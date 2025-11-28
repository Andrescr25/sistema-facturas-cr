const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const AlegraService = require('../services/alegraService');
const pagosProveedoresService = require('../services/pagosProveedoresService');

// Conectar con Prisma (la misma BD que el otro proyecto)
const prisma = new PrismaClient({
  log: ['error'],
});

// Instanciar AlegraService
const alegraService = new AlegraService();

/**
 * Inferir el tipo de identificación (códigos Alegra) según la cédula costarricense.
 * CF: Física (9 dígitos)
 * CJ: Jurídica (10 dígitos)
 * NITE: Jurídica iniciando en 4/5 (10 dígitos)
 * DIMEX: Identificación extranjera (11-12 dígitos)
 * Fallback a CJ porque la mayoría de proveedores son empresas.
 */
const TIPOS_IDENTIFICACION_ALEGRA = {
  FISICA: 'CF',
  JURIDICA: 'CJ',
  NITE: 'NITE',
  DIMEX: 'DIMEX'
};

const inferirTipoIdentificacion = (cedulaRaw) => {
  if (!cedulaRaw) return TIPOS_IDENTIFICACION_ALEGRA.JURIDICA;

  const cedula = cedulaRaw.toString().replace(/\D/g, '');

  if (cedula.length === 9) return TIPOS_IDENTIFICACION_ALEGRA.FISICA;

  if (cedula.length === 10) {
    if (cedula.startsWith('4') || cedula.startsWith('5')) {
      return TIPOS_IDENTIFICACION_ALEGRA.NITE;
    }
    return TIPOS_IDENTIFICACION_ALEGRA.JURIDICA;
  }

  if (cedula.length === 11 || cedula.length === 12) {
    return TIPOS_IDENTIFICACION_ALEGRA.DIMEX;
  }

  return TIPOS_IDENTIFICACION_ALEGRA.JURIDICA;
};

/**
 * Obtener facturas por estado
 */
router.get('/facturas', async (req, res) => {
  try {
    const { estado } = req.query;
    console.log(`📄 Obteniendo facturas con estado: ${estado || 'PROCESADA'}`);

    const facturas = await prisma.factura.findMany({
      where: estado ? { estado: estado } : undefined,
      include: {
        productos: {
          include: {
            mapeo: true
          }
        }
      },
      orderBy: {
        fechaEmision: 'desc'
      },
      take: 50
    });

    res.json({
      success: true,
      facturas: facturas,
      total: facturas.length
    });
  } catch (error) {
    console.error('❌ Error obteniendo facturas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Obtener productos pendientes de confirmación
 */
router.get('/productos-pendientes', async (req, res) => {
  try {
    console.log('📦 Obteniendo productos pendientes...');

    const productosPendientes = await prisma.productoFactura.findMany({
      where: { estadoRelacionado: 'PENDIENTE' },
      include: { factura: true },
      orderBy: {
        factura: {
          fechaProcesada: 'desc'
        }
      },
      take: 50
    });

    // Para cada producto, obtener sugerencias de la BD
    const productosConSugerencias = [];

    for (const producto of productosPendientes) {
      // Buscar productos similares en la caché de Alegra
      const palabrasClave = producto.descripcion.toLowerCase()
        .split(' ')
        .filter(palabra => palabra.length > 3)
        .slice(0, 3);

      if (palabrasClave.length > 0) {
        const similares = await prisma.alegraProduct.findMany({
          where: {
            OR: palabrasClave.map(palabra => ({
              searchText: {
                contains: palabra,
                mode: 'insensitive'
              }
            }))
          },
          take: 3
        });

        if (similares.length > 0) {
          // Calcular scores de similitud simples
          const sugerencias = similares.map(sim => {
            const matches = palabrasClave.filter(palabra =>
              sim.name.toLowerCase().includes(palabra)
            ).length;
            const similarityScore = Math.round((matches / palabrasClave.length) * 100);

            return {
              alegraId: sim.alegraId,
              name: sim.name,
              reference: sim.reference,
              price: sim.price,
              similarityScore: similarityScore
            };
          }).filter(s => s.similarityScore >= 40);

          if (sugerencias.length > 0) {
            productosConSugerencias.push({
              ...producto,
              sugerencias: sugerencias
            });
          }
        }
      }
    }

    res.json({
      success: true,
      productos: productosConSugerencias,
      total: productosConSugerencias.length
    });
  } catch (error) {
    console.error('❌ Error obteniendo productos pendientes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Confirmar relación de producto
 */
router.post('/confirmar-producto', async (req, res) => {
  try {
    const { productoId, alegraItemId, confianza } = req.body;
    console.log(`✅ Confirmando producto: ${productoId} → ${alegraItemId}`);

    const producto = await prisma.productoFactura.findUnique({
      where: { id: productoId },
      include: { factura: true }
    });

    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    // Obtener info del producto de Alegra desde cache local
    const alegraProduct = await prisma.alegraProduct.findUnique({
      where: { alegraId: alegraItemId }
    });

    if (!alegraProduct) {
      return res.status(404).json({
        success: false,
        error: 'Producto de Alegra no encontrado'
      });
    }

    // Crear o actualizar mapeo usando upsert
    const mapeo = await prisma.supplierProductMapping.upsert({
      where: {
        supplierCedula_supplierCode: {
          supplierCedula: producto.factura.proveedorCedula,
          supplierCode: producto.codigoProveedor
        }
      },
      update: {
        supplierName: producto.factura.proveedorNombre.trim(),
        supplierDesc: producto.descripcion,
        alegraItemId: alegraProduct.alegraId,
        alegraReference: alegraProduct.reference,
        alegraName: alegraProduct.name,
        confidence: confianza || 100,
        lastUsedDate: new Date(),
        timesUsed: { increment: 1 }
      },
      create: {
        supplierName: producto.factura.proveedorNombre.trim(),
        supplierCedula: producto.factura.proveedorCedula,
        supplierCode: producto.codigoProveedor,
        supplierDesc: producto.descripcion,
        alegraItemId: alegraProduct.alegraId,
        alegraReference: alegraProduct.reference,
        alegraName: alegraProduct.name,
        confidence: confianza || 100,
        origen: 'manual' // ✅ Cambiado de 'createdBy' a 'origen'
      }
    });

    // Actualizar producto
    await prisma.productoFactura.update({
      where: { id: productoId },
      data: {
        alegraItemId: alegraItemId,
        estadoRelacionado: 'RELACIONADO',
        confianza: confianza || 100,
        mapeoId: mapeo.id
      }
    });

    console.log(`✅ Producto confirmado: ${producto.descripcion} → ${alegraProduct.name}`);

    res.json({
      success: true,
      message: 'Producto confirmado exitosamente',
      mapeo: mapeo
    });
  } catch (error) {
    console.error('❌ Error confirmando producto:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Rechazar relación de producto
 */
router.post('/rechazar-producto', async (req, res) => {
  try {
    const { productoId } = req.body;
    console.log(`🔄 Rechazando producto: ${productoId}`);

    const producto = await prisma.productoFactura.findUnique({
      where: { id: productoId }
    });

    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    // Actualizar producto para quitarle cualquier relación
    await prisma.productoFactura.update({
      where: { id: productoId },
      data: {
        alegraItemId: null,
        estadoRelacionado: 'PENDIENTE',
        confianza: null,
        mapeoId: null
      }
    });

    res.json({
      success: true,
      message: 'Producto rechazado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error rechazando producto:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Actualizar precio de producto
 */
router.post('/actualizar-precio', async (req, res) => {
  try {
    const { productoId, nuevoPrecio } = req.body;
    console.log(`💰 Actualizando precio: ${productoId} → ₡${nuevoPrecio}`);

    await prisma.productoFactura.update({
      where: { id: productoId },
      data: { precioUnitario: nuevoPrecio }
    });

    res.json({
      success: true,
      message: 'Precio actualizado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error actualizando precio:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Obtener estadísticas de revisión de precios
 */
router.get('/estadisticas', async (req, res) => {
  try {
    const [
      totalFacturas,
      facturasProcesadas,
      facturasRelacionadas,
      productosPendientes
    ] = await Promise.all([
      prisma.factura.count(),
      prisma.factura.count({ where: { estado: 'PROCESADA' } }),
      prisma.factura.count({ where: { estado: 'RELACIONADA' } }),
      prisma.productoFactura.count({ where: { estadoRelacionado: 'PENDIENTE' } })
    ]);

    res.json({
      success: true,
      stats: {
        totalFacturas,
        facturasProcesadas,
        facturasRelacionadas,
        productosPendientes
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Devolver factura al estado PROCESADA (para hacer correcciones)
 */
router.post('/devolver-factura', async (req, res) => {
  try {
    const { facturaId } = req.body;

    if (!facturaId) {
      return res.status(400).json({
        success: false,
        error: 'facturaId es requerido'
      });
    }

    console.log(`🔄 Devolviendo factura ${facturaId} al estado PROCESADA...`);

    const factura = await prisma.factura.findUnique({
      where: { id: facturaId },
      include: {
        productos: true
      }
    });

    if (!factura) {
      return res.status(404).json({
        success: false,
        error: 'Factura no encontrada'
      });
    }

    // Cambiar estado de factura a PROCESADA
    await prisma.factura.update({
      where: { id: facturaId },
      data: {
        estado: 'PROCESADA'
      }
    });

    console.log(`✅ Factura ${factura.numeroConsecutivo} devuelta al estado PROCESADA`);

    res.json({
      success: true,
      message: `Factura ${factura.numeroConsecutivo} devuelta al estado PROCESADA`,
      factura: {
        id: factura.id,
        numeroConsecutivo: factura.numeroConsecutivo,
        nuevoEstado: 'PROCESADA'
      }
    });
  } catch (error) {
    console.error('❌ Error devolviendo factura:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Obtener facturas 100% relacionadas (listas para revisión de precios)
 */
router.get('/facturas-relacionadas', async (req, res) => {
  try {
    console.log('📋 Obteniendo facturas 100% relacionadas para revisión de precios...');

    const facturas = await prisma.factura.findMany({
      where: {
        estado: {
          in: ['RELACIONADA', 'PROCESADA']
        }
      },
      include: {
        productos: {
          include: {
            mapeo: true
          }
        }
      },
      orderBy: {
        fechaEmision: 'desc'
      }
    });

    // Filtrar solo facturas 100% relacionadas
    const facturasCompletas = facturas.filter(factura => {
      const total = factura.productos.length;
      const relacionados = factura.productos.filter(p => p.estadoRelacionado === 'RELACIONADO').length;
      return total > 0 && relacionados === total;
    });

    console.log(`✅ ${facturasCompletas.length} facturas 100% relacionadas encontradas`);

    res.json({
      success: true,
      facturas: facturasCompletas
    });
  } catch (error) {
    console.error('❌ Error obteniendo facturas relacionadas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Obtener datos de productos en Alegra (batch) para comparación de precios
 */
router.post('/productos-batch', async (req, res) => {
  try {
    const { alegraIds } = req.body;

    if (!alegraIds || !Array.isArray(alegraIds)) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de alegraIds'
      });
    }

    console.log(`🔍 Obteniendo datos de ${alegraIds.length} productos en batch...`);

    const productos = {};

    // Obtener datos de cada producto en paralelo
    await Promise.all(
      alegraIds.map(async (alegraId) => {
        try {
          const producto = await alegraService.getProductById(alegraId);
          if (producto) {
            const precioSinIva = producto.price?.[0]?.price || 0;
            
            // Calcular precio con IVA (13% en Costa Rica)
            // Obtener porcentaje de IVA del producto (por defecto 13%)
            const ivaPorcentaje = producto.tax?.[0]?.percentage || 13;
            const precioConIva = precioSinIva * (1 + ivaPorcentaje / 100);
            
            productos[alegraId] = {
              id: producto.id,
              name: producto.name,
              reference: producto.reference,
              price: precioConIva,  // Precio CON IVA para mostrar al usuario
              priceWithoutTax: precioSinIva,  // Precio sin IVA (por si se necesita)
              cost: producto.cost || 0,
              taxPercentage: ivaPorcentaje
            };
          }
        } catch (error) {
          console.error(`⚠️ Error obteniendo producto ${alegraId}:`, error.message);
        }
      })
    );

    console.log(`✅ ${Object.keys(productos).length}/${alegraIds.length} productos obtenidos`);

    res.json({
      success: true,
      productos: productos,
      total: Object.keys(productos).length,
      solicitados: alegraIds.length
    });
  } catch (error) {
    console.error('❌ Error en batch de productos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Enviar factura completa a Alegra (actualizar costos + precios + crear factura de proveedor)
 */
router.post('/enviar-alegra', async (req, res) => {
  try {
    const { facturaId, preciosAjustados = {} } = req.body;

    if (!facturaId) {
      return res.status(400).json({
        success: false,
        error: 'facturaId es requerido'
      });
    }

    console.log(`🚀 Enviando factura ${facturaId} a Alegra...`);

    // Obtener factura con productos
    const factura = await prisma.factura.findUnique({
      where: { id: facturaId },
      include: {
        productos: {
          include: {
            mapeo: true
          }
        }
      }
    });

    if (!factura) {
      return res.status(404).json({
        success: false,
        error: 'Factura no encontrada'
      });
    }

    // Todos los productos relacionados
    const productos = factura.productos.filter(p => p.estadoRelacionado === 'RELACIONADO');

    console.log(`📦 Procesando ${productos.length} productos...`);

    // PASO 1: Crear factura de proveedor en Alegra PRIMERO (con precios originales)
    // Esto evita que los precios ajustados afecten la factura de compra
    let alegraFacturaId = null;
    try {
      // Buscar o crear contacto del proveedor
      const identificacionTipo = inferirTipoIdentificacion(factura.proveedorCedula);

      const contacto = await alegraService.createOrGetContact({
        name: factura.proveedorNombre,
        identification: factura.proveedorCedula,
        identificationType: identificacionTipo,
        phonePrimary: factura.proveedorTelefono || '',
        email: factura.proveedorEmail || '',
        type: ['provider'],
        status: 'active',
        ignoreRepeated: true
      });

      // Preparar items de la factura con precios ORIGINALES del proveedor
      const items = productos.map(p => {
        // En XML de Costa Rica, PrecioUnitario YA es SIN IVA
        const precioUnitarioSinIva = parseFloat(p.precioUnitario) || 0;
        
        // Calcular porcentaje de descuento
        const montoTotalSinDescuento = precioUnitarioSinIva * p.cantidad;
        const descuentoPorcentaje = montoTotalSinDescuento > 0 
          ? ((p.descuento || 0) / montoTotalSinDescuento) * 100
          : 0;
        
        return {
          id: p.alegraItemId?.toString() || p.alegraItemId,
          quantity: parseFloat(p.cantidad) || 1,
          price: Math.round(precioUnitarioSinIva * 100) / 100, // Precio ORIGINAL del proveedor
          discount: Math.round(descuentoPorcentaje * 100) / 100,
          tax: [{
            id: 1, // IVA 13% Costa Rica
            percentage: 13
          }]
        };
      });

      console.log(`📋 Items preparados para Alegra (precios originales):`, JSON.stringify(items, null, 2));

      // Crear factura de compra en Alegra
      const alegraFactura = await alegraService.createPurchaseInvoice({
        date: factura.fechaEmision,
        client: contacto.id?.toString() || contacto.id,
        numberTemplate: {
          id: 10,
          number: factura.numeroConsecutivo,
          fullNumber: factura.numeroConsecutivo
        },
        observations: `Factura ${factura.numeroConsecutivo} - Importada automáticamente`,
        items: items
      });

      alegraFacturaId = alegraFactura.id;
      console.log(`✅ Factura de compra creada en Alegra: ID ${alegraFacturaId}`);
    } catch (facturaError) {
      console.warn('⚠️ Error creando factura de compra:', facturaError.message);
      // Continuar para actualizar costos y precios incluso si falla la factura
    }

    // PASO 2: Actualizar costos Y precios en Alegra EN PARALELO
    // Esto se hace DESPUÉS de crear la factura para no afectar su total
    let costosActualizados = 0;
    let preciosActualizados = 0;
    
    console.log(`⚡ Actualizando ${productos.length} productos en paralelo...`);
    
    // Crear promesas para procesar todos los productos simultáneamente
    const updatePromises = productos.map(async (producto) => {
      try {
        const alegraId = producto.alegraItemId;
        if (!alegraId) return { success: false, precioAjustado: false };

        // El costo nuevo considerando descuentos
        // En XML de Costa Rica, precioUnitario es SIN IVA
        const precioUnitarioSinIva = parseFloat(producto.precioUnitario) || 0;
        
        // Calcular el porcentaje de descuento
        const montoTotalSinDescuento = precioUnitarioSinIva * producto.cantidad;
        const descuentoPorcentaje = montoTotalSinDescuento > 0 
          ? ((producto.descuento || 0) / montoTotalSinDescuento) * 100
          : 0;
        
        // Costo = precioUnitario SIN IVA con descuento aplicado, luego multiplicar por 1.13
        const costoSinIvaConDescuento = precioUnitarioSinIva * (1 - descuentoPorcentaje / 100);
        const costoNuevo = costoSinIvaConDescuento * 1.13; // Agregamos el IVA

        // Preparar datos de actualización
        const updateData = {
          cost: Math.round(costoNuevo * 100) / 100
        };

        let precioAjustado = false;
        
        // Si el usuario ajustó el precio, incluirlo
        if (preciosAjustados[producto.id] && preciosAjustados[producto.id] > 0) {
          updateData.price = parseFloat(preciosAjustados[producto.id]);
          precioAjustado = true;
          console.log(`💰 Precio ajustado: ${producto.descripcion} → ₡${updateData.price.toFixed(2)}`);
        }

        // Actualizar en Alegra
        await alegraService.updateProduct(alegraId, updateData);

        console.log(`✅ Costo actualizado: ${producto.descripcion} → ₡${costoNuevo.toFixed(2)}`);
        return { success: true, precioAjustado };
      } catch (error) {
        console.error(`⚠️ Error actualizando ${producto.descripcion}:`, error.message);
        return { success: false, precioAjustado: false };
      }
    });
    
    // Esperar a que TODAS las actualizaciones terminen en paralelo
    const results = await Promise.all(updatePromises);
    
    // Contar resultados
    costosActualizados = results.filter(r => r.success).length;
    preciosActualizados = results.filter(r => r.precioAjustado).length;
    
    console.log(`✅ Actualizaciones paralelas completadas: ${costosActualizados}/${productos.length} costos, ${preciosActualizados} precios`);

    // La factura ya se creó en el PASO 1 con precios originales

    // PASO 3: Marcar factura como ENVIADA
    await prisma.factura.update({
      where: { id: facturaId },
      data: {
        estado: 'ENVIADA'
        // Nota: alegraFacturaId no está en el schema, se registra en logs
      }
    });
    
    try {
      const cuentaLiberada = await pagosProveedoresService.liberarCuentaPorFactura(facturaId);
      if (cuentaLiberada) {
        console.log(`💳 Cuenta por pagar liberada para factura ${factura.numeroConsecutivo}`);
      }
    } catch (liberarError) {
      console.warn('⚠️ No se pudo liberar la cuenta por pagar:', liberarError.message);
    }

    if (alegraFacturaId) {
      console.log(`📝 Factura enviada a Alegra con ID: ${alegraFacturaId}`);
    }

    console.log(`✅ Factura ${factura.numeroConsecutivo} procesada exitosamente`);

    // Determinar el mensaje apropiado
    let mensaje = 'Factura procesada exitosamente';
    if (alegraFacturaId) {
      mensaje = `Factura creada en Alegra (ID: ${alegraFacturaId})`;
    } else {
      mensaje = 'Costos y precios actualizados (factura no creada en Alegra por falta de permisos)';
    }

    res.json({
      success: true,
      mensaje: mensaje,
      facturaCreada: !!alegraFacturaId,
      resultado: {
        numeroConsecutivo: factura.numeroConsecutivo,
        proveedor: factura.proveedorNombre,
        alegraFacturaId: alegraFacturaId,
        totalProductos: productos.length,
        costosActualizados: costosActualizados,
        preciosActualizados: preciosActualizados
      }
    });
  } catch (error) {
    console.error('❌ Error enviando a Alegra:', error);
    
    // Determinar código de estado apropiado
    let statusCode = 500;
    if (error.message?.includes('deshabilitado') || 
        error.message?.includes('Error de Alegra')) {
      statusCode = 400; // Errores de validación/negocio
    }
    
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Error desconocido al procesar la factura'
    });
  }
});

module.exports = router;

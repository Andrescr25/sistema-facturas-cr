const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const AlegraService = require('../services/alegraService');

// Conectar con Prisma (la misma BD que el otro proyecto)
const prisma = new PrismaClient({
  log: ['error'],
});

// Instanciar AlegraService
const alegraService = new AlegraService();

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

    // Crear mapeo
    const mapeo = await prisma.supplierProductMapping.create({
      data: {
        supplierName: producto.factura.proveedorNombre,
        supplierCedula: producto.factura.proveedorCedula,
        supplierCode: producto.codigoProveedor,
        supplierDesc: producto.descripcion,
        alegraItemId: alegraProduct.alegraId,
        alegraReference: alegraProduct.reference,
        alegraName: alegraProduct.name,
        confidence: confianza || 100,
        createdBy: 'manual'
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
            productos[alegraId] = {
              id: producto.id,
              name: producto.name,
              reference: producto.reference,
              price: producto.price?.[0]?.price || 0,
              cost: producto.cost || 0
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

    // PASO 1: Actualizar costos Y precios en Alegra
    let costosActualizados = 0;
    let preciosActualizados = 0;
    
    for (const producto of productos) {
      try {
        const alegraId = producto.alegraItemId;
        if (!alegraId) continue;

        // Calcular costo con IVA
        const impuestoPorcentaje = producto.impuesto > 0 
          ? (producto.impuesto / producto.subtotal) * 100 
          : 13;
        const costoConIVA = producto.precioUnitario * (1 + impuestoPorcentaje / 100);

        // Preparar datos de actualización
        const updateData = {
          cost: Math.round(costoConIVA * 100) / 100
        };

        // Si el usuario ajustó el precio, incluirlo
        if (preciosAjustados[producto.id] && preciosAjustados[producto.id] > 0) {
          updateData.price = parseFloat(preciosAjustados[producto.id]);
          preciosActualizados++;
          console.log(`💰 Precio ajustado: ${producto.descripcion} → ₡${updateData.price.toFixed(2)}`);
        }

        // Actualizar en Alegra
        await alegraService.updateProduct(alegraId, updateData);

        costosActualizados++;
        console.log(`✅ Actualizado: ${producto.descripcion}`);
      } catch (error) {
        console.error(`⚠️ Error actualizando ${producto.descripcion}:`, error.message);
      }
    }

    // PASO 2: Crear factura de proveedor en Alegra
    let alegraFacturaId = null;
    try {
      // Buscar o crear contacto del proveedor
      const contacto = await alegraService.createOrGetContact({
        name: factura.proveedorNombre,
        identification: factura.proveedorCedula,
        phonePrimary: factura.proveedorTelefono || '',
        email: factura.proveedorEmail || '',
        type: 'provider'
      });

      // Preparar items de la factura
      const items = productos.map(p => ({
        id: p.alegraItemId,
        quantity: p.cantidad,
        price: p.precioUnitario,
        tax: [{
          id: 3, // IVA 13%
          percentage: p.impuesto > 0 ? (p.impuesto / p.subtotal) * 100 : 13
        }]
      }));

      // Crear factura de compra en Alegra
      const alegraFactura = await alegraService.createPurchaseInvoice({
        date: factura.fechaEmision,
        client: contacto.id,
        numberTemplate: {
          id: 1 // Compras
        },
        observations: `Factura ${factura.numeroConsecutivo} - Importada automáticamente`,
        items: items
      });

      alegraFacturaId = alegraFactura.id;
      console.log(`✅ Factura creada en Alegra: ID ${alegraFacturaId}`);
    } catch (error) {
      console.error(`⚠️ Error creando factura en Alegra:`, error.message);
    }

    // PASO 3: Marcar factura como ENVIADA
    await prisma.factura.update({
      where: { id: facturaId },
      data: {
        estado: 'ENVIADA',
        alegraFacturaId: alegraFacturaId?.toString()
      }
    });

    console.log(`✅ Factura ${factura.numeroConsecutivo} procesada exitosamente`);

    res.json({
      success: true,
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

/**
 * Revision-Precios Module - Service
 * Lógica de negocio para la revisión de precios de facturas de proveedores
 * y su envío a Alegra como facturas de compra.
 */

const prisma = require('../../../lib/prisma');
const { query } = require('../../../config/database');
const { getProductService, getContactService, getInvoiceService } = require('../../integrations/alegra');
const pagosProveedoresService = require('../../../services/pagosProveedoresService');
const { obtenerImpuestoAlegra } = require('../../../utils/impuestosAlegra');
const { calcularCostoUnitarioPropio } = require('../precios/costo');
const { calcularPrecioSugerido } = require('../precios/motor');
const { sincronizarCostoDeLineas } = require('../precios/costoHistorico');
const { obtenerConfigPrecios, resolverConfig } = require('../precios/config');

const productService = getProductService();
const contactService = getContactService();
const invoiceService = getInvoiceService();

/**
 * Error con código de estado HTTP para que el controller responda con el status correcto.
 */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

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

function inferirTipoIdentificacion(cedulaRaw) {
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
}

/**
 * Construir los items del payload de factura de compra para Alegra a partir
 * de los productos de la factura del proveedor. Función pura (testeable):
 * - price: precio original SIN IVA del XML, redondeado a 2 decimales
 * - discount: porcentaje derivado del monto de descuento de la línea
 * - tax: tarifa REAL de la línea (0/1/2/4/8/13%); si no se reconoce,
 *   se omite para que Alegra use el impuesto configurado en el producto
 */
function construirItemsFactura(productos) {
  return productos.map(p => {
    // En XML de Costa Rica, PrecioUnitario YA es SIN IVA
    const precioUnitarioSinIva = parseFloat(p.precioUnitario) || 0;

    // Calcular porcentaje de descuento
    const montoTotalSinDescuento = precioUnitarioSinIva * p.cantidad;
    const descuentoPorcentaje = montoTotalSinDescuento > 0
      ? ((p.descuento || 0) / montoTotalSinDescuento) * 100
      : 0;

    // Factor de conversión (ej: proveedor factura 25 sueltos, yo lo vendo
    // como 1 paquete de 25 → factor 1/25). Se aplica a la cantidad Y al
    // precio en sentido inverso, para que el total de la línea (cantidad ×
    // precio) siga siendo el mismo monto real de la factura del proveedor —
    // solo cambia cómo se reparte entre cantidad y precio unitario.
    const factor = parseFloat(p.mapeo?.factorConversion) || 1;

    const item = {
      id: p.alegraItemId?.toString() || p.alegraItemId,
      quantity: Math.round((parseFloat(p.cantidad) || 1) * factor * 10000) / 10000,
      price: Math.round((precioUnitarioSinIva / factor) * 100) / 100, // Precio por unidad PROPIA, no del proveedor
      discount: Math.round(descuentoPorcentaje * 100) / 100
    };

    // Tarifa de IVA real de la línea (0/1/2/4/8/13%), NO se asume 13% fijo
    const impuestoDetectado = obtenerImpuestoAlegra({ impuesto: p.impuesto, totalLinea: p.totalLinea });
    if (impuestoDetectado) {
      item.tax = [{ id: impuestoDetectado.id, percentage: impuestoDetectado.porcentaje }];
    } else {
      console.warn(`⚠️ No se pudo determinar la tarifa de IVA de "${p.descripcion}" (impuesto=${p.impuesto}, totalLinea=${p.totalLinea}). Se enviará sin forzar impuesto; Alegra usará el impuesto configurado en el producto.`);
    }

    return item;
  });
}

/**
 * Obtener facturas por estado
 */
async function getFacturas(estado) {
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

  return { facturas, total: facturas.length };
}

/**
 * Obtener productos pendientes de confirmación con sugerencias desde la caché de Alegra
 */
async function getProductosPendientes() {
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

  return { productos: productosConSugerencias, total: productosConSugerencias.length };
}

/**
 * Confirmar relación de producto (crea/actualiza el mapeo proveedor→Alegra)
 */
async function confirmarProducto({ productoId, alegraItemId, confianza }) {
  console.log(`✅ Confirmando producto: ${productoId} → ${alegraItemId}`);

  const producto = await prisma.productoFactura.findUnique({
    where: { id: productoId },
    include: { factura: true }
  });

  if (!producto) {
    throw httpError(404, 'Producto no encontrado');
  }

  // Obtener info del producto de Alegra desde cache local
  const alegraProduct = await prisma.alegraProduct.findUnique({
    where: { alegraId: alegraItemId }
  });

  if (!alegraProduct) {
    throw httpError(404, 'Producto de Alegra no encontrado');
  }

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
      origen: 'manual'
    }
  });

  await prisma.productoFactura.update({
    where: { id: productoId },
    data: {
      alegraItemId: alegraItemId,
      estadoRelacionado: 'RELACIONADO',
      confianza: confianza || 100,
      mapeoId: mapeo.id
    }
  });

  // El costo de esta compra queda disponible de inmediato para el tablero de
  // rentabilidad y el motor de precios, sin esperar a un backfill manual.
  await sincronizarCostoDeLineas([productoId]);

  console.log(`✅ Producto confirmado: ${producto.descripcion} → ${alegraProduct.name}`);

  return { message: 'Producto confirmado exitosamente', mapeo };
}

/**
 * Rechazar relación de producto (lo devuelve a PENDIENTE sin relación)
 */
async function rechazarProducto(productoId) {
  console.log(`🔄 Rechazando producto: ${productoId}`);

  const producto = await prisma.productoFactura.findUnique({
    where: { id: productoId }
  });

  if (!producto) {
    throw httpError(404, 'Producto no encontrado');
  }

  await prisma.productoFactura.update({
    where: { id: productoId },
    data: {
      alegraItemId: null,
      estadoRelacionado: 'PENDIENTE',
      confianza: null,
      mapeoId: null
    }
  });

  return { message: 'Producto rechazado exitosamente' };
}

/**
 * Actualizar precio unitario de un producto de factura
 */
async function actualizarPrecio(productoId, nuevoPrecio) {
  console.log(`💰 Actualizando precio: ${productoId} → ₡${nuevoPrecio}`);

  await prisma.productoFactura.update({
    where: { id: productoId },
    data: { precioUnitario: nuevoPrecio }
  });

  return { message: 'Precio actualizado exitosamente' };
}

/**
 * Obtener estadísticas de revisión de precios
 */
async function getEstadisticas() {
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

  return {
    stats: {
      totalFacturas,
      facturasProcesadas,
      facturasRelacionadas,
      productosPendientes
    }
  };
}

/**
 * Devolver factura al estado PROCESADA (para hacer correcciones)
 */
async function devolverFactura(facturaId) {
  console.log(`🔄 Devolviendo factura ${facturaId} al estado PROCESADA...`);

  const factura = await prisma.factura.findUnique({
    where: { id: facturaId },
    include: {
      productos: true
    }
  });

  if (!factura) {
    throw httpError(404, 'Factura no encontrada');
  }

  await prisma.factura.update({
    where: { id: facturaId },
    data: {
      estado: 'PROCESADA'
    }
  });

  console.log(`✅ Factura ${factura.numeroConsecutivo} devuelta al estado PROCESADA`);

  return {
    message: `Factura ${factura.numeroConsecutivo} devuelta al estado PROCESADA`,
    factura: {
      id: factura.id,
      numeroConsecutivo: factura.numeroConsecutivo,
      nuevoEstado: 'PROCESADA'
    }
  };
}

/**
 * Obtener facturas 100% relacionadas (listas para revisión de precios)
 */
async function getFacturasRelacionadas() {
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

  return { facturas: facturasCompletas };
}

/**
 * Precio sugerido por línea de factura — Fase 2 del motor de precios.
 * Reemplaza el `costo / 0.80` fijo que vivía en el frontend
 * (revisionPreciosUtils.js) por un margen meta real: el medido por
 * categoría (config_precios), ajustado por rotación y exclusividad del
 * producto (producto_rotacion), con un piso de seguridad del que nunca
 * baja. Se calcula por LÍNEA de factura (no por producto en abstracto)
 * porque el costo real de esta compra específica —con su descuento, su IVA
 * real y su factor de conversión— es lo único de lo que hay certeza al
 * momento de revisar precios; el costo cacheado de Alegra puede estar
 * desactualizado o venir de otro proveedor.
 *
 * @returns {Promise<Record<string, {precioSugerido:number, margenObjetivo:number, margenResultante:number, categoria:string, claseRotacion:string|null}>>}
 *          keyed por ProductoFactura.id — vacío para líneas sin costo
 *          calculable (no tiene sentido sugerir nada sin costo confiable).
 */
async function obtenerSugerenciasPrecio(facturaId) {
  const factura = await prisma.factura.findUnique({
    where: { id: facturaId },
    include: { productos: { include: { mapeo: true } } }
  });
  if (!factura) throw httpError(404, 'Factura no encontrada');

  const alegraIds = [...new Set(factura.productos.map(p => p.alegraItemId).filter(Boolean))];
  if (alegraIds.length === 0) return {};

  const [categorias, rotaciones, configPrecios] = await Promise.all([
    query('SELECT alegra_id, category FROM alegra_products_cache WHERE alegra_id = ANY($1::text[])', [alegraIds]),
    query('SELECT alegra_item_id, clase, unidades_mes, clientes_distintos FROM producto_rotacion WHERE alegra_item_id = ANY($1::text[])', [alegraIds]),
    obtenerConfigPrecios()
  ]);

  const categoriaPorItem = new Map(categorias.rows.map(r => [r.alegra_id, r.category || '']));
  const rotacionPorItem = new Map(rotaciones.rows.map(r => [r.alegra_item_id, {
    clase: r.clase,
    unidadesMes: r.unidades_mes !== null ? Number(r.unidades_mes) : null,
    clientesDistintos: Number(r.clientes_distintos)
  }]));

  const sugerencias = {};
  for (const producto of factura.productos) {
    if (!producto.alegraItemId) continue;

    const { costoSinIvaConDescuento, factor } = calcularCostoUnitarioPropio(producto, producto.mapeo?.factorConversion);
    const costoSinIva = costoSinIvaConDescuento / factor;

    const categoria = categoriaPorItem.get(producto.alegraItemId) || '';
    const rotacion = rotacionPorItem.get(producto.alegraItemId) || { clase: null, unidadesMes: null, clientesDistintos: null };
    const { margenMeta, margenMinimo } = resolverConfig(configPrecios, categoria);

    const resultado = calcularPrecioSugerido({
      costoSinIva,
      margenMetaCategoria: margenMeta,
      margenMinimoCategoria: margenMinimo,
      unidadesMes: rotacion.unidadesMes,
      clientesDistintos: rotacion.clientesDistintos
    });
    if (!resultado) continue;

    sugerencias[producto.id] = {
      ...resultado,
      categoria: categoria || '(sin categoría)',
      claseRotacion: rotacion.clase,
      unidadesMes: rotacion.unidadesMes
    };
  }

  return sugerencias;
}

/**
 * Obtener datos de productos en Alegra (batch) para comparación de precios
 */
async function getProductosBatch(alegraIds) {
  console.log(`🔍 Obteniendo datos de ${alegraIds.length} productos en batch...`);

  const productos = {};

  await Promise.all(
    alegraIds.map(async (alegraId) => {
      try {
        const resultado = await productService.getProductById(alegraId);
        const producto = resultado.success ? resultado.data : null;
        if (producto) {
          const precioSinIva = producto.price?.[0]?.price || 0;

          // Precio con el IVA propio del producto (por defecto 13%)
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

  return {
    productos,
    total: Object.keys(productos).length,
    solicitados: alegraIds.length
  };
}

/**
 * Enviar factura completa a Alegra:
 * 1. Crear factura de compra en Alegra con precios originales e IVA real por línea
 * 2. Actualizar costos y precios de los productos en Alegra en paralelo
 * 3. Marcar la factura como ENVIADA y liberar la cuenta por pagar
 */
async function enviarFacturaAlegra(facturaId, preciosAjustados = {}) {
  console.log(`🚀 Enviando factura ${facturaId} a Alegra...`);

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
    throw httpError(404, 'Factura no encontrada');
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

    const contacto = await contactService.createOrGetContact({
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
    const items = construirItemsFactura(productos);

    console.log(`📋 Items preparados para Alegra (precios originales):`, JSON.stringify(items, null, 2));

    // Crear factura de compra en Alegra
    const alegraFactura = await invoiceService.createPurchaseInvoice({
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
  console.log(`⚡ Actualizando ${productos.length} productos en paralelo...`);

  const updatePromises = productos.map(async (producto) => {
    try {
      const alegraId = producto.alegraItemId;
      if (!alegraId) return { success: false, precioAjustado: false };

      // Costo real por unidad propia — ver backend/src/modules/precios/costo.js
      // (fórmula única, antes duplicada acá y en otros 2 módulos).
      const { costoUnitario: costoNuevoNegocio, costoSinIvaConDescuento, factor } = calcularCostoUnitarioPropio(
        producto,
        producto.mapeo?.factorConversion
      );
      const costoSinIvaPropio = costoSinIvaConDescuento / factor;

      // OJO: a diferencia de "price" (que Alegra sí acepta como número suelto),
      // "cost" tiene que ir anidado en inventory.unitCost — confirmado en vivo
      // que un "cost" suelto en la raíz del payload se ignora silenciosamente
      // (el PUT responde 200 pero el costo nunca cambia). Este bug es previo
      // al factor de conversión: existía incluso con factor=1.
      const updateData = {
        inventory: {
          unitCost: (Math.round(costoNuevoNegocio * 100) / 100).toString()
        }
      };

      let precioAjustado = false;
      let precioNuevo = null;

      // Si el usuario ajustó el precio, incluirlo
      if (preciosAjustados[producto.id] && preciosAjustados[producto.id] > 0) {
        precioNuevo = parseFloat(preciosAjustados[producto.id]);
        updateData.price = precioNuevo;
        precioAjustado = true;
        console.log(`💰 Precio ajustado: ${producto.descripcion} → ₡${updateData.price.toFixed(2)}`);
      }

      const actualizacion = await productService.updateProduct(alegraId, updateData);
      if (!actualizacion.success) {
        throw new Error(actualizacion.error || `Error actualizando producto ${alegraId} en Alegra`);
      }

      // Bitácora del cambio de precio — antes no quedaba ningún registro de
      // qué precio se aplicó, con qué costo, ni con qué margen resultó.
      if (precioAjustado) {
        const margenResultante = precioNuevo > 0 ? ((precioNuevo - costoSinIvaPropio) / precioNuevo) * 100 : null;
        try {
          await query(`
            INSERT INTO precio_historico (alegra_item_id, precio_nuevo, costo_al_momento, margen_resultante, origen, factura_id)
            VALUES ($1, $2, $3, $4, 'revision_precios', $5)
          `, [alegraId, precioNuevo, costoSinIvaPropio, margenResultante !== null ? Math.round(margenResultante * 100) / 100 : null, facturaId]);
        } catch (historicoError) {
          // No debe tumbar el envío por un fallo de bitácora — el precio ya
          // se aplicó en Alegra, que es la fuente de verdad.
          console.warn(`⚠️ No se pudo registrar precio_historico para ${producto.descripcion}:`, historicoError.message);
        }
      }

      console.log(`✅ Costo actualizado: ${producto.descripcion} → ₡${costoNuevoNegocio.toFixed(2)}`);
      return { success: true, precioAjustado };
    } catch (error) {
      console.error(`⚠️ Error actualizando ${producto.descripcion}:`, error.message);
      return { success: false, precioAjustado: false };
    }
  });

  const results = await Promise.all(updatePromises);

  const costosActualizados = results.filter(r => r.success).length;
  const preciosActualizados = results.filter(r => r.precioAjustado).length;

  console.log(`✅ Actualizaciones paralelas completadas: ${costosActualizados}/${productos.length} costos, ${preciosActualizados} precios`);

  // PASO 3: Marcar ENVIADA solo si la factura de compra realmente se creó en
  // Alegra. Antes se marcaba ENVIADA siempre, aunque el paso 1 hubiera
  // fallado — la factura quedaba "completada" en el sistema sin existir en
  // Alegra, sin forma de saberlo salvo revisando los logs. Al no avanzar el
  // estado, sigue apareciendo en "facturas relacionadas" y el usuario puede
  // reintentar (los costos/precios que sí se aplicaron son idempotentes —
  // un PUT repetido no duplica nada).
  if (alegraFacturaId) {
    await prisma.factura.update({
      where: { id: facturaId },
      data: { estado: 'ENVIADA' }
      // Nota: alegraFacturaId no está en el schema, se registra en logs
    });

    try {
      const cuentaLiberada = await pagosProveedoresService.liberarCuentaPorFactura(facturaId);
      if (cuentaLiberada) {
        console.log(`💳 Cuenta por pagar liberada para factura ${factura.numeroConsecutivo}`);
      }
    } catch (liberarError) {
      console.warn('⚠️ No se pudo liberar la cuenta por pagar:', liberarError.message);
    }

    console.log(`📝 Factura enviada a Alegra con ID: ${alegraFacturaId}`);
  } else {
    console.warn(`⚠️ Factura ${factura.numeroConsecutivo} NO se creó en Alegra — costos/precios sí se actualizaron, pero el estado se queda sin avanzar para que se pueda reintentar.`);
  }

  console.log(`✅ Factura ${factura.numeroConsecutivo} procesada`);

  let mensaje = 'Factura procesada exitosamente';
  if (alegraFacturaId) {
    mensaje = `Factura creada en Alegra (ID: ${alegraFacturaId})`;
  } else {
    mensaje = 'Costos y precios actualizados, pero la factura de compra NO se creó en Alegra — queda pendiente para reintentar.';
  }

  return {
    mensaje,
    facturaCreada: !!alegraFacturaId,
    resultado: {
      numeroConsecutivo: factura.numeroConsecutivo,
      proveedor: factura.proveedorNombre,
      alegraFacturaId: alegraFacturaId,
      totalProductos: productos.length,
      costosActualizados: costosActualizados,
      preciosActualizados: preciosActualizados
    }
  };
}

module.exports = {
  getFacturas,
  getProductosPendientes,
  confirmarProducto,
  rechazarProducto,
  actualizarPrecio,
  getEstadisticas,
  devolverFactura,
  getFacturasRelacionadas,
  getProductosBatch,
  obtenerSugerenciasPrecio,
  enviarFacturaAlegra,
  // Funciones puras exportadas para tests
  construirItemsFactura,
  inferirTipoIdentificacion
};

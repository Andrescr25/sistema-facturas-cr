/**
 * Revision-Precios Module - Service
 * Lógica de negocio para la revisión de precios de facturas de proveedores.
 *
 * LO QUE LA PANTALLA USA sale del maestro propio (2026-10-04): las facturas
 * con el `productoPropioId` de cada línea, los productos de la revisión y el
 * precio sugerido. Registrar la compra es de compras.service.js.
 *
 * LO QUE QUEDA DE ALEGRA es `enviarFacturaAlegra` y sus ayudantes: el camino
 * viejo de "Enviar a Alegra", que la pantalla ya no llama. Se va con el retiro
 * de Alegra (sección 16).
 *
 * Se quitaron, por no tener pantalla, pruebas ni nadie que las llamara:
 * productos pendientes con sugerencias de la caché, confirmar y rechazar una
 * relación por el id de Alegra, las estadísticas, y `actualizar-precio`, que
 * además reescribía el precio de la línea de la factura RECIBIDA.
 */

const prisma = require('../../../lib/prisma');
const { SQL_ROTACION_PRECIOS } = require('../ventas/rotacion');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { query } = require('../../../config/database');
const { getProductService, getContactService, getInvoiceService } = require('../../integrations/alegra');
const pagosProveedoresService = require('../../../services/pagosProveedoresService');
const { obtenerImpuestoAlegra, cargarImpuestosAlegra } = require('../../../utils/impuestosAlegra');
const { calcularCostoUnitarioPropio } = require('../precios/costo');
const { calcularPrecioSugerido } = require('../precios/motor');
const { obtenerConfigPrecios, resolverConfig } = require('../precios/config');

const productService = getProductService();
const contactService = getContactService();
const invoiceService = getInvoiceService();
const MAX_FACTURAS_RELACIONADAS = 100;

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
/**
 * Revisa los productos ANTES de intentar crear la factura de compra.
 *
 * Alegra rechaza la factura ENTERA por un solo producto que no le sirva, y
 * responde con mensajes que no dicen cuál: "Uno de los items especificados es
 * inválido" (11034) o "No se encontró uno de los items" (11068). Con seis
 * líneas, eso deja a quien factura sin nada que hacer más que adivinar.
 *
 * Se revisa contra la caché local, que ya tiene el estado de cada producto,
 * así que no cuesta ninguna llamada extra a Alegra.
 */
async function revisarItemsParaFactura(productos) {
  const ids = productos.map(p => String(p.alegraItemId || '')).filter(Boolean);
  if (ids.length === 0) return [];

  const cache = await query(
    `SELECT alegra_id, name, status FROM alegra_products_cache WHERE alegra_id = ANY($1::varchar[]);`,
    [ids]
  );
  const porId = new Map(cache.rows.map(r => [String(r.alegra_id), r]));

  const problemas = [];
  for (const p of productos) {
    const id = String(p.alegraItemId || '');
    const nombre = p.descripcion || p.mapeo?.nombreProducto || `producto ${id}`;

    if (!id) { problemas.push({ nombre, motivo: 'no está relacionado con ningún producto de Alegra' }); continue; }

    const enCache = porId.get(id);
    // Ausente de la caché no es un problema en sí: puede ser un producto
    // recién creado que todavía no se sincronizó. Solo se reporta lo que se
    // sabe con certeza.
    if (enCache && enCache.status !== 'active') {
      problemas.push({ nombre: enCache.name || nombre, motivo: `está inactivo en Alegra (id ${id})` });
    }
  }
  return problemas;
}

function construirItemsFactura(productos, impuestosAlegra) {
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
    const impuestoDetectado = obtenerImpuestoAlegra({ impuesto: p.impuesto, totalLinea: p.totalLinea }, impuestosAlegra);
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

  return { facturas: await conProductoPropio(facturas), total: facturas.length };
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

  // UNA FACTURA YA REGISTRADA NO SE DEVUELVE.
  // En esta rama `ENVIADA` quiere decir que ya existe su fila en `compra`
  // (registrarCompra la deja así, ver compras.service.js) — ya no que exista
  // una factura de compra en Alegra. Devolverla la regresaría a la lista de
  // revisión con "Registrar compra" activo: registrarCompra la frenaría con un
  // 409, pero la pantalla quedaría ofreciendo algo que no se puede hacer.
  //
  // Para rehacer una compra mal relacionada hay que ANULARLA primero, y eso
  // todavía no existe (compra.estado ya admite 'anulada'; falta la función):
  // el mensaje lo dice en vez de mandar a Alegra, que ya no es el lugar.
  if (factura.estado === 'ENVIADA') {
    throw httpError(409,
      `La factura ${factura.numeroConsecutivo} ya está registrada como compra. ` +
      `Devolverla a relacionar permitiría registrarla otra vez y duplicar el gasto. ` +
      `Para corregirla habría que anular la compra primero, y eso todavía no está disponible.`);
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
async function getFacturasRelacionadas({ limit = MAX_FACTURAS_RELACIONADAS } = {}) {
  console.log('📋 Obteniendo facturas 100% relacionadas para revisión de precios...');
  const limite = Math.min(Math.max(parseInt(limit, 10) || MAX_FACTURAS_RELACIONADAS, 1), 200);

  const facturas = await prisma.factura.findMany({
    where: {
      estado: {
        in: ['RELACIONADA', 'PROCESADA']
      },
      productos: {
        some: {},
        every: {
          estadoRelacionado: 'RELACIONADO'
        }
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
    },
    take: limite
  });

  console.log(`✅ ${facturas.length} facturas 100% relacionadas encontradas`);

  return { facturas: await conProductoPropio(facturas) };
}

/**
 * Precio sugerido por línea de factura — Fase 2 del motor de precios.
 * Reemplaza el `costo / 0.80` fijo que vivía en el frontend
 * (revisionPreciosUtils.js) por un margen meta real: el medido por
 * categoría (config_precios), ajustado por rotación y exclusividad del
 * producto (ventas/rotacion.js, 12 meses), con un piso de seguridad del que nunca
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

  // TODO SALE DEL PRODUCTO PROPIO de cada línea: su categoría (la del
  // maestro) y su rotación (`venta_linea`, por `producto.id`). Hasta el
  // 2026-10-04 se iba por el id de Alegra y la categoría de la caché: una
  // línea de un producto sin ficha en Alegra no recibía sugerencia.
  const [linea] = await conProductoPropio([factura]);
  const productoIds = [...new Set(linea.productos.map(p => p.productoPropioId).filter(Boolean))];
  if (productoIds.length === 0) return {};

  const [categorias, rotaciones, configPrecios] = await Promise.all([
    query(`SELECT p.id, c.nombre AS categoria
             FROM producto p LEFT JOIN categoria_producto c ON c.id = p.categoria_id
            WHERE p.id = ANY($1::int[])`, [productoIds]),
    // En el momento, con la ventana de 12 meses con la que se calibró el
    // motor (ver ventas/rotacion.js). Antes era la foto de producto_rotacion.
    query(`SELECT producto_id, clase, unidades_mes, clientes_distintos FROM (${SQL_ROTACION_PRECIOS}) r WHERE producto_id = ANY($1::int[])`, [productoIds]),
    obtenerConfigPrecios()
  ]);

  const categoriaPorProducto = new Map(categorias.rows.map(r => [r.id, r.categoria || '']));
  const rotacionPorProducto = new Map(rotaciones.rows.map(r => [Number(r.producto_id), {
    clase: r.clase,
    unidadesMes: r.unidades_mes !== null ? Number(r.unidades_mes) : null,
    clientesDistintos: Number(r.clientes_distintos)
  }]));

  const sugerencias = {};
  for (const producto of linea.productos) {
    if (!producto.productoPropioId) continue;

    const { costoSinIvaConDescuento, factor } = calcularCostoUnitarioPropio(producto, producto.mapeo?.factorConversion);
    const costoSinIva = costoSinIvaConDescuento / factor;

    const categoria = categoriaPorProducto.get(producto.productoPropioId) || '';
    const rotacion = rotacionPorProducto.get(producto.productoPropioId) || { clase: null, unidadesMes: null, clientesDistintos: null };
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
 * Los productos de una factura en revisión, del MAESTRO PROPIO: nombre,
 * precio y costo de hoy, y la tarifa con que se venden.
 *
 * Hasta el 2026-10-04 esto le preguntaba a Alegra EN VIVO, un producto por
 * llamada. Dos problemas: el precio que mostraba era el de Alegra, no el del
 * sistema —y "Registrar compra" cambia el precio en `producto`, así que la
 * revisión siguiente comparaba contra un precio viejo—; y un producto sin
 * ficha en Alegra no se podía revisar.
 *
 * EL PRECIO VA CON IVA y el costo con IVA, como los espera la pantalla. La
 * tarifa es la del impuesto del producto: 0 es 0 (un exento), y `null` quiere
 * decir que el producto no tiene impuesto asignado. Antes un exento llegaba
 * como 13 %, porque "sin impuesto" y "0 %" eran lo mismo para un `|| 13`.
 *
 * @param {Array<number|string>} productoIds  ids de `producto`
 * @returns llaveado por `producto.id`
 */
async function getProductosDeRevision(productoIds) {
  const ids = [...new Set((productoIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  const productos = {};
  if (ids.length === 0) return { productos, total: 0, solicitados: 0 };

  const { rows } = await query(`
    SELECT p.id, p.nombre, p.referencia, p.precio_sin_iva::float8 AS precio_sin_iva,
           p.costo_con_iva::float8 AS costo_con_iva, i.tarifa::float8 AS tarifa
      FROM producto p
      LEFT JOIN impuesto i ON i.id = p.impuesto_id
     WHERE p.id = ANY($1::int[])`, [ids]);

  for (const p of rows) {
    productos[p.id] = {
      id: p.id,
      name: p.nombre,
      reference: p.referencia,
      // Sin impuesto asignado no se inventa el precio con IVA: se muestra el
      // precio tal cual, y la tarifa en null lo dice.
      price: p.tarifa === null ? p.precio_sin_iva : precioConImpuesto(p.precio_sin_iva, p.tarifa),
      priceWithoutTax: p.precio_sin_iva,
      cost: p.costo_con_iva || 0,
      taxPercentage: p.tarifa
    };
  }

  return { productos, total: rows.length, solicitados: ids.length };
}

/**
 * A cada línea de estas facturas le agrega su producto propio
 * (`productoPropioId`). `producto_id` no está en el esquema de Prisma
 * (migración 038), así que se lee aparte, en una sola consulta.
 */
async function conProductoPropio(facturas) {
  const idsDeFacturas = facturas.map(f => f.id);
  if (idsDeFacturas.length === 0) return facturas;

  const { rows } = await query(
    'SELECT id, producto_id FROM productos_factura_proveedor WHERE factura_id = ANY($1::uuid[])', [idsDeFacturas]);
  const propio = new Map(rows.map(r => [r.id, r.producto_id]));

  return facturas.map(f => ({
    ...f,
    productos: (f.productos || []).map(l => ({ ...l, productoPropioId: propio.get(l.id) ?? null }))
  }));
}

/**
 * Qué se le manda a Alegra por UNA línea de la factura: el costo nuevo y, si
 * se ajustó, el precio. `updateData` null = no hay nada que mandar.
 *
 * UNA LÍNEA DE REGALÍA NO TOCA EL COSTO. La bonificación del proveedor viene
 * como otra línea del MISMO producto con 100 % de descuento: su costo sale 0,
 * y mandarlo pisaba el costo bueno de la línea pagada con ₡0 (medido: 4 veces
 * en el histórico). Peor, las líneas se mandan en paralelo, así que cuál
 * quedaba dependía de cuál llegaba último. Una regalía no es el costo del
 * producto: es mercadería gratis dentro de una compra.
 *
 * OJO: el costo va anidado en `inventory.unitCost` — un `cost` suelto en la
 * raíz del payload Alegra lo ignora en silencio (el PUT responde 200 y el
 * costo no cambia).
 */
function actualizacionDeLinea(producto, precioAjustado) {
  // Costo real por unidad propia — fórmula única, ver precios/costo.js.
  const { costoUnitario, costoSinIvaConDescuento, factor } = calcularCostoUnitarioPropio(
    producto,
    producto.mapeo?.factorConversion
  );
  const costoSinIvaPropio = costoSinIvaConDescuento / factor;
  const esRegalia = !(costoUnitario > 0);
  const precioNuevo = precioAjustado && Number(precioAjustado) > 0 ? parseFloat(precioAjustado) : null;

  const updateData = {};
  if (!esRegalia) updateData.inventory = { unitCost: (Math.round(costoUnitario * 100) / 100).toString() };
  if (precioNuevo !== null) updateData.price = precioNuevo;

  return {
    updateData: Object.keys(updateData).length > 0 ? updateData : null,
    esRegalia,
    costoUnitario,
    costoSinIvaPropio,
    precioNuevo
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

  // NO SE ENVÍA DOS VECES.
  // El estado solo llega a ENVIADA cuando la factura de compra se creó en
  // Alegra; si ese paso falla se queda atrás justamente para poder
  // reintentar. Así que ENVIADA es prueba de que allá ya existe, y un
  // segundo envío crearía otra factura de compra por la misma compra.
  //
  // La guarda va acá y no solo en la pantalla porque el historial abre la
  // misma vista de revisión con el botón de enviar activo: alcanzaba con
  // abrir una de las 838 facturas ya enviadas y tocarlo.
  if (factura.estado === 'ENVIADA') {
    throw httpError(409,
      `La factura ${factura.numeroConsecutivo} ya se envió a Alegra. ` +
      `Volver a enviarla crearía una segunda factura de compra por la misma compra.`);
  }

  // Todos los productos relacionados
  const productos = factura.productos.filter(p => p.estadoRelacionado === 'RELACIONADO');

  console.log(`📦 Procesando ${productos.length} productos...`);

  // PASO 1: Crear factura de proveedor en Alegra PRIMERO (con precios originales)
  // Esto evita que los precios ajustados afecten la factura de compra
  let alegraFacturaId = null;
  // Por qué no se creó la factura. Se devuelve al frontend para que muestre
  // la causa real en vez de culpar siempre a los permisos.
  let motivoFacturaNoCreada = null;

  const problemasItems = await revisarItemsParaFactura(productos);
  if (problemasItems.length > 0) {
    motivoFacturaNoCreada = problemasItems
      .map(x => `"${x.nombre}" ${x.motivo}`)
      .join('; ');
    console.warn(`⚠️ No se intenta crear la factura en Alegra: ${motivoFacturaNoCreada}`);
  }

  try {
    if (problemasItems.length > 0) {
      // Alegra rechazaría la factura entera igual; se evita la llamada y se
      // conserva el motivo concreto, que es lo que se puede accionar.
      throw new Error(motivoFacturaNoCreada);
    }

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

    // Preparar items de la factura con precios ORIGINALES del proveedor.
    // Los ids de impuesto salen de la cuenta de Alegra (ver utils/impuestosAlegra.js).
    const impuestosAlegra = await cargarImpuestosAlegra();
    const items = construirItemsFactura(productos, impuestosAlegra);

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
    // El mensaje de Alegra es lo único que dice qué pasó de verdad. Antes se
    // perdía acá y la pantalla mostraba "sin permisos" pasara lo que pasara.
    const detalleAlegra = facturaError.response?.data?.message;
    const codigoAlegra = facturaError.response?.data?.code;
    if (!motivoFacturaNoCreada) {
      motivoFacturaNoCreada = detalleAlegra
        ? `${detalleAlegra}${codigoAlegra ? ` (código ${codigoAlegra})` : ''}`
        : facturaError.message;
    }
    console.warn('⚠️ Error creando factura de compra:', motivoFacturaNoCreada);
    // Continuar para actualizar costos y precios incluso si falla la factura
  }

  // PASO 2: Actualizar costos Y precios en Alegra EN PARALELO
  // Esto se hace DESPUÉS de crear la factura para no afectar su total
  console.log(`⚡ Actualizando ${productos.length} productos en paralelo...`);

  // El precio que tienen AHORA, antes de tocarlos. Sin esto la bitácora
  // guardaba `precio_anterior` en NULL —180 filas seguidas— y no había forma
  // de saber si un cambio subió o bajó el precio. Es justo el dato que
  // necesitan los catálogos para destacar lo que se abarató.
  const preciosPrevios = new Map();
  const idsParaPrevio = productos.map(p => p.alegraItemId).filter(Boolean).map(String);
  if (idsParaPrevio.length > 0) {
    try {
      const r = await query(
        `SELECT alegra_id, price FROM alegra_products_cache WHERE alegra_id = ANY($1::varchar[]);`,
        [idsParaPrevio]
      );
      r.rows.forEach(x => preciosPrevios.set(String(x.alegra_id), Number(x.price)));
    } catch (e) {
      // Sin el precio previo la bitácora queda incompleta, pero el envío
      // sigue: lo importante es aplicar costos y precios en Alegra.
      console.warn('⚠️ No se pudieron leer los precios previos:', e.message);
    }
  }

  const updatePromises = productos.map(async (producto) => {
    try {
      const alegraId = producto.alegraItemId;
      if (!alegraId) return { success: false, precioAjustado: false };

      const {
        updateData, esRegalia, costoUnitario: costoNuevoNegocio, costoSinIvaPropio, precioNuevo
      } = actualizacionDeLinea(producto, preciosAjustados[producto.id]);
      const precioAjustado = precioNuevo !== null;
      if (precioAjustado) console.log(`💰 Precio ajustado: ${producto.descripcion} → ₡${precioNuevo.toFixed(2)}`);

      if (!updateData) {
        console.log(`🎁 ${producto.descripcion}: línea de regalía (costo 0), el costo del producto no se toca`);
        return { success: true, precioAjustado: false, sinCosto: true };
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
          const precioPrevio = preciosPrevios.get(String(alegraId));
          await query(`
            INSERT INTO precio_historico (alegra_item_id, precio_anterior, precio_nuevo, costo_al_momento, margen_resultante, origen, factura_id)
            VALUES ($1, $2, $3, $4, $5, 'revision_precios', $6)
          `, [
            alegraId,
            Number.isFinite(precioPrevio) && precioPrevio > 0 ? precioPrevio : null,
            precioNuevo,
            costoSinIvaPropio,
            margenResultante !== null ? Math.round(margenResultante * 100) / 100 : null,
            facturaId
          ]);
        } catch (historicoError) {
          // No debe tumbar el envío por un fallo de bitácora — el precio ya
          // se aplicó en Alegra, que es la fuente de verdad.
          console.warn(`⚠️ No se pudo registrar precio_historico para ${producto.descripcion}:`, historicoError.message);
        }
      }

      if (esRegalia) {
        console.log(`🎁 ${producto.descripcion}: línea de regalía, solo se aplicó el precio`);
        return { success: true, precioAjustado, sinCosto: true };
      }
      console.log(`✅ Costo actualizado: ${producto.descripcion} → ₡${costoNuevoNegocio.toFixed(2)}`);
      return { success: true, precioAjustado };
    } catch (error) {
      console.error(`⚠️ Error actualizando ${producto.descripcion}:`, error.message);
      return { success: false, precioAjustado: false };
    }
  });

  const results = await Promise.all(updatePromises);

  const costosActualizados = results.filter(r => r.success && !r.sinCosto).length;
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
    motivoFacturaNoCreada,
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
  devolverFactura,
  getFacturasRelacionadas,
  getProductosDeRevision,
  obtenerSugerenciasPrecio,
  enviarFacturaAlegra,
  // Funciones puras exportadas para tests
  construirItemsFactura,
  inferirTipoIdentificacion,
  actualizacionDeLinea
};

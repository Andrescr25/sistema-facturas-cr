/**
 * Revision-Precios Module - Service
 * Lógica de negocio para la revisión de precios de facturas de proveedores.
 *
 * LO QUE LA PANTALLA USA sale del maestro propio (2026-10-04): las facturas
 * con el `productoPropioId` de cada línea, los productos de la revisión y el
 * precio sugerido. Registrar la compra es de compras.service.js.
 *
 * YA NO LE HABLA A ALEGRA. `enviarFacturaAlegra` —el "Enviar a Alegra" de
 * antes: creaba la factura de compra allá (`POST /bills`) y le escribía costo
 * y precio a cada producto (`PUT /items`)— se retiró el 2026-10-04. La
 * pantalla no lo llamaba desde que existe "Registrar compra", y en esta rama
 * a Alegra solo se le lee. Lo que ese camino cuidaba vive ahora en
 * compras.service.js: no registrar dos veces la misma factura, y que una
 * línea de regalía no pise el costo.
 *
 * También se quitaron, por no tener pantalla, pruebas ni nadie que las
 * llamara: productos pendientes con sugerencias de la caché, confirmar y
 * rechazar una relación por el id de Alegra, las estadísticas, y
 * `actualizar-precio`, que además reescribía el precio de la línea de la
 * factura RECIBIDA.
 */

const prisma = require('../../../lib/prisma');
const { SQL_ROTACION_PRECIOS } = require('../ventas/rotacion');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { query } = require('../../../config/database');
const { calcularCostoUnitarioPropio } = require('../precios/costo');
const { calcularPrecioSugerido } = require('../precios/motor');
const { obtenerConfigPrecios, resolverConfig } = require('../precios/config');

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
 * Cómo quedó cada compra ya registrada ante Hacienda, para la lista de
 * Registradas: `aceptacionHacienda` es el estado de su aceptación de
 * producción, 'sin_enviar' si conserva el XML del proveedor y todavía no
 * salió, o null si no hay nada que decir (las anteriores al 2026-10-10 no
 * tienen el XML: no se aceptaron desde acá y no se marcan como pendientes).
 *
 * Sin esto, una aceptación que no salió al registrar la compra solo se veía
 * abriendo esa compra.
 */
async function conAceptacion(facturas) {
  if (!facturas.length) return facturas;
  const { rows } = await query(
    `SELECT c.factura_proveedor_id AS id,
            COALESCE(h.estado, CASE WHEN c.xml_ruta IS NOT NULL AND c.estado = 'registrada' THEN 'sin_enviar' END) AS estado
       FROM compra c
       LEFT JOIN LATERAL (
         SELECT estado FROM hacienda_comprobante
          WHERE origen = 'compra' AND ambiente = 'produccion' AND origen_id = c.id
          ORDER BY revision_documento DESC LIMIT 1) h ON TRUE
      WHERE c.factura_proveedor_id = ANY($1::uuid[])`,
    [facturas.map(f => f.id)]
  );
  const porFactura = new Map(rows.map(r => [r.id, r.estado]));
  return facturas.map(f => ({ ...f, aceptacionHacienda: porFactura.get(f.id) || null }));
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

  const lista = await conProductoPropio(facturas);
  return { facturas: estado === 'ENVIADA' ? await conAceptacion(lista) : lista, total: facturas.length };
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
  if (factura.estado === 'GASTO_RECURRENTE') {
    throw httpError(409, 'Esta factura se gestiona como gasto: no se devuelve al catálogo.');
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

module.exports = {
  getFacturas,
  devolverFactura,
  getFacturasRelacionadas,
  getProductosDeRevision,
  obtenerSugerenciasPrecio
};

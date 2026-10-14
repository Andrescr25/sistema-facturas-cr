/**
 * Las notas que se le escribieron a un producto al facturarlo, para poder
 * leerlas mientras se le compra al proveedor.
 *
 * QUÉ SON. En Facturación se le puede escribir una nota a cada línea. Son
 * cortas y casi siempre dicen QUÉ VARIANTE quiere el cliente: "AZUL", "OJO
 * NEGRA", "Negro y rojo", "Solo 75w", "Niño y niña". Bodega ya las muestra en
 * su recuadro ámbar, porque quien alista necesita saberlo. Quien COMPRA lo
 * necesita igual: muchas describen variantes que todavía no existen en el
 * catálogo, así que sin ellas se compra la equivocada.
 *
 * DE DÓNDE SALEN. De la línea de la factura PROPIA (`factura_linea.descripcion`),
 * la misma línea del faltante: mismo producto, misma factura. Hasta el
 * 2026-09-30 (migración independencia/032) la nota vivía solo en Alegra y se
 * leía recorriendo su lista de facturas, una página de ~5 segundos tras otra;
 * ahora es una consulta.
 *
 * UNA LÍNEA SIN NOTA trae la descripción del producto (Facturación la pone
 * cuando el cajero no escribe nada, y Alegra hacía lo mismo). Esa no es una
 * nota: es el producto describiéndose, y se descarta.
 *
 * VA APARTE DEL REPORTE a propósito, como antes: si falla, lo único que falta
 * son las notas.
 */

const { faltanteOperativo, cantidadSinEnviar } = require('./faltantesCompra.sql');
const { query } = require('../../../config/database');
const { filtrosOperacion, JOIN_CICLO } = require('../rutas/operacionCiclo.service');

/** Las líneas con nota detrás de los faltantes pendientes, lo más nuevo primero. */
async function lineasConNota(fechaInicio = null, filtros = {}) {
  const params = [];
  let filtroFecha = '';
  if (fechaInicio) {
    params.push(fechaInicio);
    filtroFecha = ' AND fa.fecha >= $1::date';
  }

  const where = []; filtrosOperacion(filtros, where, params);
  if (where.length) filtroFecha += ' AND ' + where.join(' AND ');
  const { rows } = await query(`
    SELECT DISTINCT l.id AS linea_id, l.producto_id, btrim(l.descripcion) AS nota,
           fa.id AS factura_id, fa.cliente_id, fa.numero, COALESCE(c.nombre,fa.cliente_nombre) AS cliente_nombre, fa.fecha::text AS fecha
      FROM faltantes f
      JOIN factura fa ON fa.id = f.factura_propia_id LEFT JOIN cliente c ON c.id=fa.cliente_id ${JOIN_CICLO('fa')}
      JOIN factura_linea l ON l.factura_id = fa.id AND l.producto_id = f.producto_propio_id
      LEFT JOIN producto p ON p.id = l.producto_id
     WHERE ${faltanteOperativo()} AND ${cantidadSinEnviar()}>0
       AND btrim(COALESCE(l.descripcion, '')) <> ''
       AND btrim(l.descripcion) IS DISTINCT FROM btrim(COALESCE(p.descripcion, ''))${filtroFecha}
     ORDER BY fecha DESC, factura_id DESC
  `, params);

  return rows;
}

/**
 * Las notas por producto.
 *
 * @returns {Promise<{porProducto: object, facturas: number, desde: string|null}>}
 *   `porProducto` va indexado por el id PROPIO del producto (`producto.id`),
 *   el mismo `producto_id` que trae cada línea del reporte.
 */
async function notasPorProducto(fechaInicio = null, filtros = {}) {
  const lineas = await lineasConNota(fechaInicio, filtros);
  const porProducto = {};
  const facturas = new Set();

  // Vienen de la más nueva a la más vieja: la primera de cada nota es la que
  // describe lo que se está pidiendo ahora.
  for (const l of lineas) {
    facturas.add(l.factura_id);
    const producto = String(l.producto_id);
    if (!porProducto[producto]) porProducto[producto] = [];

    // La MISMA nota repetida se junta en una sola, con la cuenta de cuántas
    // veces y de qué clientes. Sin esto, un "Entregado" escrito cinco veces
    // llenaría la pantalla y taparía la que sí importa.
    const iguales = porProducto[producto].find((n) => n.nota.toLowerCase() === l.nota.toLowerCase());
    if (iguales) {
      iguales.veces++;
      iguales.origenes.push({ facturaId:l.factura_id,clienteId:l.cliente_id,cliente:l.cliente_nombre });
      if (l.cliente_nombre && !iguales.clientes.includes(l.cliente_nombre)) iguales.clientes.push(l.cliente_nombre);
    } else {
      porProducto[producto].push({
        nota: l.nota,
        origenes:[{ facturaId:l.factura_id,clienteId:l.cliente_id,cliente:l.cliente_nombre }],
        veces: 1,
        clientes: l.cliente_nombre ? [l.cliente_nombre] : [],
        numeroFactura: l.numero,
        fecha: l.fecha
      });
    }
  }

  const desde = lineas.map((l) => l.fecha).filter(Boolean).sort()[0] || null;
  return { porProducto, facturas: facturas.size, desde };
}

module.exports = { notasPorProducto, lineasConNota };

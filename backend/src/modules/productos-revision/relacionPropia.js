/**
 * La relación entre lo que factura un proveedor y un producto, escrita por
 * `producto.id`.
 *
 * Son dos cosas, y las dos cuelgan del producto PROPIO desde la migración 038:
 *
 *   · la LÍNEA (`productos_factura_proveedor.producto_id`): qué producto es
 *     este renglón de esta factura;
 *   · el MAPEO (`supplier_product_mapping.producto_id`): a qué producto
 *     corresponde ese código de ese proveedor, para las facturas que vengan.
 *
 * Hasta el 2026-10-03 las dos se escribían con el id de Alegra, y relacionar
 * exigía que el producto existiera allá: un producto creado en el sistema no
 * se podía relacionar con ninguna compra, así que no tenía costo de compras ni
 * proveedor.
 *
 * LOS CAMPOS DE ALEGRA (`alegra_item_id`, `alegra_reference`, `alegra_name`)
 * se siguen llenando cuando el producto tiene ficha allá, porque el resto del
 * módulo todavía los lee. Salen SIEMPRE del producto propio, nunca al revés:
 * acá nadie recibe un id de Alegra.
 *
 * ES SQL Y NO PRISMA porque `producto_id` no está en el esquema de Prisma
 * (regenerar el cliente le cambiaría el suyo a `main`, que comparte
 * `node_modules`).
 *
 * EN EL MAPEO, UN PRODUCTO SIN FICHA EN ALEGRA GUARDA '' Y NO NULL. El
 * cliente de Prisma que hay generado declara `alegraItemId` obligatorio, y el
 * mapeo lo siguen leyendo con Prisma el buzón, Revisión de Precios, el
 * catálogo y este módulo: UNA fila con NULL y todas esas lecturas revientan
 * (P2032) — la factura entera deja de abrir. Se vio en el navegador, no en
 * las pruebas: los dobles de Prisma no validan tipos. La cadena vacía se lee
 * bien, en JavaScript vale como "no tiene" y no cruza con ningún id real. La
 * migración 038 deja la columna NOT NULL para que no dependa de acordarse.
 * En la LÍNEA y en `costo_historico` sí va NULL: ahí Prisma lo tiene opcional.
 * El día que se regenere el cliente, esto se cambia por NULL de verdad.
 */

const { query } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');

const SIN_FICHA_EN_ALEGRA = '';

// `created_date` y `last_used_date` no tienen zona, y quien más escribe esta
// tabla es Prisma, que los manda en UTC. Se escribe igual, para que ordenar
// por "último uso" no mezcle dos relojes.
const AHORA_UTC = "(NOW() AT TIME ZONE 'UTC')";

/** El producto propio con lo que la relación necesita; 404 si no existe. */
async function productoPropio(productoId, db = { query }) {
  const { rows } = await db.query(
    'SELECT id, nombre, referencia, alegra_id, activo FROM producto WHERE id = $1', [idValido(productoId)]);
  if (!rows[0]) throw httpError(404, 'Ese producto no existe.');
  return rows[0];
}

/**
 * Crea o actualiza el mapeo de un código de proveedor hacia un producto.
 *
 * La llave es (cédula del proveedor, código): un proveedor llama a cada cosa
 * de una sola manera. Volver a relacionar el mismo código lo apunta al
 * producto nuevo y suma un uso.
 *
 * @param {{cedula: string, codigo: string, nombreProveedor: string, descripcion: string}} linea
 * @param {{id: number, nombre: string, referencia: string|null, alegra_id: string|null}} producto
 */
async function guardarMapeo(linea, producto, { origen = 'manual', confianza = 100 } = {}, db = { query }) {
  const { rows } = await db.query(`
    INSERT INTO supplier_product_mapping
      (supplier_name, supplier_cedula, supplier_code, supplier_desc,
       producto_id, proveedor_id,
       alegra_item_id, alegra_reference, alegra_name,
       confidence, origen, created_date, last_used_date)
    VALUES ($1, $2::text, $3, $4,
            $5, (SELECT id FROM proveedor WHERE identificacion = $2::text),
            $6, $7, $8,
            $9, $10, ${AHORA_UTC}, ${AHORA_UTC})
    ON CONFLICT (supplier_cedula, supplier_code) DO UPDATE SET
      supplier_name    = EXCLUDED.supplier_name,
      supplier_desc    = EXCLUDED.supplier_desc,
      producto_id      = EXCLUDED.producto_id,
      proveedor_id     = COALESCE(EXCLUDED.proveedor_id, supplier_product_mapping.proveedor_id),
      alegra_item_id   = EXCLUDED.alegra_item_id,
      alegra_reference = EXCLUDED.alegra_reference,
      alegra_name      = EXCLUDED.alegra_name,
      confidence       = EXCLUDED.confidence,
      last_used_date   = EXCLUDED.last_used_date,
      times_used       = supplier_product_mapping.times_used + 1
    RETURNING *`,
  [
    String(linea.nombreProveedor || '').trim(), linea.cedula, linea.codigo, linea.descripcion,
    producto.id,
    producto.alegra_id || SIN_FICHA_EN_ALEGRA, producto.referencia || null, producto.nombre,
    confianza, origen
  ]);
  return rows[0];
}

/** Apunta un mapeo que ya existe a otro producto (Gestionar Relaciones). */
async function cambiarProductoDelMapeo(mapeoId, producto, db = { query }) {
  const { rows } = await db.query(`
    UPDATE supplier_product_mapping
       SET producto_id = $2, alegra_item_id = $3, alegra_reference = $4, alegra_name = $5,
           confidence = 100, last_used_date = ${AHORA_UTC}, origen = 'manual'
     WHERE id = $1
     RETURNING *`,
  [mapeoId, producto.id, producto.alegra_id || SIN_FICHA_EN_ALEGRA, producto.referencia || null, producto.nombre]);
  if (!rows[0]) throw httpError(404, 'Relación no encontrada', { mapeoId });
  return rows[0];
}

/**
 * Deja relacionadas con un producto las líneas indicadas: por sus ids, o todas
 * las de un mapeo.
 *
 * @param {{lineaIds?: string[], deMapeoId?: string}} cuales
 * @returns {Promise<number>} cuántas líneas quedaron relacionadas
 */
async function relacionarLineas(cuales, producto, { mapeoId, confianza = 100 }, db = { query }) {
  const { filtro, valor } = filtroDeLineas(cuales);
  const { rowCount } = await db.query(`
    UPDATE productos_factura_proveedor
       SET producto_id = $2, alegra_item_id = $3,
           estado_relacionado = 'RELACIONADO', confianza = $4, mapeo_id = $5
     WHERE ${filtro}`,
  [valor, producto.id, producto.alegra_id || null, confianza, mapeoId]);
  return rowCount;
}

/** Devuelve líneas a PENDIENTE, sin producto ni mapeo. */
async function soltarLineas(cuales, db = { query }) {
  const { filtro, valor } = filtroDeLineas(cuales);
  const { rowCount } = await db.query(`
    UPDATE productos_factura_proveedor
       SET producto_id = NULL, alegra_item_id = NULL,
           estado_relacionado = 'PENDIENTE', confianza = NULL, mapeo_id = NULL
     WHERE ${filtro}`, [valor]);
  return rowCount;
}

function filtroDeLineas({ lineaIds, deMapeoId }) {
  if (deMapeoId) return { filtro: 'mapeo_id = $1::uuid', valor: deMapeoId };
  if (Array.isArray(lineaIds) && lineaIds.length > 0) return { filtro: 'id = ANY($1::uuid[])', valor: lineaIds.map(String) };
  throw new Error('relacionPropia: hay que decir qué líneas (lineaIds o deMapeoId)');
}

/**
 * Para lo que TODAVÍA relaciona por el id de Alegra (confirmar en Revisión de
 * Precios, crear producto en Alegra) o por un mapeo ya existente (el buzón al
 * recibir una factura): deja el `producto_id` de esas líneas con su producto
 * propio. Se llama después de cada una de esas escrituras, igual que
 * `ligarIdsPropios` con el mapeo, y se va con ellas.
 *
 * De dónde sale el producto, en orden: del id de Alegra de la línea y, si no
 * lo tiene, del mapeo con el que se relacionó — que es el caso de un producto
 * sin ficha en Alegra cuando llega otra factura del mismo proveedor. Una
 * línea que no está relacionada queda sin producto.
 *
 * De paso, el '' que el buzón copia del mapeo de un producto sin ficha vuelve
 * a ser NULL en la línea: ahí "no tiene id de Alegra" se escribe NULL.
 *
 * NO FALLA: que no se pueda colgar del id propio no es motivo para perder la
 * relación que alguien acaba de confirmar ni la factura que acaba de llegar.
 *
 * @param {string[]|{facturaId: string}} cuales  ids de líneas, o una factura entera
 */
async function ligarProductoDeLineas(cuales) {
  let filtro, valor;
  if (cuales && !Array.isArray(cuales) && cuales.facturaId) {
    filtro = 'l.factura_id = $1::uuid';
    valor = String(cuales.facturaId);
  } else {
    const ids = [...new Set((cuales || []).filter(Boolean).map(String))];
    if (ids.length === 0) return;
    filtro = 'l.id = ANY($1::uuid[])';
    valor = ids;
  }

  try {
    await query(`
      UPDATE productos_factura_proveedor l
         SET producto_id = CASE WHEN l.estado_relacionado = 'RELACIONADO' THEN COALESCE(
               (SELECT p.id FROM producto p WHERE p.alegra_id = NULLIF(l.alegra_item_id::text, '')),
               (SELECT m.producto_id FROM supplier_product_mapping m WHERE m.id = l.mapeo_id)
             ) END,
             alegra_item_id = NULLIF(l.alegra_item_id, '')
       WHERE ${filtro}`, [valor]);
  } catch (error) {
    console.warn('⚠️ No se pudo ligar el producto propio de las líneas:', error.message);
  }
}

module.exports = {
  SIN_FICHA_EN_ALEGRA,
  productoPropio, guardarMapeo, cambiarProductoDelMapeo, relacionarLineas, soltarLineas, ligarProductoDeLineas
};

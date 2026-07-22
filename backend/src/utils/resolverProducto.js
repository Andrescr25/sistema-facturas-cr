/**
 * Resuelve la identidad REAL de un producto (alegra_id + referencia + nombre)
 * anclando siempre en alegra_products_cache — la única fuente donde
 * alegra_id y referencia están garantizados como campos separados y
 * correctos. alegraId y referencia deben tratarse como campos distintos que
 * nunca se sustituyen entre sí ni se comparan contra el `id` local de
 * `productos` (la llave primaria local no tiene relación con Alegra).
 */

const { query } = require('../../config/database');

async function buscarEnCacheAlegra({ alegraId, referencia }) {
  if (alegraId !== null && alegraId !== undefined && alegraId !== '') {
    const porId = await query(
      `SELECT alegra_id, name, reference FROM alegra_products_cache WHERE alegra_id = $1 LIMIT 1`,
      [String(alegraId)]
    );
    if (porId.rows.length > 0) return porId.rows[0];
  }

  if (referencia !== null && referencia !== undefined && referencia !== '') {
    const porReferencia = await query(
      `SELECT alegra_id, name, reference FROM alegra_products_cache WHERE reference = $1 LIMIT 1`,
      [String(referencia)]
    );
    if (porReferencia.rows.length > 0) return porReferencia.rows[0];
  }

  return null;
}

/**
 * Encuentra (o crea/actualiza) la fila local de `productos` para un
 * producto, siempre anclada por alegra_id cuando se puede resolver contra
 * la caché — el mismo patrón limpio que ya usa product.service.js. Nunca
 * compara un valor ambiguo contra `codigo` y luego contra `id` local como
 * si fueran intercambiables.
 *
 * @param {Object} datos
 * @param {string|number|null} datos.alegraId - ID interno de Alegra, si se conoce con certeza.
 * @param {string|null} datos.referencia - Referencia/código, si se conoce con certeza.
 * @param {string|null} datos.nombreFallback - Nombre a usar solo si el producto no está en la caché de Alegra.
 * @returns {Promise<{productoId:number, alegraId:string|null, codigo:string|null, nombre:string|null}|null>}
 */
async function resolverProductoLocal({ alegraId = null, referencia = null, nombreFallback = null } = {}) {
  const real = await buscarEnCacheAlegra({ alegraId, referencia });

  if (real) {
    const existente = await query(
      `SELECT id FROM productos WHERE alegra_id = $1 LIMIT 1`,
      [real.alegra_id]
    );

    if (existente.rows.length > 0) {
      await query(
        `UPDATE productos SET nombre = $1, codigo = $2 WHERE alegra_id = $3`,
        [real.name, real.reference, real.alegra_id]
      );
      return { productoId: existente.rows[0].id, alegraId: real.alegra_id, codigo: real.reference, nombre: real.name };
    }

    const creado = await query(
      `INSERT INTO productos (alegra_id, nombre, codigo) VALUES ($1, $2, $3) RETURNING id`,
      [real.alegra_id, real.name, real.reference]
    );
    return { productoId: creado.rows[0].id, alegraId: real.alegra_id, codigo: real.reference, nombre: real.name };
  }

  // No está sincronizado en alegra_products_cache todavía. Como último
  // recurso se busca/crea SOLO por referencia explícita — nunca por un
  // valor que podría en realidad ser un alegra_id o cualquier otra cosa.
  if (!referencia) return null;

  const existentePorCodigo = await query(
    `SELECT id, nombre FROM productos WHERE codigo = $1 LIMIT 1`,
    [referencia]
  );
  if (existentePorCodigo.rows.length > 0) {
    return {
      productoId: existentePorCodigo.rows[0].id,
      alegraId: null,
      codigo: referencia,
      nombre: existentePorCodigo.rows[0].nombre
    };
  }

  const creado = await query(
    `INSERT INTO productos (codigo, nombre) VALUES ($1, $2) RETURNING id`,
    [referencia, nombreFallback || 'Producto sin nombre']
  );
  return { productoId: creado.rows[0].id, alegraId: null, codigo: referencia, nombre: nombreFallback || null };
}

module.exports = { resolverProductoLocal };

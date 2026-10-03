/**
 * Lista MANUAL que se muestra en la tablet. No deduce qué es nuevo.
 *
 * Sección 12, parte 3: producto_id es producto.id; id es la entrada de esta
 * lista. Se quita por el id de entrada para poder retirar también un registro
 * histórico sin correspondencia. alegra_item_id conserva SOLO la referencia
 * anterior: jamás se usa como sustituto del producto propio (migración 036).
 */
const { query } = require('../../../config/database');
const { idValido, httpError } = require('../../utils/validacion');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { DESDE, VISIBLE, NORMALIZAR_SQL, normalizar } = require('../catalogo-clientes/consultaProducto');

const SQL_TABLA = `
  CREATE TABLE IF NOT EXISTS producto_nuevo_catalogo (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER REFERENCES producto(id),
    alegra_item_id VARCHAR(100),
    agregado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    agregado_por VARCHAR(255)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS producto_nuevo_catalogo_producto_unico
    ON producto_nuevo_catalogo (producto_id) WHERE producto_id IS NOT NULL;
`;

/** Datos actuales del maestro, sin copiar nombre, foto ni precio a la lista. */
async function listar() {
  const { rows } = await query(`
    SELECT n.id, n.producto_id, n.alegra_item_id, n.agregado_en, n.agregado_por,
           p.nombre, p.referencia, cat.nombre AS categoria, p.imagen_url,
           p.activo, p.oculto, p.precio_sin_iva
      FROM producto_nuevo_catalogo n
      LEFT JOIN producto p ON p.id = n.producto_id
      LEFT JOIN categoria_producto cat ON cat.id = p.categoria_id
     ORDER BY n.agregado_en DESC, n.id DESC`);
  return rows.map(r => {
    const existe = r.nombre !== null && r.nombre !== undefined;
    const visible = existe && r.activo && !r.oculto && Number(r.precio_sin_iva) > 0;
    return {
      registroId: r.id, productoId: r.producto_id,
      nombre: existe ? r.nombre : `Producto histórico ${r.alegra_item_id || r.id}`,
      referencia: r.referencia || '', categoria: r.categoria || '', imagenUrl: r.imagen_url || '',
      agregadoEn: r.agregado_en, agregadoPor: r.agregado_por || null,
      visibleEnCatalogo: Boolean(visible),
      motivoNoVisible: visible ? null : !existe ? 'Falta conciliar la ficha del producto'
        : r.oculto ? 'Está oculto en el catálogo' : !r.activo ? 'Está inactivo'
          : 'No tiene precio de venta'
    };
  });
}

/** Buscador propio de esta lista; no usa el de devoluciones ni consulta Alegra. */
async function buscar(texto) {
  const q = normalizar(texto).trim();
  if (q.length < 2) return [];
  const { rows } = await query(`
    SELECT p.id AS "productoId", p.nombre, p.referencia, cat.nombre AS categoria
    ${DESDE} WHERE ${VISIBLE}
      AND ${NORMALIZAR_SQL("p.nombre || ' ' || COALESCE(p.referencia, '')")} LIKE $1
    ORDER BY p.nombre, p.id LIMIT 30`, [`%${q}%`]);
  return rows;
}

/** Doble toque: una entrada por producto, sin cambiar la fecha de la anterior. */
async function agregar(productoId, usuario = null) {
  const id = idValido(productoId);
  const { rows: [producto] } = await query(`
    SELECT p.id, p.nombre, p.activo, p.oculto, p.precio_sin_iva FROM producto p WHERE p.id = $1`, [id]);
  if (!producto) throw httpError(404, 'Ese producto no está en el catálogo.');
  if (!producto.activo || producto.oculto || Number(producto.precio_sin_iva) <= 0) {
    throw httpError(409, `"${producto.nombre}" no está disponible en el catálogo.`);
  }
  const { rows } = await query(`
    INSERT INTO producto_nuevo_catalogo (producto_id, agregado_por, agregado_en)
    VALUES ($1, $2, ${AHORA_CR_SQL})
    ON CONFLICT (producto_id) WHERE producto_id IS NOT NULL DO NOTHING
    RETURNING id`, [id, usuario]);
  return { productoId: id, nombre: producto.nombre, yaEstaba: rows.length === 0 };
}

/** registroId, no productoId: funciona también para una entrada sin ficha. */
async function quitar(registroId) {
  const id = idValido(registroId);
  const { rows } = await query('DELETE FROM producto_nuevo_catalogo WHERE id = $1 RETURNING id', [id]);
  if (!rows.length) throw httpError(404, 'Ese producto no estaba en Productos nuevos.');
  return { registroId: id, quitado: true };
}

/** La tablet solo baja fichas visibles; la administración conserva las demás. */
async function idsParaCatalogo() {
  const { rows } = await query(`
    SELECT n.producto_id, n.agregado_en FROM producto_nuevo_catalogo n
    JOIN producto p ON p.id = n.producto_id
    WHERE ${VISIBLE} ORDER BY n.agregado_en DESC, n.id DESC`);
  return rows.map(r => ({ productoId: r.producto_id, agregadoEn: r.agregado_en }));
}
module.exports = { SQL_TABLA, listar, buscar, agregar, quitar, idsParaCatalogo };

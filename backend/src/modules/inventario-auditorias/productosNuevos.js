/**
 * "Productos nuevos": una lista MANUAL de productos que el catálogo del agente
 * muestra en su propia sección, justo después de "Bajamos el precio".
 *
 * Decisión del usuario (2026-09-27): se maneja a mano desde Auditoría de
 * Inventario — agregar o quitar, nada más. No hay regla automática (fecha de
 * creación en Alegra, primera compra…): qué es "nuevo" para enseñárselo al
 * cliente lo decide una persona.
 *
 * La tabla guarda solo QUÉ producto, cuándo y quién lo agregó. El nombre, la
 * foto y el precio salen siempre de alegra_products_cache: copiarlos acá los
 * dejaría viejos en cuanto alguien cambie el producto.
 *
 * Un producto de la lista que se desactiva o se oculta deja de verse en el
 * catálogo (la tablet solo baja los activos), pero NO se saca solo de la
 * lista: la pantalla lo marca, para que nadie crea que el sistema está roto
 * ni pierda la lista si lo vuelven a activar.
 */

const { query } = require('../../../config/database');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const SQL_TABLA = `
  CREATE TABLE IF NOT EXISTS producto_nuevo_catalogo (
      alegra_item_id VARCHAR(100) PRIMARY KEY,
      agregado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      agregado_por VARCHAR(255)
  );
`;

/** La lista para administrarla: lo más reciente arriba, con los datos del catálogo. */
async function listar() {
  const { rows } = await query(`
    SELECT n.alegra_item_id, n.agregado_en, n.agregado_por,
           p.name, p.reference, p.category, p.image_url, p.status, p.hidden_locally
      FROM producto_nuevo_catalogo n
      LEFT JOIN alegra_products_cache p ON p.alegra_id = n.alegra_item_id
     ORDER BY n.agregado_en DESC, n.alegra_item_id
  `);
  return rows.map((r) => {
    const existe = r.name !== null && r.name !== undefined;
    const visible = existe && r.status === 'active' && !r.hidden_locally;
    return {
      alegraItemId: String(r.alegra_item_id),
      nombre: existe ? r.name : `Producto ${r.alegra_item_id}`,
      referencia: r.reference || '',
      categoria: r.category || '',
      imagenUrl: r.image_url || '',
      agregadoEn: r.agregado_en,
      agregadoPor: r.agregado_por || null,
      visibleEnCatalogo: visible,
      motivoNoVisible: visible ? null
        : !existe ? 'Ya no está en el catálogo'
          : r.hidden_locally ? 'Está oculto en el catálogo'
            : 'Está inactivo en Alegra'
    };
  });
}

/**
 * Agrega un producto. Tiene que estar en el catálogo y visible: si no, no
 * saldría en la tablet y parecería que agregarlo no sirvió. Agregar uno que ya
 * estaba no es un error (doble toque): se avisa y no cambia su fecha.
 */
async function agregar(alegraItemId, usuario = null) {
  const id = String(alegraItemId || '').trim();
  if (!id) throw httpError(400, 'Falta el producto.');

  const { rows } = await query(
    `SELECT alegra_id, name, status, hidden_locally FROM alegra_products_cache WHERE alegra_id = $1`,
    [id]
  );
  const producto = rows[0];
  if (!producto) throw httpError(404, 'Ese producto no está en el catálogo.');
  if (producto.status !== 'active' || producto.hidden_locally) {
    throw httpError(409, `"${producto.name}" está inactivo u oculto: no saldría en el catálogo.`);
  }

  const r = await query(`
    INSERT INTO producto_nuevo_catalogo (alegra_item_id, agregado_por)
    VALUES ($1, $2)
    ON CONFLICT (alegra_item_id) DO NOTHING
    RETURNING alegra_item_id
  `, [id, usuario]);
  return { alegraItemId: id, nombre: producto.name, yaEstaba: r.rows.length === 0 };
}

async function quitar(alegraItemId) {
  const id = String(alegraItemId || '').trim();
  const r = await query(
    `DELETE FROM producto_nuevo_catalogo WHERE alegra_item_id = $1 RETURNING alegra_item_id`,
    [id]
  );
  if (r.rows.length === 0) throw httpError(404, 'Ese producto no estaba en Productos nuevos.');
  return { alegraItemId: id, quitado: true };
}

/**
 * Lo que baja la tablet: solo los ids, lo más reciente primero. El producto
 * completo (foto, precio, categoría) ya lo tiene del catálogo descargado.
 */
async function idsParaCatalogo() {
  const { rows } = await query(
    `SELECT alegra_item_id, agregado_en FROM producto_nuevo_catalogo ORDER BY agregado_en DESC, alegra_item_id`
  );
  return rows.map((r) => ({ alegraItemId: String(r.alegra_item_id), agregadoEn: r.agregado_en }));
}

module.exports = { SQL_TABLA, listar, agregar, quitar, idsParaCatalogo };

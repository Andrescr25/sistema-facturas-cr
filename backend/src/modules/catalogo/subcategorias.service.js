/**
 * Subcategorías dentro de cada categoría.
 *
 * Las categorías vienen de Alegra y llegan planas: "Productos de PVC" son 118
 * piezas con sanitario, potable, conduit, pegamentos y accesorios de baño
 * revueltos; en Eléctrica pasa con los bombillos y en Pesca con casi todo.
 * (Desde 2026-09-21 también se pueden crear categorías nuevas EN Alegra —ver
 * categorias.service.js `crear`—, pero eso no cambia nada de lo de acá: cada
 * categoría, nueva o vieja, se sigue pudiendo partir en subcategorías propias.)
 *
 * LA SUBCATEGORÍA ES NUESTRA. No se manda a Alegra ni se lee de allá: sirve
 * para ordenar el catálogo acá adentro, y se puede crear la que haga falta.
 *
 * SE CUELGA DEL NOMBRE DE LA CATEGORÍA porque es lo que guarda la caché de
 * productos (`alegra_products_cache.category`). Cruzarlo por un id de Alegra
 * exigiría un dato que la caché no tiene.
 */

const { query } = require('../../../config/database');

const LARGO_NOMBRE = 80;

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** Un nombre de subcategoría utilizable, o se dice por qué no lo es. */
function nombreValido(valor) {
  const nombre = String(valor || '').trim().replace(/\s+/g, ' ');
  if (!nombre) throw httpError(400, 'La subcategoría necesita un nombre.');
  if (nombre.length > LARGO_NOMBRE) throw httpError(400, `El nombre no puede pasar de ${LARGO_NOMBRE} caracteres.`);
  return nombre;
}

function categoriaValida(valor) {
  const categoria = String(valor || '').trim();
  if (!categoria) throw httpError(400, 'Hay que decir a qué categoría pertenece.');
  return categoria;
}

/**
 * Las subcategorías de una categoría, con cuántos productos tiene cada una.
 * Sin categoría, todas — es lo que usa la pantalla para pintar el desplegable
 * de cualquier producto sin volver a preguntar.
 */
async function listar({ categoria = '', incluirInactivas = false } = {}) {
  const condiciones = [];
  const params = [];

  if (String(categoria).trim()) {
    params.push(String(categoria).trim());
    condiciones.push(`s.categoria = $${params.length}`);
  }
  if (!incluirInactivas) condiciones.push('s.activo');

  // El conteo usa el mismo criterio de "visible" que la lista de productos
  // (status activo Y no oculto localmente) — antes solo miraba `status`, así
  // que un producto oculto seguía sumando a una subcategoría que en la
  // pantalla real aparecía con menos productos de los que este número decía.
  const { rows } = await query(`
    SELECT s.id, s.categoria, s.nombre, s.activo, s.orden,
           (SELECT COUNT(*)::int FROM alegra_products_cache p
             WHERE p.subcategoria_id = s.id AND p.status = 'active' AND p.hidden_locally = false) AS productos
      FROM subcategoria s
      ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''}
     ORDER BY s.categoria, s.orden, s.nombre
  `, params);

  return rows;
}

async function crear({ categoria, nombre }) {
  const cat = categoriaValida(categoria);
  const nom = nombreValido(nombre);

  try {
    const { rows } = await query(
      `INSERT INTO subcategoria (categoria, nombre) VALUES ($1, $2) RETURNING id, categoria, nombre, activo`,
      [cat, nom]
    );
    return { ...rows[0], productos: 0 };
  } catch (error) {
    // El índice único es por (categoría, nombre en minúsculas): dos iguales no
    // se distinguirían en el desplegable.
    if (error.code === '23505') {
      throw httpError(409, `"${nom}" ya existe en ${cat}.`);
    }
    throw error;
  }
}

async function renombrar(id, { nombre }) {
  const nom = nombreValido(nombre);

  try {
    const { rows } = await query(
      `UPDATE subcategoria SET nombre = $2 WHERE id = $1 RETURNING id, categoria, nombre, activo`,
      [Number(id), nom]
    );
    if (!rows[0]) throw httpError(404, 'No existe esa subcategoría.');
    return rows[0];
  } catch (error) {
    if (error.code === '23505') throw httpError(409, `"${nom}" ya existe en esa categoría.`);
    throw error;
  }
}

/**
 * Desactivar NO borra ni desclasifica: los productos siguen colgando de ella.
 * Es lo que permite dejar de ofrecerla sin perder el trabajo de clasificar —y
 * poder volver atrás si se desactivó por error.
 */
async function cambiarEstado(id, activo) {
  const { rows } = await query(
    `UPDATE subcategoria SET activo = $2 WHERE id = $1 RETURNING id, categoria, nombre, activo`,
    [Number(id), Boolean(activo)]
  );
  if (!rows[0]) throw httpError(404, 'No existe esa subcategoría.');
  return rows[0];
}

/**
 * Ponerle (o quitarle) la subcategoría a un producto.
 *
 * Se comprueba que la subcategoría sea DE LA CATEGORÍA DEL PRODUCTO. Sin eso
 * se podía marcar un bombillo como "Sanitario" mandando el id a mano, y el
 * catálogo quedaba peor ordenado que antes.
 */
async function asignarAProducto(alegraId, subcategoriaId) {
  const id = String(alegraId || '').trim();
  if (!id) throw httpError(400, 'Falta el producto.');

  const { rows: prod } = await query(
    `SELECT alegra_id, category FROM alegra_products_cache WHERE alegra_id = $1`, [id]
  );
  if (!prod[0]) throw httpError(404, 'No existe ese producto en el catálogo.');

  if (subcategoriaId === null || subcategoriaId === undefined || subcategoriaId === '') {
    await query(`UPDATE alegra_products_cache SET subcategoria_id = NULL WHERE alegra_id = $1`, [id]);
    return { alegraId: id, subcategoriaId: null };
  }

  const { rows: sub } = await query(
    `SELECT id, categoria, nombre FROM subcategoria WHERE id = $1`, [Number(subcategoriaId)]
  );
  if (!sub[0]) throw httpError(404, 'No existe esa subcategoría.');

  if (sub[0].categoria !== prod[0].category) {
    throw httpError(400,
      `"${sub[0].nombre}" es de ${sub[0].categoria} y el producto está en ${prod[0].category || 'sin categoría'}.`);
  }

  await query(`UPDATE alegra_products_cache SET subcategoria_id = $2 WHERE alegra_id = $1`, [id, sub[0].id]);
  return { alegraId: id, subcategoriaId: sub[0].id, nombre: sub[0].nombre };
}

/**
 * Fija el orden dentro de una categoría: `idsEnOrden` es TODA la lista de
 * subcategorías de esa categoría, en el orden final deseado (el que ya se ve
 * en pantalla tras mover una). Cada una recibe su posición como `orden`.
 *
 * Se valida que cada id sea de ESA categoría por la misma razón que
 * `asignarAProducto`: sin eso, un id mandado a mano podría mover el orden de
 * una subcategoría de otra categoría sin que nadie se diera cuenta.
 *
 * UN SOLO UPDATE, NO UNO POR FILA. Antes eran hasta 19 `UPDATE` seguidos,
 * cada uno su propio viaje contra el pooler de Supabase — el botón de
 * "subir/bajar" tardaba ~3 s en reaccionar por esto, no por la base en sí.
 */
async function reordenar(categoria, idsEnOrden) {
  const cat = categoriaValida(categoria);
  if (!Array.isArray(idsEnOrden) || idsEnOrden.length === 0) {
    throw httpError(400, 'Falta la lista de subcategorías en su nuevo orden.');
  }

  const ids = idsEnOrden.map((id) => Number(id));
  const { rows } = await query(
    `SELECT id, categoria FROM subcategoria WHERE id = ANY($1::int[])`, [ids]
  );
  const ajena = rows.find((r) => r.categoria !== cat);
  if (ajena) throw httpError(400, `La subcategoría ${ajena.id} no es de ${cat}.`);
  if (rows.length !== ids.length) throw httpError(404, 'Alguna subcategoría no existe.');

  const ordenes = ids.map((_, i) => i);
  await query(`
    UPDATE subcategoria s
       SET orden = v.orden
      FROM (SELECT * FROM UNNEST($1::int[], $2::int[])) AS v(id, orden)
     WHERE s.id = v.id
  `, [ids, ordenes]);

  return listar({ categoria: cat, incluirInactivas: true });
}

/**
 * Ponerle (o quitarle) la subcategoría a VARIOS productos de una vez — la
 * acción en lote del riel. Misma regla que `asignarAProducto`: todos tienen
 * que ser de la categoría de la subcategoría destino, y un solo `UPDATE`.
 */
async function asignarLote(alegraIds, subcategoriaId) {
  if (!Array.isArray(alegraIds) || alegraIds.length === 0) {
    throw httpError(400, 'Falta la lista de productos.');
  }
  const ids = alegraIds.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) throw httpError(400, 'Falta la lista de productos.');

  if (subcategoriaId === null || subcategoriaId === undefined || subcategoriaId === '') {
    const { rowCount } = await query(
      `UPDATE alegra_products_cache SET subcategoria_id = NULL WHERE alegra_id = ANY($1::varchar[])`,
      [ids]
    );
    return { actualizados: rowCount, subcategoriaId: null };
  }

  const { rows: sub } = await query(
    `SELECT id, categoria, nombre FROM subcategoria WHERE id = $1`, [Number(subcategoriaId)]
  );
  if (!sub[0]) throw httpError(404, 'No existe esa subcategoría.');

  const { rows: ajenos } = await query(
    `SELECT alegra_id FROM alegra_products_cache WHERE alegra_id = ANY($1::varchar[]) AND category <> $2`,
    [ids, sub[0].categoria]
  );
  if (ajenos.length > 0) {
    throw httpError(400, `${ajenos.length} de los productos no son de ${sub[0].categoria}.`);
  }

  const { rowCount } = await query(
    `UPDATE alegra_products_cache SET subcategoria_id = $2 WHERE alegra_id = ANY($1::varchar[])`,
    [ids, sub[0].id]
  );
  return { actualizados: rowCount, subcategoriaId: sub[0].id, nombre: sub[0].nombre };
}

/**
 * Borra una subcategoría — solo si ya no tiene NINGÚN producto colgado
 * (activo, inactivo u oculto: `ON DELETE SET NULL` la desengancharía igual,
 * pero borrar una que todavía clasifica algo sería perder ese trabajo sin
 * avisar). Mover los productos primero con `asignarLote`.
 */
async function eliminar(id) {
  const subId = Number(id);
  const { rows: cuenta } = await query(
    `SELECT COUNT(*)::int AS n FROM alegra_products_cache WHERE subcategoria_id = $1`, [subId]
  );
  if (cuenta[0].n > 0) {
    throw httpError(409, `Todavía tiene ${cuenta[0].n} producto(s). Muévelos antes de borrarla.`);
  }

  const { rows } = await query(`DELETE FROM subcategoria WHERE id = $1 RETURNING id`, [subId]);
  if (!rows[0]) throw httpError(404, 'No existe esa subcategoría.');
  return { id: subId };
}

module.exports = { listar, crear, renombrar, cambiarEstado, asignarAProducto, asignarLote, eliminar, reordenar };

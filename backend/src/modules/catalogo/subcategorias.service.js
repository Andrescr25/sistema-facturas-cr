/**
 * Subcategorías dentro de cada categoría.
 *
 * Las categorías vienen de Alegra y son PLANAS: 18 bolsas grandes donde no se
 * encuentra nada. "Productos de PVC" son 118 piezas con sanitario, potable,
 * conduit, pegamentos y accesorios de baño revueltos; en Eléctrica pasa con los
 * bombillos y en Pesca con casi todo.
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

  const { rows } = await query(`
    SELECT s.id, s.categoria, s.nombre, s.activo,
           (SELECT COUNT(*)::int FROM alegra_products_cache p
             WHERE p.subcategoria_id = s.id AND p.status = 'active') AS productos
      FROM subcategoria s
      ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''}
     ORDER BY s.categoria, s.nombre
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

module.exports = { listar, crear, renombrar, cambiarEstado, asignarAProducto };

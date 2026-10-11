/**
 * Las dos tablas propias de la taxonomía del catálogo: `subcategoria` y
 * `categoria_config`.
 *
 * - `subcategoria`: cómo se parte cada categoría por dentro ("Productos de
 *   PVC" son más de cien piezas con sanitario, potable, conduit y pegamentos
 *   revueltos). Es nuestra desde siempre; nunca se mandó a Alegra.
 * - `categoria_config`: en qué orden se muestran las categorías y con qué
 *   nombre EN PANTALLA. El nombre real sigue siendo el de la categoría.
 *
 * LAS DOS CUELGAN DEL NOMBRE DE LA CATEGORÍA, no de su id. Es herencia de
 * cuando las categorías eran de Alegra y la caché de productos solo guardaba
 * el nombre; se conserva porque las filas ya existen así y `main` las sigue
 * usando igual. Las categorías, en esta rama, son `categoria_producto`.
 *
 * VINO DE `catalogo/categorias.service.js` Y `catalogo/subcategorias.service.js`
 * (2026-10-04), que eran de la Gestión de Catálogo vieja. Lo que se dejó
 * atrás al mudarlo:
 *   · `listar` las categorías le PREGUNTABA A ALEGRA EN VIVO, y de ahí salía
 *     el orden que baja la tablet. Ahora salen de `categoria_producto`.
 *   · el conteo de productos de cada subcategoría miraba la caché de Alegra;
 *     ahora mira `producto`, con el mismo "visible" que el resto.
 *   · crear una categoría en Alegra, y asignar o contar subcategorías sobre
 *     la caché: ninguna pantalla de esta rama lo usaba.
 */

const { query } = require('../../../config/database');
const { httpError } = require('../../utils/validacion');

const LARGO_NOMBRE = 80;

// "Visible" es lo mismo en todas las consultas del catálogo: activo y no
// oculto. Si el conteo de una tarjeta usara otro criterio que la lista de
// adentro, la tarjeta diría 37 y adentro habría 35.
const VISIBLE = 'p.activo = TRUE AND p.oculto = FALSE';

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

// ─── Categorías: orden y nombre visible ────────────────────────────────────

/**
 * Las categorías en el ORDEN CANÓNICO: el de `categoria_config.orden`. Es el
 * único lugar donde se decide, y lo usan Gestión de Catálogo (el árbol) y el
 * catálogo del agente (lo que baja la tablet): si cada uno lo armara por su
 * lado, tarde o temprano mostrarían órdenes distintos.
 *
 * Sale la categoría activa, y también la desactivada que todavía tiene
 * productos a la vista: esconderla escondería esos productos.
 *
 * Sin orden explícito —la fila no existe, o existe solo por un renombre— va
 * después de cualquiera ya ordenada, alfabéticas entre ellas.
 *
 * @returns {Promise<{id: number, name: string, nombreVisible: string, orden: number}[]>}
 */
async function categoriasEnOrden(db = { query }) {
  const { rows } = await db.query(`
    SELECT c.id, c.nombre, cfg.nombre_visible, cfg.orden
      FROM categoria_producto c
      LEFT JOIN categoria_config cfg ON cfg.categoria = c.nombre
     WHERE c.activo
        OR EXISTS (SELECT 1 FROM producto p WHERE p.categoria_id = c.id AND ${VISIBLE})`);

  return [...rows]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((c, i) => ({
      id: c.id,
      name: c.nombre,
      nombreVisible: c.nombre_visible || c.nombre,
      orden: c.orden !== null && c.orden !== undefined ? c.orden : 100000 + i
    }))
    .sort((a, b) => a.orden - b.orden);
}

async function renombrarCategoria(categoria, nombreVisible) {
  const cat = String(categoria || '').trim();
  if (!cat) throw httpError(400, 'Falta la categoría.');
  const nombre = String(nombreVisible || '').trim();

  await query(`
    INSERT INTO categoria_config (categoria, nombre_visible)
    VALUES ($1, $2)
    ON CONFLICT (categoria) DO UPDATE SET nombre_visible = $2, actualizado_en = CURRENT_TIMESTAMP
  `, [cat, nombre || null]);

  return { categoria: cat, nombreVisible: nombre || cat };
}

/**
 * Fija el orden exacto: `categoriasEnOrden` es la lista COMPLETA de nombres
 * reales de categoría en el orden final deseado. Cada una recibe su posición
 * como `orden`, igual que `reordenarSubcategorias`.
 *
 * UN SOLO UPSERT, NO UNO POR CATEGORÍA. La primera versión hacía un INSERT por
 * cada una —17 viajes de ida y vuelta, uno detrás de otro— y ESO era el botón
 * de "subir/bajar" que tardaba ~3 s en reaccionar, no la base en sí.
 */
async function reordenarCategorias(nombresEnOrden) {
  if (!Array.isArray(nombresEnOrden) || nombresEnOrden.length === 0) {
    throw httpError(400, 'Falta la lista de categorías en su nuevo orden.');
  }

  const nombres = nombresEnOrden.map((c) => String(c || '').trim()).filter(Boolean);
  if (nombres.length === 0) throw httpError(400, 'Falta la lista de categorías en su nuevo orden.');
  const ordenes = nombres.map((_, i) => i);

  await query(`
    INSERT INTO categoria_config (categoria, orden)
    SELECT * FROM UNNEST($1::varchar[], $2::int[])
    ON CONFLICT (categoria) DO UPDATE SET orden = EXCLUDED.orden, actualizado_en = CURRENT_TIMESTAMP
  `, [nombres, ordenes]);

  const { rows: config } = await query(
    `SELECT categoria, nombre_visible FROM categoria_config WHERE categoria = ANY($1::varchar[])`, [nombres]
  );
  const nombreVisiblePorCategoria = new Map(config.map((c) => [c.categoria, c.nombre_visible]));

  return nombres.map((nombre, i) => ({
    name: nombre,
    nombreVisible: nombreVisiblePorCategoria.get(nombre) || nombre,
    orden: i
  }));
}

// ─── Subcategorías ─────────────────────────────────────────────────────────

/**
 * Las subcategorías de una categoría, con cuántos productos a la vista tiene
 * cada una. Sin categoría, todas — es lo que baja la tablet para ordenar el
 * catálogo sin volver a preguntar.
 */
async function listarSubcategorias({ categoria = '', incluirInactivas = false } = {}) {
  const condiciones = [];
  const params = [];

  if (String(categoria).trim()) {
    params.push(String(categoria).trim());
    condiciones.push(`s.categoria = $${params.length}`);
  }
  if (!incluirInactivas) condiciones.push('s.activo');

  const { rows } = await query(`
    SELECT s.id, s.categoria, s.nombre, s.activo, s.orden,
           (SELECT COUNT(*)::int FROM producto p WHERE p.subcategoria_id = s.id AND ${VISIBLE}) AS productos
      FROM subcategoria s
      ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''}
     ORDER BY s.categoria, s.orden, s.nombre
  `, params);

  return rows;
}

async function crearSubcategoria({ categoria, nombre }) {
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
    if (error.code === '23505') throw httpError(409, `"${nom}" ya existe en ${cat}.`);
    throw error;
  }
}

async function renombrarSubcategoria(id, { nombre } = {}) {
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
 * Fija el orden dentro de una categoría: `idsEnOrden` es TODA la lista de
 * subcategorías de esa categoría, en el orden final deseado. Cada una recibe
 * su posición como `orden`.
 *
 * Se valida que cada id sea de ESA categoría: sin eso, un id mandado a mano
 * podría mover el orden de una subcategoría de otra categoría sin que nadie
 * se diera cuenta.
 *
 * UN SOLO UPDATE, NO UNO POR FILA: eran hasta 19 seguidos, y el botón de
 * "subir/bajar" tardaba ~3 s en reaccionar por eso.
 */
async function reordenarSubcategorias(categoria, idsEnOrden) {
  const cat = categoriaValida(categoria);
  if (!Array.isArray(idsEnOrden) || idsEnOrden.length === 0) {
    throw httpError(400, 'Falta la lista de subcategorías en su nuevo orden.');
  }

  const ids = idsEnOrden.map((id) => Number(id));
  const { rows } = await query(`SELECT id, categoria FROM subcategoria WHERE id = ANY($1::int[])`, [ids]);
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

  return listarSubcategorias({ categoria: cat, incluirInactivas: true });
}

module.exports = {
  VISIBLE,
  categoriasEnOrden, renombrarCategoria, reordenarCategorias,
  listarSubcategorias, crearSubcategoria, renombrarSubcategoria, reordenarSubcategorias
};

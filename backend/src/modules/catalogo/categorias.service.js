/**
 * Orden y nombre visible de las categorías de Alegra.
 *
 * LAS CATEGORÍAS SON DE ALEGRA, PLANAS Y DE SOLO LECTURA — igual que dice
 * subcategorias.service.js. Lo único que se guarda ACÁ es dónde mostrarlas y
 * cómo llamarlas EN PANTALLA; el nombre real de Alegra (`categoria.name`) es
 * el que sigue viajando en `alegra_products_cache.category` y en
 * `subcategoria.categoria`, y nunca cambia por esto.
 *
 * SIN CONFIGURAR, UNA CATEGORÍA MANTIENE EL ORDEN QUE ALEGRA DEVUELVE. Eso es
 * lo que se veía antes de que existiera esta pantalla, así que activarla no
 * reordena nada hasta que alguien mueva algo a propósito.
 */
const { query } = require('../../../config/database');
const { getProductService } = require('../../integrations/alegra');

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function listar() {
  const productService = getProductService();
  const alegraCategorias = await productService.getItemCategories();

  const { rows: config } = await query(`SELECT categoria, nombre_visible, orden FROM categoria_config`);
  const configPorNombre = new Map(config.map((c) => [c.categoria, c]));

  return alegraCategorias
    .map((c, index) => {
      const cfg = configPorNombre.get(c.name);
      return {
        id: c.id,
        name: c.name,
        nombreVisible: cfg?.nombre_visible || c.name,
        // Sin orden explícito —fila que no existe, o que existe solo por un
        // renombre y nunca se movió— va después de cualquiera ya ordenada,
        // respetando el orden en que llegó de Alegra entre ellas.
        orden: (cfg && cfg.orden !== null) ? cfg.orden : 100000 + index
      };
    })
    .sort((a, b) => a.orden - b.orden || a.name.localeCompare(b.name));
}

/**
 * Las categorías sin preguntarle a Alegra: las que tienen productos en la
 * copia local, con el mismo orden y nombre visible de `categoria_config`.
 *
 * Es el respaldo de Gestión de Catálogo cuando Alegra no responde — sin esto
 * la pantalla entera quedaba vacía, aunque todos los productos estuvieran en
 * la copia local. Sin `id` de Alegra: con este respaldo no se puede mover
 * nada de categoría (eso escribe en Alegra de todos modos).
 */
async function listarDesdeCache() {
  const [{ rows: nombres }, { rows: config }] = await Promise.all([
    query(`SELECT DISTINCT category AS name FROM alegra_products_cache
            WHERE category <> '' AND status = 'active' AND hidden_locally = false
            ORDER BY category`),
    query(`SELECT categoria, nombre_visible, orden FROM categoria_config`)
  ]);
  const configPorNombre = new Map(config.map((c) => [c.categoria, c]));

  return nombres
    .map(({ name }, index) => {
      const cfg = configPorNombre.get(name);
      return {
        id: null,
        name,
        nombreVisible: cfg?.nombre_visible || name,
        orden: (cfg && cfg.orden !== null) ? cfg.orden : 100000 + index
      };
    })
    .sort((a, b) => a.orden - b.orden || a.name.localeCompare(b.name));
}

async function renombrar(categoria, nombreVisible) {
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
 * reales de categoría (los de Alegra) en el orden final deseado. Cada una
 * recibe su posición como `orden`, igual que `subcategorias.reordenar`.
 *
 * UN SOLO UPSERT, NO UNO POR CATEGORÍA. La primera versión hacía un
 * `INSERT` por cada una —17 viajes de ida y vuelta contra el pooler de
 * Supabase, uno detrás de otro— y ESO era el botón de "subir/bajar" que
 * tardaba ~3 s en reaccionar, no la base en sí. Tampoco vuelve a preguntarle
 * a Alegra (`listar()` sí lo hace): un reordenamiento no cambia qué
 * categorías existen, así que arma la respuesta con lo que ya se sabe
 * (los nombres que llegaron) más `nombre_visible` de la config local.
 */
async function reordenar(categoriasEnOrden) {
  if (!Array.isArray(categoriasEnOrden) || categoriasEnOrden.length === 0) {
    throw httpError(400, 'Falta la lista de categorías en su nuevo orden.');
  }

  const nombres = categoriasEnOrden.map((c) => String(c || '').trim()).filter(Boolean);
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

/**
 * Crea una categoría nueva EN ALEGRA. Hasta ahora las categorías eran de
 * solo lectura porque nunca hizo falta crear una — esta es la excepción: el
 * usuario pidió partir una categoría existente en dos (2026-09-21, "Línea de
 * Ciclo" en bici/moto) y consolidar otra ("Bolsas y Desechables").
 */
async function crear(nombre) {
  const nom = String(nombre || '').trim();
  if (!nom) throw httpError(400, 'Falta el nombre de la categoría.');

  const existentes = await getProductService().getItemCategories();
  const yaExiste = existentes.find((c) => c.name.toLowerCase() === nom.toLowerCase());
  if (yaExiste) throw httpError(409, `"${nom}" ya existe en Alegra (id ${yaExiste.id}).`);

  return getProductService().createItemCategory(nom);
}

module.exports = { listar, listarDesdeCache, renombrar, reordenar, crear };

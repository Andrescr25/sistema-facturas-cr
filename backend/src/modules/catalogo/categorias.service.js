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
 */
async function reordenar(categoriasEnOrden) {
  if (!Array.isArray(categoriasEnOrden) || categoriasEnOrden.length === 0) {
    throw httpError(400, 'Falta la lista de categorías en su nuevo orden.');
  }

  for (let i = 0; i < categoriasEnOrden.length; i++) {
    const cat = String(categoriasEnOrden[i] || '').trim();
    if (!cat) continue;
    await query(`
      INSERT INTO categoria_config (categoria, orden)
      VALUES ($1, $2)
      ON CONFLICT (categoria) DO UPDATE SET orden = $2, actualizado_en = CURRENT_TIMESTAMP
    `, [cat, i]);
  }

  return listar();
}

module.exports = { listar, renombrar, reordenar };

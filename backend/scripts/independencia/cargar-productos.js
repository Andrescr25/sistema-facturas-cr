/**
 * Carga los productos y las categorías de Alegra en la base propia
 * (rama independencia-alegra).
 *
 * LEE de Alegra (solo GET) y ESCRIBE en la base local: la guarda de
 * config/aislado.js impide que la base sea la de producción. Se puede correr
 * las veces que haga falta: actualiza por `alegra_id`.
 *
 * Requiere la configuración cargada antes (impuestos): el producto apunta a
 * `impuesto.id`, no a un número suelto.
 *
 * Uso:  node scripts/independencia/cargar-productos.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { pool } = require('../../config/database');
const { getClient } = require('../../src/integrations/alegra');
const { productoDesdeAlegra, categoriaDesdeAlegra } = require('../../src/modules/productos/desdeAlegra');

const alegra = getClient();
const COLUMNAS = [
  'nombre', 'referencia', 'descripcion', 'cabys', 'impuesto_id', 'unidad', 'categoria_id',
  'precio_sin_iva', 'costo_con_iva', 'inventariable', 'es_medicamento', 'forma_farmaceutica',
  'registro_sanitario', 'imagen_url', 'activo', 'oculto', 'alegra_id'
];

// Al actualizar, la foto propia NO se pisa con la de Alegra: la nuestra vive en
// nuestro almacenamiento y la de Alegra viene firmada y vence. Sin esto, cada
// carga desharía el trabajo de scripts/independencia/migrar-fotos.js.
const ASIGNACIONES = COLUMNAS.filter(c => c !== 'alegra_id').map(c => (
  c === 'imagen_url'
    ? "imagen_url = CASE WHEN producto.imagen_url LIKE '/archivos/%' THEN producto.imagen_url ELSE EXCLUDED.imagen_url END"
    : `${c} = EXCLUDED.${c}`
));

async function leer(ruta, params) {
  const r = await alegra.get(ruta, params);
  if (r?.success === false) throw new Error(`Alegra ${ruta}: ${r.status} ${r.data?.message || r.error}`);
  return r?.data ?? r;
}

async function leerTodosLosItems() {
  const todos = [];
  for (let start = 0; ; start += 30) {
    const pagina = await leer('/items', { start, limit: 30 });
    if (!Array.isArray(pagina)) throw new Error('Alegra /items devolvió algo que no es una lista');
    todos.push(...pagina);
    if (pagina.length < 30) break;
  }
  return todos;
}

async function main() {
  const inicio = Date.now();
  const [categoriasAlegra, items] = await Promise.all([leer('/item-categories'), leerTodosLosItems()]);
  console.log(`→ Leídos de Alegra: ${items.length} productos y ${categoriasAlegra.length} categorías en ${Math.round((Date.now() - inicio) / 1000)} s`);

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const categorias = new Map();
    for (const c of categoriasAlegra) {
      const f = categoriaDesdeAlegra(c);
      const { rows } = await cliente.query(
        `INSERT INTO categoria_producto (nombre, activo, alegra_id) VALUES ($1, $2, $3)
         ON CONFLICT (alegra_id) DO UPDATE SET nombre = EXCLUDED.nombre, activo = EXCLUDED.activo
         RETURNING id`,
        [f.nombre, f.activo, f.alegra_id]
      );
      categorias.set(f.alegra_id, rows[0].id);
    }

    const { rows: imp } = await cliente.query('SELECT id, alegra_id FROM impuesto WHERE alegra_id IS NOT NULL');
    if (imp.length === 0) throw new Error('No hay impuestos cargados: corra antes cargar-configuracion.js');
    const impuestos = new Map(imp.map(r => [String(r.alegra_id), r.id]));

    const { rows: ocu } = await cliente.query('SELECT alegra_id FROM alegra_products_cache WHERE hidden_locally = TRUE');
    const ocultos = new Set(ocu.map(r => String(r.alegra_id)));

    const avisos = {};
    let activos = 0;
    for (const item of items) {
      const { fila, avisos: a } = productoDesdeAlegra(item, { impuestos, categorias, ocultos });
      if (fila.activo) {
        activos++;
        for (const x of a) avisos[x] = (avisos[x] || 0) + 1;
      }
      await cliente.query(
        `INSERT INTO producto (${COLUMNAS.join(', ')}) VALUES (${COLUMNAS.map((_, i) => `$${i + 1}`).join(', ')})
         ON CONFLICT (alegra_id) DO UPDATE SET ${ASIGNACIONES.join(', ')},
           actualizado_en = CURRENT_TIMESTAMP`,
        COLUMNAS.map(c => fila[c])
      );
    }

    // Hasta el corte, `main` sigue clasificando en subcategorías sobre la
    // caché de Alegra: se copia la que calza con la categoría que el producto
    // tiene acá, y se suelta la que quedó de otra (se movió de categoría).
    // Son las mismas dos sentencias de la migración 030.
    const copiadas = await cliente.query(`
      UPDATE producto p SET subcategoria_id = c.subcategoria_id
        FROM alegra_products_cache c
        JOIN subcategoria s ON s.id = c.subcategoria_id
        JOIN categoria_producto cp ON cp.nombre = s.categoria
       WHERE c.alegra_id = p.alegra_id AND cp.id = p.categoria_id
         AND p.subcategoria_id IS DISTINCT FROM c.subcategoria_id`);
    const sueltas = await cliente.query(`
      UPDATE producto p SET subcategoria_id = NULL
        FROM subcategoria s
       WHERE s.id = p.subcategoria_id
         AND s.categoria IS DISTINCT FROM (SELECT nombre FROM categoria_producto WHERE id = p.categoria_id)`);

    await cliente.query('COMMIT');
    console.log(`✓ Productos cargados: ${items.length} (${activos} activos), ${categorias.size} categorías.`);
    console.log(`  Subcategorías: ${copiadas.rowCount} copiadas de main, ${sueltas.rowCount} soltadas por cambio de categoría.`);
    console.log('  Pendientes de corregir en los ACTIVOS:', Object.keys(avisos).length ? JSON.stringify(avisos) : 'ninguno');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✗ No se cargaron los productos:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });

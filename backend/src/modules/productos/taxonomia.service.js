/**
 * Categorías, subcategorías y acciones en lote de Gestión de Catálogo, sobre
 * el maestro propio (`producto`).
 *
 * Es el mismo rediseño que en `main` (categorías como tarjetas, subcategorías
 * adentro, mover de a muchos) pero sin la caché de Alegra: allá la
 * subcategoría cuelga de `alegra_products_cache` y cambiar de categoría es un
 * trabajo de fondo que le escribe a Alegra producto por producto. Acá las dos
 * cosas son un UPDATE sobre `producto`, en el momento.
 *
 * LO QUE SE REUTILIZA DE `main`, SIN COPIARLO: `subcategoria` y
 * `categoria_config` son tablas locales en las dos ramas, colgadas del NOMBRE
 * de la categoría. Crear, renombrar y ordenar subcategorías, y el orden y el
 * nombre visible de las categorías, usan los servicios de `catalogo/` tal
 * cual. Lo que cuenta, asigna, mueve o borra mira `producto`, y vive acá.
 *
 * "VISIBLE" ES LO MISMO EN TODAS LAS CONSULTAS: activo y no oculto. Si el
 * conteo de una tarjeta usara otro criterio que la lista de adentro, la
 * tarjeta diría 37 y adentro habría 35.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { clasificarProducto } = require('../precios/auditoria');
const subcategoriasTabla = require('../catalogo/subcategorias.service');
const categoriasConfig = require('../catalogo/categorias.service');
const { SQL_ROTACION } = require('../ventas/rotacion');
const { listarProductos } = require('./productos.service');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

const VISIBLE = 'p.activo = TRUE AND p.oculto = FALSE';
// Un lote más grande que esto es un error de la pantalla, no un pedido real:
// la categoría más grande tiene ~450 productos.
const MAXIMO_LOTE = 1000;

/** Una lista de ids de producto utilizable, sin repetidos. */
function idsDeLote(valor) {
  if (!Array.isArray(valor) || valor.length === 0) throw httpError(400, 'No vino ningún producto.');
  if (valor.length > MAXIMO_LOTE) throw httpError(400, `Son más de ${MAXIMO_LOTE} productos de una vez.`);
  return [...new Set(valor.map((v) => idValido(v)))];
}

async function categoriaActiva(ejecutor, id) {
  const { rows } = await ejecutor.query('SELECT id, nombre, activo FROM categoria_producto WHERE id = $1', [idValido(id)]);
  if (!rows[0]) throw httpError(404, 'No existe esa categoría.');
  if (!rows[0].activo) throw httpError(400, `"${rows[0].nombre}" está desactivada.`);
  return rows[0];
}

// ─── El árbol ──────────────────────────────────────────────────────────────

/**
 * Categorías con sus subcategorías y conteos, en el orden canónico —el de
 * `categoria_config.orden`, el mismo que usa el catálogo del agente—.
 *
 * Una categoría desactivada sale igual si todavía tiene productos visibles:
 * esconderla escondería esos productos.
 */
async function arbol() {
  const [categorias, subcategorias, conteos] = await Promise.all([
    pool.query(`
      SELECT c.id, c.nombre, cfg.nombre_visible, cfg.orden
        FROM categoria_producto c
        LEFT JOIN categoria_config cfg ON cfg.categoria = c.nombre
       WHERE c.activo
          OR EXISTS (SELECT 1 FROM producto p WHERE p.categoria_id = c.id AND ${VISIBLE})`),
    pool.query(`
      SELECT s.id, s.categoria, s.nombre, s.orden, s.activo,
             (SELECT COUNT(*)::int FROM producto p WHERE p.subcategoria_id = s.id AND ${VISIBLE}) AS productos
        FROM subcategoria s
       WHERE s.activo
       ORDER BY s.categoria, s.orden, s.nombre`),
    pool.query(`
      SELECT p.categoria_id, p.subcategoria_id, COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE p.imagen_url IS NULL OR p.imagen_url = '')::int AS sin_imagen
        FROM producto p
       WHERE ${VISIBLE}
       GROUP BY p.categoria_id, p.subcategoria_id`)
  ]);

  const subsPorCategoria = new Map();
  for (const s of subcategorias.rows) {
    if (!subsPorCategoria.has(s.categoria)) subsPorCategoria.set(s.categoria, []);
    subsPorCategoria.get(s.categoria).push({ id: s.id, nombre: s.nombre, orden: s.orden, activo: s.activo, productos: s.productos });
  }

  const suma = new Map();
  for (const f of conteos.rows) {
    const t = suma.get(f.categoria_id) || { total: 0, sinClasificar: 0, sinImagen: 0 };
    t.total += f.n;
    t.sinImagen += f.sin_imagen;
    if (f.subcategoria_id === null) t.sinClasificar += f.n;
    suma.set(f.categoria_id, t);
  }

  // Sin orden explícito van después de las ordenadas, alfabéticas entre ellas.
  const ordenadas = [...categorias.rows].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return ordenadas
    .map((c, i) => ({
      id: c.id,
      name: c.nombre,
      nombreVisible: c.nombre_visible || c.nombre,
      orden: c.orden !== null && c.orden !== undefined ? c.orden : 100000 + i,
      total: suma.get(c.id)?.total || 0,
      sinClasificar: suma.get(c.id)?.sinClasificar || 0,
      sinImagen: suma.get(c.id)?.sinImagen || 0,
      subcategorias: subsPorCategoria.get(c.nombre) || []
    }))
    .sort((a, b) => a.orden - b.orden);
}

// ─── Las filas de la pantalla ─────────────────────────────────────────────

/**
 * Subcategoría, rotación, proveedor principal y margen de cada producto, en
 * UNA consulta para toda la lista (sin una por fila).
 *
 * El margen sale de `clasificarProducto`, la misma fórmula que el resto del
 * sistema, con la tarifa real del producto: una tercera fórmula serían tres
 * cifras distintas para el mismo producto.
 */
const SELECT_FILA = `
  SELECT p.id, p.nombre, p.referencia, p.imagen_url, p.precio_sin_iva, p.costo_con_iva,
         p.activo, p.oculto, p.categoria_id,
         c.nombre AS categoria, i.tarifa,
         s.id AS sub_id, s.nombre AS sub_nombre,
         r.unidades_mes,
         prov.supplier_name, prov.supplier_cedula
    FROM producto p
    LEFT JOIN categoria_producto c ON c.id = p.categoria_id
    LEFT JOIN impuesto i ON i.id = p.impuesto_id
    LEFT JOIN subcategoria s ON s.id = p.subcategoria_id
    -- Rotación en tiempo real (ventas/rotacion.js), igual que en main: la
    -- foto de producto_rotacion ya no se usa.
    LEFT JOIN (${SQL_ROTACION}) r ON r.alegra_item_id = p.alegra_id
    LEFT JOIN LATERAL (
           SELECT supplier_name, supplier_cedula
             FROM supplier_product_mapping m
            WHERE m.producto_id = p.id
            ORDER BY m.times_used DESC, m.last_used_date DESC
            LIMIT 1
         ) prov ON true`;

function aFila(r) {
  const tarifa = r.tarifa === null || r.tarifa === undefined ? null : Number(r.tarifa);
  const precio = Number(r.precio_sin_iva);
  const { margenReal } = clasificarProducto({ price: precio, cost: r.costo_con_iva, costoDerivado: null, tarifa });
  return {
    id: r.id,
    nombre: r.nombre,
    referencia: r.referencia,
    imagen_url: r.imagen_url,
    categoria_id: r.categoria_id,
    categoria: r.categoria,
    activo: r.activo,
    oculto: r.oculto,
    precio_sin_iva: precio,
    costo_con_iva: Number(r.costo_con_iva),
    tarifa,
    // Sin impuesto asignado no se inventa el precio con IVA.
    precio_con_iva: tarifa === null ? null : precioConImpuesto(precio, tarifa),
    margen_real: margenReal,
    unidades_mes: r.unidades_mes === null || r.unidades_mes === undefined ? null : Number(r.unidades_mes),
    subcategoria: r.sub_id ? { id: r.sub_id, nombre: r.sub_nombre } : null,
    proveedor: r.supplier_name ? { nombre: r.supplier_name, cedula: r.supplier_cedula } : null
  };
}

/** Todos los productos visibles de una categoría, sin paginar (la mayor tiene ~450). */
async function productosDeCategoria(categoriaId) {
  const { rows } = await pool.query(
    `${SELECT_FILA} WHERE p.categoria_id = $1 AND ${VISIBLE} ORDER BY lower(p.nombre), p.id`,
    [idValido(categoriaId)]
  );
  return rows.map(aFila);
}

/**
 * Buscar en todo el catálogo: los mismos filtros que la lista de siempre
 * (texto, proveedor, sin foto, estado), con las columnas de la fila nueva.
 * El filtrado lo hace `listarProductos`, para que buscar diga lo mismo acá
 * que en cualquier otra pantalla que use el maestro.
 */
async function buscar({ buscar: texto = '', proveedor = '', sinImagen = false, estado = 'activos', limite = 100 } = {}) {
  const encontrados = [];
  const tope = Math.min(Math.max(parseInt(limite, 10) || 100, 1), MAXIMO_LOTE);
  for (let pagina = 1; encontrados.length < tope; pagina++) {
    const { data, paginacion } = await listarProductos({ buscar: texto, proveedor, sinImagen, estado, pagina, limite: 100 });
    encontrados.push(...data);
    if (pagina >= paginacion.paginas) break;
  }
  const ids = encontrados.slice(0, tope).map((p) => p.id);
  if (ids.length === 0) return [];

  const { rows } = await pool.query(`${SELECT_FILA} WHERE p.id = ANY($1::int[])`, [ids]);
  const porId = new Map(rows.map((r) => [r.id, aFila(r)]));
  // El orden es el de listarProductos (alfabético), no el de la segunda consulta.
  return ids.map((id) => porId.get(id)).filter(Boolean);
}

// ─── Acciones en lote ─────────────────────────────────────────────────────

/**
 * Ponerle (o quitarle) la subcategoría a varios productos de una vez.
 *
 * TODOS TIENEN QUE SER DE LA CATEGORÍA DE ESA SUBCATEGORÍA: sin esta regla,
 * un id mandado a mano marcaba un bombillo como "Sanitario" y el catálogo
 * quedaba peor ordenado que antes. Un solo UPDATE, no uno por fila.
 */
async function asignarSubcategoria({ productoIds, subcategoriaId } = {}, usuarioId) {
  const ids = idsDeLote(productoIds);
  const destino = subcategoriaId === null || subcategoriaId === undefined || subcategoriaId === ''
    ? null
    : idValido(subcategoriaId);

  return enTransaccion(async (cliente) => {
    const { rows: productos } = await cliente.query(
      `SELECT p.id, p.nombre, p.subcategoria_id, c.nombre AS categoria
         FROM producto p LEFT JOIN categoria_producto c ON c.id = p.categoria_id
        WHERE p.id = ANY($1::int[]) FOR UPDATE OF p`,
      [ids]
    );
    if (productos.length !== ids.length) throw httpError(404, 'Algún producto no existe.');

    let sub = null;
    if (destino !== null) {
      const { rows } = await cliente.query('SELECT id, categoria, nombre, activo FROM subcategoria WHERE id = $1', [destino]);
      sub = rows[0];
      if (!sub) throw httpError(404, 'No existe esa subcategoría.');
      const ajenos = productos.filter((p) => p.categoria !== sub.categoria);
      if (ajenos.length) {
        throw httpError(400,
          `${ajenos.length === 1 ? `"${ajenos[0].nombre}" no es` : `${ajenos.length} productos no son`} de ${sub.categoria}: ` +
          `"${sub.nombre}" es una subcategoría de esa categoría.`);
      }
    }

    const { rowCount } = await cliente.query(
      `UPDATE producto SET subcategoria_id = $2, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ANY($1::int[]) AND subcategoria_id IS DISTINCT FROM $2`,
      [ids, destino]
    );

    for (const p of productos.filter((x) => x.subcategoria_id !== destino)) {
      await registrarCambio(cliente, {
        entidad: 'producto', entidadId: p.id, accion: 'editar',
        antes: { subcategoria_id: p.subcategoria_id }, despues: { subcategoria_id: destino }, usuarioId
      });
    }
    return { actualizados: rowCount, subcategoria: sub ? { id: sub.id, nombre: sub.nombre } : null };
  });
}

/**
 * Cambiar de categoría a varios productos. En `main` es un trabajo de fondo
 * que le escribe a Alegra uno por uno (~3 s cada uno); acá es un UPDATE.
 *
 * La subcategoría se suelta: la de antes es de la otra categoría. Llegan a
 * "Sin clasificar" de la nueva, que es donde alguien los va a acomodar.
 */
async function cambiarCategoria({ productoIds, categoriaId } = {}, usuarioId) {
  const ids = idsDeLote(productoIds);
  return enTransaccion(async (cliente) => {
    const destino = await categoriaActiva(cliente, categoriaId);
    const { rows: productos } = await cliente.query(
      'SELECT id, categoria_id, subcategoria_id FROM producto WHERE id = ANY($1::int[]) FOR UPDATE',
      [ids]
    );
    if (productos.length !== ids.length) throw httpError(404, 'Algún producto no existe.');

    const { rowCount } = await cliente.query(
      `UPDATE producto SET categoria_id = $2, subcategoria_id = NULL, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ANY($1::int[]) AND categoria_id IS DISTINCT FROM $2`,
      [ids, destino.id]
    );
    for (const p of productos.filter((x) => x.categoria_id !== destino.id)) {
      await registrarCambio(cliente, {
        entidad: 'producto', entidadId: p.id, accion: 'editar',
        antes: { categoria_id: p.categoria_id, subcategoria_id: p.subcategoria_id },
        despues: { categoria_id: destino.id, subcategoria_id: null }, usuarioId
      });
    }
    return { actualizados: rowCount, categoria: { id: destino.id, nombre: destino.nombre } };
  });
}

/**
 * Pasar una subcategoría entera, con sus productos, a otra categoría. Los
 * productos SIGUEN AGRUPADOS en ella: es lo que la hace distinta de cambiar
 * de categoría producto por producto.
 */
async function moverSubcategoria(subcategoriaId, { categoriaId } = {}, usuarioId) {
  const subId = idValido(subcategoriaId);
  return enTransaccion(async (cliente) => {
    const destino = await categoriaActiva(cliente, categoriaId);
    const { rows } = await cliente.query('SELECT id, categoria, nombre FROM subcategoria WHERE id = $1 FOR UPDATE', [subId]);
    const sub = rows[0];
    if (!sub) throw httpError(404, 'No existe esa subcategoría.');
    if (sub.categoria === destino.nombre) return { movidos: 0, subcategoria: sub };

    try {
      await cliente.query(
        // `$2::varchar` en los dos lugares: sin el cast, Postgres deduce un
        // tipo distinto en cada uso y rechaza la sentencia entera.
        `UPDATE subcategoria
            SET categoria = $2::varchar,
                orden = (SELECT COALESCE(MAX(orden), -1) + 1 FROM subcategoria WHERE categoria = $2::varchar)
          WHERE id = $1`,
        [subId, destino.nombre]
      );
    } catch (error) {
      if (error.code === '23505') throw httpError(409, `${destino.nombre} ya tiene una subcategoría "${sub.nombre}".`);
      throw error;
    }
    const { rowCount } = await cliente.query(
      `UPDATE producto SET categoria_id = $2, actualizado_en = CURRENT_TIMESTAMP WHERE subcategoria_id = $1`,
      [subId, destino.id]
    );
    await registrarCambio(cliente, {
      entidad: 'subcategoria', entidadId: subId, accion: 'editar',
      antes: { categoria: sub.categoria }, despues: { categoria: destino.nombre, productos: rowCount }, usuarioId
    });
    return { movidos: rowCount, subcategoria: { id: subId, nombre: sub.nombre, categoria: destino.nombre } };
  });
}

// ─── Subcategorías ────────────────────────────────────────────────────────

/** Crear una subcategoría en una categoría propia (por id, no por nombre). */
async function crearSubcategoria({ categoriaId, nombre } = {}) {
  const categoria = await categoriaActiva(pool, categoriaId);
  return subcategoriasTabla.crear({ categoria: categoria.nombre, nombre });
}

async function reordenarSubcategorias({ categoriaId, ids } = {}) {
  const categoria = await categoriaActiva(pool, categoriaId);
  await subcategoriasTabla.reordenar(categoria.nombre, ids);
  return { categoria: categoria.nombre };
}

/**
 * Borrar una subcategoría, solo si ya no tiene productos a la vista. Los que
 * estén dados de baja u ocultos no la traban: al borrarla quedan sin
 * clasificar (ON DELETE SET NULL).
 */
async function eliminarSubcategoria(id) {
  const subId = idValido(id);
  const { rows } = await pool.query(
    `SELECT s.nombre,
            (SELECT COUNT(*)::int FROM producto p WHERE p.subcategoria_id = s.id AND ${VISIBLE}) AS productos
       FROM subcategoria s WHERE s.id = $1`,
    [subId]
  );
  if (!rows[0]) throw httpError(404, 'No existe esa subcategoría.');
  if (rows[0].productos > 0) {
    throw httpError(409, `"${rows[0].nombre}" todavía tiene ${rows[0].productos} producto(s): hay que moverlos antes de borrarla.`);
  }
  await pool.query('DELETE FROM subcategoria WHERE id = $1', [subId]);
  return { borrada: true, id: subId };
}

module.exports = {
  arbol,
  productosDeCategoria,
  buscar,
  asignarSubcategoria,
  cambiarCategoria,
  moverSubcategoria,
  crearSubcategoria,
  reordenarSubcategorias,
  eliminarSubcategoria,
  renombrarSubcategoria: (id, datos) => subcategoriasTabla.renombrar(idValido(id), datos || {}),
  // El orden y el nombre visible viven en categoria_config, por nombre: los
  // mismos de `main`, sin cambios.
  reordenarCategorias: (nombres) => categoriasConfig.reordenar(nombres),
  nombreVisibleCategoria: async (id, nombreVisible) => {
    const categoria = await categoriaActiva(pool, id);
    return categoriasConfig.renombrar(categoria.nombre, nombreVisible);
  }
};

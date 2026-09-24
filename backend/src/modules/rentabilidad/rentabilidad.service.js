/**
 * Rentabilidad Module - Service
 * Tablero de rentabilidad — Fase 1 de la estrategia de precios (ver plan en
 * /Users/joseandres/.claude/plans/ok-ya-lo-vi-adaptive-sky.md). Lee de
 * alegra_products_cache + costo_historico + producto_rotacion y aplica el
 * mismo clasificador que usan los scripts de auditoría
 * (backend/src/modules/precios/auditoria.js) — una sola fuente de verdad
 * para "¿este costo es confiable?", no una copia para el script y otra
 * para la pantalla.
 *
 * El catálogo activo son ~1954 productos — se trae completo y se filtra/
 * pagina en memoria en vez de repetir la lógica de clasificación en SQL.
 * Mismo criterio pragmático que ya usa cuentas-por-cobrar con su espejo
 * local.
 */

const { query } = require('../../../config/database');
const { clasificarProducto, tasaIvaDe } = require('../precios/auditoria');
const { obtenerCostosDerivados } = require('../precios/costoDerivado');
const { calcularTechoCompetencia } = require('../precios/motor');

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

const PRIORIDAD_CLASIFICACION = { SIN_COSTO: 0, UNIDAD_SOSPECHOSA: 1, MARGEN_NEGATIVO: 2, OK: 3 };

function mediana(valores) {
  if (!valores || valores.length === 0) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 !== 0 ? ordenado[mid] : (ordenado[mid - 1] + ordenado[mid]) / 2;
}

/**
 * Catálogo activo completo, con costo derivado (costo_historico), rotación
 * (producto_rotacion) y la clasificación de calidad de costo ya calculada.
 * Tres queries fijas, sin N+1 por producto.
 */
async function obtenerCatalogoClasificado() {
  const [productos, derivadoPorItem, competencia] = await Promise.all([
    // Del maestro propio (`producto`), no de la caché de Alegra: acá está la
    // TARIFA de cada producto, que es justo lo que faltaba para no asumir 13%.
    //
    // Los alias (name, category, price, cost, image_url) se mantienen a
    // propósito: abajo hay sesenta líneas que mapean este resultado y una
    // pantalla que consume esa forma. Cambiar la fuente no tiene por qué
    // cambiar el contrato.
    query(`
      SELECT p.alegra_id,
             p.nombre          AS name,
             cat.nombre        AS category,
             p.precio_sin_iva  AS price,
             p.costo_con_iva   AS cost,
             p.imagen_url      AS image_url,
             imp.tarifa        AS tarifa,
             r.clase AS clase_rotacion, r.unidades_mes, r.clientes_distintos,
             r.facturacion_12m, r.meses_sin_venta
      FROM producto p
      LEFT JOIN categoria_producto cat ON cat.id = p.categoria_id
      LEFT JOIN impuesto imp ON imp.id = p.impuesto_id
      LEFT JOIN producto_rotacion r ON r.alegra_item_id = p.alegra_id
      WHERE p.activo = TRUE
    `),
    // Mediana de las últimas compras VÁLIDAS, no la última fila suelta —
    // ver precios/costoDerivado.js para los dos defectos que arregla.
    obtenerCostosDerivados(),
    // El precio de competencia MÁS BARATO por producto (entre todas sus
    // fuentes confirmadas) — es el que de verdad limita cuánto puede pagar
    // la pulpería antes de irle mejor comprándole directo al retailer.
    query(`
      SELECT DISTINCT ON (m.alegra_item_id) m.alegra_item_id, m.fuente, pc.precio
      FROM competencia_mapping m
      JOIN LATERAL (
        SELECT precio FROM precio_competencia
        WHERE fuente = m.fuente AND sku_externo = m.sku_externo
        ORDER BY fecha_captura DESC LIMIT 1
      ) pc ON true
      ORDER BY m.alegra_item_id, pc.precio ASC
    `)
  ]);

  const competenciaPorItem = new Map(competencia.rows.map(r => [r.alegra_item_id, { fuente: r.fuente, precio: Number(r.precio) }]));

  return productos.rows.map(p => {
    const derivado = derivadoPorItem.get(String(p.alegra_id)) ?? null;
    const costoDerivado = derivado ? derivado.costo : null;
    const historialInestable = derivado ? derivado.historialInestable : false;
    const c = clasificarProducto({ price: p.price, cost: p.cost, costoDerivado, historialInestable, tarifa: p.tarifa });
    const comp = competenciaPorItem.get(String(p.alegra_id)) ?? null;
    const techoCompetencia = comp ? calcularTechoCompetencia(comp.precio) : null;

    // El clasificador dice SIN_COSTO cuando Alegra no tiene costo, y eso está
    // bien como señal de calidad del dato. Pero de esos productos hay ~330
    // que SÍ tienen costo conocido, sacado de sus facturas de proveedor: la
    // tabla mostraba ₡0 y margen "—" para todos ellos, escondiendo un dato
    // que sí tenemos. `costoEfectivo` es el mejor costo disponible y
    // `origenCosto` dice de dónde salió, para no mezclar churras con merinas.
    const precio = Number(p.price) || 0;
    const costoAlegra = Number(p.cost) || 0;
    const usaDerivado = costoAlegra <= 0 && costoDerivado > 0;
    const costoEfectivo = costoAlegra > 0 ? costoAlegra : (costoDerivado || 0);

    // Los costos vienen CON IVA y el precio SIN IVA, así que hay que bajar el
    // costo antes de comparar. Con la TARIFA REAL del producto: 91 activos no
    // están al 13% (44 al 1%, 15 al 2%, 9 al 4%, 6 exentos, 3 al 8%) y
    // quitarles un 13% que no pagan les corría el margen que muestra la
    // pantalla. Sin tarifa asignada —14 productos— se cae al supuesto de antes.
    const costoEfectivoSinIva = costoEfectivo > 0 ? costoEfectivo / (1 + tasaIvaDe(p.tarifa) / 100) : null;
    const margenEfectivo = costoEfectivoSinIva !== null && precio > 0
      ? ((precio - costoEfectivoSinIva) / precio) * 100
      : null;

    return {
      alegraItemId: p.alegra_id,
      nombre: p.name,
      imagenUrl: p.image_url || '',
      categoria: p.category || '(sin categoría)',
      precio: Number(p.price) || 0,
      costo: Number(p.cost) || 0,
      costoDerivado,
      // Señales del historial de compras, para poder explicar en pantalla por
      // qué un costo no es de fiar.
      costoDerivadoReciente: derivado ? Math.round(derivado.costoReciente * 100) / 100 : null,
      comprasConsideradas: derivado ? derivado.entradas : 0,
      historialInestable,
      claseRotacion: p.clase_rotacion || null,
      unidadesMes: p.unidades_mes !== null ? Number(p.unidades_mes) : null,
      clientesDistintos: p.clientes_distintos !== null ? Number(p.clientes_distintos) : null,
      facturacion12m: p.facturacion_12m !== null ? Number(p.facturacion_12m) : null,
      mesesSinVenta: p.meses_sin_venta,
      clasificacionCosto: c.clasificacion,
      costoSinIva: c.costoSinIva !== null ? Math.round(c.costoSinIva * 100) / 100 : null,
      margenReal: c.margenReal !== null ? Math.round(c.margenReal * 10) / 10 : null,
      costoSugerido: c.costoSugerido !== null ? Math.round(c.costoSugerido * 100) / 100 : null,
      // Mejor costo disponible y de dónde viene ('alegra' | 'facturas' | null)
      costoEfectivo: costoEfectivo > 0 ? Math.round(costoEfectivo * 100) / 100 : null,
      origenCosto: costoEfectivo > 0 ? (usaDerivado ? 'facturas' : 'alegra') : null,
      margenEfectivo: margenEfectivo !== null ? Math.round(margenEfectivo * 10) / 10 : null,
      precioCompetencia: comp ? comp.precio : null,
      fuenteCompetencia: comp ? comp.fuente : null,
      techoCompetencia: techoCompetencia !== null ? Math.round(techoCompetencia * 100) / 100 : null,
      superaTechoCompetencia: techoCompetencia !== null ? (Number(p.price) || 0) > techoCompetencia : false
    };
  });
}

/**
 * GET /api/rentabilidad/resumen — KPIs generales + desglose por categoría.
 */
async function obtenerResumen() {
  const productos = await obtenerCatalogoClasificado();

  const porClasificacion = { SIN_COSTO: 0, UNIDAD_SOSPECHOSA: 0, MARGEN_NEGATIVO: 0, OK: 0 };
  const categoriasMap = new Map();

  for (const p of productos) {
    porClasificacion[p.clasificacionCosto]++;

    if (!categoriasMap.has(p.categoria)) {
      categoriasMap.set(p.categoria, {
        categoria: p.categoria,
        total: 0,
        sinCosto: 0,
        unidadSospechosa: 0,
        margenNegativo: 0,
        ok: 0,
        margenes: []
      });
    }
    const c = categoriasMap.get(p.categoria);
    c.total++;
    if (p.clasificacionCosto === 'SIN_COSTO') c.sinCosto++;
    else if (p.clasificacionCosto === 'UNIDAD_SOSPECHOSA') c.unidadSospechosa++;
    else if (p.clasificacionCosto === 'MARGEN_NEGATIVO') c.margenNegativo++;
    else c.ok++;
    if (p.margenReal !== null) c.margenes.push(p.margenReal);
  }

  const categorias = [...categoriasMap.values()]
    .map(c => ({
      categoria: c.categoria,
      total: c.total,
      sinCosto: c.sinCosto,
      unidadSospechosa: c.unidadSospechosa,
      margenNegativo: c.margenNegativo,
      ok: c.ok,
      margenMediana: mediana(c.margenes) !== null ? Math.round(mediana(c.margenes) * 10) / 10 : null
    }))
    .sort((a, b) => b.total - a.total);

  const conCompetencia = productos.filter(p => p.precioCompetencia !== null);

  return {
    totalProductos: productos.length,
    porClasificacion,
    categorias,
    competencia: {
      conDato: conCompetencia.length,
      superanTecho: conCompetencia.filter(p => p.superaTechoCompetencia).length
    }
  };
}

/**
 * GET /api/rentabilidad/productos — lista filtrable/paginada. Orden por
 * defecto: peores casos primero (sin costo → unidad sospechosa → margen
 * negativo → ok), y dentro de cada uno por facturación descendente — así
 * lo primero que ve el usuario es lo que más pesa arreglar.
 */
async function listarProductos(filtros = {}) {
  let productos = await obtenerCatalogoClasificado();

  if (filtros.categoria && filtros.categoria !== 'todas') {
    productos = productos.filter(p => p.categoria === filtros.categoria);
  }
  if (filtros.clasificacion && filtros.clasificacion !== 'todas') {
    productos = productos.filter(p => p.clasificacionCosto === filtros.clasificacion);
  }
  if (filtros.clase && filtros.clase !== 'todas') {
    productos = productos.filter(p => p.claseRotacion === filtros.clase);
  }
  if (filtros.superaTecho === 'true' || filtros.superaTecho === true) {
    productos = productos.filter(p => p.superaTechoCompetencia);
  }
  if (filtros.search) {
    const termino = filtros.search.toLowerCase();
    productos = productos.filter(p => p.nombre.toLowerCase().includes(termino));
  }

  productos.sort((a, b) => {
    const diff = PRIORIDAD_CLASIFICACION[a.clasificacionCosto] - PRIORIDAD_CLASIFICACION[b.clasificacionCosto];
    if (diff !== 0) return diff;
    return (b.facturacion12m || 0) - (a.facturacion12m || 0);
  });

  const total = productos.length;
  const page = Math.max(parseInt(filtros.page, 10) || 1, 1);
  const pageSize = Math.min(parseInt(filtros.pageSize, 10) || PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);
  const start = (page - 1) * pageSize;

  return {
    data: productos.slice(start, start + pageSize),
    total,
    page,
    pageSize
  };
}

// ==================== Monitoreo de márgenes ====================

const COLUMNAS_SNAPSHOT = 10;
const FILAS_POR_INSERT_SNAPSHOT = 150;

/**
 * Guarda el margen de TODO el catálogo con la fecha de hoy.
 *
 * Usa exactamente el mismo cálculo que la pantalla (obtenerCatalogoClasificado),
 * para que la serie histórica y lo que se ve en vivo nunca digan cosas
 * distintas. Re-correrlo el mismo día actualiza la foto en vez de duplicarla.
 */
async function tomarSnapshotMargenes(fecha = new Date()) {
  const productos = await obtenerCatalogoClasificado();
  const dia = fecha.toISOString().slice(0, 10);

  for (let i = 0; i < productos.length; i += FILAS_POR_INSERT_SNAPSHOT) {
    const lote = productos.slice(i, i + FILAS_POR_INSERT_SNAPSHOT);
    const placeholders = lote.map((_, idx) => {
      const b = idx * COLUMNAS_SNAPSHOT;
      return `(${Array.from({ length: COLUMNAS_SNAPSHOT }, (_, c) => `$${b + c + 1}`).join(', ')})`;
    }).join(', ');

    const valores = lote.flatMap(p => [
      dia, String(p.alegraItemId), p.categoria, p.precio, p.costoEfectivo,
      p.origenCosto, p.margenEfectivo, p.clasificacionCosto, p.unidadesMes, p.facturacion12m
    ]);

    await query(`
      INSERT INTO margen_snapshot (
        fecha, alegra_item_id, categoria, precio, costo,
        origen_costo, margen, clasificacion, unidades_mes, facturacion_12m
      ) VALUES ${placeholders}
      ON CONFLICT (fecha, alegra_item_id) DO UPDATE SET
        categoria = EXCLUDED.categoria, precio = EXCLUDED.precio, costo = EXCLUDED.costo,
        origen_costo = EXCLUDED.origen_costo, margen = EXCLUDED.margen,
        clasificacion = EXCLUDED.clasificacion, unidades_mes = EXCLUDED.unidades_mes,
        facturacion_12m = EXCLUDED.facturacion_12m, creado_en = CURRENT_TIMESTAMP;
    `, valores);
  }

  return { fecha: dia, productos: productos.length };
}

/**
 * GET /api/rentabilidad/tendencia — evolución del margen por fecha.
 *
 * El margen se pondera por facturación, no se promedia a secas: un producto
 * que factura ₡2M y otro que factura ₡3.000 no pesan igual en la salud del
 * negocio, y el promedio simple queda dominado por la cola larga.
 */
async function obtenerTendenciaMargenes({ categoria } = {}) {
  const filtroCategoria = categoria && categoria !== 'todas' ? 'AND categoria = $1' : '';
  const params = filtroCategoria ? [categoria] : [];

  const serie = await query(`
    SELECT fecha,
           COUNT(*)::int AS productos,
           COUNT(*) FILTER (WHERE margen IS NOT NULL)::int AS con_costo,
           ROUND(
             (SUM(margen * facturacion_12m) FILTER (WHERE margen IS NOT NULL AND facturacion_12m > 0)
              / NULLIF(SUM(facturacion_12m) FILTER (WHERE margen IS NOT NULL AND facturacion_12m > 0), 0))::numeric, 2
           ) AS margen_ponderado,
           ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY margen))::numeric, 2) AS margen_mediana,
           COUNT(*) FILTER (WHERE clasificacion = 'MARGEN_NEGATIVO')::int AS margen_negativo,
           COUNT(*) FILTER (WHERE clasificacion = 'SIN_COSTO')::int AS sin_costo
    FROM margen_snapshot
    WHERE TRUE ${filtroCategoria}
    GROUP BY fecha ORDER BY fecha ASC;
  `, params);

  return {
    serie: serie.rows.map(r => ({
      fecha: r.fecha,
      productos: r.productos,
      conCosto: r.con_costo,
      margenPonderado: r.margen_ponderado !== null ? Number(r.margen_ponderado) : null,
      margenMediana: r.margen_mediana !== null ? Number(r.margen_mediana) : null,
      margenNegativo: r.margen_negativo,
      sinCosto: r.sin_costo
    }))
  };
}

/**
 * Productos cuyo margen cayó más entre la primera y la última foto.
 * Es la lista accionable del monitoreo: qué se deterioró sin que nadie lo tocara.
 */
async function obtenerDeterioroMargenes({ limite = 20 } = {}) {
  const fechas = await query(`SELECT MIN(fecha) primera, MAX(fecha) ultima FROM margen_snapshot`);
  const { primera, ultima } = fechas.rows[0];
  if (!primera || String(primera) === String(ultima)) {
    return { desde: primera, hasta: ultima, productos: [], sinComparacion: true };
  }

  const res = await query(`
    SELECT a.alegra_item_id, c.name, a.categoria,
           a.margen AS margen_antes, b.margen AS margen_ahora,
           a.costo AS costo_antes, b.costo AS costo_ahora,
           a.precio AS precio_antes, b.precio AS precio_ahora,
           b.facturacion_12m
    FROM margen_snapshot a
    JOIN margen_snapshot b ON b.alegra_item_id = a.alegra_item_id AND b.fecha = $2
    LEFT JOIN alegra_products_cache c ON c.alegra_id::text = a.alegra_item_id
    WHERE a.fecha = $1 AND a.margen IS NOT NULL AND b.margen IS NOT NULL
      AND b.margen < a.margen
    ORDER BY (a.margen - b.margen) DESC
    LIMIT $3;
  `, [primera, ultima, limite]);

  return {
    desde: primera,
    hasta: ultima,
    sinComparacion: false,
    productos: res.rows.map(r => ({
      alegraItemId: r.alegra_item_id,
      nombre: r.name || r.alegra_item_id,
      categoria: r.categoria,
      margenAntes: Number(r.margen_antes),
      margenAhora: Number(r.margen_ahora),
      caida: Math.round((Number(r.margen_antes) - Number(r.margen_ahora)) * 10) / 10,
      costoAntes: Number(r.costo_antes),
      costoAhora: Number(r.costo_ahora),
      precioAntes: Number(r.precio_antes),
      precioAhora: Number(r.precio_ahora),
      facturacion12m: Number(r.facturacion_12m)
    }))
  };
}

module.exports = {
  obtenerResumen,
  listarProductos,
  tomarSnapshotMargenes,
  obtenerTendenciaMargenes,
  obtenerDeterioroMargenes
};

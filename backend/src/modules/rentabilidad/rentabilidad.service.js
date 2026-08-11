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
const { clasificarProducto, IVA_ASUMIDO } = require('../precios/auditoria');
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
  const [productos, derivados, competencia] = await Promise.all([
    query(`
      SELECT p.alegra_id, p.name, p.category, p.price, p.cost, p.image_url,
             r.clase AS clase_rotacion, r.unidades_mes, r.clientes_distintos,
             r.facturacion_12m, r.meses_sin_venta
      FROM alegra_products_cache p
      LEFT JOIN producto_rotacion r ON r.alegra_item_id = p.alegra_id::text
      WHERE p.status = 'active'
    `),
    query(`
      SELECT DISTINCT ON (alegra_item_id) alegra_item_id, costo_unitario
      FROM costo_historico
      ORDER BY alegra_item_id, fecha DESC
    `),
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

  const derivadoPorItem = new Map(derivados.rows.map(r => [r.alegra_item_id, Number(r.costo_unitario)]));
  const competenciaPorItem = new Map(competencia.rows.map(r => [r.alegra_item_id, { fuente: r.fuente, precio: Number(r.precio) }]));

  return productos.rows.map(p => {
    const costoDerivado = derivadoPorItem.get(String(p.alegra_id)) ?? null;
    const c = clasificarProducto({ price: p.price, cost: p.cost, costoDerivado });
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

    // Los costos vienen CON IVA y el precio SIN IVA (asimetría de Alegra),
    // así que hay que bajar el costo antes de comparar.
    const costoEfectivoSinIva = costoEfectivo > 0 ? costoEfectivo / (1 + IVA_ASUMIDO / 100) : null;
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

module.exports = {
  obtenerResumen,
  listarProductos
};

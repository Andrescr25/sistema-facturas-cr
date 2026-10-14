/**
 * Rentabilidad — rehecho el 2026-09-25 a pedido del usuario: una sola
 * pantalla, sin pestañas, con el margen de cada producto, su rotación REAL y
 * cuándo se vende (por semana, mes y año; qué parte del mes y del año).
 *
 * DE DÓNDE SALE CADA COSA
 *   · El catálogo visible: en esta rama, el maestro propio `producto` (activo
 *     y no oculto); en main, alegra_products_cache.
 *   · El margen de HOY: `clasificarProducto` (precios/auditoria.js) — la misma
 *     fórmula que el resto del sistema, con la tarifa real de cada producto y
 *     el costo de las facturas de proveedor si la ficha propia no lo tiene. Una sola
 *     cifra: antes había dos cálculos de margen con nombres distintos.
 *   · La rotación y lo vendido: ventas/rotacion.js, EN EL MOMENTO (unidades de
 *     los últimos 3 meses, Pareto 80/95). Antes era una foto sacada a mano.
 *   · Cuándo se vende: ventas/estadisticas.js, también en el momento.
 *
 * LA GANANCIA DE LO VENDIDO es lo cobrado (sin IVA) menos lo que esas
 * unidades cuestan HOY sin IVA. Es estimada: el historial no guarda el costo
 * del día de la venta. Solo se calcula si el costo es confiable (ni "sin
 * costo" ni "unidad sospechosa"); si no, se deja vacía en vez de inventarla.
 */

const { query } = require('../../../config/database');
const { clasificarProducto } = require('../precios/auditoria');
const { obtenerCostosDerivados } = require('../precios/costoDerivado');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const rotacion = require('../ventas/rotacion');
const estadisticas = require('../ventas/estadisticas');
const { HOY_CR, VENTANA_MESES } = rotacion;

const POR_PAGINA = 30;
const COSTO_CONFIABLE = new Set(['OK', 'MARGEN_NEGATIVO']);

// Lista → detalle → lista no tiene por qué recalcular 1.900 productos cada
// vez: 30 segundos de memoria. "Tiempo real" con medio minuto de margen.
const VIGENCIA_MS = 30 * 1000;
let enMemoria = null;

const redondear = (v, decimales = 2) => (v === null || v === undefined || !Number.isFinite(Number(v))
  ? null
  : Math.round(Number(v) * 10 ** decimales) / 10 ** decimales);

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Una fila por producto visible, con su margen de hoy, su rotación y lo que
 * vendió en la ventana. Tres consultas fijas, sin una por producto.
 */
async function calcularCatalogo() {
  const [productos, derivados, rot] = await Promise.all([
    // RAMA independencia-alegra: los productos salen del maestro propio
    // (`producto`), con su tarifa, categoría y subcategoría de acá — no de la
    // copia de Alegra. Los alias conservan la forma que espera el resto.
    //
    // TODO SE CRUZA POR `producto.id`: la rotación y lo vendido (`venta_linea`,
    // migración 034), el costo derivado de las compras (precios/costoDerivado)
    // y la identidad que usa la pantalla. Un producto creado en el sistema,
    // sin ficha en Alegra, entra igual que los demás.
    query(`
      SELECT p.id AS producto_id, p.nombre AS name, p.referencia AS reference, cat.nombre AS category,
             p.precio_sin_iva AS price, p.costo_con_iva AS cost, imp.tarifa AS tax_percentage,
             p.imagen_url AS image_url, s.nombre AS subcategoria
        FROM producto p
        LEFT JOIN categoria_producto cat ON cat.id = p.categoria_id
        LEFT JOIN impuesto imp ON imp.id = p.impuesto_id
        LEFT JOIN subcategoria s ON s.id = p.subcategoria_id
       WHERE p.activo = TRUE AND p.oculto = FALSE
    `),
    obtenerCostosDerivados(),
    // El mes en curso no es comparable con un mes cerrado. Su acumulado
    // sigue en ventas/totales; la media mensual usa tres meses completos.
    rotacion.rotacionPorProducto({ promedioMesesCompletos: true })
  ]);

  return productos.rows.map((p) => {
    const productoId = Number(p.producto_id);
    const derivado = derivados.get(productoId) || null;
    const c = clasificarProducto({
      price: p.price, cost: p.cost,
      costoDerivado: derivado ? derivado.costo : null,
      historialInestable: derivado ? derivado.historialInestable : false,
      tasaIva: p.tax_percentage
    });
    const r = rot.get(productoId) || null;
    const confiable = COSTO_CONFIABLE.has(c.clasificacion) && c.costoSinIva !== null;
    const unidades = r ? r.unidades : 0;
    const ventas = r ? r.ventas : 0;

    return {
      productoId,
      nombre: p.name,
      referencia: p.reference || '',
      categoria: p.category || 'Sin categoría',
      subcategoria: p.subcategoria || null,
      imagenUrl: p.image_url || '',
      tarifa: p.tax_percentage === null || p.tax_percentage === undefined ? null : Number(p.tax_percentage),
      precio: Number(p.price) || 0,
      precioConIva: p.tax_percentage === null || p.tax_percentage === undefined ? null : precioConImpuesto(p.price, p.tax_percentage),
      costoSinIva: redondear(c.costoSinIva),
      origenCosto: c.origenCosto,
      calidadCosto: c.clasificacion,
      margen: redondear(c.margenReal, 1),
      clase: r ? r.clase : 'C',
      unidades: redondear(unidades),
      unidadesSemana: r ? r.unidadesSemana : 0,
      unidadesMes: r ? r.unidadesMes : 0,
      facturas: r ? r.facturas : 0,
      clientes: r ? r.clientesDistintos : 0,
      ultimaVenta: r ? r.ultimaVenta : null,
      ventas: redondear(ventas),
      ganancia: confiable && unidades > 0 ? redondear(ventas - unidades * c.costoSinIva) : null
    };
  });
}

async function catalogo() {
  if (enMemoria && Date.now() - enMemoria.en < VIGENCIA_MS) return enMemoria.filas;
  const filas = await calcularCatalogo();
  enMemoria = { en: Date.now(), filas };
  return filas;
}

const ORDENES = {
  vendidos: (a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre),
  ganancia: (a, b) => (b.ganancia ?? -Infinity) - (a.ganancia ?? -Infinity) || b.unidades - a.unidades,
  'margen-alto': (a, b) => (b.margen ?? -Infinity) - (a.margen ?? -Infinity) || b.unidades - a.unidades,
  // Los sin margen van al final también acá: arriba tienen que estar los que
  // pierden plata, no los que no tienen costo.
  'margen-bajo': (a, b) => (a.margen ?? Infinity) - (b.margen ?? Infinity) || b.unidades - a.unidades,
  nombre: (a, b) => a.nombre.localeCompare(b.nombre)
};

/**
 * GET /api/rentabilidad/productos
 *   ?buscar=&categoria=&clase=A|B|C&costo=sin-costo|negativo&orden=&pagina=
 */
async function obtenerProductosFiltrados({ buscar = '', categoria = '', clase = '', costo = '', orden = 'vendidos' } = {}) {
  let filas = await catalogo();

  const texto = normalizar(buscar);
  if (texto) {
    const palabras = texto.split(/\s+/);
    filas = filas.filter((p) => {
      const donde = normalizar(`${p.nombre} ${p.referencia}`);
      return palabras.every((w) => donde.includes(w));
    });
  }
  if (categoria) filas = filas.filter((p) => p.categoria === categoria);
  if (['A', 'B', 'C'].includes(clase)) filas = filas.filter((p) => p.clase === clase);
  if (costo === 'sin-costo') filas = filas.filter((p) => p.calidadCosto === 'SIN_COSTO' || p.calidadCosto === 'UNIDAD_SOSPECHOSA');
  if (costo === 'negativo') filas = filas.filter((p) => p.margen !== null && p.margen < 0);

  filas = [...filas].sort(ORDENES[orden] || ORDENES.vendidos);

  return filas;
}

// Pantalla y Excel comparten exactamente los filtros y el orden. La descarga
// toma esta lista completa una vez, sin recorrer páginas que podrían cambiar
// entre peticiones cuando vence la memoria de 30 segundos.
async function listarProductos({ pagina = 1, ...filtros } = {}) {
  const filas = await obtenerProductosFiltrados(filtros);
  const total = filas.length;
  const pag = Math.max(parseInt(pagina, 10) || 1, 1);
  return {
    data: filas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA),
    total,
    pagina: pag,
    paginas: Math.max(Math.ceil(total / POR_PAGINA), 1)
  };
}

/**
 * GET /api/rentabilidad/resumen — el negocio entero: lo vendido y ganado en
 * la ventana, cuántos productos hay en cada clase, y las series de cuándo se
 * vende (en colones: sumar unidades de productos distintos no dice nada).
 */
async function obtenerResumen() {
  const [filas, totales, series] = await Promise.all([
    catalogo(),
    query(`
      SELECT COALESCE(SUM(importe), 0) AS ventas,
             COUNT(DISTINCT factura_id)::int AS facturas,
             COUNT(DISTINCT cliente_id)::int AS clientes
        FROM venta_linea
       WHERE fecha > (${HOY_CR} - INTERVAL '${VENTANA_MESES} months')::date AND fecha <= ${HOY_CR}
    `),
    estadisticas.series()
  ]);

  const conGanancia = filas.filter((p) => p.ganancia !== null);
  const ventasConCosto = conGanancia.reduce((s, p) => s + p.ventas, 0);
  const ganancia = conGanancia.reduce((s, p) => s + p.ganancia, 0);
  const t = totales.rows[0];
  const ventas = Number(t.ventas) || 0;

  const porClase = { A: 0, B: 0, C: 0 };
  for (const p of filas) porClase[p.clase]++;

  const categorias = [...new Set(filas.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, 'es'));

  return {
    ventanaMeses: VENTANA_MESES,
    ventas: redondear(ventas),
    facturas: t.facturas,
    clientes: t.clientes,
    ganancia: redondear(ganancia),
    // Sobre lo vendido CON costo conocido: la ganancia de lo que no tiene
    // costo no se sabe, y dividir entre todo lo vendido la achicaría.
    margenPonderado: ventasConCosto > 0 ? redondear((ganancia / ventasConCosto) * 100, 1) : null,
    coberturaCosto: ventas > 0 ? redondear((ventasConCosto / ventas) * 100, 1) : null,
    productos: filas.length,
    porClase,
    sinCosto: filas.filter((p) => p.calidadCosto === 'SIN_COSTO' || p.calidadCosto === 'UNIDAD_SOSPECHOSA').length,
    margenNegativo: filas.filter((p) => p.margen !== null && p.margen < 0).length,
    categorias,
    series
  };
}

/** GET /api/rentabilidad/productos/:productoId — un producto y sus series, en unidades. */
async function obtenerProducto(productoId) {
  // Un id que no es un entero positivo no es de ningún producto: 404, sin
  // buscar. `Number('12abc')` es NaN y `Number('')` es 0; ninguno pasa.
  const id = Number(productoId);
  const producto = Number.isInteger(id) && id > 0
    ? (await catalogo()).find((p) => p.productoId === id)
    : null;
  if (!producto) {
    const e = new Error('Ese producto no está en el catálogo (inactivo u oculto).');
    e.status = 404;
    throw e;
  }
  return { producto, series: await estadisticas.series(producto.productoId) };
}

module.exports = { listarProductos, obtenerProductosFiltrados, obtenerResumen, obtenerProducto, calcularCatalogo, ORDENES, _limpiarMemoria: () => { enMemoria = null; } };

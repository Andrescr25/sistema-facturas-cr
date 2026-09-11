/**
 * Impuestos de Alegra para las líneas de compra y los productos nuevos.
 *
 * POR QUÉ YA NO HAY UN MAPEO ESCRITO A MANO
 * Hasta el 11 de setiembre de 2026 este archivo tenía los ids de Alegra
 * escritos a mano, y estaban mal: 1 % apuntaba al id 6, que en esta cuenta es
 * 4 %; 2 % al 7, que es 8 %; y exento al 3, que es 0,5 %. Desde el 10 de
 * julio, 82 líneas de compra al 1 % se registraron al 4 %, 19 al 2 % al 8 % y
 * 22 exentas al 0,5 %: unos ₡16.674 de IVA de compras de más en Alegra. La
 * prueba solo revisaba que hubiera seis ids distintos, no que fueran los
 * de la cuenta.
 *
 * Ahora los ids salen de la lista real de la cuenta (GET /taxes) y se elige
 * por porcentaje. Si alguien crea o reordena impuestos en Alegra, se sigue
 * eligiendo bien.
 */

const TOLERANCIA_PORCENTAJE = 0.5;
const VIGENCIA_MS = 6 * 60 * 60 * 1000;

/**
 * Calcula el porcentaje real de IVA de una línea de factura a partir del monto
 * de impuesto y el total de línea (ambos como vienen del XML de Hacienda).
 */
function calcularPorcentajeIva({ impuesto, totalLinea }) {
  const montoImpuesto = parseFloat(impuesto) || 0;
  const subtotal = (parseFloat(totalLinea) || 0) - montoImpuesto;

  if (montoImpuesto <= 0 || subtotal <= 0) return 0;

  return (montoImpuesto / subtotal) * 100;
}

/**
 * Menor es mejor. Cuando hay varias tarifas con el mismo porcentaje se usa la
 * estándar: para 0 % esta cuenta tiene "IVA exento", "Tarifa 0 % (Artículo
 * 32…)" y "Tarifa 0 % sin derecho a crédito", y una línea de compra sin IVA
 * es la exenta.
 */
function prioridad(t) {
  const nombre = String(t.name || '').toLowerCase();
  if (/sin derecho/.test(nombre)) return 3;
  if (/art[ií]culo|art\./.test(nombre)) return 2;
  const tipo = String(t.rateType || '').toUpperCase();
  if (['EXEMPT', 'REDUCED', 'TRANSIENT', 'GENERAL'].includes(tipo)) return 0;
  return 1;
}

/**
 * De la lista de GET /taxes, las tarifas utilizables: activas, de IVA, una
 * por porcentaje. Los factores de bienes usados (IVA_BIENES_USADOS) quedan
 * fuera por tipo.
 */
function normalizarImpuestos(lista) {
  const porPorcentaje = new Map();
  for (const t of lista || []) {
    if (String(t.status) !== 'active') continue;
    if (String(t.type || 'IVA').toUpperCase() !== 'IVA') continue;
    const porcentaje = Number(t.percentage);
    if (!Number.isFinite(porcentaje)) continue;
    const candidato = { id: Number(t.id), porcentaje, nombre: t.name, prioridad: prioridad(t) };
    const actual = porPorcentaje.get(porcentaje);
    if (!actual || candidato.prioridad < actual.prioridad) porPorcentaje.set(porcentaje, candidato);
  }
  return [...porPorcentaje.values()]
    .map(({ prioridad: _p, ...t }) => t)
    .sort((a, b) => a.porcentaje - b.porcentaje);
}

/**
 * El impuesto de la cuenta que corresponde a una línea de factura, a partir
 * del monto de impuesto real. Devuelve null si la tarifa no coincide (con
 * tolerancia) con ninguna, para no forzar un impuesto incorrecto.
 *
 * @param {Array} impuestos lo que devuelve cargarImpuestosAlegra()
 */
function obtenerImpuestoAlegra({ impuesto, totalLinea }, impuestos) {
  if (!Array.isArray(impuestos) || impuestos.length === 0) {
    throw new Error('obtenerImpuestoAlegra necesita la lista de impuestos de Alegra (ver cargarImpuestosAlegra)');
  }
  const porcentajeReal = calcularPorcentajeIva({ impuesto, totalLinea });

  let seleccionado = null;
  let menorDiferencia = Infinity;
  for (const candidato of impuestos) {
    const diferencia = Math.abs(porcentajeReal - candidato.porcentaje);
    if (diferencia < menorDiferencia && diferencia < TOLERANCIA_PORCENTAJE) {
      menorDiferencia = diferencia;
      seleccionado = candidato;
    }
  }
  return seleccionado;
}

let cache = null;

/**
 * La lista de impuestos de la cuenta, leída de Alegra y guardada 6 horas.
 *
 * Si no se puede leer, falla con un mensaje en vez de devolver una lista
 * inventada: prefiero que no se envíe la compra a que se envíe con un IVA
 * equivocado, que es lo que pasó durante dos meses.
 */
async function cargarImpuestosAlegra({ cliente, ahora = Date.now } = {}) {
  if (cache && ahora() - cache.cargadoEn < VIGENCIA_MS) return cache.impuestos;

  // require perezoso: este archivo lo cargan servicios que ya cargan la integración.
  const c = cliente || require('../src/integrations/alegra').getClient();
  let respuesta;
  try {
    respuesta = await c.get('/taxes');
  } catch (error) {
    respuesta = { success: false, error: error.message };
  }
  const lista = respuesta?.success === false ? null : (respuesta?.data ?? respuesta);
  const impuestos = Array.isArray(lista) ? normalizarImpuestos(lista) : [];

  if (impuestos.length === 0) {
    const error = new Error('No se pudo leer la lista de impuestos de Alegra. No se envía nada para no registrar un IVA equivocado; intente de nuevo en un momento.');
    error.status = 503;
    throw error;
  }

  cache = { impuestos, cargadoEn: ahora() };
  return impuestos;
}

/** Solo para pruebas. */
function _reiniciarCache() {
  cache = null;
}

module.exports = {
  TOLERANCIA_PORCENTAJE,
  calcularPorcentajeIva,
  normalizarImpuestos,
  obtenerImpuestoAlegra,
  cargarImpuestosAlegra,
  _reiniciarCache
};

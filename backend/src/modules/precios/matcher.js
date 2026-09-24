/**
 * Emparejamiento por nombre — usado para vincular productos propios con
 * productos de la competencia (EPA, VTEX, listas manuales). Mismo criterio
 * de scoring que ya existe en el repo (palabras clave en común, umbral de
 * confianza para auto-confirmar) — ver:
 *   - getProductosPendientes (revision-precios.service.js) — score por
 *     palabras en `name`, umbral de sugerencia 40
 *   - findSimilarProducts/calculateSimilarityScore (alegra-product.service.js)
 *     — score por palabras en `name+reference+description`, auto-confirma a
 *     >=80 en emailService.js
 *
 * Mejora sobre ambas: normaliza tildes ("Válvula" === "valvula"). Ninguna
 * de las dos lo hacía, y contra catálogos de terceros (que no comparten
 * ninguna convención de escritura con el nuestro) la diferencia importa más
 * que en el matching contra proveedores ya conocidos.
 *
 * Segunda mejora, encontrada probando contra datos reales de Walmart/EPA:
 * un nombre propio corto y genérico ("ACEITE 3 EN 1 MD") se reduce a UNA
 * sola palabra clave ("aceite") tras el filtro de longitud — cualquier
 * producto externo que contenga esa palabra saca 100% de score, aunque sea
 * "Aromatizante Glade Aceites Naturales" (nada que ver). Con una sola
 * palabra el score no discrimina nada; MIN_PALABRAS_CLAVE exige al menos 2
 * para que el score signifique algo.
 */

const LONGITUD_MINIMA_PALABRA = 3;
const MAX_PALABRAS_CLAVE = 5;
const MIN_PALABRAS_CLAVE = 2; // con menos de esto, el score no es confiable — ver comentario arriba
const MIN_COINCIDENCIAS = 2; // una palabra en común es casualidad; dos son señal
const UMBRAL_AUTOCONFIRMAR = 80; // mismo umbral que emailService.js para auto-relacionar
const UMBRAL_SUGERENCIA = 40; // mismo umbral que getProductosPendientes
const LONGITUD_MINIMA_REFERENCIA = 3;
const REFERENCIAS_NO_CONFIABLES = new Set([
  '0',
  '00',
  '000',
  '0000',
  '1',
  '01',
  '001',
  'na',
  // Se escriben YA NORMALIZADAS (sin barras ni espacios): `normalizarReferencia`
  // le quita la puntuación, así que 'n/a' o 's/ref' acá nunca calzarían.
  'sref',
  'sinref',
  'sinreferencia'
]);

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes/diacríticos
    .replace(/[^a-z0-9\s]/g, ' ') // puntuación -> espacio, no se pega a la palabra siguiente
    .replace(/\s+/g, ' ')
    .trim();
}

function palabrasClave(texto, max = MAX_PALABRAS_CLAVE) {
  return normalizar(texto)
    .split(' ')
    .filter(palabra => palabra.length > LONGITUD_MINIMA_PALABRA)
    .slice(0, max);
}

/**
 * ¿La palabra aparece en el texto EMPEZANDO una palabra?
 *
 * Antes se usaba `includes`, que calza en medio de otra: "lite" dentro de
 * "SPLITER" (sp-LITE-r) hacía que "NEXT TV LITE" sugiriera un spliter de TV.
 * Se acepta el comienzo y no la palabra entera para no perder los plurales
 * —"tornillo" tiene que seguir calzando con "TORNILLOS"—.
 */
function apareceComoPalabra(palabra, textoNormalizado) {
  if (!palabra) return false;
  const inicio = `(^|[^a-z0-9])${palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
  return new RegExp(inicio).test(textoNormalizado);
}

function normalizarReferencia(texto) {
  return normalizar(texto).replace(/\s+/g, '');
}

function esReferenciaConfiable(texto) {
  const ref = normalizarReferencia(texto);
  if (ref.length < LONGITUD_MINIMA_REFERENCIA) return false;
  if (REFERENCIAS_NO_CONFIABLES.has(ref)) return false;
  if (/^0+$/.test(ref)) return false;
  return true;
}

function calcularScoreCatalogo(nombrePropio, productoCatalogo) {
  const textoCatalogo = [
    productoCatalogo?.name,
    productoCatalogo?.reference,
    productoCatalogo?.description
  ].filter(Boolean).join(' ');

  return calcularScoreSimilitud(nombrePropio, textoCatalogo);
}

/**
 * Score de similitud 0-100 entre un nombre propio y un nombre externo:
 * % de las palabras clave del nombre propio que aparecen como substring en
 * el nombre externo normalizado.
 */
function calcularScoreSimilitud(nombrePropio, nombreExterno) {
  const propias = palabrasClave(nombrePropio);
  if (propias.length < MIN_PALABRAS_CLAVE) return 0;

  const externoNormalizado = normalizar(nombreExterno);
  const coincidencias = propias.filter(palabra => apareceComoPalabra(palabra, externoNormalizado)).length;

  // UNA palabra en común es una casualidad; dos son una señal.
  //
  // Medido contra los pendientes reales: "INTERES DE MORA 3%" y "Cargo por
  // mora" sacaban 50 % contra "F.HIDROXON 500ML MORA AZUL" y "CUERDA ALBAÑIL
  // MORADO" —una sola palabra, la misma que el ratio premiaba por ser corta
  // la descripción—. Con el mismo 50 % salía "ESPUMIL TACO 750G" contra
  // "JABON ESPUMIL TACO 1X4", que SÍ es el producto: ahí coinciden dos.
  // El ratio no los distingue; la cuenta sí.
  if (coincidencias < MIN_COINCIDENCIAS) return 0;

  return Math.round((coincidencias / propias.length) * 100);
}

/**
 * Mejor candidato externo para un nombre propio, entre una lista de
 * {skuExterno, nombreExterno, precio, ...}. Devuelve null si ninguno llega
 * al umbral de sugerencia (UMBRAL_SUGERENCIA) — no tiene sentido proponer
 * un match que casi con seguridad está mal.
 */
function encontrarMejorMatch(nombrePropio, candidatos) {
  if (!candidatos || candidatos.length === 0) return null;

  const puntuados = candidatos
    .map(c => ({ ...c, score: calcularScoreSimilitud(nombrePropio, c.nombreExterno) }))
    .filter(c => c.score >= UMBRAL_SUGERENCIA)
    .sort((a, b) => b.score - a.score);

  return puntuados[0] || null;
}

module.exports = {
  normalizar,
  palabrasClave,
  normalizarReferencia,
  esReferenciaConfiable,
  calcularScoreSimilitud,
  calcularScoreCatalogo,
  encontrarMejorMatch,
  UMBRAL_AUTOCONFIRMAR,
  UMBRAL_SUGERENCIA,
  MIN_PALABRAS_CLAVE,
  MIN_COINCIDENCIAS
};

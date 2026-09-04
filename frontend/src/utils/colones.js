/**
 * Formatear colones. Uno solo para todo el frontend.
 *
 * POR QUÉ VIVE ACÁ Y NO EN CADA PANTALLA
 * Estaba copiado en siete archivos, y cada copia arrastraba el mismo error: el
 * separador de miles que devuelve `toLocaleString('es-CR')` NO es un espacio
 * normal sino un espacio duro (U+00A0), invisible en el editor. Al copiar la
 * linea y escribir el reemplazo a mano salia `.replace(/ /g, '.')` con un
 * espacio comun, que no reemplaza nada, y el monto quedaba como "1 234 567".
 *
 * Se escribe \u00A0 —el codigo, no el caracter— justamente para que se vea.
 * El linter atajo ese error cinco veces en archivos distintos; la sexta se
 * evita teniendo una sola copia.
 */

/** 1.234.567 — redondeado, que es como se lee un precio. */
export function colones(n) {
  return `\u20A1${Math.round(Number(n) || 0).toLocaleString('es-CR').replace(/\u00A0/g, '.')}`
}

/** 1.234,57 — con centimos, para precios unitarios. */
export function colonesExacto(n) {
  const v = Number(n) || 0
  return `\u20A1${v.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, '.')}`
}

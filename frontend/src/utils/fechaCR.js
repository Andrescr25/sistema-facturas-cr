/**
 * El día del calendario en Costa Rica, del lado del navegador.
 *
 * `new Date().toISOString().split('T')[0]` da la fecha en UTC, y el país está
 * en UTC−6: a partir de las 6 de la tarde devuelve el día siguiente. En una
 * pantalla que se usa de noche, eso es la fecha equivocada.
 *
 * Se NOMBRA la zona en vez de confiar en la del dispositivo: un teléfono con
 * la zona mal puesta no debería cambiar la fecha de una venta.
 */

const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit'
})

export function hoyEnCostaRica(momento = new Date()) {
  return FORMATO.format(momento)
}

/**
 * "2026-10-11…" → "11/10/2026", para leer en pantalla. Corta el texto en vez
 * de pasar por `Date`: una fecha de calendario no tiene hora, y convertirla
 * la corre un día según la zona.
 *
 * Estaba copiada en cada componente de Facturación; una sola copia.
 */
export function fechaCorta(f, vacio = '—') {
  return f ? String(f).slice(0, 10).split('-').reverse().join('/') : vacio
}


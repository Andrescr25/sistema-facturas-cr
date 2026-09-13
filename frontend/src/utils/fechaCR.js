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

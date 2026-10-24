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

/**
 * Una fecha de calendario en palabras ("10 de octubre de 2026"). Mismo
 * cuidado que fechaCorta: `factura.fecha` llega del servidor como medianoche
 * UTC ("2026-10-10T00:00:00.000Z"), y `new Date(f).toLocaleDateString()` en
 * Costa Rica la mostraba como el 9 (visto en el portal el 2026-10-20). Se toma
 * el día del texto y se formatea en UTC, donde no se corre.
 *
 * Solo lo que es de calendario se lee del texto: «AAAA-MM-DD» o esa fecha a
 * medianoche UTC. Cualquier otra cosa trae una hora (un instante): se muestra
 * el día que era en Costa Rica, no el del texto, que de noche ya es mañana.
 */
const DIA_DE_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?Z?)?$/

export function fechaEnPalabras(f, opciones = { day: 'numeric', month: 'long', year: 'numeric' }, vacio = '—') {
  const texto = String(f ?? '').trim()
  let dia = DIA_DE_CALENDARIO.exec(texto)?.slice(1, 4)
  if (!dia) {
    const instante = new Date(f)
    if (!texto || Number.isNaN(instante.getTime())) return vacio
    dia = hoyEnCostaRica(instante).split('-')
  }
  const [a, m, d] = dia.map(Number)
  if (!a || !m || !d) return vacio
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString('es-CR', { ...opciones, timeZone: 'UTC' })
}


/** Instantes del servidor con zona (timestamptz), a la hora de Costa Rica. */
export function fechaHoraEnCostaRica(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
}

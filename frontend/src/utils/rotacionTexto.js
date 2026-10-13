/**
 * Cómo se DICE la rotación de un cliente.
 *
 * El cálculo es del servidor (`backend/src/modules/clientes/rotacion.js`):
 * última factura emitida + la frecuencia del cliente = próxima visita. Acá
 * solo se pone en palabras, igual en la ficha, en Preventa y en los reportes.
 * Sin imports, para poder probarlo sin navegador.
 */

/** Las frecuencias de siempre, a un toque. Cualquier otra se escribe. */
export const ROTACIONES_COMUNES = [7, 15, 22, 30]
export const ROTACION_MAXIMA = 365

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

/**
 * "2026-11-01" → "1 de noviembre". Lleva el año cuando no es el de `hoy`.
 * Corta el texto en vez de pasar por `Date`: un día de calendario no tiene
 * hora, y convertirlo lo corre un día según la zona del dispositivo.
 */
export function diaEnPalabras(dia, hoy = '') {
  const [anio, mes, d] = String(dia || '').slice(0, 10).split('-').map(Number)
  if (!anio || !MESES[mes - 1] || !d) return ''
  const conAnio = hoy && String(hoy).slice(0, 4) !== String(anio)
  return `${d} de ${MESES[mes - 1]}${conAnio ? ` de ${anio}` : ''}`
}

/** "Cada 22 días", o que todavía no se definió. */
export function textoRotacion(dias) {
  if (!dias) return 'Sin rotación definida'
  return Number(dias) === 1 ? 'Todos los días' : `Cada ${dias} días`
}

/** Lo que se le dice a quien escribe la frecuencia, o '' si está bien. */
export function avisoDeRotacion(texto) {
  const escrito = String(texto ?? '').trim()
  if (escrito === '') return ''
  const n = Number(escrito)
  if (!Number.isInteger(n) || n < 1 || n > ROTACION_MAXIMA) return `Escribí un número entero de días, entre 1 y ${ROTACION_MAXIMA}.`
  return ''
}

/**
 * La próxima visita, en palabras y con su tono (los de `Insignia`).
 *
 * @param {object} rotacion  lo que manda el servidor: estado, proximaVisita, faltan…
 * @param {string} hoy  "AAAA-MM-DD", solo para decidir si se escribe el año
 * @returns {{tono: string, etiqueta: string, cuando: string, detalle: string}}
 */
export function visitaEnPalabras(rotacion, hoy = '') {
  const dia = diaEnPalabras(rotacion?.proximaVisita, hoy)
  const faltan = Number(rotacion?.faltan)
  switch (rotacion?.estado) {
    case 'atrasado':
      return { tono: 'peligro', etiqueta: 'Atrasado', cuando: dia, detalle: `Le tocaba hace ${plural(-faltan, 'día', 'días')}.` }
    case 'hoy':
      return { tono: 'alerta', etiqueta: 'Le toca hoy', cuando: dia, detalle: 'Hoy se cumple su rotación.' }
    case 'proximo':
      return { tono: 'activo', etiqueta: 'Próximo', cuando: dia, detalle: faltan === 1 ? 'Le toca mañana.' : `Faltan ${faltan} días.` }
    case 'sin_facturas':
      return { tono: 'neutro', etiqueta: 'Sin facturas', cuando: 'Todavía sin fecha', detalle: 'La próxima visita se calcula desde su primera factura.' }
    default:
      return { tono: 'neutro', etiqueta: 'Sin rotación', cuando: 'Sin fecha', detalle: 'Editá la ficha y poné cada cuántos días se le visita.' }
  }
}

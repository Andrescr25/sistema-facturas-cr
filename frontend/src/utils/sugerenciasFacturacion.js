/**
 * Qué se le sugiere al agente en "Suele faltar" y cómo se reparte entre la
 * fila de siempre y el «Ver más» (2026-10-28, el usuario: «la barra está
 * perfecta, pero ampliémosla: que me recomiende más productos que el cliente
 * lleva»).
 *
 * La fila de arriba NO cambia: 10 productos, hasta 3 de ellos reservados para
 * lo que el cliente dejó de llevar. Lo nuevo es lo que cabe en el «Ver más»:
 * el resto de lo que lleva seguido, el resto de lo que dejó de llevar y los
 * productos que compró UNA sola vez este último año («ocasionales»), que antes
 * no se sugerían y dejaban a 44 de 236 clientes sin ninguna sugerencia.
 */

export const TOPE_FILA = 10
// De los 10, hasta 3 se guardan para lo que DEJÓ de llevar. Sin esta reserva,
// un cliente con 20 productos habituales llenaba la barra con ellos y el
// "hace 199 días que no lo lleva" no aparecía nunca — y ese es justo el que
// le da al agente algo que preguntar.
export const RESERVA_PERDIDOS = 3

// Los tres motivos, en el orden en que se muestran y con el título de cada grupo.
export const MOTIVOS = [
  { id: 'habitual', titulo: 'Lo lleva seguido' },
  { id: 'perdido', titulo: 'Dejó de llevarlo' },
  { id: 'ocasional', titulo: 'Lo ha llevado antes' }
]

const LISTAS = { habitual: 'habituales', perdido: 'perdidos', ocasional: 'ocasionales' }

/**
 * @returns {{ fila: object[], grupos: {id: string, titulo: string, productos: object[]}[], cantidadMas: number }}
 *   `fila` es la franja compacta; `grupos` lo que se despliega con «Ver más»
 *   (sin los grupos vacíos); cada producto lleva `motivo`.
 */
export function armarSugerencias(sugerencias, items) {
  const yaEsta = (id) => (items || []).some(i => String(i.id) === String(id))
  // El motivo se marca al armar cada lista, no comparando objetos después: los
  // tres se dicen distinto y hay que distinguirlos sin depender de la identidad.
  const por = Object.fromEntries(MOTIVOS.map(({ id }) => [
    id,
    (sugerencias?.[LISTAS[id]] || []).filter(p => !yaEsta(p.id)).map(p => ({ ...p, motivo: id }))
  ]))

  // Los perdidos toman su reserva; los habituales llenan el resto. Si no hay
  // perdidos, los habituales se quedan con todo el espacio. Los ocasionales
  // solo entran a la fila si todavía sobra lugar: el cliente que no tiene
  // hábitos igual ve algo, pero nunca le quitan el lugar a un habitual.
  const reservados = por.perdido.slice(0, RESERVA_PERDIDOS)
  const habituales = por.habitual.slice(0, TOPE_FILA - reservados.length)
  const ocasionales = por.ocasional.slice(0, Math.max(0, TOPE_FILA - reservados.length - habituales.length))
  const fila = [...habituales, ...reservados, ...ocasionales]

  const enFila = new Set(fila.map(p => String(p.id)))
  const grupos = MOTIVOS
    .map(({ id, titulo }) => ({ id, titulo, productos: por[id].filter(p => !enFila.has(String(p.id))) }))
    .filter(g => g.productos.length > 0)

  return { fila, grupos, cantidadMas: grupos.reduce((n, g) => n + g.productos.length, 0) }
}

/** Lo que se le dice al agente en cada tarjeta: el motivo, con el dato que lo respalda. */
export function textoMotivo(p) {
  if (p.motivo === 'perdido') return `Hace ${p.dias} días que no lo lleva`
  if (p.motivo === 'ocasional') return `Lo llevó una vez, ${haceCuanto(p.dias)}`
  return `Lo lleva ${p.veces} ${p.veces === 1 ? 'vez' : 'veces'}`
}

function haceCuanto(dias) {
  if (!(dias > 0)) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

import { coordenadasDe } from './visitaPreventa.js'

/**
 * «Mi día» (2026-11-01): las cuentas de la pantalla del plan de visitas.
 * Puras, para probarlas sin navegador.
 */

/** Saca el elemento de `desde` y lo pone en `hasta`. Fuera de la lista no mueve nada. */
export function moverEn(lista, desde, hasta) {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return lista
  const copia = [...lista]
  const [elemento] = copia.splice(desde, 1)
  copia.splice(hasta, 0, elemento)
  return copia
}

const porNombre = (a, b) => String(a.cliente.nombre).localeCompare(String(b.cliente.nombre), 'es')

/**
 * El día en el orden de la ruta (parte 2, «Orden de la ruta»): ruta por ruta,
 * en el orden de la lista de rutas (la misma con que se arma solo), y dentro de
 * cada una por su lugar en la ruta. Lo que no tiene ruta o lugar va al final.
 * @param {{cliente: {nombre, ruta: {id}, ordenRuta}}[]} clientes  los del día
 * @param {{id}[]} rutas
 */
export function ordenDeRuta(clientes, rutas) {
  const posicion = new Map(rutas.map((r, i) => [Number(r.id), i]))
  const deRuta = (x) => posicion.get(Number(x.cliente.ruta?.id)) ?? Infinity
  return [...clientes].sort((a, b) => (deRuta(a) - deRuta(b))
    || ((a.cliente.ordenRuta ?? Infinity) - (b.cliente.ordenRuta ?? Infinity)) || porNombre(a, b))
}

/** ¿El día ya está en el orden de la ruta? */
export function estaEnOrdenDeRuta(clientes, rutas) {
  return ordenDeRuta(clientes, rutas).every((x, i) => x.cliente.id === clientes[i].cliente.id)
}

/**
 * ¿Guardar su día cambiaría alguna ruta? Sí, si dentro de una misma ruta los
 * del día no van en el orden que tienen en ella.
 */
export function difiereDeLaRuta(clientes) {
  const ultimo = new Map()
  return clientes.some(({ cliente }) => {
    const ruta = cliente.ruta?.id
    if (!ruta || cliente.ordenRuta == null) return false
    const antes = ultimo.get(ruta)
    ultimo.set(ruta, cliente.ordenRuta)
    return antes !== undefined && cliente.ordenRuta < antes
  })
}

/**
 * Los del día en el mapa (parte 3, «Mapa del día»): cada uno con su número del
 * plan y su punto, si la ficha tiene coordenadas. Los que no, aparte: así el
 * agente sabe a quién marcarle la ubicación desde la visita.
 */
export function puntosDelDia(clientes) {
  const conPunto = []
  const sinPunto = []
  clientes.forEach((x, i) => {
    const punto = coordenadasDe(x.cliente.ubicacion_maps)
    const base = { numero: i + 1, id: x.cliente.id, nombre: x.cliente.nombre, atendido: Boolean(x.atendido) }
    if (punto) conPunto.push({ ...base, ...punto })
    else sinPunto.push(base)
  })
  return { conPunto, sinPunto }
}

/**
 * Lo que se lee del recorrido del agente (F5, 2026-10-29): dónde estaba al
 * hacer cada cosa y qué tan lejos del cliente.
 *
 * La distancia se mide contra la ubicación de la ficha, leída con la misma
 * regla de «Cómo llegar» (`coordenadasDe`): si el enlace no trae coordenadas
 * escritas, no hay contra qué medir y se dice.
 */
import { coordenadasDe } from './visitaPreventa.js'

/** Más lejos que esto, la acción se marca: no parece hecha en el local. */
export const METROS_LEJOS = 300

/** Distancia en metros entre dos puntos (fórmula de haversine). */
export function distanciaMetros(a, b) {
  const rad = (g) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)))
}

/** El punto donde estaba, en Maps; null si el dispositivo no dio la ubicación. */
export function mapaDe(gps) {
  return gps?.estado === 'tomada' && gps.latitud !== null ? `https://www.google.com/maps?q=${gps.latitud},${gps.longitud}` : null
}

/**
 * Qué decir del GPS de una acción.
 * @returns {{ texto: string, tono: 'exito'|'alerta'|'neutro', mapa: string|null }}
 */
export function lecturaDelGps(gps, ubicacionMaps) {
  if (!gps) return { texto: 'Sin visita de Preventa: facturada desde Facturación', tono: 'neutro', mapa: null }
  if (gps.estado === 'negada') return { texto: 'No dio permiso de ubicación', tono: 'alerta', mapa: null }
  if (gps.estado !== 'tomada' || gps.latitud === null) return { texto: 'El dispositivo no dio la ubicación', tono: 'alerta', mapa: null }
  const mapa = mapaDe(gps)
  const cliente = coordenadasDe(ubicacionMaps)
  if (!cliente) return { texto: 'Ubicación tomada; la ficha del cliente no tiene coordenadas para comparar', tono: 'neutro', mapa }
  const metros = distanciaMetros({ lat: gps.latitud, lng: gps.longitud }, cliente)
  const cuanto = metros < 1000 ? `${metros} m` : `${(metros / 1000).toLocaleString('es-CR', { maximumFractionDigits: 1 })} km`
  return { texto: `A ${cuanto} del cliente`, tono: metros > METROS_LEJOS ? 'alerta' : 'exito', mapa }
}

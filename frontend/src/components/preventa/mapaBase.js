import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Lo común de los mapas de Preventa (2026-11-01): el mapa con los mosaicos de
 * OpenStreetMap (no piden llave, pero sí internet) y su atribución. Lo usan el
 * de marcar la ubicación del local y el «Mapa del día». Leaflet se carga
 * aparte: solo viaja con el componente que abre un mapa (React.lazy).
 */
export function crearMapa(caja) {
  const mapa = L.map(caja, { zoomControl: true, attributionControl: true })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(mapa)
  // Dentro de un modal el tamaño final llega un instante después.
  const espera = setTimeout(() => mapa.invalidateSize(), 60)
  return { mapa, quitar: () => { clearTimeout(espera); mapa.remove() } }
}

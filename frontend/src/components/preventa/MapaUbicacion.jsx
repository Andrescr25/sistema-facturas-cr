import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// El marcador se dibuja acá (SVG): las imágenes por defecto de Leaflet no
// sobreviven al empaquetado y el pin salía roto.
const PIN = L.divIcon({
  className: '',
  html: '<svg viewBox="0 0 24 36" width="30" height="45" class="text-peligro-600 drop-shadow"><path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"/><circle cx="12" cy="12" r="4.5" fill="white"/></svg>',
  iconSize: [30, 45],
  iconAnchor: [15, 45]
})

/**
 * El mapa para marcar el punto exacto del local (2026-10-29: «que pueda
 * asignarle ubicación con punto exacto en el mapa»). Tocar el mapa pone el
 * marcador; arrastrarlo lo ajusta. Mosaicos de OpenStreetMap: no piden llave,
 * pero sí internet.
 *
 * `vista` centra el mapa (al abrir, o al usar el GPS); `punto` es el marcador.
 * Se carga aparte (React.lazy): Leaflet no viaja con el resto de la aplicación.
 */
export default function MapaUbicacion({ punto, vista, onCambiar, alto = 'h-[55vh] min-h-[280px]' }) {
  const caja = useRef(null)
  const mapa = useRef(null)
  const marcador = useRef(null)
  const alCambiar = useRef(onCambiar)
  alCambiar.current = onCambiar

  useEffect(() => {
    const m = L.map(caja.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(m)
    m.on('click', (e) => alCambiar.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
    mapa.current = m
    // Dentro del modal el tamaño final llega un instante después.
    const t = setTimeout(() => m.invalidateSize(), 60)
    return () => { clearTimeout(t); m.remove(); mapa.current = null; marcador.current = null }
  }, [])

  useEffect(() => {
    if (mapa.current && vista) mapa.current.setView([vista.lat, vista.lng], vista.zoom)
  }, [vista])

  useEffect(() => {
    const m = mapa.current
    if (!m) return
    if (!punto) {
      if (marcador.current) { marcador.current.remove(); marcador.current = null }
      return
    }
    if (!marcador.current) {
      marcador.current = L.marker([punto.lat, punto.lng], { draggable: true, icon: PIN, keyboard: false }).addTo(m)
      marcador.current.on('dragend', () => {
        const p = marcador.current.getLatLng()
        alCambiar.current({ lat: p.lat, lng: p.lng })
      })
    } else {
      marcador.current.setLatLng([punto.lat, punto.lng])
    }
  }, [punto])

  return <div ref={caja} role="application" aria-label="Mapa para marcar la ubicación" className={`${alto} w-full rounded-xl`} />
}

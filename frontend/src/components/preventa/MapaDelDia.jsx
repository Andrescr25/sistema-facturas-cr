import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { crearMapa } from './mapaBase'

// El número del plan, en un círculo: verde el que ya visitó, oscuro el siguiente.
const icono = ({ numero, atendido, esSiguiente, elegido }) => L.divIcon({
  className: '',
  html: `<span class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-sm font-bold shadow-md ${
    atendido ? 'bg-exito-600 text-white' : esSiguiente ? 'bg-primario-700 text-white' : 'bg-white text-neutro-800'
  } ${elegido ? 'ring-4 ring-alerta-400' : ''}">${numero}</span>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
})

/**
 * El «Mapa del día» (parte 3 de «Mi día», 2026-11-01): los clientes de su día
 * numerados en el orden del plan, unidos por una línea en ese orden. Tocar un
 * número lo elige (`onElegir`). Se carga aparte (React.lazy), como el de la
 * ubicación.
 */
export default function MapaDelDia({ puntos, siguiente, elegido, onElegir }) {
  const caja = useRef(null)
  const mapa = useRef(null)
  const capa = useRef(null)
  const alElegir = useRef(onElegir)
  alElegir.current = onElegir

  useEffect(() => {
    const { mapa: m, quitar } = crearMapa(caja.current)
    mapa.current = m
    capa.current = L.layerGroup().addTo(m)
    const limites = puntos.map(p => [p.lat, p.lng])
    if (limites.length === 1) m.setView(limites[0], 16)
    else if (limites.length) m.fitBounds(limites, { padding: [36, 36] })
    return () => { quitar(); mapa.current = null }
    // Encuadra al abrir; después el agente mueve el mapa a su gusto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!capa.current) return
    capa.current.clearLayers()
    if (puntos.length > 1) {
      // El color sale de la paleta: la clase manda sobre el que pone Leaflet.
      L.polyline(puntos.map(p => [p.lat, p.lng]), { className: 'stroke-neutro-500', weight: 3, opacity: 0.8, dashArray: '6 8' }).addTo(capa.current)
    }
    for (const p of puntos) {
      // El elegido y el siguiente, encima de los que caen en el mismo punto.
      const encima = p.id === elegido ? 1000 : p.id === siguiente ? 500 : 0
      L.marker([p.lat, p.lng], { icon: icono({ ...p, esSiguiente: p.id === siguiente, elegido: p.id === elegido }), keyboard: false, title: `${p.numero}. ${p.nombre}`, zIndexOffset: encima })
        .on('click', () => alElegir.current(p.id))
        .addTo(capa.current)
    }
  }, [puntos, siguiente, elegido])

  return <div ref={caja} role="application" aria-label="Mapa del día" className="h-[55vh] min-h-[300px] w-full rounded-xl" />
}

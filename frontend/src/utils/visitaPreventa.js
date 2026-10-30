/**
 * Lo que el agente necesita en la puerta del cliente (F3 del agente de ventas,
 * 2026-10-29: «que en ese módulo de preventa donde entre al cliente, también
 * le salga la información de ubicación»).
 *
 * La ficha guarda la ubicación como un ENLACE de Maps (`ubicacion_maps`), no
 * como coordenadas. Maps lo abre tal cual; para Waze hacen falta latitud y
 * longitud, que solo se pueden leer si el enlace las trae escritas (los
 * enlaces cortos «maps.app.goo.gl» no las traen: ahí solo Maps).
 *
 * Los teléfonos de las fichas traen cosas como «89350207 JEISON»: se toma el
 * número y, si es de 8 dígitos, se le pone el 506 de Costa Rica.
 */

const COORDENADAS = [
  /[?&](?:q|query|ll|destination|daddr)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
  /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/
]

/** { lat, lng } si el enlace las trae escritas; si no, null. */
export function coordenadasDe(enlace) {
  const texto = decodeURIComponent(String(enlace || ''))
  for (const patron of COORDENADAS) {
    const m = texto.match(patron)
    if (!m) continue
    const lat = Number(m[1]), lng = Number(m[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) return { lat, lng }
  }
  return null
}

/** Cómo llegar: el enlace de la ficha para Maps y, si se puede, Waze. */
export function enlacesParaLlegar(enlace) {
  if (!enlace) return { maps: null, waze: null }
  const c = coordenadasDe(enlace)
  return { maps: enlace, waze: c ? `https://waze.com/ul?ll=${c.lat},${c.lng}&navigate=yes` : null }
}

/** «89350207 JEISON» → «50689350207». Null si no hay un número que sirva. */
export function numeroDe(telefono) {
  const m = String(telefono || '').match(/\+?\d[\d\s-]{6,}\d/)
  if (!m) return null
  const digitos = m[0].replace(/\D/g, '')
  if (digitos.length === 8) return `506${digitos}`
  if (digitos.length === 11 && digitos.startsWith('506')) return digitos
  return null
}

/** Los teléfonos de la ficha, sin repetir, con su enlace para llamar y para WhatsApp. */
export function contactosDe(cliente) {
  const vistos = new Set()
  return [cliente?.celular, cliente?.telefono, cliente?.telefono_secundario]
    .filter(Boolean)
    .map(texto => ({ texto: String(texto).trim(), numero: numeroDe(texto) }))
    .filter(({ texto, numero }) => {
      const clave = numero || texto
      if (vistos.has(clave)) return false
      vistos.add(clave)
      return true
    })
    .map(({ texto, numero }) => ({
      texto,
      llamar: numero ? `tel:+${numero}` : null,
      whatsapp: numero ? `https://wa.me/${numero}` : null
    }))
}

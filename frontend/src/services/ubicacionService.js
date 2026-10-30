/**
 * El GPS del dispositivo en el momento de una acción del agente (F4, 2026-10-29:
 * el usuario pidió GPS en cada acción para tenerlo «completamente monitoreado»).
 *
 * Una página web NO puede seguir al agente todo el día: solo pregunta dónde
 * está cuando él hace algo (facturar en una visita, marcar «próxima visita»).
 * Nunca frena la acción: sin permiso o sin señal de GPS se dice por qué
 * («negada» / «no_disponible») y eso también queda anotado.
 */
export function tomarUbicacion({ espera = 12000 } = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ estado: 'no_disponible' })
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ estado: 'tomada', latitud: p.coords.latitude, longitud: p.coords.longitude, precision: Math.round(p.coords.accuracy) }),
      (e) => resolve({ estado: e.code === 1 ? 'negada' : 'no_disponible' }),
      { enableHighAccuracy: true, timeout: espera, maximumAge: 60000 }
    )
  })
}

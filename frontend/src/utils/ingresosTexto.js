import { fechaEnPalabras } from './fechaCR.js'

/**
 * Cómo se lee en pantalla lo de «Mis ingresos» y «Empleados» (2026-10-30).
 * Solo texto: las cuentas las hace el servidor (empleados/liquidacion.js), una
 * sola vez para las dos pantallas.
 */

/** 452 → "7 h 32 min"; 45 → "45 min"; 480 → "8 h". */
export function duracion(minutos) {
  const m = Math.max(0, Math.round(Number(minutos) || 0))
  const horas = Math.floor(m / 60)
  const resto = m % 60
  if (!horas) return `${resto} min`
  return resto ? `${horas} h ${resto} min` : `${horas} h`
}

/** Los minutos que van de un instante a ahora: lo que lleva la jornada abierta. */
export function minutosDesde(inicio, ahora = new Date()) {
  const t = new Date(inicio).getTime()
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((ahora.getTime() - t) / 60000))
}

export const ESTADOS_JORNADA = {
  abierta: { nombre: 'Trabajando', tono: 'activo' },
  cerrada: { nombre: 'Con salida', tono: 'exito' },
  sin_salida: { nombre: 'Sin salida', tono: 'alerta' },
  anulada: { nombre: 'Anulada', tono: 'peligro' }
}

/** "jueves, 29 oct" para encabezar un día. */
export const nombreDelDia = (fecha) => fechaEnPalabras(fecha, { weekday: 'long', day: 'numeric', month: 'short' })

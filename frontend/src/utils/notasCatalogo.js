/**
 * Los textos que explican por qué un producto aparece en una sección de la
 * portada del cliente.
 *
 * Fuera de la pantalla para poder probarlos: "hace 1 días" o "hace 0 meses"
 * son el tipo de detalle que nadie mira en una revisión y que el cliente ve
 * en la primera pantalla.
 *
 * Van en USTED. El resto del sistema tutea porque lo usa gente de la casa;
 * acá el lector es el dueño de otro negocio.
 */

export function notaHabitual(producto) {
  const veces = Number(producto.veces) || 0
  if (veces <= 0) return null
  return veces === 1 ? 'Lo compró una vez' : `Lo compró ${veces} veces`
}

/** "hace 2 meses", "hace 3 semanas", "ayer" — sin unidades en cero. */
export function haceCuanto(dias) {
  const d = Math.max(0, Math.round(Number(dias) || 0))
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 14) return `hace ${d} días`
  if (d < 60) {
    const semanas = Math.round(d / 7)
    return `hace ${semanas} semana${semanas === 1 ? '' : 's'}`
  }
  const meses = Math.round(d / 30)
  if (meses < 12) return `hace ${meses} mes${meses === 1 ? '' : 'es'}`
  const anios = Math.floor(meses / 12)
  return `hace ${anios} año${anios === 1 ? '' : 's'}`
}

export function notaPerdido(producto) {
  if (producto.dias === null || producto.dias === undefined) return null
  return `Sin comprarlo ${haceCuanto(producto.dias)}`
}

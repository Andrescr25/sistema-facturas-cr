/**
 * Lo que la pantalla de una compra ya registrada decide sin preguntarle al
 * servidor (2026-11-05): qué avisar en cada línea y si conviene corregir de
 * una vez todas las compras de ese código.
 */

const distinto = (otro, linea) => Boolean(otro && linea.producto && otro.productoId !== linea.producto.id)

/**
 * La relación del código HOY, o lo que muestra Revisión de Precios para esta
 * línea, no es lo que quedó en la compra: alguna de las dos está mal.
 */
export const relacionDistinta = (linea) => distinto(linea.relacion, linea) || distinto(linea.revision, linea)

/** Los avisos de una línea: lo que puede estar mal, o lo que impide corregirla. */
export function avisosDeLinea(linea) {
  const avisos = []
  if (!linea.producto) avisos.push({ tono: 'alerta', texto: 'Quedó sin producto nuestro: no entró al inventario ni cuenta en Reporte Clientes.' })
  if (distinto(linea.relacion, linea)) {
    avisos.push({ tono: 'alerta', texto: `La relación de este código hoy dice «${linea.relacion.nombre || 'sin producto'}», no lo que quedó en esta compra. Revise cuál es el correcto.` })
  } else if (distinto(linea.revision, linea)) {
    avisos.push({ tono: 'alerta', texto: `Revisión de Precios muestra esta línea como «${linea.revision.nombre || 'sin producto'}», no lo que quedó en esta compra (y así quedó su historial de costos). Revise cuál es el correcto.` })
  }
  if (linea.entregas?.length) {
    const quienes = linea.entregas.map((e) => `${e.cliente} (factura ${e.factura})`).join(', ')
    avisos.push({ tono: 'neutro', texto: `Ya se usó para dar por llegado lo de ${quienes}. Para corregirla, primero quíteles la respuesta en Reporte Clientes.` })
  }
  return avisos
}

/**
 * Si al corregir se ofrece cambiar también las demás compras de ese código.
 * Viene marcado cuando la relación del código todavía apunta al producto
 * equivocado: entonces el error es de la relación y se repitió en todas.
 */
export function opcionTodas(linea) {
  const relacionIgual = Boolean(linea.relacion && linea.producto) && !distinto(linea.relacion, linea)
  return { mostrar: Boolean(linea.relacion) && (linea.otrasCompras > 0 || relacionIgual), marcada: relacionIgual }
}

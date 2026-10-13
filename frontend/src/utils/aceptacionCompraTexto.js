/**
 * La aceptación de una compra ante Hacienda, en palabras. SIN IMPORTS y sin
 * React: backend/tests/aceptacionCompra.test.js lo importa tal cual.
 *
 * QUÉ SE PIDIÓ (2026-10-12). Al registrar una compra aparecía un formulario
 * —ambiente, respuesta, condición del IVA, IVA a acreditar, gasto aplicable—
 * y el usuario pidió que «se haga solo», «siempre como totalmente aceptada y
 * ya en producción», y que la compra «NO se duplique, sino que salga que yo
 * le hice recepción». La aceptación sale sola al registrar; acá se decide
 * qué se le dice de cómo quedó.
 */

/**
 * Las condiciones de IVA con que el sistema puede aceptar una compra sin
 * preguntar (anexo de Hacienda, nota 18). Crédito parcial (02) y bienes de
 * capital (03) piden montos propios de cada compra: no se ofrecen.
 */
export const CONDICIONES_IVA_COMPRAS = [
  ['01', 'Genera crédito de IVA', 'Todo el IVA de la compra se acredita. Lo habitual en mercadería que se revende con IVA.'],
  ['04', 'Gasto que no genera crédito', 'El IVA no se acredita: queda como parte del gasto.'],
  ['05', 'Proporcionalidad', 'Todavía no se sabe cuánto se acredita; se define en la declaración.']
]

const CONDICION = Object.fromEntries(CONDICIONES_IVA_COMPRAS.map(([codigo, nombre]) => [codigo, nombre]))
// Los dos que no se eligen acá, por si la aceptación se hizo de otra forma.
Object.assign(CONDICION, { '02': 'Crédito parcial de IVA', '03': 'Bienes de capital' })

/** El nombre de una condición de IVA, o '' si no se reconoce. */
export const condicionDeIva = (codigo) => CONDICION[codigo] || ''

/**
 * Lo que la aceptación le declaró a Hacienda, en un renglón. '' si todavía
 * no hay aceptación. `fmt` da formato a los montos.
 */
export function declaradoDe(estado, fmt) {
  const d = estado?.declarado
  if (!d?.condicion) return ''
  const partes = [condicionDeIva(d.condicion) || `Condición ${d.condicion}`]
  if (d.impuestoAcreditar !== null && d.impuestoAcreditar !== undefined) partes.push(`IVA acreditado ${fmt(Number(d.impuestoAcreditar))}`)
  if (d.gastoAplicable !== null && d.gastoAplicable !== undefined) partes.push(`gasto aplicable ${fmt(Number(d.gastoAplicable))}`)
  return partes.join(' · ')
}

/**
 * La cabecera del bloque en la compra ya registrada: { tono, titulo,
 * detalle }. null mientras el servidor no contestó.
 */
export function aceptacionDeCompra(estado) {
  if (!estado) return null
  const c = estado.comprobante
  if (c?.estado === 'aceptada') {
    return {
      tono: 'exito', titulo: 'Hacienda registró que aceptaste esta compra',
      detalle: 'Es una confirmación sobre la factura del proveedor: no se crea otra compra.'
    }
  }
  if (c?.estado === 'rechazada') {
    return { tono: 'peligro', titulo: 'Hacienda rechazó la aceptación', detalle: 'El motivo está abajo. La compra sigue registrada.' }
  }
  if (c) {
    return {
      tono: 'alerta', titulo: 'La aceptación está en camino',
      detalle: 'Ya se preparó para esta compra; abajo se ve en qué paso va.'
    }
  }
  if (estado.motivoNoEmitible) return { tono: 'alerta', titulo: 'Falta aceptarla ante Hacienda', detalle: estado.motivoNoEmitible }
  return {
    tono: 'alerta', titulo: 'Falta aceptarla ante Hacienda',
    detalle: 'No salió al registrar la compra. Tocá «Aceptar ante Hacienda»: es una confirmación, no otra compra.'
  }
}

/**
 * La etiqueta de una compra en la lista de Registradas: { tono, texto }.
 * `estado` es `aceptacionHacienda` (el de su aceptación, 'sin_enviar' o
 * null). Las anteriores al 2026-10-10, que no se aceptaron desde acá,
 * siguen diciendo solo «Registrada».
 */
export function etiquetaDeAceptacion(estado) {
  if (estado === 'aceptada') return { tono: 'exito', texto: 'Aceptada en Hacienda' }
  if (estado === 'rechazada') return { tono: 'peligro', texto: 'Hacienda la rechazó' }
  if (estado === 'sin_enviar') return { tono: 'alerta', texto: 'Falta aceptarla en Hacienda' }
  if (estado) return { tono: 'alerta', texto: 'Aceptación en camino' }
  return { tono: 'neutro', texto: 'Registrada' }
}

/**
 * El renglón del aviso al registrar la compra: qué pasó con la aceptación.
 * `hacienda` es lo que devuelve el servidor junto con la compra.
 */
export function avisoDeAceptacion(hacienda) {
  if (!hacienda) return ''
  if (hacienda.estado === 'enviada') {
    const c = hacienda.comprobante || {}
    return c.estado === 'aceptada'
      ? '🧾 Hacienda ya registró tu aceptación de esta compra'
      : '🧾 Aceptación enviada a Hacienda (sin formulario): falta su respuesta'
  }
  return `⚠️ La aceptación ante Hacienda NO salió: ${hacienda.motivo || 'abrí la compra en Registradas para enviarla.'}`
}

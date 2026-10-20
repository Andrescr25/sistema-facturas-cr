/**
 * Lo que la pantalla dice de una nota de crédito y de la factura que tocó.
 * SIN IMPORTS: backend/tests/notaCreditoSeguimiento.test.js lo importa tal
 * cual. El formato de la plata llega por parámetro (`fmt`, en la pantalla es
 * `colones`).
 *
 * QUÉ ARREGLA (2026-10-11). El usuario hizo una nota de crédito y contó:
 * «no avisó nada y solo me salió la factura como pagada». Era cierto: la
 * nota bajaba el saldo a cero y la factura decía "Pagada", que es otra cosa.
 * Pidió que se sepa «si se aplicó, si anuló el documento o qué pasó» y «si
 * la nota es aplicada a una factura electrónica o una de venta normal».
 *
 * La regla de fondo: SALDO EN CERO NO ES "PAGADA". Una factura puede quedar
 * sin saldo porque se cobró o porque una nota la acreditó, y a quien factura
 * le importa cuál de las dos.
 */

/** Medio colón de tolerancia: los montos se guardan con céntimos. */
const cubre = (monto, total) => Number(monto) > 0 && Number(monto) >= Number(total) - 0.5

/** Los motivos de una nota, en el orden en que se ofrecen al hacerla. */
export const MOTIVOS_NOTA = [
  ['devolucion', 'Devolución'], ['error', 'Error en la factura'], ['anulacion', 'Anulación'],
  ['descuento', 'Descuento posterior'], ['otro', 'Otro']
]
const MOTIVOS = Object.fromEntries(MOTIVOS_NOTA)
/** El motivo que eligió quien hizo la nota, en palabras. */
export const motivoDeNota = (clave) => MOTIVOS[clave] || 'Sin motivo'

/** Cómo está la factura, en una etiqueta: { tono, texto }. */
export function estadoDeFactura(f, fmt) {
  if (f.estado === 'anulada') return { tono: 'peligro', texto: 'Anulada' }
  if (f.estado === 'borrador') return { tono: 'neutro', texto: 'Borrador' }
  // Antes que "Pagada": una factura acreditada entera no la pagó nadie.
  if (cubre(f.acreditado, f.total)) return { tono: 'nota', texto: 'Anulada con nota de crédito' }
  if (f.saldo > 0) return { tono: 'alerta', texto: `Debe ${fmt(f.saldo)}` }
  return { tono: 'exito', texto: 'Pagada' }
}

/**
 * La segunda línea, cuando una nota acreditó solo una parte: la etiqueta de
 * arriba dice "Debe…" o "Pagada", y esto explica por qué no es el total.
 */
export function notasDeFactura(f, fmt) {
  const acreditado = Number(f.acreditado) || 0
  if (acreditado <= 0 || cubre(acreditado, f.total)) return ''
  return `Nota de crédito por ${fmt(acreditado)}`
}

/** Qué hizo esta nota sobre la factura: { clave, tono, titulo, detalle }. */
export function efectoDeNota(nota, f, fmt) {
  if (nota.estado === 'anulada') {
    return { clave: 'anulada', tono: 'peligro', titulo: 'Nota anulada', detalle: 'Ya no descuenta nada de la factura.' }
  }
  const total = Number(f.total) || 0
  const cobrado = Number(f.cobrado) || 0
  const acreditado = Number(f.acreditado) || 0
  // Si ya se había cobrado, lo acreditado de más es plata del cliente.
  const aFavor = Math.max(0, Math.round((cobrado + acreditado - total) * 100) / 100)
  const sobra = aFavor > 0.5 ? ` Ya había ${fmt(cobrado)} cobrados: quedan ${fmt(aFavor)} a favor del cliente.` : ''

  if (cubre(nota.monto, total)) {
    return {
      clave: 'total', tono: 'nota', titulo: 'Anuló la factura completa',
      detalle: `Acreditó los ${fmt(total)} de la factura: el cliente no debe nada por ella.${sobra}`
    }
  }
  const resto = f.saldo > 0
    ? `El cliente todavía debe ${fmt(f.saldo)} de esta factura.`
    : cubre(acreditado, total)
      ? 'Con las otras notas, la factura quedó acreditada por completo.'
      : 'El resto de la factura ya está cobrado.'
  return {
    clave: 'parcial', tono: 'nota', titulo: `Acreditó ${fmt(nota.monto)} de ${fmt(total)}`,
    detalle: `${resto}${sobra}`
  }
}

/** Lo que la nota le devolvió al inventario. '' si no devolvió unidades. */
export function inventarioDeNota(nota) {
  const n = Number(nota.unidades) || 0
  if (nota.estado === 'anulada' || n <= 0) return ''
  return n === 1 ? 'Volvió 1 unidad al inventario.' : `Volvieron ${n} unidades al inventario.`
}

/** A qué documento se aplicó: { electronica, tipo, numero }. */
export function aplicadaA(f) {
  if (!f.electronica) return { electronica: false, tipo: 'Factura de venta', numero: f.numero, nota: 'No es electrónica' }
  const tiquete = f.fiscal?.tipo === '04' || f.tipoDocumento === 'tiquete'
  return {
    electronica: true, tipo: tiquete ? 'Tiquete electrónico' : 'Factura electrónica',
    numero: f.fiscal?.consecutivo || f.numero, nota: 'Aceptada por Hacienda'
  }
}

/**
 * Cómo va la nota ante Hacienda, cuando NO hay un comprobante en curso (si lo
 * hay, lo cuenta el panel de pasos). null = no hay nada que decir.
 * `emision` es lo que respondió el servidor (`estadoNota`), o null si todavía
 * no llegó.
 */
export function haciendaDeNota(nota, f, emision) {
  if (nota.estado === 'anulada') return null
  if (nota.historica) {
    return nota.electronica
      ? { tono: 'exito', titulo: 'Aceptada por Hacienda', detalle: 'Se emitió desde Alegra.' }
      : { tono: 'neutro', titulo: 'Hecha en Alegra', detalle: 'No consta su emisión electrónica.' }
  }
  if (nota.electronica || nota.fiscal?.estado === 'aceptada') {
    return { tono: 'exito', titulo: 'Aceptada por Hacienda', detalle: nota.fiscal ? `Consecutivo ${nota.fiscal.consecutivo}` : '' }
  }
  if (emision?.comprobante) return null
  if (emision?.motivoNoEmitible) return { tono: 'neutro', titulo: 'No va a Hacienda', detalle: emision.motivoNoEmitible }
  if (emision) {
    return {
      tono: 'alerta', titulo: 'Falta emitirla ante Hacienda', emitible: true,
      detalle: 'La factura es electrónica: hasta que Hacienda acepte la nota, para Hacienda la factura sigue entera.'
    }
  }
  // Todavía no contestó el servidor: lo que se sabe por la factura.
  return f.electronica ? null : { tono: 'neutro', titulo: 'No va a Hacienda', detalle: 'La factura no es electrónica.' }
}

/** El aviso de que la nota quedó hecha: qué pasó y qué falta. */
export function avisoNotaCreada(nota, f, fmt) {
  const aplicada = (f.notasCredito || []).find(n => n.id === nota.id) || { monto: nota.total, estado: 'emitida' }
  const efecto = efectoDeNota(aplicada, f, fmt)
  const hacienda = f.electronica
    ? 'La factura es electrónica: falta emitir la nota ante Hacienda, en la tarjeta de la nota.'
    : 'La factura no es electrónica: la nota queda en el sistema y no va a Hacienda.'
  return `Nota de crédito ${nota.numero} por ${fmt(aplicada.monto)} aplicada. ${efecto.titulo}. ${hacienda}`
}

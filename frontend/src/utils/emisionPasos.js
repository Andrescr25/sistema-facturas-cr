/**
 * Emitir una factura electrónica de un clic: el orden de los pasos y lo que
 * se muestra de cada uno. SIN IMPORTS y sin React:
 * backend/tests/emisionUnClic.test.js lo importa tal cual.
 *
 * QUÉ REEMPLAZA (2026-10-11). Emitir era abrir un modal, elegir ambiente y
 * tipo, tocar "Preparar XML firmado", después "Enviar a Hacienda", después
 * "Consultar estado" las veces que hiciera falta, y aparte ir al botón Correo.
 * El usuario pidió: «con solo darle a este botón ya se emita», «que en la
 * misma factura me indique qué va pasando» y que al cliente le llegue «el
 * pdf con los 2 XML». Los tres pasos del servidor siguen siendo los mismos;
 * acá se encadenan.
 */

/** Estados en los que Hacienda ya contestó: no hay nada más que esperar. */
export const FINALES = ['aceptada', 'rechazada']

/** Hacienda la tiene y todavía no contesta. */
const EN_HACIENDA = ['recibida', 'procesando']

/**
 * Firmar → enviar → consultar hasta que Hacienda conteste o se acaben los
 * intentos. Devuelve el comprobante como quedó: si no es final, el servidor
 * lo sigue consultando solo cada minuto.
 *
 * `alAvanzar` recibe { fase, comprobante } en cada cambio, para pintarlo.
 * `sigue()` deja cortar si la persona se fue de la factura.
 */
export async function emitirPasoAPaso({
  firmar, enviar, consultar, esperar, alAvanzar = () => {}, sigue = () => true,
  comprobante = null, intentos = 20, pausaMs = 3000
}) {
  let c = comprobante
  if (!c) {
    alAvanzar({ fase: 'firmando', comprobante: null })
    c = await firmar()
  }
  if (!sigue()) return c

  // Preparada o con un envío sin confirmar: el servidor decide si hay que
  // mandarla o solo consultar la misma clave. Nunca se firma dos veces.
  if (!FINALES.includes(c.estado) && !EN_HACIENDA.includes(c.estado)) {
    alAvanzar({ fase: 'enviando', comprobante: c })
    c = await enviar(c)
  }

  for (let i = 0; i < intentos; i++) {
    // "error" es que Hacienda no la recibió: esperar no lo arregla.
    if (FINALES.includes(c.estado) || c.estado === 'error' || !sigue()) break
    alAvanzar({ fase: 'esperando', comprobante: c })
    await esperar(pausaMs)
    if (!sigue()) break
    c = await consultar(c)
    // Hacienda no conoce esa clave: el envío anterior no llegó. Se mandan
    // otra vez LOS MISMOS bytes, sin gastar otro número.
    if (c.noEncontrada) c = await enviar(c)
  }
  alAvanzar({ fase: null, comprobante: c })
  return c
}

const NOMBRE_TIPO = { '01': 'Factura electrónica', '04': 'Tiquete electrónico', '03': 'Nota de crédito electrónica' }
export const nombreDeTipo = (tipo) => NOMBRE_TIPO[tipo] || 'Comprobante electrónico'

/**
 * Los cuatro renglones que ve quien factura. Cada uno:
 *   estado: 'hecho' | 'activo' | 'pendiente' | 'fallo' | 'aviso' | 'omitido'
 * `seguimiento` es si el servidor consulta solo a Hacienda cada minuto.
 * `origen` es 'factura' o 'nota_credito': los cuatro pasos son los mismos
 * (la nota también se le entrega al cliente desde el 2026-10-11); solo
 * cambia a dónde se manda a quien le falta el correo.
 */
export function pasosDe({ comprobante: c, correo, fase, ambiente, seguimiento, origen = 'factura' }) {
  const estado = c?.estado
  const enviada = [...EN_HACIENDA, ...FINALES].includes(estado)

  const firma = c
    ? { estado: 'hecho', titulo: 'Comprobante firmado', detalle: `Consecutivo ${c.consecutivo}` }
    : { estado: fase === 'firmando' ? 'activo' : 'pendiente', titulo: fase === 'firmando' ? 'Firmando el comprobante…' : 'Firmar el comprobante' }

  let envio
  if (enviada) envio = { estado: 'hecho', titulo: 'Enviado a Hacienda' }
  else if (fase === 'enviando') envio = { estado: 'activo', titulo: 'Enviando a Hacienda…' }
  else if (estado === 'error') envio = { estado: 'fallo', titulo: 'Hacienda no lo recibió', detalle: c.mensaje || 'Revisá la configuración y volvé a intentar.' }
  else if (estado === 'incierta' || estado === 'enviando') {
    envio = { estado: fase === 'esperando' ? 'activo' : 'aviso', titulo: 'No se confirmó el envío', detalle: 'Se está consultando la misma clave; no se gasta otro número.' }
  } else envio = { estado: 'pendiente', titulo: 'Enviar a Hacienda' }

  let respuesta
  if (estado === 'aceptada') respuesta = { estado: 'hecho', titulo: 'Aceptada por Hacienda' }
  else if (estado === 'rechazada') respuesta = { estado: 'fallo', titulo: 'Rechazada por Hacienda', detalle: 'El motivo está abajo.' }
  else if (enviada) {
    respuesta = fase === 'esperando'
      ? { estado: 'activo', titulo: 'Esperando la respuesta de Hacienda…' }
      : {
          estado: 'aviso', titulo: 'Hacienda todavía no responde',
          // Solo se promete lo que el servidor dijo que hace (HACIENDA_TRABAJADOR).
          detalle: seguimiento === true
            ? 'El sistema la sigue consultando solo cada minuto.'
            : 'Tocá «Consultar a Hacienda» en un momento.'
        }
  } else respuesta = { estado: 'pendiente', titulo: 'Respuesta de Hacienda' }

  let entrega
  if (estado !== 'aceptada') entrega = { estado: 'pendiente', titulo: 'Correo al cliente con el PDF y los dos XML' }
  else if ((c.ambiente || ambiente) !== 'produccion') {
    entrega = { estado: 'omitido', titulo: 'No se le envía al cliente', detalle: 'Es una prueba: este comprobante no tiene validez fiscal.' }
  } else if (correo?.estado === 'enviado') entrega = { estado: 'hecho', titulo: `Enviado al cliente: ${correo.para}`, detalle: 'PDF, comprobante XML y respuesta de Hacienda.' }
  else if (correo?.estado === 'sin_correo') {
    entrega = {
      estado: 'aviso', titulo: 'El cliente no tiene correo',
      // El botón Correo (elegir a mano el destinatario) es de la factura.
      detalle: `Agregalo en su ficha y tocá «Enviar al cliente»${origen === 'factura' ? ', o mandalo con el botón Correo' : ''}.`
    }
  }
  else if (correo?.estado === 'error') entrega = { estado: 'fallo', titulo: 'No se pudo enviar el correo', detalle: correo.motivo || 'Revisá la dirección del cliente.' }
  else entrega = { estado: 'aviso', titulo: 'Todavía no se le envió al cliente', detalle: 'Tocá «Enviar al cliente».' }

  return [
    { clave: 'firma', ...firma }, { clave: 'envio', ...envio },
    { clave: 'respuesta', ...respuesta }, { clave: 'correo', ...entrega }
  ]
}

/** La etiqueta de arriba del panel: en una palabra, cómo va. */
export function resumenDe({ comprobante: c, fase }) {
  if (c?.estado === 'aceptada') return { tono: 'exito', texto: 'Aceptada' }
  if (c?.estado === 'rechazada') return { tono: 'peligro', texto: 'Rechazada' }
  if (fase) return { tono: 'activo', texto: 'Emitiendo' }
  if (c?.estado === 'error') return { tono: 'peligro', texto: 'Sin enviar' }
  if (c?.estado === 'preparada') return { tono: 'alerta', texto: 'Sin enviar' }
  if (c) return { tono: 'alerta', texto: 'Esperando a Hacienda' }
  return null
}

/**
 * Qué dice el botón, y qué hace al tocarlo. null = no se ofrece: Hacienda ya
 * la aceptó y un comprobante aceptado no se vuelve a emitir.
 *
 * Con un comprobante a medias el botón CONTINÚA ese mismo (misma clave, mismo
 * número); solo un rechazo prepara uno nuevo que referencia al rechazado.
 */
export function botonDe({ estado: e, fase }) {
  if (fase) return { texto: 'Emitiendo…', ocupado: true }
  if (!e) return { texto: 'Emitir electrónicamente', ocupado: true }
  const c = e.comprobante
  if (c?.estado === 'aceptada') return null
  if (c?.estado === 'rechazada') return { texto: 'Volver a emitir', sustituir: true }
  if (c?.estado === 'preparada') return { texto: 'Enviar a Hacienda', continuar: true }
  if (c?.estado === 'error') return { texto: 'Volver a enviar', continuar: true }
  if (c) return { texto: 'Consultar a Hacienda', continuar: true }
  return { texto: 'Emitir electrónicamente' }
}

// --- El dato que a veces falta (descuentos y medicamentos) ---

/** Los motivos de descuento del anexo 4.4 de Hacienda. */
export const MOTIVOS_DESCUENTO = [
  ['01', 'Regalía'], ['02', 'Regalía con IVA cobrado al cliente'], ['03', 'Bonificación'],
  ['04', 'Por volumen'], ['05', 'Por temporada'], ['06', 'Promocional'], ['07', 'Comercial'],
  ['08', 'Por frecuencia'], ['09', 'Sostenido'], ['99', 'Otro']
]

/**
 * De lo que la persona contestó a lo que espera el servidor: una entrada por
 * línea pendiente. El motivo del descuento se elige UNA vez y vale para todas
 * las líneas con descuento de esa factura; los datos de un medicamento son de
 * cada producto.
 */
export function lineasDe(pendientes, respuestas = {}) {
  return (pendientes || []).map(p => {
    const m = respuestas.medicamentos?.[p.numeroLinea] || {}
    return {
      numeroLinea: p.numeroLinea,
      ...(p.descuento ? {
        codigoDescuento: respuestas.codigoDescuento || '',
        naturalezaDescuento: String(respuestas.naturalezaDescuento || '').trim()
      } : {}),
      ...(p.medicamento ? {
        registroMedicamento: String(m.registro ?? p.registroSanitario ?? '').trim(),
        formaFarmaceutica: String(m.forma ?? p.formaFarmaceutica ?? '').trim()
      } : {})
    }
  })
}

/**
 * Lo que una nota de crédito puede declarar que hace sobre su factura, en
 * palabras de quien factura y con el código del anexo 4.4. Son los de uso
 * diario; el servidor admite además los demás de `REFERENCIAS_DE_NOTA`.
 *
 * EL 02 NO ES "CORRIGE MONTO": el modal viejo lo decía así y el anexo dice
 * «Corrige texto de documento de referencia». Corregir un monto es el 14.
 */
export const REFERENCIAS_NOTA = [
  ['01', 'Anula la factura completa'],
  ['06', 'Devolución de mercancía'],
  ['14', 'Corrige el monto (hubo un error)'],
  ['02', 'Corrige un texto de la factura'],
  ['09', 'Rebaja o descuento posterior (nota financiera)'],
  ['99', 'Otro']
]

/**
 * ¿El documento necesita que alguien conteste algo antes de emitir? El motivo
 * de un descuento, los datos de un medicamento, con qué paga el cliente —en
 * una venta de contado que nadie cobró todavía— o, en una nota de crédito,
 * qué hace la nota sobre su factura.
 */
export function pideDatos(estado) {
  return Boolean(estado?.pendientes?.length || estado?.faltaMedioPago || estado?.faltaReferencia)
}

/** Qué falta contestar, en palabras. '' = ya se puede emitir. */
export function faltaContestar(pendientes, respuestas = {}, { faltaMedioPago = false, faltaReferencia = false } = {}) {
  if (faltaReferencia) {
    if (!respuestas.codigoReferencia) return 'Elegí qué hace la nota.'
    if (respuestas.codigoReferencia === '99' && !String(respuestas.referenciaOtro || '').trim()) return 'Describí qué hace la nota.'
  }
  if (faltaMedioPago && !respuestas.metodoPagoId) return 'Elegí con qué paga el cliente.'
  for (const l of lineasDe(pendientes, respuestas)) {
    if ('codigoDescuento' in l) {
      if (!l.codigoDescuento) return 'Elegí el motivo del descuento.'
      if (l.codigoDescuento === '99' && !l.naturalezaDescuento) return 'Escribí de qué es el descuento.'
    }
    if ('registroMedicamento' in l) {
      if (!l.registroMedicamento) return 'Escribí el registro sanitario del medicamento.'
      if (!/^\d{3}$/.test(l.formaFarmaceutica)) return 'La forma farmacéutica es un código de 3 dígitos.'
    }
  }
  return ''
}

/**
 * Lo contestado, como lo espera el servidor. Solo viaja lo que se pidió: el
 * medio de pago no se manda si la factura ya lo tenía.
 */
export function respuestaDe(estado, respuestas = {}) {
  return {
    ...(estado?.pendientes?.length ? { lineas: lineasDe(estado.pendientes, respuestas) } : {}),
    ...(estado?.faltaMedioPago ? { metodoPagoId: respuestas.metodoPagoId } : {}),
    ...(estado?.faltaReferencia ? {
      codigoReferencia: respuestas.codigoReferencia,
      ...(respuestas.codigoReferencia === '99' ? { referenciaOtro: String(respuestas.referenciaOtro || '').trim() } : {})
    } : {})
  }
}

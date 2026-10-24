/**
 * Funciones puras del centro de impresión, sobre la factura PROPIA (rama
 * independencia-alegra, sección 11, paso 3).
 *
 * Hasta el 2026-09-30 este archivo traducía las líneas de Alegra —que traen
 * la referencia, la descripción, el precio y los impuestos en formas muy
 * variables— y armaba el payload que el servidor le reenviaba a Alegra. Ahora
 * el servidor propone las líneas ya ajustadas (reprinting/procesarImpresion.js)
 * y acá solo se pasan a la forma del formulario y de vuelta.
 *
 * SIN IMPORTS A PROPÓSITO: las pruebas lo cargan con `import()` directo.
 */

import { redondearDinero as dinero } from './moneda.js'

/**
 * Una fecha de calendario 'YYYY-MM-DD' (la emisión de la factura propia) se
 * muestra como ese día, sin hora: `new Date('2026-09-10')` es medianoche UTC,
 * que en Costa Rica todavía es el 9. Un instante (cuándo se procesó) lleva
 * su hora.
 */
export const formatDate = (dateString) => {
  const soloDia = String(dateString ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (soloDia) {
    return new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]))
      .toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  return new Date(dateString).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const numero = (v) => Number(v) || 0

/**
 * Una línea de la propuesta del servidor, en la forma que dibuja el
 * formulario. `description` es el NOMBRE del producto (el título de la
 * línea); la nota que se le escribió al facturar viaja aparte (`nota`) y se
 * devuelve tal cual.
 */
export function aItemDeEdicion(l) {
  return {
    productoId: l.productoId,
    reference: l.referencia || '',
    description: l.nombre || '',
    nota: l.nota ?? null,
    quantity: numero(l.cantidad),
    price: numero(l.precio),
    precioEditado: false,
    descuento: numero(l.descuento),
    tarifa: numero(l.tarifa),
    esNuevo: false,
    cantidad_faltante: numero(l.rebaja) > 0 ? numero(l.rebaja) : 0,
    eliminar_por_faltante: numero(l.cantidad) === 0 && numero(l.cantidadOriginal) > 0
  }
}

/** Lo que se le manda al servidor: cada línea por el id PROPIO de su producto. */
export function lineasParaProcesar(items) {
  return items.map((i) => ({
    productoId: i.productoId,
    cantidad: numero(i.quantity),
    precio: numero(i.price),
    precioEditado: i.precioEditado === true,
    descuento: numero(i.descuento),
    nota: i.nota ?? null
  }))
}

/** null si se puede guardar; si no, por qué. */
export function validarItemsParaProcesar(items) {
  if (items.some(i => !Number.isFinite(Number(i.price)) || Number(i.price) < 0)) {
    return 'Los precios deben ser números mayores o iguales a cero.'
  }
  if (items.some((i) => !i.productoId)) {
    return 'Cada producto nuevo hay que elegirlo en el buscador antes de guardar.'
  }
  if (items.some((i) => numero(i.quantity) <= 0 && !i.eliminar_por_faltante)) {
    return 'Las cantidades deben ser mayores a cero.'
  }
  if (items.every((i) => numero(i.quantity) <= 0)) {
    return 'La factura quedaría sin productos: si no se entregó nada, se anula en Facturación.'
  }
  return null
}

/** El subtotal de una línea, sin impuesto y con su descuento. */
export function subtotalDeItem(i) {
  const bruto = numero(i.quantity) * numero(i.price)
  return dinero(bruto - dinero(bruto * numero(i.descuento) / 100))
}

/**
 * El total de la factura como lo va a calcular el servidor: cada línea con
 * SU tarifa (0, 1, 2, 4, 8 o 13 %), redondeando por línea. Antes se sumaba
 * cantidad × precio sin impuesto y se comparaba contra el total CON impuesto:
 * "contra el original" salía siempre negativo.
 */
export function totalDeItems(items) {
  return dinero(items.reduce((suma, i) => {
    const base = subtotalDeItem(i)
    return suma + base + dinero(base * numero(i.tarifa) / 100)
  }, 0))
}

/**
 * Qué sigue después de guardar una factura de la cola.
 *
 * «IMPRIMIR Y EMITIR» (2026-10-20, el usuario: «hay facturas que siempre se
 * emiten, pero se emiten hasta después del proceso de impresión; que todas
 * las facturas que tienen correo salga el botón imprimir y emitir; eso sí,
 * que las rebajas y ajustes de precios se hagan primero y después se
 * emita»). El orden es guardar → emitir → imprimir: Hacienda recibe la
 * factura ya con los faltantes rebajados y los precios ajustados (una
 * electrónica ya no se edita), y el papel sale como «Factura electrónica»,
 * con su clave, porque el PDF solo la muestra cuando Hacienda la aceptó.
 *
 * «IMPRIMIR Y EMITIR COMO TIQUETE» (2026-10-24, el usuario: «los clientes que
 * no tienen correo, salga la opción emitir como tiquete e imprimir»). Es lo
 * mismo para el cliente SIN correo: sin dónde mandarle una factura
 * electrónica, sale tiquete, SIN dirigirlo a nadie (su cédula suele ser de
 * relleno y Hacienda rechazó el primero), y se le entrega impreso.
 */
export const DESPUES = { GUARDAR: 'guardar', IMPRIMIR: 'imprimir', EMITIR: 'emitir', EMITIR_TIQUETE: 'tiquete' }

const tieneCorreo = (f) => /^\S+@\S+\.\S+$/.test(String(f?.cliente_email || '').trim())
const sinEmitir = (f) => !f.electronica && !f.con_comprobante && !f.historica

/** ¿Se le ofrece «Imprimir y emitir»? Tiene correo y todavía no es ni va camino a ser electrónica. */
export function seEmiteAlImprimir(f) {
  return tieneCorreo(f) && sinEmitir(f)
}

/** ¿Se le ofrece «Imprimir y emitir como tiquete»? No tiene correo y todavía no es electrónica. */
export function seEmiteComoTiquete(f) {
  return !tieneCorreo(f) && sinEmitir(f)
}

/** La pregunta antes de marcar impresa una factura desde la lista. */
export function preguntaAlProcesar(f, { soloImprimir, despues }) {
  const tiquete = despues === DESPUES.EMITIR_TIQUETE
  const accion = tiquete ? ', emitirla como tiquete electrónico e imprimirla'
    : despues === DESPUES.EMITIR ? ', emitirla electrónicamente e imprimirla'
    : despues === DESPUES.IMPRIMIR ? ' e imprimir ahora' : ''
  const ajustes = soloImprimir ? '' : '\n\nSe le rebajan los faltantes y se le ponen los precios del catálogo.'
  const cuando = soloImprimir ? 'Se' : 'Después de eso se'
  // El tiquete no le sirve al cliente para respaldar gastos ni créditos de IVA:
  // se avisa antes, porque una vez aceptado ya no se cambia.
  const emision = tiquete
    ? `\n\n${cuando} emite ante Hacienda como TIQUETE ELECTRÓNICO, sin los datos del cliente (no queda a nombre de nadie), y se imprime: ` +
      'no tiene correo, se le entrega en papel. Un tiquete no le sirve al cliente para respaldar gastos ni créditos de IVA.'
    : despues === DESPUES.EMITIR
      ? `\n\n${cuando} emite ante Hacienda; cuando la acepte, le llega a ${f.cliente_email} y se imprime.`
      : ''
  return `¿Marcar la factura ${f.numero_factura} como impresa${accion}?${ajustes}${emision}`
}

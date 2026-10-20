/**
 * Las cuentas y las reglas de la pantalla de una factura, sin nada de React.
 * SIN IMPORTS: backend/tests/facturaVista.test.js lo importa tal cual.
 *
 * POR QUÉ EXISTE (2026-10-11). Todo esto vivía dentro de VistaFactura.jsx,
 * que llegó a 790 líneas mezclando el dibujo con las cuentas, la copia que se
 * edita y el cobro que se anula. El molde del proyecto es otro: las cuentas
 * acá, el estado en un gancho (useEdicionFactura) y cada sección en su
 * componente.
 */

export const num = (v) => Number(v) || 0

const MEDIOS = {
  cash: 'Efectivo', transfer: 'Transferencia', 'credit-card': 'Tarjeta de crédito',
  'debit-card': 'Tarjeta de débito', check: 'Cheque', sinpe_movil: 'SINPE Móvil'
}
/** El medio de pago, en palabras. */
export const medio = (v) => {
  if (!v) return null
  const k = String(v).trim().toLowerCase()
  return MEDIOS[k] || String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase()
}

/**
 * ¿La línea trae un detalle que diga algo? Cuando nadie escribe nada, el
 * servidor guarda ahí la descripción del producto, que en este catálogo es
 * el mismo nombre repetido: mostrarla sería ruido.
 */
const mismoTexto = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase()
export const esDetallePropio = (l) => Boolean(String(l.descripcion || '').trim()) && !mismoTexto(l.descripcion, l.nombre)

/**
 * La línea guardada → la fila que se muestra, y la que se copia para editar.
 *
 * EL DETALLE VIAJA CON LA LÍNEA. No estaba en la copia, y como al guardar se
 * reemplazan todas las líneas, corregir una cantidad borraba lo que alguien
 * había escrito en las demás ("ENTREGADO", "OJO CERRADO, VIGILADO X CÁMARAS").
 */
export const filaDe = (l) => ({
  productoId: l.productoId, nombre: l.nombre, referencia: l.referencia, cabys: l.cabys,
  cantidad: num(l.cantidad), precioUnitario: num(l.precioUnitario),
  descuentoPorcentaje: num(l.descuentoPorcentaje), tarifa: num(l.tarifa),
  impuestoMonto: num(l.impuestoMonto), descripcion: l.descripcion || ''
})

/** Una fila nueva a partir de un producto del catálogo. */
export const lineaDeProducto = (p) => ({
  productoId: p.productoId ?? p.id,
  nombre: p.name,
  referencia: p.reference,
  cabys: p.cabys,
  cantidad: 1,
  precioUnitario: num(p.price),
  descuentoPorcentaje: 0,
  // La tarifa viene del maestro, igual que al facturar.
  tarifa: p.tax?.length ? num(p.tax[0].percentage) : 0,
  descripcion: ''
})

/** Lo que vale una línea antes del impuesto, ya con su descuento. */
export const baseDe = (l) => l.cantidad * l.precioUnitario * (1 - (l.descuentoPorcentaje || 0) / 100)

/**
 * Los totales de lo que está en pantalla. En edición se recalculan con la
 * copia de trabajo; si no, son los guardados en el documento.
 *
 * `subtotal` es la BASE: la suma de las líneas, que ya trae el descuento
 * restado. Con descuento se calcula desde el total, porque las facturas
 * copiadas de Alegra guardan el subtotal ANTES del descuento y las propias,
 * después. Lo que se muestra lo arma `renglonesDeTotales` (Subtotal de antes
 * del descuento, Descuento, Impuestos): así 1.505 − 36 + 191 = 1.660 cierra.
 */
export function totalesDe(f, filas, editando) {
  const impuestoDe = (l) => (editando ? baseDe(l) * l.tarifa / 100 : l.impuestoMonto)
  const impuesto = editando ? filas.reduce((s, l) => s + impuestoDe(l), 0) : f.impuesto
  const descuento = editando
    ? filas.reduce((s, l) => s + l.cantidad * l.precioUnitario * (num(l.descuentoPorcentaje) / 100), 0)
    : num(f.descuento)
  const subtotal = editando
    ? filas.reduce((s, l) => s + baseDe(l), 0)
    : (descuento > 0 ? num(f.total) - num(f.impuesto) : f.subtotal)
  const total = editando ? subtotal + impuesto : f.total
  const porTarifa = [...filas.reduce((m, l) => {
    const t = num(l.tarifa)
    return m.set(t, (m.get(t) || 0) + impuestoDe(l))
  }, new Map())].filter(([, monto]) => monto > 0).sort((a, b) => a[0] - b[0])
  const hayDescuento = filas.some(l => num(l.descuentoPorcentaje) > 0) || Boolean(editando)
  return { impuestoDe, impuesto, descuento, subtotal, total, porTarifa, hayDescuento }
}

/** "13 %", "1 %", "0,5 %": como en el PDF. */
const tarifaTexto = (t) => `${String(Math.round(num(t) * 100) / 100).replace('.', ',')} %`

/**
 * Los renglones de los totales, iguales al PDF (factura.pdf.js,
 * `renglonesDeTotales`): Subtotal de ANTES del descuento, Descuento como resta
 * (0 si no hay), un Impuesto por tarifa de la mayor a la menor. El Total va
 * aparte. Pedido del usuario, 2026-10-19: «subtotal / descuento / impuesto
 * 13 % / impuesto 2 % / total», también en esta vista donde se edita.
 * Así la cuenta cierra: subtotal − descuento + impuestos = total.
 */
export function renglonesDeTotales({ subtotal, descuento, porTarifa }) {
  return [
    { etiqueta: 'Subtotal', monto: num(subtotal) + num(descuento) },
    // 0 y no −0: un −0 formateado sale «−₡0».
    { etiqueta: 'Descuento', monto: num(descuento) > 0 ? -num(descuento) : 0 },
    ...(porTarifa.length
      ? [...porTarifa].reverse().map(([tarifa, monto]) => ({ etiqueta: `Impuesto ${tarifaTexto(tarifa)}`, monto }))
      : [{ etiqueta: 'Impuesto', monto: 0 }])
  ]
}

/**
 * El comprobante de producción que tiene reservada la factura, según el panel
 * de emisión. Se mira además de la factura porque el panel se entera antes:
 * entre que Hacienda la recibe y que la pantalla relee la factura, el botón
 * Editar quedaba ofreciendo un cambio que la base va a rechazar.
 */
export function reservaFiscalDe(comprobante) {
  return comprobante?.ambiente === 'produccion' && comprobante.estado !== 'rechazada' ? comprobante : null
}

/** Por qué no se puede editar la factura; null = sí se puede. */
export function porQueNoSeEdita(f, { reservaFiscal = null, emitiendo = false } = {}) {
  return f.estado === 'anulada' ? 'Está anulada.'
    : f.estado !== 'emitida' ? 'Todavía es un borrador.'
    : (f.electronica || reservaFiscal?.estado === 'aceptada') ? 'Ya se emitió electrónicamente: se corrige con una nota de crédito.'
    : emitiendo ? 'Se está emitiendo electrónicamente.'
    : (['pendiente', 'enviada'].includes(f.haciendaEstado) || reservaFiscal) ? 'Está reservada ante Hacienda. Consultá el resultado antes de editar.'
    : f.cobrado > 0 ? 'Tiene un cobro aplicado: primero hay que anularlo, abajo en «Cobros».'
    : f.acreditado > 0 ? 'Tiene una nota de crédito aplicada.'
    : null
}

/** Qué impide guardar la corrección, en palabras. '' = se puede. */
export function faltaParaGuardar(lineas) {
  if (!lineas || lineas.length === 0) return 'La factura no puede quedar sin líneas.'
  if (lineas.some(l => num(l.cantidad) <= 0)) return 'Hay una línea con cantidad en cero.'
  return ''
}

/**
 * Lo que se le manda al servidor al guardar la corrección. Además de los
 * ids, lo que se veía: el servidor lo compara con su ficha y no deja cambiar
 * un cliente o agregar un producto que acá sea OTRO (ver
 * facturaPropia.service.js, `esLoMostrado`).
 */
export function cuerpoDeEdicion({ cliente, lineas, observaciones, motivo }) {
  return {
    clienteId: cliente?.id,
    clienteNombre: cliente?.nombre || '',
    clienteIdentificacion: cliente?.identificacion || '',
    items: lineas.map(l => ({
      productoId: l.productoId,
      reference: l.referencia || '',
      name: l.nombre || '',
      quantity: num(l.cantidad),
      price: num(l.precioUnitario),
      discount: Math.min(100, Math.max(0, num(l.descuentoPorcentaje))),
      description: (l.descripcion || '').trim()
    })),
    observaciones,
    motivo: String(motivo || '').trim() || null
  }
}

/** El cliente elegido en el buscador, con la forma que guarda la factura. */
export const clienteDeFicha = (c) => ({
  id: c.id, nombre: c.name, identificacion: c.identification,
  telefono: c.phonePrimary || c.mobile, direccion: null, correo: c.email
})

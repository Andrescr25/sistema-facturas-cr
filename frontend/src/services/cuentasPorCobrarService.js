import api from './api'

/**
 * Traducción de NUESTRA forma a la que todavía habla la pantalla.
 *
 * El backend propio nombra las cosas como son (`id`, `numero`, `saldoTotal`);
 * estos componentes fueron escritos contra el espejo de Alegra
 * (`numeroFactura`, `totalSaldo`). Se traduce ACÁ, pegado al código viejo, y
 * se borra el día que esos componentes hablen nuestro idioma.
 *
 * Lo que NO se hace: meter nuestro id en un campo llamado `alegraInvoiceId`.
 * Eso sería dejar escrita una mentira que alguien terminaría mandando a una
 * ruta de Alegra. Se usa `facturaId`.
 */
function diasHasta(fecha) {
  if (!fecha) return null
  const hoy = new Date()
  const vence = new Date(`${String(fecha).slice(0, 10)}T12:00:00`)
  return Math.round((vence - hoy) / 86400000)
}

function adaptarDeudor(d) {
  return {
    clienteId: d.clienteId,
    clienteNombre: d.nombre,
    identificacion: d.identificacion,
    telefono: d.telefono,
    totalSaldo: d.saldoTotal,
    facturas: (d.detalle || []).map((f) => ({
      facturaId: f.id,
      numeroFactura: f.numero,
      fecha: f.fecha,
      fechaVencimiento: f.fechaVencimiento,
      total: f.total,
      saldo: f.saldo,
      diasRestantes: diasHasta(f.fechaVencimiento)
    }))
  }
}

export async function getCuentasPorCobrar(params = {}) {
  const response = await api.get('/cuentas-por-cobrar/propios/deudores', { params })
  return {
    success: true,
    data: (response.data?.data ?? []).map(adaptarDeudor),
    paginacion: response.data?.paginacion ?? null
  }
}

export async function getAbonosFactura(facturaId) {
  const response = await api.get(`/cuentas-por-cobrar/propios/facturas/${facturaId}/abonos`)
  return { success: true, data: response.data?.data ?? [] }
}

/**
 * Las líneas de la factura, para mirarlas al cobrar. Salen de nuestra base:
 * antes se le pedían a Alegra cada vez que se abría el modal.
 */
export async function getProductosFactura(facturaId) {
  const response = await api.get(`/facturacion/facturas/${facturaId}`)
  const factura = response.data?.data
  return {
    success: true,
    data: (factura?.lineas ?? []).map((l) => ({
      nombre: l.nombre,
      referencia: l.referencia,
      cantidad: l.cantidad,
      precio: l.precioUnitario,
      total: l.cantidad * l.precioUnitario * (1 - (l.descuentoPorcentaje || 0) / 100)
    }))
  }
}

export async function registrarAbono(payload) {
  const response = await api.post('/cuentas-por-cobrar/propios/abonos', payload)
  return { success: true, data: response.data?.data ?? null }
}

/** Los métodos de pago de NUESTRO catálogo: el de la pantalla no tenía SINPE. */
export async function getMetodosPago() {
  const response = await api.get('/catalogos/configuracion')
  const metodos = response.data?.data?.metodosPago ?? response.data?.metodosPago ?? []
  return metodos
    .filter((m) => m.activo)
    .map((m) => ({ id: m.id, clave: m.clave, label: m.nombre, pideReferencia: m.pide_referencia }))
}

export async function anularAbono(abonoId, motivo) {
  const response = await api.patch(`/cuentas-por-cobrar/propios/abonos/${abonoId}/anular`, { motivo })
  return { success: true, data: response.data?.data ?? null }
}

export async function getCobrosDia(fecha) {
  const response = await api.get('/cuentas-por-cobrar/cobros-dia', { params: { fecha } })
  return response.data
}

export async function sincronizarCuentasPorCobrar() {
  const response = await api.post('/cuentas-por-cobrar/sync')
  return response.data
}

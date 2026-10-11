import api from './api'

export async function getPagosProveedores(params = {}) {
  const response = await api.get('/pagos-proveedores', { params })
  return response.data
}

/**
 * Registrar un pago a un proveedor. El saldo ya no se edita: el pago es un
 * documento (de qué cuenta salió, con qué método y referencia) y el saldo de
 * la factura se calcula a partir de él.
 *
 * @param {{ aplicaciones: Array<{cuentaPorPagarId: string, monto?: number, pagarTodo?: boolean}>,
 *           cuentaDineroId: number, metodoPagoId: number, referencia?: string, fecha?: string }} datos
 */
export async function registrarPagoProveedor(datos) {
  const response = await api.post('/pagos-proveedores/pagos', datos)
  return response.data
}

/** Anular un pago: queda con su motivo y el saldo vuelve solo. */
export async function anularPagoProveedor(pagoId, motivo) {
  const response = await api.post(`/pagos-proveedores/pagos/${pagoId}/anular`, { motivo })
  return response.data
}


export async function getProveedoresConCuentas() {
  const response = await api.get('/pagos-proveedores/proveedores')
  return response.data
}

// --- Notas de crédito ---
// Saldo a favor = crédito de un proveedor que todavía no se pudo descontar
// (su factura ya estaba pagada, o sobró). Es plata que te deben.

export async function getSaldosAFavor() {
  const response = await api.get('/pagos-proveedores/notas-credito/saldos-a-favor')
  return response.data
}

export async function getCandidatasNota(notaId) {
  const response = await api.get(`/pagos-proveedores/notas-credito/${notaId}/candidatas`)
  return response.data
}

export async function aplicarNotaACuenta(notaId, cuentaId, monto) {
  const response = await api.post(
    `/pagos-proveedores/notas-credito/${notaId}/aplicar-a/${cuentaId}`,
    monto !== undefined ? { monto } : {}
  )
  return response.data
}

export async function eliminarNotaCredito(notaId) {
  const response = await api.delete(`/pagos-proveedores/notas-credito/${notaId}`)
  return response.data
}

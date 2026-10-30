import api from './api'

/**
 * La cartera ENTERA. Buscar, filtrar por estado o vencimiento y el resumen
 * se resuelven en el navegador (utils/filtrosCobros.js): el endpoint no los
 * entiende, y son unos 60 clientes.
 */
export async function getCuentasPorCobrar() {
  const response = await api.get('/cuentas-por-cobrar/propios/deudores', { params: { limite: 1000 } })
  // Tal como la manda el servidor. Acá había un traductor (`adaptarDeudor`)
  // a los nombres del espejo de Alegra; se retiró el 2026-10-04, cuando la
  // pantalla pasó a usar los nuestros (`nombre`, `saldoTotal`, `numero`).
  return {
    success: true,
    data: response.data?.data ?? [],
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
  const response = await api.get('/cuentas-por-cobrar/propios/caja', { params: { fecha } })
  const d = response.data?.data

  // Los nombres que todavía usa la pestaña. Se traducen acá, como el resto:
  // `metodoPago` es el nombre del catálogo (las copiadas de Alegra guardan
  // "CASH" crudo) y `numeroFactura` puede traer varias, porque un abono se
  // puede repartir entre facturas.
  return {
    success: true,
    fecha: d?.fecha,
    cobros: (d?.cobros ?? []).map((c) => ({
      id: c.id,
      clienteNombre: c.cliente,
      numeroFactura: c.facturas,
      metodoPago: c.metodo,
      monto: c.monto,
      anulado: c.anulado,
      referencia: c.referencia,
      registradoPor: c.registradoPor
    })),
    resumen: {
      total: d?.resumen?.total ?? 0,
      cantidadCobros: d?.resumen?.cantidad ?? 0,
      anulados: d?.resumen?.anulados ?? 0,
      efectivoEsperado: d?.resumen?.efectivoEsperado ?? 0,
      // Cobrado en efectivo − lo que salió de la caja (pagos a proveedores y
      // gastos) = lo que debería haber. Ver migración 026.
      efectivoCobrado: d?.resumen?.efectivoCobrado ?? 0,
      salidasEfectivo: d?.resumen?.salidasEfectivo ?? 0,
      salidas: d?.salidas ?? [],
      porMetodo: Object.fromEntries(
        (d?.resumen?.porMetodo ?? []).map((m) => [m.clave, { monto: m.monto, cantidad: m.cantidad, nombre: m.metodo }])
      ),
      // Cuánto cobró cada usuario y si ya entregó el efectivo (migración 071).
      porUsuario: d?.porUsuario ?? []
    },
    cierre: d?.cierre ?? null
  }
}

/** Cerrar el día: se cuenta el efectivo y se compara con lo esperado. */
export async function cerrarCaja({ fecha, efectivoContado, motivoDiferencia, observaciones }) {
  const response = await api.post('/cuentas-por-cobrar/propios/caja/cerrar',
    { fecha, efectivoContado, motivoDiferencia, observaciones })
  return response.data?.data ?? null
}

/** Recibir el efectivo que cobró un usuario ese día. Lo cobrado se congela al recibir. */
export async function recibirEfectivo({ fecha, usuarioId, efectivoEntregado, observaciones }) {
  const response = await api.post('/cuentas-por-cobrar/propios/caja/rendicion',
    { fecha, usuarioId, efectivoEntregado, observaciones })
  return response.data?.data ?? null
}

/** Reabrir un cierre. Pide motivo y queda anotado quién lo hizo. */
export async function reabrirCaja(fecha, motivo) {
  const response = await api.post('/cuentas-por-cobrar/propios/caja/reabrir', { fecha, motivo })
  return response.data?.data ?? null
}


/**
 * Lo que entró y salió de Caja General en un período, con las facturas que
 * originaron cada movimiento. Sin fechas, el mes en curso.
 */
export async function getMovimientosCaja({ desde, hasta } = {}) {
  const response = await api.get('/cuentas-por-cobrar/propios/caja/movimientos', { params: { desde, hasta } })
  return response.data?.data ?? null
}

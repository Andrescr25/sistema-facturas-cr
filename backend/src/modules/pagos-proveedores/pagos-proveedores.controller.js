/**
 * Pagos-Proveedores Module - Controller
 * Controladores HTTP para cuentas por pagar a proveedores
 */

const pagosProveedoresService = require('../../../services/pagosProveedoresService');
const notasCreditoService = require('../../../services/notasCreditoService');
const pagosProveedor = require('./pagosProveedor.service');

/**
 * GET /pagos-proveedores
 */
async function listarCuentas(req, res) {
  try {
    const {
      estado,
      proveedor,
      search,
      dias,
      diasMin,
      diasMax,
      soloVencidas
    } = req.query;

    const result = await pagosProveedoresService.listarCuentas({
      estado,
      proveedor,
      search,
      dias,
      diasMin,
      diasMax,
      soloVencidas: soloVencidas === 'true'
    });

    res.json({
      success: true,
      data: result.data,
      resumen: result.resumen,
      filtros: result.filtros
    });
  } catch (error) {
    console.error('❌ Error obteniendo cuentas por pagar:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo cuentas por pagar',
      error: error.message
    });
  }
}

/**
 * GET /pagos-proveedores/proveedores
 */
async function listarProveedoresConCuentas(req, res) {
  try {
    const data = await pagosProveedoresService.listarProveedoresConCuentas();
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error obteniendo proveedores con cuentas por pagar:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo proveedores con cuentas por pagar',
      error: error.message
    });
  }
}

/**
 * PATCH /pagos-proveedores/:id
 */
async function actualizarCuenta(req, res) {
  try {
    const { estado, saldoPendiente, notas } = req.body;
    if (!estado && saldoPendiente === undefined && notas === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Debe enviar al menos un campo para actualizar'
      });
    }

    const cuenta = await pagosProveedoresService.actualizarCuenta(req.params.id, {
      estado,
      saldoPendiente,
      notas
    });

    res.json({
      success: true,
      data: cuenta
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('❌ Error actualizando cuenta por pagar:', error);
    res.status(500).json({
      success: false,
      message: 'Error actualizando cuenta por pagar',
      error: error.message
    });
  }
}

// ==================== Pagos ====================

/**
 * POST /pagos-proveedores/pagos
 * { aplicaciones: [{ cuentaPorPagarId, monto | pagarTodo }], cuentaDineroId,
 *   metodoPagoId, referencia?, fecha?, observaciones? }
 */
async function registrarPago(req, res) {
  try {
    const pago = await pagosProveedor.registrarPago(req.body || {}, req.usuario?.id);
    res.status(201).json({ success: true, data: pago });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('❌ Error registrando pago a proveedor:', error);
    res.status(500).json({ success: false, message: 'Error registrando el pago' });
  }
}

/** POST /pagos-proveedores/pagos/:id/anular  { motivo } */
async function anularPago(req, res) {
  try {
    const pago = await pagosProveedor.anularPago(req.params.id, req.body || {}, req.usuario?.id);
    res.json({ success: true, data: pago });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('❌ Error anulando pago a proveedor:', error);
    res.status(500).json({ success: false, message: 'Error anulando el pago' });
  }
}

// ==================== Notas de crédito ====================

/**
 * GET /pagos-proveedores/notas-credito/huerfanas
 * Notas que no se pudieron aplicar (su factura no está en el sistema).
 * Es lo primero que hay que mirar cuando un saldo no cuadra.
 */
async function listarNotasHuerfanas(req, res) {
  try {
    const data = await notasCreditoService.listarHuerfanas();
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error listando notas de crédito huérfanas:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /pagos-proveedores/notas-credito/saldos-a-favor
 * Crédito que no se pudo descontar (facturas ya pagadas o excedentes): plata
 * que el proveedor te debe y podés aplicar a una próxima compra.
 */
async function listarSaldosAFavor(req, res) {
  try {
    const data = await notasCreditoService.saldosAFavor();
    const total = data.reduce((s, x) => s + x.aFavor, 0);
    res.json({ success: true, data, total });
  } catch (error) {
    console.error('❌ Error listando saldos a favor:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /pagos-proveedores/notas-credito/aplicar
 * Reintenta aplicar las notas pendientes (por si la factura llegó después).
 */
async function aplicarNotasCredito(req, res) {
  try {
    const aplicadas = await notasCreditoService.aplicarNotasCreditoPendientes();
    res.json({ success: true, aplicadas: aplicadas.length, detalle: aplicadas });
  } catch (error) {
    console.error('❌ Error aplicando notas de crédito:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /pagos-proveedores/notas-credito/:id/candidatas
 * Facturas del mismo proveedor con saldo, para elegir a cuál aplicarle el
 * crédito que quedó a favor.
 */
async function listarCandidatas(req, res) {
  try {
    const data = await notasCreditoService.cuentasCandidatas(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('❌ Error listando facturas candidatas:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /pagos-proveedores/notas-credito/:id/aplicar-a/:cuentaId
 * Liga el crédito a la factura elegida y descuenta su saldo.
 */
async function aplicarNotaACuenta(req, res) {
  try {
    const data = await notasCreditoService.aplicarNotaACuenta(
      req.params.id, req.params.cuentaId, req.body?.monto
    );
    res.json({ success: true, ...data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('❌ Error aplicando la nota a la factura:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * DELETE /pagos-proveedores/notas-credito/:id
 * Elimina la nota devolviendo a las facturas lo que se les había descontado.
 */
async function eliminarNotaCredito(req, res) {
  try {
    const data = await notasCreditoService.eliminarNotaCredito(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('❌ Error eliminando la nota de crédito:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PATCH /pagos-proveedores/notas-credito/:id/inventario
 * Marca que ya se revisó si esa nota implicaba devolución física.
 */
async function marcarInventarioRevisado(req, res) {
  try {
    const data = await notasCreditoService.marcarInventarioRevisado(req.params.id, req.body.revisado);
    res.json({ success: true, ...data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('❌ Error marcando revisión de inventario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  listarCuentas,
  listarProveedoresConCuentas,
  actualizarCuenta,
  registrarPago,
  anularPago,
  listarNotasHuerfanas,
  listarSaldosAFavor,
  listarCandidatas,
  aplicarNotaACuenta,
  eliminarNotaCredito,
  aplicarNotasCredito,
  marcarInventarioRevisado
};

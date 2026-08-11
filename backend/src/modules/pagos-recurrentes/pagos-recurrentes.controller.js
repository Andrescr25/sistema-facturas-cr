/**
 * Pagos Recurrentes - Controller
 */

const service = require('./pagos-recurrentes.service');

function manejarError(res, error, contexto) {
  if (error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error(`Error ${contexto}:`, error);
  res.status(500).json({ success: false, error: error.message });
}

async function listarGastos(req, res) {
  try {
    const data = await service.listarGastos();
    res.json({ success: true, data, categorias: service.CATEGORIAS, frecuencias: service.FRECUENCIAS });
  } catch (error) {
    manejarError(res, error, 'listando gastos recurrentes');
  }
}

async function crearGasto(req, res) {
  try {
    const data = await service.crearGasto(req.body);
    res.json({ success: true, data });
  } catch (error) {
    manejarError(res, error, 'creando gasto recurrente');
  }
}

async function actualizarGasto(req, res) {
  try {
    const data = await service.actualizarGasto(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    manejarError(res, error, 'actualizando gasto recurrente');
  }
}

async function cambiarActivoGasto(req, res) {
  try {
    const data = await service.cambiarActivoGasto(req.params.id, req.body.activo);
    res.json({ success: true, data });
  } catch (error) {
    manejarError(res, error, 'cambiando estado del gasto');
  }
}

async function eliminarGasto(req, res) {
  try {
    const data = await service.eliminarGasto(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'eliminando gasto recurrente');
  }
}

async function obtenerPeriodo(req, res) {
  try {
    const data = await service.obtenerPeriodo(req.params.periodo);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'obteniendo el período');
  }
}

async function actualizarPago(req, res) {
  try {
    const data = await service.actualizarPago(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    manejarError(res, error, 'actualizando el pago');
  }
}

async function marcarPagado(req, res) {
  try {
    const data = await service.marcarPagado(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    manejarError(res, error, 'marcando el pago');
  }
}

async function revertirPago(req, res) {
  try {
    const data = await service.revertirPago(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    manejarError(res, error, 'revirtiendo el pago');
  }
}

async function historialGasto(req, res) {
  try {
    const data = await service.historialGasto(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'obteniendo el historial del gasto');
  }
}

async function obtenerResumen(req, res) {
  try {
    const data = await service.obtenerResumen();
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'obteniendo el resumen de flujo');
  }
}

// ==================== Consulta automática de recibos ====================

async function sincronizarGasto(req, res) {
  try {
    const data = await service.sincronizarGasto(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'consultando el recibo');
  }
}

async function sincronizarTodos(req, res) {
  try {
    const data = await service.sincronizarTodos();
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'consultando los recibos');
  }
}

async function listarFuentesAuto(req, res) {
  try {
    res.json({ success: true, data: service.listarFuentesAuto() });
  } catch (error) {
    manejarError(res, error, 'listando fuentes automáticas');
  }
}

async function opcionesFuente(req, res) {
  try {
    const data = await service.opcionesFuente(req.params.fuente, req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'consultando las opciones de la fuente');
  }
}

module.exports = {
  listarGastos,
  crearGasto,
  actualizarGasto,
  cambiarActivoGasto,
  eliminarGasto,
  obtenerPeriodo,
  actualizarPago,
  marcarPagado,
  revertirPago,
  historialGasto,
  obtenerResumen,
  sincronizarGasto,
  sincronizarTodos,
  listarFuentesAuto,
  opcionesFuente
};

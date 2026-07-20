/**
 * Inventario-Auditorias Module - Controller
 * Controladores HTTP para auditorías cíclicas de inventario
 */

const inventarioAuditoriasService = require('./inventario-auditorias.service');

/**
 * GET /inventario-auditorias
 */
async function listarAuditorias(req, res) {
  try {
    const { tipo } = req.query;
    const data = await inventarioAuditoriasService.listarAuditorias(tipo);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando auditorías:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /inventario-auditorias/categorias
 */
async function listarCategorias(req, res) {
  try {
    const data = await inventarioAuditoriasService.listarCategorias();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error obteniendo categorías de productos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /inventario-auditorias
 */
async function crearAuditoria(req, res) {
  const { tipo, categoria, nombre } = req.body; // tipo: 'random', 'categoria', 'critico'
  try {
    const audit = await inventarioAuditoriasService.crearAuditoria({ tipo, categoria, nombre });
    res.json({ success: true, data: audit });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error creando auditoría de inventario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /inventario-auditorias/:id
 */
async function getAuditoria(req, res) {
  const { id } = req.params;
  try {
    const data = await inventarioAuditoriasService.getAuditoria(id);
    res.json({ success: true, data });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error('Error obteniendo detalle de auditoría:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PUT /inventario-auditorias/:id/items
 */
async function guardarConteos(req, res) {
  const { id } = req.params;
  const { items } = req.body; // Array de { id, stock_real }

  try {
    const { message } = await inventarioAuditoriasService.guardarConteos(id, items);
    res.json({ success: true, message });
  } catch (error) {
    if (error.partialResult) {
      // Progreso parcial ya persistido por applyBatchedAdjustments: los lotes previos ya están
      // marcados ajustado_alegra = TRUE, así que volver a guardar sólo reintenta lo pendiente.
      const result = error.partialResult;
      return res.status(500).json({
        success: false,
        message: result.itemsAdjusted > 0
          ? `Conteos guardados. Se aplicó el ajuste en Alegra para ${result.itemsAdjusted} de ${result.totalItems} ítems (lote ${result.batchesCompleted} de ${result.totalBatches}) antes de un error. Guarda de nuevo para reintentar los restantes.`
          : 'Los conteos se guardaron, pero no se pudo aplicar el ajuste de inventario en Alegra. Guarda de nuevo para reintentarlo.',
        error: result.errorDetail
      });
    }
    console.error('Error actualizando conteos:', error);
    res.status(500).json({
      success: false,
      message: 'No se pudieron guardar los conteos.',
      error: error.response?.data || error.message
    });
  }
}

/**
 * POST /inventario-auditorias/:id/finalizar
 */
async function finalizarAuditoria(req, res) {
  const { id } = req.params;
  const { observaciones } = req.body;

  try {
    const data = await inventarioAuditoriasService.finalizarAuditoria(id, observaciones);
    res.json({
      success: true,
      message: 'Auditoría finalizada con éxito',
      data
    });
  } catch (error) {
    console.error('Error finalizando auditoría:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /inventario-auditorias/:id/ajustar-alegra
 */
async function ajustarEnAlegra(req, res) {
  const { id } = req.params;

  try {
    const result = await inventarioAuditoriasService.ajustarEnAlegra(id);
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.partialResult) {
      const result = error.partialResult;
      return res.status(500).json({
        success: false,
        message: result.itemsAdjusted > 0
          ? `Se aplicó el ajuste en Alegra para ${result.itemsAdjusted} de ${result.totalItems} ítems (lote ${result.batchesCompleted} de ${result.totalBatches}) antes de un error. Presiona "Aplicar Ajuste en Alegra" nuevamente para reintentar los restantes.`
          : 'No se pudo aplicar el ajuste en Alegra. Verifique los detalles de error.',
        error: result.errorDetail
      });
    }
    console.error('Error aplicando ajuste en Alegra:', error);
    res.status(500).json({
      success: false,
      message: 'No se pudo aplicar el ajuste en Alegra. Verifique los detalles de error.',
      error: error.response?.data || error.message
    });
  }
}

/**
 * POST /inventario-auditorias/:id/resync
 */
async function resincronizarAuditoria(req, res) {
  const { id } = req.params;

  try {
    await inventarioAuditoriasService.resincronizarAuditoria(id);
    res.json({ success: true, message: 'Auditoría re-sincronizada correctamente con los stocks y costos actuales de Alegra.' });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error('Error re-sincronizando auditoría:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /inventario-auditorias/devolucion
 */
async function crearDevolucion(req, res) {
  try {
    const devolucion = await inventarioAuditoriasService.crearDevolucion();
    res.json({ success: true, data: devolucion });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error creando devolución:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /inventario-auditorias/buscar-productos?q=
 */
async function buscarProductosParaDevolucion(req, res) {
  const { q } = req.query;
  try {
    const data = await inventarioAuditoriasService.buscarProductosParaDevolucion(q);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error buscando productos para devolución:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /inventario-auditorias/:id/items
 */
async function agregarItemDevolucion(req, res) {
  const { id } = req.params;
  try {
    const item = await inventarioAuditoriasService.agregarItemDevolucion(id, req.body);
    res.json({ success: true, data: item });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error agregando producto a devolución:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /inventario-auditorias/:id/items/:itemId
 */
async function eliminarItemDevolucion(req, res) {
  const { id, itemId } = req.params;
  try {
    await inventarioAuditoriasService.eliminarItemDevolucion(id, itemId);
    res.json({ success: true, message: 'Producto eliminado de la devolución.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error eliminando producto de devolución:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  listarAuditorias,
  listarCategorias,
  crearAuditoria,
  getAuditoria,
  guardarConteos,
  finalizarAuditoria,
  ajustarEnAlegra,
  resincronizarAuditoria,
  crearDevolucion,
  buscarProductosParaDevolucion,
  agregarItemDevolucion,
  eliminarItemDevolucion
};

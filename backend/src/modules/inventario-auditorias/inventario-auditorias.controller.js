/**
 * Inventario-Auditorias Module - Controller
 * Controladores HTTP para auditorías cíclicas de inventario
 */

const inventarioAuditoriasService = require('./inventario-auditorias.service');
const productosNuevos = require('./productosNuevos');

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
 * PATCH /inventario-auditorias/:id/items/:itemId/conteo
 * Guarda solo el conteo de un ítem (sin ajuste en Alegra), para que no se
 * pierda si el navegador se cierra antes de "Guardar y Ajustar".
 */
async function guardarConteoIndividual(req, res) {
  const { id, itemId } = req.params;
  const { stockReal } = req.body;

  try {
    await inventarioAuditoriasService.guardarConteoIndividual(id, itemId, stockReal);
    res.json({ success: true });
  } catch (error) {
    console.error('Error guardando conteo individual:', error);
    res.status(500).json({ success: false, error: error.message });
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
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
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
    // Genérico a propósito: esta misma ruta la usan devoluciones y tandas
    // de excesos (ver eliminarItemDevolucion en el service).
    res.json({ success: true, message: 'Producto eliminado.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error eliminando producto de devolución:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /inventario-auditorias/generar-excesos
 *
 * La ÚNICA forma de que nazca una tanda de excesos. El cron dejó de crearlas
 * solo: revisa, escala descuentos y depura la liquidación, pero la tanda de
 * empaque la pide una persona cuando se va a poner a empacar.
 */
async function generarExcesos(req, res) {
  try {
    const result = await inventarioAuditoriasService.generarTandaDeExcesos();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error generando excesos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PATCH /inventario-auditorias/:id/items/:itemId/exceso
 */
async function actualizarItemExceso(req, res) {
  const { id, itemId } = req.params;
  const { empacado, stockReal } = req.body;

  try {
    const item = await inventarioAuditoriasService.actualizarItemExceso(id, itemId, { empacado, stockReal });
    res.json({ success: true, data: item });
  } catch (error) {
    if (error.partialResult) {
      return res.status(500).json({
        success: false,
        message: 'La cantidad se guardó, pero no se pudo aplicar el ajuste en Alegra. Intenta de nuevo.',
        error: error.partialResult.errorDetail
      });
    }
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error actualizando producto de exceso:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /inventario-auditorias/regalos
 */
async function listarRegalos(req, res) {
  try {
    const data = await inventarioAuditoriasService.listarRegalos();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando regalías:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ==================== Control manual de excesos ====================

/**
 * POST /inventario-auditorias/excesos — tanda vacía para armarla a mano.
 */
async function crearExcesoManual(req, res) {
  try {
    const data = await inventarioAuditoriasService.crearExcesoManual();
    res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error creando tanda de excesos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /inventario-auditorias/:id — elimina una tanda de excesos completa.
 */
async function eliminarAuditoria(req, res) {
  try {
    const data = await inventarioAuditoriasService.eliminarAuditoria(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error eliminando tanda de excesos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /inventario-auditorias/:id/items-exceso — agrega a mano un producto
 * a una tanda de excesos.
 */
async function agregarItemExceso(req, res) {
  try {
    const data = await inventarioAuditoriasService.agregarItemExceso(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error agregando producto a la tanda de excesos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /inventario-auditorias/:id/descuento — mismo descuento para todos los
 * productos de la tanda.
 */
async function aplicarDescuentoTanda(req, res) {
  try {
    const data = await inventarioAuditoriasService.aplicarDescuentoTanda(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error aplicando descuento a la tanda de excesos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /inventario-auditorias/descuentos
 */
async function listarDescuentosExceso(req, res) {
  try {
    const data = await inventarioAuditoriasService.listarDescuentosExceso();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando descuentos por exceso:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /inventario-auditorias/descuentos — pone o corrige a mano el
 * descuento de un producto.
 */
async function guardarDescuentoExceso(req, res) {
  try {
    const data = await inventarioAuditoriasService.guardarDescuentoExceso(req.body);
    res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error guardando descuento por exceso:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /inventario-auditorias/descuentos/:alegraItemId
 */
async function eliminarDescuentoExceso(req, res) {
  try {
    const data = await inventarioAuditoriasService.eliminarDescuentoExceso(req.params.alegraItemId);
    res.json({ success: true, ...data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error eliminando descuento por exceso:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ==================== PRODUCTOS NUEVOS (catálogo del agente) ====================

function responderError(res, error, contexto) {
  if (error.status) return res.status(error.status).json({ success: false, message: error.message });
  console.error(contexto, error);
  return res.status(500).json({ success: false, error: error.message });
}

/** GET /inventario-auditorias/productos-nuevos */
async function listarProductosNuevos(req, res) {
  try {
    res.json({ success: true, data: await productosNuevos.listar() });
  } catch (error) {
    responderError(res, error, 'Error listando productos nuevos:');
  }
}

async function buscarProductosNuevos(req, res) {
  try {
    res.json({ success: true, data: await productosNuevos.buscar(req.query.q) });
  } catch (error) {
    responderError(res, error, 'Error buscando productos nuevos:');
  }
}

/** POST /inventario-auditorias/productos-nuevos { productoId: producto.id } */
async function agregarProductoNuevo(req, res) {
  try {
    const quien = req.usuario?.nombre || req.usuario?.usuario || null;
    res.json({ success: true, data: await productosNuevos.agregar(req.body?.productoId, quien) });
  } catch (error) {
    responderError(res, error, 'Error agregando producto nuevo:');
  }
}

/** DELETE /inventario-auditorias/productos-nuevos/registros/:registroId */
async function quitarProductoNuevo(req, res) {
  try {
    res.json({ success: true, data: await productosNuevos.quitar(req.params.registroId) });
  } catch (error) {
    responderError(res, error, 'Error quitando producto nuevo:');
  }
}

module.exports = {
  buscarProductosNuevos,
  listarProductosNuevos,
  agregarProductoNuevo,
  quitarProductoNuevo,
  listarAuditorias,
  listarCategorias,
  crearAuditoria,
  getAuditoria,
  guardarConteos,
  guardarConteoIndividual,
  finalizarAuditoria,
  ajustarEnAlegra,
  resincronizarAuditoria,
  crearDevolucion,
  buscarProductosParaDevolucion,
  agregarItemDevolucion,
  eliminarItemDevolucion,
  generarExcesos,
  actualizarItemExceso,
  listarRegalos,
  crearExcesoManual,
  eliminarAuditoria,
  agregarItemExceso,
  aplicarDescuentoTanda,
  listarDescuentosExceso,
  guardarDescuentoExceso,
  eliminarDescuentoExceso
};

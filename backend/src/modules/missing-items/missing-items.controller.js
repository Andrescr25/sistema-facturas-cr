/**
 * Missing-Items Module - Controller
 * Controladores HTTP para operaciones de faltantes
 */

const missingItemsService = require('./missing-items.service');

/**
 * POST /faltantes/ajustes
 * Guarda un ajuste de faltante
 */
async function saveAdjustment(req, res) {
  try {
    const { faltante_id, cantidad_entregada, estado, requiere_actualizacion, revisado } = req.body;

    const result = await missingItemsService.saveAdjustment({
      faltanteId: faltante_id,
      cantidadEntregada: cantidad_entregada,
      estado,
      requiereActualizacion: requiere_actualizacion,
      revisado
    });

    res.json(result);
  } catch (error) {
    console.error('❌ Error guardando ajuste:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /faltantes/ajustes/:faltanteId
 * Elimina un ajuste de faltante
 */
async function deleteAdjustment(req, res) {
  try {
    const { faltanteId } = req.params;
    const result = await missingItemsService.deleteAdjustment(faltanteId);
    res.json(result);
  } catch (error) {
    console.error('❌ Error eliminando ajuste:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /faltantes/diagnostico/:alegraReference
 * Obtiene diagnóstico de un producto
 */
async function getDiagnostic(req, res) {
  try {
    const { alegraReference } = req.params;
    const result = await missingItemsService.getDiagnostic(alegraReference);
    res.json(result);
  } catch (error) {
    console.error('❌ Error obteniendo diagnóstico:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /faltantes/reasignar-proveedor
 * POST /faltantes/asignar-proveedor-manual
 */
async function assignSupplierManual(req, res) {
  try {
    const { alegraReference, alegraItemId, alegraName, proveedorId, nuevoProveedorId } = req.body;
    const result = await missingItemsService.assignSupplierManual({
      alegraReference,
      alegraItemId,
      alegraName,
      proveedorId,
      nuevoProveedorId
    });
    res.json(result);
  } catch (error) {
    console.error('❌ Error asignando proveedor:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  saveAdjustment,
  deleteAdjustment,
  getDiagnostic,
  assignSupplierManual
};

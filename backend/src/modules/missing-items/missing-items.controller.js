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
    const { faltante_id, cantidad_entregada, estado, requiere_actualizacion } = req.body;

    const result = await missingItemsService.saveAdjustment({
      faltanteId: faltante_id,
      cantidadEntregada: cantidad_entregada,
      estado,
      requiereActualizacion: requiere_actualizacion
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
 * DELETE /faltantes/proveedor/limpiar
 * Limpia todos los faltantes de la base de datos
 */
async function cleanProviderMissingItems(req, res) {
  try {
    console.log('🗑️ Limpiando faltantes de la BD...');
    const result = await missingItemsService.cleanProviderMissingItems();
    res.json(result);
  } catch (error) {
    console.error('❌ Error limpiando faltantes:', error);
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
 * POST /faltantes/limpiar-duplicados/:alegraReference
 * Limpia productos duplicados
 */
async function cleanDuplicates(req, res) {
  try {
    const { alegraReference } = req.params;
    const result = await missingItemsService.cleanDuplicates(alegraReference);
    res.json(result);
  } catch (error) {
    console.error('❌ Error limpiando duplicados:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  saveAdjustment,
  deleteAdjustment,
  cleanProviderMissingItems,
  getDiagnostic,
  cleanDuplicates
};

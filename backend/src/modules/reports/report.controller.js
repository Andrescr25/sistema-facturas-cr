/**
 * Controlador de Reportes
 */

const ReportService = require('./report.service');
const ResponseHelper = require('../../utils/response.helper');

class ReportController {
  constructor() {
    this.reportService = new ReportService();
  }

  getMissingItemsBySupplier = async (req, res) => {
    try {
      const { fecha_inicio } = req.query;
      const result = await this.reportService.getMissingItemsBySupplier(fecha_inicio);

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Reporte generado', 200, {
          total_proveedores: result.total_proveedores,
          resumen: result.resumen
        });
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getMissingItemsByClient = async (req, res) => {
    try {
      const result = await this.reportService.getMissingItemsByClient();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Reporte generado', 200, {
          total_clientes: result.total_clientes,
          resumen: result.resumen
        });
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  clearProcessedSupplierMissingItems = async (req, res) => {
    try {
      const result = await this.reportService.clearProcessedSupplierMissingItems();

      if (result.success) {
        return ResponseHelper.success(res, { eliminados: result.eliminados }, result.message);
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getEncargosEspeciales = async (req, res) => {
    try {
      const result = await this.reportService.getEncargosEspeciales();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Encargos especiales obtenidos');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getProcessingHistory = async (req, res) => {
    try {
      const result = await this.reportService.getProcessingHistory();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Historial obtenido');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Reporte consolidado de faltantes
   */
  getMissingItemsConsolidated = async (req, res) => {
    try {
      const { semana, mes, ano } = req.query;
      const result = await this.reportService.getMissingItemsConsolidated(req.query);

      if (result.success) {
        return res.json({
          success: true,
          data: result.data,
          filters: { semana, mes, ano },
          periodo: { semana, mes, ano }
        });
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Reporte de compras sugeridas por proveedor
   */
  getSuggestedPurchases = async (req, res) => {
    try {
      const { semana, mes, ano, multiplicador = 1.2 } = req.query;
      const result = await this.reportService.getSuggestedPurchases(req.query);

      if (result.success) {
        return res.json({
          success: true,
          data: result.data,
          total_proveedores: result.data.length,
          filters: { semana, mes, ano, multiplicador },
          resumen: {
            total_compra_general: result.data.reduce((sum, p) => sum + parseFloat(p.total_compra_sugerida || 0), 0),
            total_productos: result.data.reduce((sum, p) => sum + (p.productos_sugeridos?.length || 0), 0)
          }
        });
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };
}

module.exports = ReportController;

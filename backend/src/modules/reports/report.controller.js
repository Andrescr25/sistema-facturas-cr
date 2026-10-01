/**
 * Controlador de Reportes
 */

const ReportService = require('./report.service');
const notasDeFaltantes = require('./notasDeFaltantes');
const ResponseHelper = require('../../utils/response.helper');

class ReportController {
  constructor() {
    this.reportService = new ReportService();
  }

  /**
   * GET /reports/faltantes/notas — las notas que se le escribieron a cada
   * producto al facturarlo, para leerlas mientras se le compra al proveedor.
   *
   * Va aparte del reporte a propósito: si las notas fallan, el reporte se ve
   * igual. (Antes se leían de Alegra; desde la migración independencia/032
   * salen de la línea de la factura propia.)
   */
  getNotasDeFaltantes = async (req, res) => {
    try {
      const { fecha_inicio } = req.query;
      const r = await notasDeFaltantes.notasPorProducto(fecha_inicio || null);
      return res.json({ success: true, data: r });
    } catch (error) {
      console.error('❌ Error trayendo las notas de los faltantes:', error.message);
      // No se cae el reporte por esto: se responde vacío diciendo qué pasó.
      return res.json({
        success: false,
        data: { porProducto: {}, facturas: 0, desde: null },
        message: 'No se pudieron traer las notas en este momento.'
      });
    }
  };

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
}

module.exports = ReportController;

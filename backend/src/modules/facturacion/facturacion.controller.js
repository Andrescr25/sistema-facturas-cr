/**
 * Facturacion Module - Controller
 * Controladores HTTP para operaciones de facturación rápida
 */

const FacturacionService = require('./facturacion.service');
const ResponseHelper = require('../../utils/response.helper');

class FacturacionController {
  constructor() {
    this.facturacionService = new FacturacionService();
  }

  getItems = async (req, res) => {
    try {
      const result = await this.facturacionService.getItems();
      return ResponseHelper.success(res, result.data, 'Productos obtenidos para caché', 200, {
        total: result.total,
        timestamp: result.timestamp
      });
    } catch (error) {
      console.error('❌ Error obteniendo items de Alegra:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getContacts = async (req, res) => {
    try {
      const result = await this.facturacionService.getContacts();
      return ResponseHelper.success(res, result.data, 'Contactos obtenidos para caché', 200, {
        total: result.total,
        timestamp: result.timestamp
      });
    } catch (error) {
      console.error('❌ Error obteniendo contacts de Alegra:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  createInvoice = async (req, res) => {
    try {
      const invoiceData = req.body;
      const result = await this.facturacionService.createInvoice(invoiceData);
      return ResponseHelper.success(res, result.data, result.message);
    } catch (error) {
      console.error('❌ Error creando factura en Alegra:', error);
      return ResponseHelper.error(res, error.message, 500, error.response?.data);
    }
  };

  getInvoicePDF = async (req, res) => {
    try {
      const { id } = req.params;
      const pdfResponse = await this.facturacionService.getInvoicePDF(id);

      if (pdfResponse.pdf) {
        return ResponseHelper.success(res, { pdfUrl: pdfResponse.pdf, invoiceId: id });
      } else {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=factura-${id}.pdf`);
        return res.send(pdfResponse);
      }
    } catch (error) {
      console.error('❌ Error obteniendo PDF de factura:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getTaxes = async (req, res) => {
    try {
      const result = await this.facturacionService.getTaxes();
      return ResponseHelper.success(res, result.data, 'Impuestos obtenidos');
    } catch (error) {
      console.error('❌ Error obteniendo impuestos:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getPaymentMethods = async (req, res) => {
    try {
      const result = this.facturacionService.getPaymentMethods();
      return ResponseHelper.success(res, result.data, 'Métodos de pago obtenidos');
    } catch (error) {
      console.error('❌ Error obteniendo métodos de pago:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };
}

module.exports = FacturacionController;

/**
 * Controlador de Facturas
 * Maneja las peticiones HTTP relacionadas con facturas
 */

const InvoiceService = require('./invoice.service');
const ResponseHelper = require('../../utils/response.helper');

class InvoiceController {
  constructor() {
    this.invoiceService = new InvoiceService();
  }

  /**
   * Buscar facturas por número
   */
  searchByNumber = async (req, res) => {
    try {
      const { numero } = req.params;

      if (!numero) {
        return ResponseHelper.validationError(res, { numero: ['Número es requerido'] });
      }

      const result = await this.invoiceService.searchByNumber(numero);

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Facturas encontradas');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      console.error('❌ Error en searchByNumber:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Buscar facturas por cliente
   */
  searchByClient = async (req, res) => {
    try {
      const { cliente } = req.params;

      if (!cliente) {
        return ResponseHelper.validationError(res, { cliente: ['Cliente es requerido'] });
      }

      const result = await this.invoiceService.searchByClient(decodeURIComponent(cliente));

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Facturas encontradas');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      console.error('❌ Error en searchByClient:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener siguiente consecutivo
   */
  getNextConsecutive = async (req, res) => {
    try {
      const result = await this.invoiceService.getNextConsecutive();

      if (result.success) {
        return ResponseHelper.success(res, result, 'Consecutivo obtenido');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      console.error('❌ Error en getNextConsecutive:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener PDF de factura
   */
  getInvoicePDF = async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHelper.validationError(res, { id: ['ID es requerido'] });
      }

      const result = await this.invoiceService.getInvoicePDF(id);

      if (result.success) {
        return res.json({
          success: true,
          url: result.url,
          invoiceNumber: result.invoiceNumber
        });
      }

      return ResponseHelper.error(res, result.error, 404);
    } catch (error) {
      console.error('❌ Error en getInvoicePDF:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener facturas por período
   */
  getInvoicesByPeriod = async (req, res) => {
    try {
      const { ano, mes, semana } = req.params;

      if (!ano || !mes) {
        return ResponseHelper.validationError(res, {
          periodo: ['Año y mes son requeridos']
        });
      }

      const result = await this.invoiceService.getInvoicesByPeriod(
        parseInt(ano),
        parseInt(mes),
        semana ? parseInt(semana) : null
      );

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Facturas obtenidas');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      console.error('❌ Error en getInvoicesByPeriod:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener facturas pendientes de reimpresión
   */
  getPendingReprintInvoices = async (req, res) => {
    try {
      const result = await this.invoiceService.getPendingReprintInvoices();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Facturas pendientes obtenidas');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      console.error('❌ Error en getPendingReprintInvoices:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener facturas procesadas (últimos 7 días)
   */
  getProcessedReprintInvoices = async (req, res) => {
    try {
      const result = await this.invoiceService.getProcessedReprintInvoices();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Facturas procesadas obtenidas');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      console.error('❌ Error en getProcessedReprintInvoices:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener detalle de factura
   */
  getInvoiceDetail = async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHelper.validationError(res, { id: ['ID es requerido'] });
      }

      const result = await this.invoiceService.getInvoiceDetail(id);

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Detalle de factura obtenido');
      }

      return ResponseHelper.error(res, result.error, 404);
    } catch (error) {
      console.error('❌ Error en getInvoiceDetail:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Procesar factura individual
   */
  processIndividualInvoice = async (req, res) => {
    try {
      const { 
        alegra_id, 
        numero_factura, 
        cliente_nombre, 
        fecha_emision, 
        ajustes, 
        estado,
        items_editados,
        marcar_como_procesada,
        actualizar_precios
      } = req.body;

      if (!alegra_id || !numero_factura) {
        return ResponseHelper.validationError(res, {
          alegra_id: alegra_id ? null : ['alegra_id es requerido'],
          numero_factura: numero_factura ? null : ['numero_factura es requerido']
        });
      }

      const result = await this.invoiceService.processIndividualInvoice({
        alegra_id,
        numero_factura,
        cliente_nombre,
        fecha_emision,
        ajustes: ajustes || [],
        estado: estado || 'procesado',
        items_editados,
        marcar_como_procesada,
        actualizar_precios
      });

      if (result.success) {
        return ResponseHelper.success(res, result.data, result.message, 201);
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      console.error('❌ Error en processIndividualInvoice:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Recuperar factura procesada
   */
  recoverProcessedInvoice = async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHelper.validationError(res, { id: ['ID es requerido'] });
      }

      const result = await this.invoiceService.recoverProcessedInvoice(id);

      if (result.success) {
        return ResponseHelper.success(res, result.data, result.message);
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      console.error('❌ Error en recoverProcessedInvoice:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Registrar faltantes de una factura
   */
  registerMissingItems = async (req, res) => {
    try {
      const { id } = req.params;
      const { faltantes, registrado_por, observaciones_adicionales } = req.body;

      if (!id) {
        return ResponseHelper.validationError(res, { id: ['ID es requerido'] });
      }

      if (!faltantes || !Array.isArray(faltantes) || faltantes.length === 0) {
        return ResponseHelper.validationError(res, {
          faltantes: ['Faltantes debe ser un array no vacío']
        });
      }

      const result = await this.invoiceService.registerMissingItems(
        id,
        faltantes,
        registrado_por || 'Usuario',
        observaciones_adicionales || ''
      );

      if (result.success) {
        return ResponseHelper.success(res, result.data, result.message, 201);
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      console.error('❌ Error en registerMissingItems:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener todas las facturas locales con filtros
   */
  getInvoices = async (req, res) => {
    try {
      const result = await this.invoiceService.getInvoices(req.query);
      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Facturas obtenidas');
      }
      return ResponseHelper.error(res, result.error, 500);
    } catch (error) {
      console.error('❌ Error en getInvoices:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Obtener una factura específica con items y faltantes asociados
   */
  getInvoiceWithRelations = async (req, res) => {
    try {
      const { id } = req.params;
      const result = await this.invoiceService.getInvoiceWithRelations(id);
      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Factura obtenida');
      }
      return ResponseHelper.error(res, result.message || result.error, result.statusCode || 500);
    } catch (error) {
      console.error('❌ Error en getInvoiceWithRelations:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Crear nueva factura local
   */
  createInvoiceLocal = async (req, res) => {
    try {
      const result = await this.invoiceService.createInvoiceLocal(req.body);
      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Factura creada exitosamente', 201);
      }
      if (result.code === '23505') {
        return ResponseHelper.error(res, 'Ya existe una factura con ese número', 409);
      }
      return ResponseHelper.error(res, result.error, 500);
    } catch (error) {
      console.error('❌ Error en createInvoiceLocal:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Actualizar estado de factura local
   */
  updateInvoiceLocal = async (req, res) => {
    try {
      const { id } = req.params;
      const result = await this.invoiceService.updateInvoiceLocal(id, req.body);
      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Factura actualizada exitosamente');
      }
      return ResponseHelper.error(res, result.message || result.error, result.statusCode || 500);
    } catch (error) {
      console.error('❌ Error en updateInvoiceLocal:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Marcar factura local como procesada
   */
  markAsProcessedLocal = async (req, res) => {
    try {
      const { id } = req.params;
      const result = await this.invoiceService.markAsProcessedLocal(id);
      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Factura marcada como procesada');
      }
      return ResponseHelper.error(res, result.message || result.error, result.statusCode || 500);
    } catch (error) {
      console.error('❌ Error en markAsProcessedLocal:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * Buscar facturas locales
   */
  searchInvoicesLocal = async (req, res) => {
    try {
      const { termino } = req.params;
      const result = await this.invoiceService.searchInvoicesLocal(termino);
      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Facturas encontradas');
      }
      return ResponseHelper.error(res, result.error, 500);
    } catch (error) {
      console.error('❌ Error en searchInvoicesLocal:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };
}

module.exports = InvoiceController;

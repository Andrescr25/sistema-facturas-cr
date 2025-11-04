/**
 * Servicio de Facturas de Alegra
 * Maneja todas las operaciones relacionadas con facturas en Alegra API
 */

const { getInstance: getAlegraClient } = require('../alegra.client');

class AlegraInvoiceService {
  constructor() {
    this.client = getAlegraClient();
  }

  /**
   * Obtener facturas por período
   */
  async getInvoicesByPeriod(year, month, week = null) {
    const params = {
      start: 0,
      limit: 100,
      order_field: 'date',
      order_direction: 'DESC'
    };

    // Filtrar por período si es necesario
    // Nota: Alegra no tiene filtro directo por mes, hay que filtrar localmente

    return await this.client.get('/invoices', params);
  }

  /**
   * Obtener factura por ID
   */
  async getInvoiceById(invoiceId) {
    return await this.client.get(`/invoices/${invoiceId}`);
  }

  /**
   * Buscar facturas por número
   */
  async searchInvoicesByNumber(invoiceNumber) {
    return await this.client.get('/invoices', {
      numberTemplate: invoiceNumber
    });
  }

  /**
   * Buscar facturas por cliente
   */
  async searchInvoicesByClient(clientName) {
    return await this.client.get('/invoices', {
      client: clientName
    });
  }

  /**
   * Crear factura
   */
  async createInvoice(invoiceData) {
    return await this.client.post('/invoices', invoiceData);
  }

  /**
   * Actualizar factura
   */
  async updateInvoice(invoiceId, updateData) {
    return await this.client.put(`/invoices/${invoiceId}`, updateData);
  }

  /**
   * Eliminar factura
   */
  async deleteInvoice(invoiceId) {
    return await this.client.delete(`/invoices/${invoiceId}`);
  }

  /**
   * Obtener siguiente número consecutivo
   */
  async getNextConsecutive() {
    try {
      // Obtener configuración de numeración
      const result = await this.client.get('/numbering-templates');

      if (result.success && result.data && result.data.length > 0) {
        const template = result.data.find(t => t.documentType === 'invoice');
        return {
          success: true,
          nextNumber: template ? template.nextConsecutive : null
        };
      }

      return { success: false, error: 'No se encontró plantilla de numeración' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener PDF de factura
   */
  async getInvoicePDF(invoiceId) {
    try {
      const result = await this.getInvoiceById(invoiceId);

      if (result.success && result.data) {
        return {
          success: true,
          url: result.data.pdf?.url || null,
          invoiceNumber: result.data.numberTemplate?.fullNumber
        };
      }

      return { success: false, error: 'Factura no encontrada' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener precio actualizado de un producto
   */
  async getUpdatedPrice(productReference) {
    try {
      const result = await this.client.get('/items', {
        reference: productReference
      });

      if (result.success && result.data && result.data.length > 0) {
        return result.data[0].price;
      }

      return null;
    } catch (error) {
      console.error('Error obteniendo precio:', error);
      return null;
    }
  }

  /**
   * Eliminar item de factura
   */
  async deleteInvoiceItem(invoiceId, itemId) {
    return await this.client.delete(`/invoices/${invoiceId}/items/${itemId}`);
  }

  /**
   * Actualizar item de factura
   */
  async updateInvoiceItem(invoiceId, itemId, itemData) {
    return await this.client.put(`/invoices/${invoiceId}/items/${itemId}`, itemData);
  }
}

module.exports = AlegraInvoiceService;

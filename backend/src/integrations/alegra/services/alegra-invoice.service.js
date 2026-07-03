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
    try {
      // Primero buscar el cliente por nombre en Alegra
      const clientResult = await this.client.get('/contacts', {
        name: clientName,
        type: 'client'
      });

      if (!clientResult.success || !clientResult.data || clientResult.data.length === 0) {
        // Si no se encuentra el cliente, buscar facturas directamente por nombre
        console.log(`⚠️ Cliente "${clientName}" no encontrado, buscando facturas por texto...`);
        return await this.client.get('/invoices', {
          client: clientName
        });
      }

      // Si se encuentra el cliente, buscar facturas por ID de cliente
      const clientIds = clientResult.data.map(c => c.id);
      console.log(`✅ Encontrados ${clientIds.length} clientes con nombre "${clientName}"`);

      // Buscar facturas para cada cliente encontrado
      const allInvoices = [];
      for (const clientId of clientIds) {
        const invoiceResult = await this.client.get('/invoices', {
          client: clientId
        });

        if (invoiceResult.success && invoiceResult.data) {
          allInvoices.push(...invoiceResult.data);
        }
      }

      return {
        success: true,
        data: allInvoices
      };
    } catch (error) {
      console.error('❌ Error en searchInvoicesByClient:', error);
      return {
        success: false,
        error: error.message
      };
    }
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

  async getInvoicePDF(invoiceId) {
    try {
      // 1. Obtener la información de la factura para tener el número
      const invoiceResult = await this.getInvoiceById(invoiceId);
      const invoiceNumber = invoiceResult.success && invoiceResult.data
        ? invoiceResult.data.numberTemplate?.fullNumber
        : null;

      // 2. Hacer la llamada específica para obtener la URL del PDF de Alegra
      const pdfResult = await this.client.get(`/invoices/${invoiceId}/pdf`);

      if (pdfResult.success && pdfResult.data && (pdfResult.data.pdf || pdfResult.data.url)) {
        return {
          success: true,
          url: pdfResult.data.pdf || pdfResult.data.url || null,
          invoiceNumber: invoiceNumber
        };
      }

      // Fallback: si falla el endpoint específico pero la factura tiene pdf en su data
      if (invoiceResult.success && invoiceResult.data && invoiceResult.data.pdf?.url) {
        return {
          success: true,
          url: invoiceResult.data.pdf.url,
          invoiceNumber: invoiceNumber
        };
      }

      return { success: false, error: 'No se pudo obtener el PDF de la factura en Alegra' };
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

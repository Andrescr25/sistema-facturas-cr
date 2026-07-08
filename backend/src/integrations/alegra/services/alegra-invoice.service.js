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
      console.log(`📄 Obteniendo PDF de Alegra para factura ${invoiceId}...`);
      
      // Llamar al detalle de la factura pidiendo específicamente el campo pdf
      const result = await this.client.get(`/invoices/${invoiceId}`, { fields: 'pdf' });

      if (result.success && result.data && result.data.pdf) {
        const pdfUrl = typeof result.data.pdf === 'object' ? result.data.pdf.url : result.data.pdf;
        return {
          success: true,
          url: pdfUrl,
          invoiceNumber: result.data.numberTemplate?.fullNumber || null
        };
      }

      return { success: false, error: 'No se pudo obtener la URL del PDF de la factura en Alegra' };
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
        // Encontrar coincidencia exacta por referencia para evitar falsos positivos por LIKE
        const targetRef = productReference.toString().trim().toLowerCase();
        const item = result.data.find(it => 
          (it.reference || '').toString().trim().toLowerCase() === targetRef
        );
        
        if (!item) {
          console.log(`⚠️ Coincidencia exacta de referencia no encontrada en Alegra para: ${productReference}`);
          return null;
        }
        
        const priceField = item.price;
        
        let priceValue = 0;
        if (Array.isArray(priceField)) {
          const main = priceField.find(p => p.main) || priceField[0];
          priceValue = Number(main?.price ?? 0);
        } else if (priceField && typeof priceField === 'object') {
          priceValue = Number(priceField.price ?? priceField.value ?? 0);
        } else {
          priceValue = Number(priceField ?? 0);
        }
        
        return priceValue;
      }

      return null;
    } catch (error) {
      console.error('Error obteniendo precio:', error);
      return null;
    }
  }

  /**
   * Obtener precio actualizado de un producto por su ID de Alegra
   */
  async getUpdatedPriceById(itemId) {
    try {
      const result = await this.client.get(`/items/${itemId}`);
      if (result.success && result.data) {
        const item = result.data;
        const priceField = item.price;
        
        let priceValue = 0;
        if (Array.isArray(priceField)) {
          const main = priceField.find(p => p.main) || priceField[0];
          priceValue = Number(main?.price ?? 0);
        } else if (priceField && typeof priceField === 'object') {
          priceValue = Number(priceField.price ?? priceField.value ?? 0);
        } else {
          priceValue = Number(priceField ?? 0);
        }
        
        return priceValue;
      }
      return null;
    } catch (error) {
      console.error(`Error obteniendo precio por ID ${itemId}:`, error);
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

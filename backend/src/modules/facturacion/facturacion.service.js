/**
 * Facturacion Module - Service
 * Lógica de negocio para operaciones de facturación rápida en Alegra
 */

const AlegraService = require('../../../services/alegraService');
const { query } = require('../../../config/database');

class FacturacionService {
  constructor() {
    this.alegraService = new AlegraService();
  }

  /**
   * Obtiene todos los productos de Alegra para cache offline
   */
  async getItems() {
    console.log('📦 Obteniendo todos los productos de Alegra para cache...');
    const allItems = [];
    let page = 1;
    const limit = 30;
    let hasMore = true;

    while (hasMore) {
      const response = await this.alegraService.makeRequest('GET', '/items', {
        start: (page - 1) * limit,
        limit: limit
      });

      if (response && response.length > 0) {
        allItems.push(...response);
        page++;
        if (response.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return {
      success: true,
      data: allItems,
      total: allItems.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Obtiene todos los contactos de Alegra para cache offline
   */
  async getContacts() {
    console.log('👥 Obteniendo todos los contactos de Alegra...');
    const allContacts = [];
    let page = 1;
    const limit = 30;
    let hasMore = true;

    while (hasMore) {
      const response = await this.alegraService.makeRequest('GET', '/contacts', {
        start: (page - 1) * limit,
        limit: limit
      });

      if (response && response.length > 0) {
        allContacts.push(...response);
        page++;
        if (response.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return {
      success: true,
      data: allContacts,
      total: allContacts.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Crea una factura en Alegra y la registra en la base de datos local
   */
  async createInvoice(invoiceData) {
    console.log('🧾 Creando factura en Alegra:', {
      cliente: invoiceData.client,
      items: invoiceData.items?.length
    });

    const response = await this.alegraService.makeRequest('POST', '/invoices', invoiceData);
    console.log('✅ Factura creada exitosamente:', response.id);

    // Registrar en BD local
    try {
      const numeroFactura = response.numberTemplate?.fullNumber || 
                            response.numberTemplate?.formattedNumber || 
                            response.id?.toString();
      const alegraId = parseInt(response.id, 10);
      const clienteNombre = response.client?.name || 'Cliente no especificado';
      const clienteEmail = response.client?.email || null;
      const fechaEmision = response.date || new Date().toISOString().split('T')[0];
      const total = parseFloat(response.total || 0);

      const fecha = new Date(fechaEmision);
      const startOfYear = new Date(fecha.getFullYear(), 0, 1);
      const dayOfYear = Math.floor((fecha - startOfYear) / (24 * 60 * 60 * 1000));
      const semana = Math.max(1, Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7));
      const mes = fecha.getMonth() + 1;
      const ano = fecha.getFullYear();

      await query(`
        INSERT INTO facturas (
          numero_factura, alegra_id, cliente_nombre, cliente_email,
          fecha_emision, semana, mes, ano, total, estado_bodega
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendiente')
        ON CONFLICT (numero_factura) DO UPDATE SET
          alegra_id = EXCLUDED.alegra_id,
          cliente_nombre = EXCLUDED.cliente_nombre,
          cliente_email = EXCLUDED.cliente_email,
          fecha_emision = EXCLUDED.fecha_emision,
          semana = EXCLUDED.semana,
          mes = EXCLUDED.mes,
          ano = EXCLUDED.ano,
          total = EXCLUDED.total
      `, [numeroFactura, alegraId, clienteNombre, clienteEmail, fechaEmision, semana, mes, ano, total]);

      console.log(`📦 Factura ${numeroFactura} registrada en BD local con estado_bodega='pendiente'`);
    } catch (dbError) {
      console.error('⚠️ Error registrando factura en BD local (no crítico):', dbError.message);
    }

    return {
      success: true,
      data: response,
      message: 'Factura creada exitosamente'
    };
  }

  /**
   * Obtiene el PDF de una factura por ID
   */
  async getInvoicePDF(id) {
    console.log(`📄 Obteniendo PDF de factura ${id}...`);
    return await this.alegraService.makeRequest('GET', `/invoices/${id}/pdf`);
  }

  /**
   * Obtiene todos los impuestos de Alegra
   */
  async getTaxes() {
    console.log('💰 Obteniendo impuestos de Alegra...');
    const response = await this.alegraService.makeRequest('GET', '/taxes');
    return {
      success: true,
      data: response
    };
  }

  /**
   * Retorna los métodos de pago fijos para Costa Rica
   */
  getPaymentMethods() {
    return {
      success: true,
      data: [
        { id: 'cash', name: 'Efectivo', type: 'cash' },
        { id: 'credit-card', name: 'Tarjeta de Crédito', type: 'credit-card' },
        { id: 'debit-card', name: 'Tarjeta de Débito', type: 'debit-card' },
        { id: 'transfer', name: 'Transferencia Bancaria', type: 'transfer' },
        { id: 'check', name: 'Cheque', type: 'check' }
      ]
    };
  }
}

module.exports = FacturacionService;

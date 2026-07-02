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
   * Obtiene todos los registros paginados de un endpoint en lotes paralelos (concurrencia controlada)
   */
  async fetchAllParallel(endpoint, additionalParams = {}, concurrency = 5, limit = 30) {
    const allResults = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      // Crear un lote de páginas a solicitar en paralelo
      const pageBatch = [];
      for (let i = 0; i < concurrency; i++) {
        pageBatch.push(page + i);
      }

      console.log(`🔄 Sincronizando lote de ${concurrency} páginas para ${endpoint} (páginas ${pageBatch[0]} a ${pageBatch[pageBatch.length - 1]})...`);

      // Ejecutar el lote en paralelo
      const promises = pageBatch.map(p => {
        const start = (p - 1) * limit;
        return this.alegraService.makeRequest('GET', endpoint, {
          ...additionalParams,
          start,
          limit
        })
          .then(data => ({ success: true, data, page: p }))
          .catch(error => ({ success: false, error: error.message, page: p }));
      });

      const batchResults = await Promise.all(promises);

      // Ordenar por página para asegurar la secuencia original
      batchResults.sort((a, b) => a.page - b.page);

      let foundEnd = false;
      for (const result of batchResults) {
        if (!result.success) {
          console.error(`❌ Error en página ${result.page} de ${endpoint}:`, result.error);
          throw new Error(result.error);
        }

        const data = result.data || [];
        allResults.push(...data);

        // Si una página devuelve menos elementos que el límite, hemos llegado al final
        if (data.length < limit) {
          foundEnd = true;
          hasMore = false;
          break;
        }
      }

      if (foundEnd) {
        break;
      }

      // Avanzar al siguiente lote
      page += concurrency;

      // Pequeño delay de 500ms entre lotes para respirar
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return allResults;
  }

  /**
   * Obtiene todos los productos de Alegra para cache offline
   */
  async getItems() {
    console.log('📦 Obteniendo todos los productos de Alegra para cache (paralelo)...');
    const allItems = await this.fetchAllParallel('/items', { type: 'product' }, 5, 30);

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
    console.log('👥 Obteniendo todos los contactos de Alegra (paralelo)...');
    const allContacts = await this.fetchAllParallel('/contacts', {}, 5, 30);

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

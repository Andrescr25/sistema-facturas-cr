/**
 * Facturacion Module - Service
 * Lógica de negocio para operaciones de facturación rápida en Alegra
 */

const { getClient } = require('../../integrations/alegra');
const { query } = require('../../../config/database');
const idempotencia = require('./idempotencia');

class FacturacionService {
  constructor() {
    this.client = getClient();
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
        return this.client.request('GET', endpoint, {
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
   * Crea una factura en Alegra y la registra en la base de datos local.
   *
   * `claveIdempotencia` la pone quien arma la factura, UNA vez por documento,
   * y la repite en cada reenvío. Con ella, mandar dos veces la misma factura
   * devuelve la que ya existe en vez de crear una segunda — que es lo que
   * pasaba cuando la respuesta de Alegra se perdía y alguien reintentaba.
   *
   * Sin clave se comporta como siempre (no rompe a quien todavía no la manda),
   * pero queda avisado en el log: esa llamada NO tiene protección.
   */
  async createInvoice(invoiceData, claveIdempotencia = null) {
    console.log('🧾 Creando factura en Alegra:', {
      cliente: invoiceData.client,
      items: invoiceData.items?.length,
      clave: claveIdempotencia || '(sin clave)'
    });

    if (!claveIdempotencia) {
      console.warn('⚠️ Factura sin clave de idempotencia: si esta petición se reenvía, se duplicará.');
      return this._crearEnAlegraYRegistrar(invoiceData);
    }

    const reserva = await idempotencia.reservar(claveIdempotencia, invoiceData);

    if (!reserva.seguir) {
      console.log(`♻️ La factura ${claveIdempotencia} ya se había creado (${reserva.yaCreada.numero}). No se llama a Alegra.`);
      // OJO con el tipo: acá el id viene de una columna varchar, así que es
      // TEXTO, mientras que en el primer envío es el número que manda Alegra.
      // Es la misma factura; quien lo consuma debe comparar con String().
      return {
        success: true,
        data: { id: reserva.yaCreada.id, numberTemplate: { fullNumber: reserva.yaCreada.numero } },
        message: 'Esa factura ya estaba creada.',
        yaExistia: true
      };
    }

    try {
      const resultado = await this._crearEnAlegraYRegistrar(invoiceData);
      await idempotencia.marcarCreada(claveIdempotencia, resultado.data);
      return resultado;
    } catch (error) {
      // Que Alegra haya RESPONDIDO es lo que decide si se puede reintentar.
      // Con respuesta, consta que rechazó y no creó nada. Sin respuesta, pudo
      // haberla creado y reenviar la duplicaría.
      const huboRespuesta = Boolean(error.response);
      const estado = await idempotencia.marcarFallo(claveIdempotencia, {
        huboRespuesta,
        detalle: error.response?.data?.message || error.message
      });
      if (estado === 'incierta') {
        console.error(`⛔ Factura ${claveIdempotencia} quedó INCIERTA: Alegra no respondió. ` +
          `Hay que verificar en Alegra antes de reenviarla.`);
      }
      throw error;
    }
  }

  /** El llamado a Alegra y el registro local, sin la capa de idempotencia. */
  async _crearEnAlegraYRegistrar(invoiceData) {
    const response = await this.client.request('POST', '/invoices', invoiceData);
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
          total = EXCLUDED.total,
          estado_bodega = 'pendiente'
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
    return await this.client.request('GET', `/invoices/${id}/pdf`);
  }

  /**
   * Obtiene todos los impuestos de Alegra
   */
  async getTaxes() {
    console.log('💰 Obteniendo impuestos de Alegra...');
    const response = await this.client.request('GET', '/taxes');
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

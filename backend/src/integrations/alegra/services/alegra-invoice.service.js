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
   * Crear factura de compra (endpoint /bills).
   * Documentación: https://developer.alegra.com/reference/post_bills
   * Migrado del servicio legacy: devuelve la factura RAW y LANZA en error.
   */
  async createPurchaseInvoice(data) {
    try {
      console.log(`📄 Creando factura de compra en Alegra...`);

      // Transformar datos al formato correcto de /bills
      const billData = {
        date: data.date,
        dueDate: data.date, // Misma fecha si es contado
        provider: data.client, // ← CLAVE: usar 'provider' no 'contact'
        numberTemplate: data.numberTemplate || { id: 10 }, // ID 10 = Factura de compra electrónica
        observations: data.observations || '',
        purchases: {
          items: data.items
        },
        saleCondition: 'CASH', // Contado por defecto
        paymentMethod: 'CASH' // Efectivo por defecto
      };

      console.log(`📋 Datos de factura:`, JSON.stringify(billData, null, 2));

      const response = await this.client.api.post('/bills', billData);
      console.log(`✅ Factura de compra creada: ID ${response.data.id}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error creando factura de compra:');
      console.error('   Status:', error.response?.status);
      console.error('   Message:', error.response?.data?.message || error.message);
      console.error('   Data:', JSON.stringify(error.response?.data, null, 2));

      if (error.response?.status === 403) {
        console.warn('⚠️ Error 403: Sin permisos para crear facturas de compra');
        console.warn('💡 Posibles causas:');
        console.warn('   1. Tu plan no incluye facturas de proveedor');
        console.warn('   2. El usuario no tiene permisos suficientes');
        console.warn('   3. Verifica en Alegra: Configuración > Usuarios y permisos');
      } else if (error.response?.status === 400) {
        console.warn('⚠️ Error 400: Datos inválidos');
        console.warn('   Datos enviados:', JSON.stringify(error.config?.data, null, 2));
      }

      throw error;
    }
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

  // ── Helpers de transformación (migrados literal del servicio legacy) ──
  // Son funciones puras (no usan this.client); se mantienen como métodos
  // de instancia para no romper la forma en que ya se llaman.

  /**
   * Transformar factura de Alegra al formato esperado por el frontend
   * Copiado del sistema original proyecto-faltantes
   */
  transformInvoiceForFrontend(invoice) {
    try {
      const fecha = new Date(invoice.date);

      return {
      // ID y números
      alegra_id: parseInt(invoice.id),
      numero_factura: invoice.numberTemplate?.formattedNumber || invoice.numberTemplate?.number || 'N/A',
      numero_completo: invoice.numberTemplate?.fullNumber || 'N/A',

      // Cliente
      cliente_id: parseInt(invoice.client?.id || 0),
      cliente_nombre: invoice.client?.name || 'Cliente no especificado',
      cliente_email: invoice.client?.email || null,
      cliente_identificacion: invoice.client?.identification || null,
      cliente_telefono: invoice.client?.phonePrimary || null,

      // Fechas
      fecha_emision: invoice.date,
      fecha_vencimiento: invoice.dueDate || invoice.date,
      fecha_hora: invoice.datetime || invoice.date,

      // Montos
      subtotal: parseFloat(invoice.subtotal || 0),
      descuento: parseFloat(invoice.discount || 0),
      impuestos: parseFloat(invoice.tax || 0),
      total: parseFloat(invoice.total || 0),
      total_pagado: parseFloat(invoice.totalPaid || 0),
      saldo: parseFloat(invoice.balance || 0),

      // Estado y condiciones
      estado: invoice.status || 'unknown',
      condicion_venta: invoice.saleCondition || null,
      metodo_pago: invoice.paymentMethod || null,
      terminos: invoice.term || null,

      // Información adicional
      observaciones: invoice.observations || null,
      anotaciones: invoice.anotation || null,
      terminos_condiciones: invoice.termsConditions || null,

      // Bodega y vendedor
      bodega: invoice.warehouse?.name || 'Principal',
      vendedor: invoice.seller?.name || null,

      // Semana, mes, año (calculados)
      semana: this.calculateWeekOfMonth(invoice.date),
      mes: fecha.getMonth() + 1,
      ano: fecha.getFullYear(),

      // Items procesados
      items: this.processAlegraItems(invoice.items || []),

      // Datos originales para referencia
      alegra_data: invoice
      };
    } catch (error) {
      console.error('❌ Error en transformInvoiceForFrontend:', error);
      console.error('❌ Factura problemática:', invoice);
      throw new Error(`Error transformando factura: ${error.message}`);
    }
  }

  /**
   * Procesar items de factura de Alegra
   */
  processAlegraItems(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map(item => this.normalizeInvoiceItem(item));
  }

  normalizeInvoiceItem(item = {}) {
    const { referenceValue, referenceType } = this.normalizeItemReference(item);
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const total = Number(item.total) || Number((quantity * price).toFixed(2));
    const discount = Number(item.discount) || 0;

    return {
      alegra_id: item.id,
      codigo_alegra: item.id?.toString() || null,
      nombre: item.name || item.description || 'Producto sin nombre',
      name: item.name || item.description || 'Producto sin nombre',
      descripcion: item.description || '',
      description: item.description || '',
      referencia: referenceValue,
      reference: referenceValue,
      referencia_tipo: referenceType,
      reference_type: referenceType,
      // ✅ codigo_producto solo usa la referencia real (NO productKey/CABYS)
      codigo_producto: referenceValue || null,
      // ⚠️ productKey es CABYS - mantenerlo separado, NO usarlo como identificador
      productKey: item.productKey || null,
      cantidad: quantity,
      quantity,
      precio_unitario: price,
      price,
      descuento: discount,
      discount,
      total,
      unidad: item.unit || item.unitType || 'unit',
      unit: item.unit || item.unitType || 'unit',
      unitType: item.unitType || item.unit || 'unit',
      tipo: item.type || 'product',
      impuestos: Array.isArray(item.tax) ? item.tax : [],
      tax: Array.isArray(item.tax) ? item.tax : [],
    };
  }

  normalizeItemReference(item = {}) {
    const coerceString = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
      return null;
    };

    let referenceValue = null;
    let referenceType = null;

    const rawReference = item.reference;

    if (typeof rawReference === 'string' || typeof rawReference === 'number' || typeof rawReference === 'bigint') {
      referenceValue = coerceString(rawReference);
    } else if (rawReference && typeof rawReference === 'object') {
      referenceValue =
        coerceString(rawReference.reference) ||
        coerceString(rawReference.code) ||
        coerceString(rawReference.value);
      referenceType = rawReference.type || null;
    }

    // ❌ NO usar productKey (CABYS) como referencia - es un código general compartido
    if (!referenceValue) {
      referenceValue =
        coerceString(item.code) ||
        coerceString(item.sku) ||
        coerceString(item.id);
    }

    if (!referenceType) {
      referenceType = item.referenceType || item.reference_type || null;
    }

    return {
      referenceValue,
      referenceType: referenceType || null
    };
  }

  /**
   * Calcular semana del mes
   */
  calculateWeekOfMonth(dateString) {
    const date = new Date(dateString);
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfMonth = date.getDate();
    const dayOfWeek = firstDay.getDay();

    return Math.ceil((dayOfMonth + dayOfWeek) / 7);
  }
}

module.exports = AlegraInvoiceService;

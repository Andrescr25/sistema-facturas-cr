/**
 * Servicio de Negocio de Facturas
 * Coordina operaciones entre la BD local y la API de Alegra
 */

const { getInvoiceService: getAlegraInvoiceService, getProductService: getAlegraProductService } = require('../../integrations/alegra');
const DatabaseHelper = require('../../utils/database.helper');
const { query } = require('../../../config/database');

class InvoiceService {
  constructor() {
    this.alegraInvoiceService = getAlegraInvoiceService();
    this.alegraProductService = getAlegraProductService();
  }

  /**
   * Buscar facturas por número
   */
  async searchByNumber(numero) {
    try {
      console.log(`🔍 Buscando facturas con número: ${numero}`);

      const result = await this.alegraInvoiceService.searchInvoicesByNumber(numero);

      if (result.success) {
        return {
          success: true,
          data: result.data,
          searchTerm: numero,
          searchType: 'numero'
        };
      }

      return result;
    } catch (error) {
      console.error('❌ Error buscando facturas por número:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Buscar facturas por cliente
   */
  async searchByClient(clientName) {
    try {
      console.log(`🔍 Buscando facturas del cliente: ${clientName}`);

      const result = await this.alegraInvoiceService.searchInvoicesByClient(clientName);

      if (result.success) {
        return {
          success: true,
          data: result.data,
          searchTerm: clientName,
          searchType: 'cliente'
        };
      }

      return result;
    } catch (error) {
      console.error('❌ Error buscando facturas por cliente:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener siguiente consecutivo
   */
  async getNextConsecutive() {
    try {
      console.log('🔢 Obteniendo siguiente consecutivo de factura...');

      const result = await this.alegraInvoiceService.getNextConsecutive();

      if (result.success) {
        return result;
      }

      // Fallback: calcular manualmente desde última factura
      return await this._calculateNextConsecutive();
    } catch (error) {
      console.error('❌ Error obteniendo consecutivo:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener PDF de factura
   */
  async getInvoicePDF(invoiceId) {
    try {
      console.log(`📄 Obteniendo PDF de factura: ${invoiceId}`);

      const result = await this.alegraInvoiceService.getInvoicePDF(invoiceId);

      if (result.success) {
        return {
          success: true,
          url: result.url,
          invoiceNumber: result.invoiceNumber
        };
      }

      return result;
    } catch (error) {
      console.error('❌ Error obteniendo PDF:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener facturas por período
   */
  async getInvoicesByPeriod(year, month, week = null) {
    try {
      console.log(`📅 Obteniendo facturas para ${year}/${month}${week ? `/semana ${week}` : ''}`);

      // Obtener desde BD local
      let sql = `
        SELECT f.*
        FROM facturas f
        WHERE EXTRACT(YEAR FROM f.fecha_emision) = $1
        AND EXTRACT(MONTH FROM f.fecha_emision) = $2
      `;

      const params = [year, month];

      if (week) {
        sql += ` AND EXTRACT(WEEK FROM f.fecha_emision) = $3`;
        params.push(week);
      }

      sql += ` ORDER BY f.fecha_emision DESC`;

      const result = await query(sql, params);

      // Mapear los registros de la base de datos local al formato original de Alegra
      // para que el frontend pueda leer .client?.name, .date, .id etc.
      const mappedRows = result.rows.map(row => {
        let formattedDate = null;
        if (row.fecha_emision) {
          try {
            formattedDate = new Date(row.fecha_emision).toISOString().split('T')[0];
          } catch (e) {
            formattedDate = String(row.fecha_emision).split('T')[0];
          }
        }

        return {
          id: row.alegra_id ? String(row.alegra_id) : String(row.id),
          alegra_id: row.alegra_id,
          numberTemplate: {
            fullNumber: row.numero_factura || String(row.id),
            formattedNumber: row.numero_factura || String(row.id)
          },
          client: {
            name: row.cliente_nombre || 'Cliente no especificado',
            email: row.cliente_email || null
          },
          date: formattedDate,
          total: Number(row.total || 0),
          // Mantener metadatos locales útiles
          local_data: {
            id: row.id,
            estado_bodega: row.estado_bodega || 'pendiente',
            estado_procesamiento: row.estado_procesamiento || 'pendiente'
          }
        };
      });

      return {
        success: true,
        data: mappedRows,
        period: { year, month, week }
      };
    } catch (error) {
      console.error('❌ Error obteniendo facturas por período:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Método privado: Calcular siguiente consecutivo manualmente
   */
  async _calculateNextConsecutive() {
    // Implementación de fallback
    return {
      success: true,
      ultimoNumero: '001000012979',
      siguienteNumero: '001000012980',
      siguienteConsecutivo: '001000012980'
    };
  }

  /**
   * Obtener todas las facturas locales con filtros
   */
  async getInvoices(filters = {}) {
    try {
      const { semana, mes, ano, procesada, cliente } = filters;

      let sql = `
        SELECT f.*, 
               COUNT(fi.id) as total_items,
               COUNT(fa.id) as total_faltantes
        FROM facturas f
        LEFT JOIN factura_items fi ON f.id = fi.factura_id
        LEFT JOIN faltantes fa ON fa.factura_propia_id = f.factura_propia_id
      `;

      const conditions = [];
      const params = [];
      let paramIndex = 1;

      if (semana) {
        conditions.push(`f.semana = $${paramIndex++}`);
        params.push(semana);
      }

      if (mes) {
        conditions.push(`f.mes = $${paramIndex++}`);
        params.push(mes);
      }

      if (ano) {
        conditions.push(`f.ano = $${paramIndex++}`);
        params.push(ano);
      }

      if (procesada !== undefined) {
        conditions.push(`f.procesada = $${paramIndex++}`);
        params.push(procesada === 'true');
      }

      if (cliente) {
        conditions.push(`f.cliente_nombre ILIKE $${paramIndex++}`);
        params.push(`%${cliente}%`);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += `
        GROUP BY f.id
        ORDER BY f.fecha_emision DESC, f.numero_factura DESC
      `;

      const result = await query(sql, params);

      return {
        success: true,
        data: result.rows,
        total: result.rows.length
      };
    } catch (error) {
      console.error('❌ Error obteniendo facturas locales:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener una factura específica con items y faltantes asociados
   */
  async getInvoiceWithRelations(id) {
    try {
      // 1. Intentar obtener la factura de Alegra
      const alegraResult = await this.alegraInvoiceService.getInvoiceById(id);

      if (alegraResult.success) {
        const facturaAlegra = alegraResult.data;

        // Buscar datos locales complementarios usando alegra_id
        const alegraIdInt = parseInt(id, 10);
        const localResult = await query(
          'SELECT * FROM facturas WHERE alegra_id = $1 ORDER BY id DESC LIMIT 1',
          [alegraIdInt]
        );

        let localData = null;
        let localItems = [];
        let localFaltantes = [];

        if (localResult.rows.length > 0) {
          const localId = localResult.rows[0].id;
          localData = localResult.rows[0];

          // Obtener items locales
          const itemsResult = await query(`
            SELECT fi.*, p.nombre as producto_nombre, p.codigo as producto_codigo
            FROM factura_items fi
            LEFT JOIN productos p ON fi.producto_id = p.id
            WHERE fi.factura_id = $1
            ORDER BY fi.id
          `, [localId]);
          localItems = itemsResult.rows;

          // Obtener faltantes
          // Los faltantes cuelgan de la factura y el producto PROPIOS
          // (migración independencia/032); `localId` es de la tabla vieja.
          const faltantesResult = await query(`
            SELECT fa.*, p.nombre as producto_nombre, p.referencia as producto_codigo
            FROM faltantes fa
            LEFT JOIN producto p ON p.id = fa.producto_propio_id
            WHERE fa.factura_propia_id = (SELECT factura_propia_id FROM facturas WHERE id = $1)
            ORDER BY fa.created_at DESC
          `, [localId]);
          localFaltantes = faltantesResult.rows;
        }

        // Devolver la factura de Alegra con los datos locales adjuntos
        return {
          success: true,
          data: {
            ...facturaAlegra,
            local_data: localData,
            local_items: localItems,
            local_faltantes: localFaltantes
          }
        };
      }

      // 2. Fallback: buscar en la base de datos local si no se encontró en Alegra (ej: facturas offline locales)
      const localIdInt = parseInt(id, 10);
      const facturaLocal = await query(
        'SELECT * FROM facturas WHERE id = $1 OR alegra_id = $2',
        [isNaN(localIdInt) ? -1 : localIdInt, isNaN(localIdInt) ? -1 : localIdInt]
      );

      if (facturaLocal.rows.length > 0) {
        const localId = facturaLocal.rows[0].id;
        const factura = facturaLocal.rows[0];

        const itemsResult = await query(`
          SELECT fi.*, p.nombre as producto_nombre, p.codigo as producto_codigo,
                 pr.nombre as proveedor_nombre
          FROM factura_items fi
          LEFT JOIN productos p ON fi.producto_id = p.id
          LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
          WHERE fi.factura_id = $1
          ORDER BY fi.id
        `, [localId]);

        const faltantesResult = await query(`
          SELECT fa.*, p.nombre as producto_nombre, p.referencia as producto_codigo
          FROM faltantes fa
          LEFT JOIN producto p ON p.id = fa.producto_propio_id
          WHERE fa.factura_propia_id = (SELECT factura_propia_id FROM facturas WHERE id = $1)
          ORDER BY fa.created_at DESC
        `, [localId]);

        // Convertir estructura local a estructura básica de Alegra para compatibilidad del frontend
        return {
          success: true,
          data: {
            id: factura.alegra_id || factura.id,
            date: factura.fecha_emision ? new Date(factura.fecha_emision).toISOString().split('T')[0] : null,
            total: Number(factura.total || 0),
            client: {
              name: factura.cliente_nombre || 'Cliente no especificado',
              email: factura.cliente_email || null
            },
            numberTemplate: {
              fullNumber: factura.numero_factura,
              formattedNumber: factura.numero_factura
            },
            items: itemsResult.rows.map(it => ({
              id: it.alegra_id || it.id,
              name: it.producto_nombre,
              reference: it.producto_codigo,
              quantity: Number(it.cantidad || 0),
              price: Number(it.precio_unitario || 0),
              total: Number(it.total || 0)
            })),
            local_data: factura,
            local_items: itemsResult.rows,
            local_faltantes: faltantesResult.rows
          }
        };
      }

      return {
        success: false,
        statusCode: 404,
        message: 'Factura no encontrada en Alegra ni en base de datos local'
      };

    } catch (error) {
      console.error('❌ Error obteniendo factura con relaciones:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Crear nueva factura local
   */
  async createInvoiceLocal(invoiceData) {
    try {
      const {
        numero_factura,
        alegra_id,
        cliente_nombre,
        cliente_email,
        fecha_emision,
        total,
        items
      } = invoiceData;

      const fecha = new Date(fecha_emision);

      // Función helper para calcular semana del mes
      const calculateWeekOfMonth = (date) => {
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const dayOfMonth = date.getDate();
        const dayOfWeek = firstDay.getDay();
        return Math.ceil((dayOfMonth + dayOfWeek) / 7);
      };

      const semana = calculateWeekOfMonth(fecha);
      const mes = fecha.getMonth() + 1;
      const ano = fecha.getFullYear();

      const facturaResult = await query(`
        INSERT INTO facturas (numero_factura, alegra_id, cliente_nombre, cliente_email, 
                             fecha_emision, semana, mes, ano, total)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [numero_factura, alegra_id, cliente_nombre, cliente_email, fecha_emision, semana, mes, ano, total]);

      const facturaId = facturaResult.rows[0].id;

      if (items && items.length > 0) {
        for (const item of items) {
          await query(`
            INSERT INTO factura_items (factura_id, producto_id, cantidad_original, 
                                     cantidad_entregada, precio_unitario, subtotal)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            facturaId,
            item.producto_id,
            item.cantidad,
            item.cantidad,
            item.precio_unitario,
            item.subtotal
          ]);
        }
      }

      return {
        success: true,
        data: facturaResult.rows[0]
      };
    } catch (error) {
      console.error('❌ Error creando factura local:', error);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * Actualizar estado de factura local
   */
  async updateInvoiceLocal(id, data) {
    try {
      const { procesada } = data;

      const result = await query(`
        UPDATE facturas 
        SET procesada = COALESCE($1, procesada)
        WHERE id = $2
        RETURNING *
      `, [procesada, id]);

      if (result.rows.length === 0) {
        return {
          success: false,
          statusCode: 404,
          message: 'Factura no encontrada'
        };
      }

      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      console.error('❌ Error actualizando factura local:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Marcar factura local como procesada
   */
  async markAsProcessedLocal(id) {
    try {
      const result = await query(`
        UPDATE facturas 
        SET procesada = true
        WHERE id = $1
        RETURNING *
      `, [id]);

      if (result.rows.length === 0) {
        return {
          success: false,
          statusCode: 404,
          message: 'Factura no encontrada'
        };
      }

      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      console.error('❌ Error marcando factura como procesada:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Buscar facturas locales
   */
  async searchInvoicesLocal(termino) {
    try {
      const result = await query(`
        SELECT f.*, 
               COUNT(fi.id) as total_items,
               COUNT(fa.id) as total_faltantes
        FROM facturas f
        LEFT JOIN factura_items fi ON f.id = fi.factura_id
        LEFT JOIN faltantes fa ON fa.factura_propia_id = f.factura_propia_id
        WHERE f.numero_factura ILIKE $1 
           OR f.cliente_nombre ILIKE $1
           OR f.cliente_email ILIKE $1
        GROUP BY f.id
        ORDER BY f.fecha_emision DESC
        LIMIT 50
      `, [`%${termino}%`]);

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('❌ Error buscando facturas locales:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = InvoiceService;

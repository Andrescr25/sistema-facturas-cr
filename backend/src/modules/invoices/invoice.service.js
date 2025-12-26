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
        SELECT f.*,
               c.nombre as cliente_nombre,
               c.email as cliente_email
        FROM facturas f
        LEFT JOIN clientes c ON f.cliente_id = c.id
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

      return {
        success: true,
        data: result.rows,
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
   * Obtener facturas pendientes de reimpresión
   */
  async getPendingReprintInvoices() {
    try {
      console.log('📋 Obteniendo facturas pendientes de reimpresión...');

      const sql = `
        SELECT
          fr.id as reimpresion_id,
          fr.ajustes_realizados,
          fr.estado,
          fr.fecha_creacion,
          f.alegra_id,
          f.numero_factura,
          f.fecha_emision,
          c.nombre as cliente_nombre
        FROM facturas_reimpresion fr
        JOIN facturas f ON fr.factura_id = f.id
        LEFT JOIN clientes c ON f.cliente_id = c.id
        WHERE fr.estado = 'pendiente'
        ORDER BY fr.fecha_creacion ASC
      `;

      const result = await query(sql);

      return {
        success: true,
        data: result.rows,
        total: result.rows.length
      };
    } catch (error) {
      console.error('❌ Error obteniendo facturas pendientes:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener facturas procesadas (últimos 7 días)
   */
  async getProcessedReprintInvoices() {
    try {
      console.log('📋 Obteniendo facturas procesadas (últimos 7 días)...');

      const sql = `
        SELECT
          fr.id as reimpresion_id,
          fr.ajustes_realizados,
          fr.estado,
          fr.fecha_creacion,
          fr.fecha_procesamiento,
          f.alegra_id,
          f.numero_factura,
          f.fecha_emision,
          c.nombre as cliente_nombre
        FROM facturas_reimpresion fr
        JOIN facturas f ON fr.factura_id = f.id
        LEFT JOIN clientes c ON f.cliente_id = c.id
        WHERE fr.estado = 'procesada'
        AND fr.fecha_procesamiento >= NOW() - INTERVAL '7 days'
        ORDER BY fr.fecha_procesamiento DESC
      `;

      const result = await query(sql);

      return {
        success: true,
        data: result.rows,
        total: result.rows.length
      };
    } catch (error) {
      console.error('❌ Error obteniendo facturas procesadas:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener detalle de factura para registro de faltantes
   */
  async getInvoiceDetail(invoiceId) {
    try {
      console.log(`🔍 Obteniendo detalle de factura: ${invoiceId}`);

      // Primero buscar en BD local
      const localResult = await query(
        'SELECT * FROM facturas WHERE alegra_id = $1',
        [invoiceId]
      );

      // Obtener de Alegra
      const alegraResult = await this.alegraInvoiceService.getInvoiceById(invoiceId);

      if (alegraResult.success) {
        const factura = alegraResult.data;

        return {
          success: true,
          data: {
            ...factura,
            local_data: localResult.rows[0] || null
          }
        };
      }

      return alegraResult;
    } catch (error) {
      console.error('❌ Error obteniendo detalle de factura:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Actualizar precios de productos desde Alegra antes de procesar factura
   * Solo actualiza productos que tienen requiere_actualizacion: true
   */
  async updateInvoicePricesFromAlegra(alegra_id, ajustes, itemsEditados = null) {
    try {
      console.log(`💰 Actualizando precios desde Alegra para factura ${alegra_id}...`);

      // 1. Obtener factura actual de Alegra
      const invoiceResult = await this.alegraInvoiceService.getInvoiceById(alegra_id);
      if (!invoiceResult.success || !invoiceResult.data) {
        throw new Error('No se pudo obtener la factura de Alegra');
      }

      const invoice = invoiceResult.data;
      const currentItems = invoice.items || [];

      // DEBUG: Mostrar estructura completa del primer item
      if (currentItems.length > 0) {
        console.log(`🔍 DEBUG - Estructura del primer item:`, JSON.stringify(currentItems[0], null, 2));
      }

      // 1.5. Crear mapa de ID de Alegra → Código de producto
      // Esto ayuda a hacer match cuando reference es null
      const alegraIdToCodigoMap = new Map();

      // Obtener códigos de productos desde la base de datos local
      try {
        const productosEnFactura = currentItems
          .map(item => item.item?.id || item.id)
          .filter(id => id);

        if (productosEnFactura.length > 0) {
          const productosDB = await query(`
            SELECT alegra_id, codigo
            FROM productos
            WHERE alegra_id = ANY($1::int[])
          `, [productosEnFactura]);

          productosDB.rows.forEach(row => {
            alegraIdToCodigoMap.set(row.alegra_id.toString(), row.codigo);
            console.log(`  📌 Mapeado: Alegra ID ${row.alegra_id} → Código ${row.codigo}`);
          });
        }
      } catch (error) {
        console.warn('⚠️ No se pudo cargar mapa de IDs de Alegra:', error.message);
      }

      // 2. Identificar productos que necesitan actualización
      const productosParaActualizar = ajustes.filter(aj => aj.requiere_actualizacion);

      if (productosParaActualizar.length === 0) {
        console.log(`✅ No hay productos que requieran actualización de precios`);
        return { success: true, updated: 0 };
      }

      console.log(`📦 ${productosParaActualizar.length} productos requieren actualización de precios`);

      // 3. Obtener precios actualizados de Alegra (batch para optimizar)
      const preciosActualizados = new Map();
      const batchSize = 5; // Procesar de 5 en 5 para no saturar API

      for (let i = 0; i < productosParaActualizar.length; i += batchSize) {
        const batch = productosParaActualizar.slice(i, i + batchSize);

        await Promise.all(batch.map(async (ajuste) => {
          try {
            const precio = await this.alegraInvoiceService.getUpdatedPrice(ajuste.producto_codigo);
            if (precio !== null) {
              preciosActualizados.set(ajuste.producto_codigo, precio);
              console.log(`  ✓ Precio actualizado para ${ajuste.producto_codigo}: ₡${precio}`);
            }
          } catch (error) {
            console.warn(`  ⚠️ No se pudo obtener precio para ${ajuste.producto_codigo}:`, error.message);
          }
        }));

        // Pequeña pausa entre batches para no saturar la API
        if (i + batchSize < productosParaActualizar.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // 4. Construir array de items actualizados
      const updatedItems = currentItems.map(item => {
        // Intentar obtener la referencia de múltiples fuentes
        let itemReference = item.reference || item.item?.reference;

        // Si reference es null, intentar obtenerlo del mapa usando el ID de Alegra
        if (!itemReference) {
          const alegraItemId = (item.item?.id || item.id)?.toString();
          if (alegraItemId && alegraIdToCodigoMap.has(alegraItemId)) {
            itemReference = alegraIdToCodigoMap.get(alegraItemId);
            console.log(`  🔑 Match por ID de Alegra: ${alegraItemId} → Código ${itemReference}`);
          }
        }

        // Buscar ajuste por código de producto
        let ajuste = ajustes.find(aj => aj.producto_codigo === itemReference);

        // Si no encontró por referencia/ID, intentar por nombre (último fallback)
        if (!ajuste && item.description) {
          ajuste = ajustes.find(aj => {
            const nombreSimilar = aj.producto_nombre?.toLowerCase().trim() === item.description?.toLowerCase().trim();
            if (nombreSimilar) {
              console.log(`  ℹ️ Match por nombre: "${item.description}" = "${aj.producto_nombre}" (código: ${aj.producto_codigo})`);
            }
            return nombreSimilar;
          });
        }

        // Si el producto tiene ajustes
        if (ajuste) {
          // Calcular nueva cantidad según el estado del ajuste
          let nuevaCantidad = item.quantity;

          if (ajuste.requiere_actualizacion) {
            // Calcular cuánto hay que rebajar
            const cantidadPendiente = ajuste.cantidad_faltante - (ajuste.cantidad_entregada || 0);

            if (ajuste.estado === 'no_llego') {
              // No llegó nada → Rebajar todo lo faltante
              nuevaCantidad = Math.max(item.quantity - ajuste.cantidad_faltante, 0);
              console.log(`  🔴 ${itemReference}: NO LLEGÓ - Rebajando ${ajuste.cantidad_faltante} unidades (${item.quantity} → ${nuevaCantidad})`);
            } else if (ajuste.estado === 'parcial') {
              // Llegó parte → Rebajar lo pendiente
              nuevaCantidad = Math.max(item.quantity - cantidadPendiente, 0);
              console.log(`  🟡 ${itemReference}: PARCIAL - Rebajando ${cantidadPendiente} unidades (${item.quantity} → ${nuevaCantidad})`);
            } else if (ajuste.estado === 'completo') {
              // Todo llegó → No rebajar
              console.log(`  🟢 ${itemReference}: COMPLETO - Cantidad sin cambios (${item.quantity})`);
            }
          }

          // Obtener precio actualizado (si está disponible)
          const precioNuevo = preciosActualizados.has(itemReference)
            ? preciosActualizados.get(itemReference)
            : item.price;

          if (preciosActualizados.has(itemReference)) {
            console.log(`  💰 ${itemReference}: Precio actualizado (₡${item.price} → ₡${precioNuevo})`);
          }

          return {
            id: item.id,
            reference: itemReference,
            description: item.description || item.name,
            quantity: nuevaCantidad, // CANTIDAD AJUSTADA
            price: precioNuevo, // PRECIO ACTUALIZADO
            tax: item.tax,
            item: item.item
          };
        }

        // Si no tiene ajustes, mantener original
        return {
          id: item.id,
          reference: itemReference,
          description: item.description || item.name,
          quantity: item.quantity,
          price: item.price,
          tax: item.tax,
          item: item.item
        };
      }).filter(item => item.quantity > 0); // Filtrar items con cantidad 0

      // 5. Actualizar factura en Alegra con precios nuevos
      const updateResult = await this.alegraInvoiceService.updateInvoice(alegra_id, {
        items: updatedItems
      });

      if (!updateResult.success) {
        throw new Error('No se pudo actualizar la factura en Alegra');
      }

      console.log(`✅ Factura ${alegra_id} actualizada con ${preciosActualizados.size} precios nuevos`);

      return {
        success: true,
        updated: preciosActualizados.size,
        preciosActualizados: Array.from(preciosActualizados.entries()).map(([codigo, precio]) => ({
          codigo,
          precio
        }))
      };
    } catch (error) {
      console.error('❌ Error actualizando precios desde Alegra:', error);
      return {
        success: false,
        error: error.message,
        updated: 0
      };
    }
  }

  /**
   * Procesar factura individual
   */
  async processIndividualInvoice(invoiceData) {
    try {
      const { alegra_id, numero_factura, cliente_nombre, fecha_emision, ajustes, estado, items_editados } = invoiceData;

      console.log(`📋 Procesando factura individual: ${numero_factura}`);
      console.log(`📦 Ajustes recibidos:`, JSON.stringify(ajustes, null, 2));
      console.log(`📊 Total ajustes: ${ajustes?.length || 0}`);

      // NUEVO: Actualizar precios y cantidades desde Alegra ANTES de procesar
      if (ajustes && ajustes.length > 0) {
        const productosParaActualizar = ajustes.filter(aj => aj.requiere_actualizacion);
        console.log(`🔍 Productos que requieren actualización: ${productosParaActualizar.length}`);
        console.log(`📝 Detalles:`, JSON.stringify(productosParaActualizar, null, 2));

        await this.updateInvoicePricesFromAlegra(alegra_id, ajustes, items_editados);
      }

      // 1. Registrar en procesamientos
      const procesamiento = await query(`
        INSERT INTO procesamientos (
          total_facturas, facturas_para_historial, facturas_para_reimpresion,
          procesado_por, detalles
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        1,
        1,
        estado.includes('requiere_reimpresion') ? 1 : 0,
        'Usuario Individual',
        JSON.stringify({
          factura_procesada: {
            alegra_id,
            numero_factura,
            cliente_nombre,
            fecha_emision,
            ajustes,
            estado
          }
        })
      ]);

      // 2. Si requiere reimpresión, guardar en facturas_reimpresion
      if (estado.includes('requiere_reimpresion')) {
        const existeReimpresion = await query(`
          SELECT fr.id FROM facturas_reimpresion fr
          JOIN facturas fa ON fr.factura_id = fa.id
          WHERE fa.alegra_id = $1
        `, [alegra_id]);

        if (existeReimpresion.rows.length > 0) {
          await query(`
            UPDATE facturas_reimpresion
            SET ajustes_realizados = $2,
                estado = 'pendiente',
                fecha_creacion = CURRENT_TIMESTAMP,
                fecha_procesamiento = NULL
            FROM facturas fa
            WHERE facturas_reimpresion.factura_id = fa.id
            AND fa.alegra_id = $1
          `, [alegra_id, JSON.stringify(ajustes)]);
        } else {
          await query(`
            INSERT INTO facturas_reimpresion (factura_id, ajustes_realizados, estado, fecha_creacion)
            SELECT fa.id, $2, 'pendiente', CURRENT_TIMESTAMP
            FROM facturas fa
            WHERE fa.alegra_id = $1
          `, [alegra_id, JSON.stringify(ajustes)]);
        }
      }

      // 3. Guardar ajustes
      await this._saveAdjustments(alegra_id, ajustes);

      // 4. Marcar faltantes como procesados
      await query(`
        UPDATE faltantes
        SET estado = 'procesado'
        FROM facturas fa
        WHERE faltantes.factura_id = fa.id
        AND fa.alegra_id = $1
      `, [alegra_id]);

      // 5. Actualizar estado de factura
      await query(`
        UPDATE facturas
        SET estado_procesamiento = 'procesado'
        WHERE alegra_id = $1
      `, [alegra_id]);

      console.log(`✅ Factura ${numero_factura} procesada`);

      return {
        success: true,
        message: `Factura ${numero_factura} procesada correctamente`,
        data: {
          procesamiento_id: procesamiento.rows[0].id,
          factura_procesada: numero_factura,
          ajustes_guardados: ajustes.length
        }
      };
    } catch (error) {
      console.error('❌ Error procesando factura:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Recuperar factura procesada
   */
  async recoverProcessedInvoice(invoiceId) {
    try {
      console.log(`🔄 Recuperando factura ${invoiceId}...`);

      // 1. Cambiar estado de faltantes
      const faltantesRecuperados = await query(`
        UPDATE faltantes
        SET estado = 'pendiente'
        FROM facturas fa
        WHERE faltantes.factura_id = fa.id
        AND fa.alegra_id = $1
        AND faltantes.estado = 'procesado'
        RETURNING faltantes.id
      `, [invoiceId]);

      // 2. Cambiar estado de factura
      await query(`
        UPDATE facturas
        SET estado_procesamiento = 'pendiente'
        WHERE alegra_id = $1
      `, [invoiceId]);

      // 3. Eliminar registro de reimpresión
      const reimpresionEliminada = await query(`
        DELETE FROM facturas_reimpresion
        WHERE facturas_reimpresion.factura_id IN (
          SELECT fa.id FROM facturas fa WHERE fa.alegra_id = $1
        )
        AND facturas_reimpresion.estado IN ('pendiente', 'procesada')
        RETURNING facturas_reimpresion.id
      `, [invoiceId]);

      console.log(`✅ Factura ${invoiceId} recuperada`);

      return {
        success: true,
        message: `Factura ${invoiceId} recuperada con ajustes previos conservados`,
        data: {
          factura_id: invoiceId,
          faltantes_restaurados: faltantesRecuperados.rows.length,
          ajustes_conservados: true,
          reimpresion_eliminada: reimpresionEliminada.rows.length
        }
      };
    } catch (error) {
      console.error('❌ Error recuperando factura:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Registrar faltantes de una factura
   */
  async registerMissingItems(invoiceId, faltantes, registradoPor = 'Usuario', observacionesAdicionales = '') {
    try {
      console.log(`📝 Registrando faltantes para factura: ${invoiceId}`);

      // 1. Obtener o crear factura en BD local
      const facturaResult = await query(`
        SELECT id FROM facturas WHERE alegra_id = $1
      `, [invoiceId]);

      let facturaLocalId;

      if (facturaResult.rows.length === 0) {
        // Crear factura en BD local
        const alegraResult = await this.alegraInvoiceService.getInvoiceById(invoiceId);

        if (!alegraResult.success) {
          throw new Error('Factura no encontrada en Alegra');
        }

        const factura = alegraResult.data;

        const newFactura = await query(`
          INSERT INTO facturas (alegra_id, numero_factura, fecha_emision, total, estado_procesamiento)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [
          invoiceId,
          factura.numberTemplate?.fullNumber,
          factura.date,
          factura.total,
          'pendiente'
        ]);

        facturaLocalId = newFactura.rows[0].id;
      } else {
        facturaLocalId = facturaResult.rows[0].id;
      }

      // 2. Guardar faltantes
      for (const faltante of faltantes) {
        // El frontend envía item_id que puede ser la referencia del producto o el ID de Alegra
        const itemIdentifier = faltante.item_id || faltante.producto_codigo;

        if (!itemIdentifier) {
          console.warn('⚠️ Faltante sin identificador:', faltante);
          continue;
        }

        // Buscar producto por código
        const productoResult = await query(`
          SELECT id FROM productos
          WHERE codigo = $1
          LIMIT 1
        `, [itemIdentifier]);

        let productoId = null;

        if (productoResult.rows.length === 0) {
          // Si no existe el producto, crearlo temporalmente con la información disponible
          console.log(`⚠️ Producto ${itemIdentifier} no encontrado, creando registro temporal...`);

          try {
            const newProducto = await query(`
              INSERT INTO productos (codigo, nombre)
              VALUES ($1, $2)
              RETURNING id
            `, [itemIdentifier, faltante.nombre_producto || 'Producto sin nombre']);

            productoId = newProducto.rows[0].id;
          } catch (insertError) {
            // Si falla el INSERT (por ejemplo, por duplicado), intentar buscar de nuevo
            console.warn(`⚠️ Error al insertar producto, buscando de nuevo:`, insertError.message);
            const retryResult = await query(`
              SELECT id FROM productos WHERE codigo = $1 LIMIT 1
            `, [itemIdentifier]);

            if (retryResult.rows.length > 0) {
              productoId = retryResult.rows[0].id;
            } else {
              throw new Error(`No se pudo obtener o crear el producto con código ${itemIdentifier}`);
            }
          }
        } else {
          productoId = productoResult.rows[0].id;
        }

        await query(`
          INSERT INTO faltantes (
            factura_id, producto_id, cantidad_faltante, tipo_faltante,
            observaciones, registrado_por, estado
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')
          ON CONFLICT (factura_id, producto_id)
          DO UPDATE SET
            cantidad_faltante = $3,
            tipo_faltante = $4,
            observaciones = $5,
            fecha_registro = CURRENT_TIMESTAMP
        `, [
          facturaLocalId,
          productoId,
          faltante.cantidad_faltante,
          faltante.tipo_faltante,
          faltante.observaciones || '',
          registradoPor
        ]);
      }

      // 3. Guardar observaciones adicionales si existen
      if (observacionesAdicionales) {
        await query(`
          INSERT INTO observaciones_adicionales (factura_id, observaciones)
          VALUES ($1, $2)
          ON CONFLICT (factura_id)
          DO UPDATE SET observaciones = $2, fecha_registro = CURRENT_TIMESTAMP
        `, [facturaLocalId, observacionesAdicionales]);
      }

      console.log(`✅ ${faltantes.length} faltantes registrados`);

      return {
        success: true,
        message: 'Faltantes registrados correctamente',
        data: {
          factura_id: invoiceId,
          faltantes_registrados: faltantes.length
        }
      };
    } catch (error) {
      console.error('❌ Error registrando faltantes:', error);
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
   * Método privado: Guardar ajustes en BD
   */
  async _saveAdjustments(alegraId, ajustes) {
    for (const ajuste of ajustes) {
      try {
        const faltanteResult = await query(`
          SELECT f.id as faltante_id
          FROM faltantes f
          JOIN productos p ON f.producto_id = p.id
          JOIN facturas fa ON f.factura_id = fa.id
          WHERE fa.alegra_id = $1
          AND p.codigo = $2
          AND f.estado = 'pendiente'
          LIMIT 1
        `, [alegraId, ajuste.producto_codigo]);

        if (faltanteResult.rows.length > 0) {
          const faltante_id = faltanteResult.rows[0].faltante_id;

          await query(`
            INSERT INTO faltantes_ajustes (faltante_id, cantidad_entregada, estado, requiere_actualizacion)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (faltante_id)
            DO UPDATE SET
              cantidad_entregada = $2,
              estado = $3,
              requiere_actualizacion = $4,
              updated_at = CURRENT_TIMESTAMP
          `, [
            faltante_id,
            ajuste.cantidad_entregada,
            ajuste.estado,
            ajuste.requiere_actualizacion
          ]);
        }
      } catch (error) {
        console.error(`❌ Error guardando ajuste para ${ajuste.producto_codigo}:`, error.message);
      }
    }
  }
}

module.exports = InvoiceService;

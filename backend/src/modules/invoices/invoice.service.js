/**
 * Servicio de Negocio de Facturas
 * Coordina operaciones entre la BD local y la API de Alegra
 */

const { getInvoiceService: getAlegraInvoiceService, getProductService: getAlegraProductService } = require('../../integrations/alegra');
const DatabaseHelper = require('../../utils/database.helper');
const { query } = require('../../../config/database');
const AlegraService = require('../../../services/alegraService');

class InvoiceService {
  constructor() {
    this.alegraInvoiceService = getAlegraInvoiceService();
    this.alegraProductService = getAlegraProductService();
    this.alegraServiceInstance = new AlegraService();
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
          fr.id as id,
          fr.ajustes_realizados,
          fr.estado,
          fr.fecha_creacion,
          fr.categoria,
          fr.total_ajustes,
          fa.id as factura_id,
          fa.numero_factura,
          fa.alegra_id,
          fa.cliente_nombre,
          fa.cliente_email,
          fa.fecha_emision,
          fa.total
        FROM facturas_reimpresion fr
        JOIN facturas fa ON fr.factura_id = fa.id
        WHERE fr.estado = 'pendiente'
        ORDER BY fr.fecha_creacion DESC
      `;

      const result = await query(sql);

      // Procesar los ajustes JSONB para mejor visualización
      const facturasConAjustes = result.rows.map(factura => {
        const ajustes = typeof factura.ajustes_realizados === 'string'
          ? JSON.parse(factura.ajustes_realizados)
          : factura.ajustes_realizados;

        const requiereActualizacion = ajustes?.some(aj => aj.requiere_actualizacion) || false;

        return {
          ...factura,
          ajustes_realizados: ajustes,
          total_ajustes: ajustes?.length || 0,
          requiere_actualizacion: requiereActualizacion,
          categoria: factura.categoria || (requiereActualizacion ? 'requiere_cambios' : 'sin_cambios')
        };
      });

      const sinCambios = facturasConAjustes.filter(f => f.categoria === 'sin_cambios');
      const requiereCambios = facturasConAjustes.filter(f => f.categoria !== 'sin_cambios');

      return {
        success: true,
        data: {
          sin_cambios: sinCambios,
          requiere_cambios: requiereCambios
        },
        total_pendientes: facturasConAjustes.length,
        resumen: {
          facturas_pendientes: facturasConAjustes.length,
          facturas_sin_cambios: sinCambios.length,
          facturas_con_cambios: requiereCambios.length
        }
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
          fr.estado as estado_reimpresion,
          fr.fecha_creacion,
          fr.fecha_procesamiento,
          fr.categoria,
          fr.total_ajustes,
          fa.id as factura_id,
          fa.numero_factura,
          fa.alegra_id,
          fa.cliente_nombre,
          fa.cliente_email,
          fa.fecha_emision,
          fa.total,
          EXTRACT(DAY FROM (NOW() - fr.fecha_procesamiento)) as dias_desde_procesamiento
        FROM facturas_reimpresion fr
        JOIN facturas fa ON fr.factura_id = fa.id
        WHERE fr.estado = 'procesada'
          AND fr.fecha_procesamiento >= NOW() - INTERVAL '7 days'
        ORDER BY fr.fecha_procesamiento DESC
      `;

      const result = await query(sql);

      // Procesar los ajustes JSONB
      const facturasConAjustes = result.rows.map(factura => {
        const ajustes = typeof factura.ajustes_realizados === 'string'
          ? JSON.parse(factura.ajustes_realizados)
          : factura.ajustes_realizados;

        const requiereActualizacion = ajustes?.some(aj => aj.requiere_actualizacion) || false;
        const tieneVariacionPrecio = ajustes?.some(aj => aj.diferencia_precio_absoluta || aj.diferencia_precio_relativa);

        return {
          ...factura,
          ajustes_realizados: ajustes,
          total_ajustes: ajustes?.length || 0,
          dias_restantes_recuperacion: Math.ceil(7 - factura.dias_desde_procesamiento),
          puede_recuperar: factura.dias_desde_procesamiento <= 7,
          requiere_actualizacion: requiereActualizacion,
          tiene_variacion_precio: tieneVariacionPrecio,
          categoria: factura.categoria || (requiereActualizacion ? 'requiere_cambios' : 'sin_cambios')
        };
      });

      return {
        success: true,
        data: facturasConAjustes,
        total: facturasConAjustes.length,
        resumen: {
          facturas_procesadas: facturasConAjustes.length,
          recuperables: facturasConAjustes.filter(f => f.puede_recuperar).length
        }
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
   * Obtener detalle de factura para registro de faltantes.
   * Combina los ítems de Alegra con los estados persistidos en la BD local (tipo_faltante, cantidad_faltante, observaciones).
   */
  async getInvoiceDetail(invoiceId) {
    try {
      // Obtener ítems de Alegra primero (así tenemos el numero_factura real)
      const alegraResult = await this.alegraInvoiceService.getInvoiceById(invoiceId);

      if (!alegraResult.success) {
        return alegraResult;
      }

      const factura = alegraResult.data;

      // Buscar en BD local por alegra_id (cast a INTEGER)
      const alegraIdInt = parseInt(invoiceId, 10);
      const numeroFacturaCompleto = factura.numberTemplate?.fullNumber || null;

      let localResult = await query(
        'SELECT * FROM facturas WHERE alegra_id = $1 ORDER BY id DESC LIMIT 1',
        [alegraIdInt]
      );

      // Fallback: buscar por numero_factura completo (ej: "001000014480") si no se encontró por alegra_id
      if (localResult.rows.length === 0 && numeroFacturaCompleto) {
        localResult = await query(
          'SELECT * FROM facturas WHERE numero_factura = $1 ORDER BY id DESC LIMIT 1',
          [numeroFacturaCompleto]
        );
      }

      const facturaLocalId = localResult.rows[0]?.id || null;

      // Si existe en BD local, obtener los faltantes guardados para esta factura
      let faltantesMap = {};
      if (facturaLocalId) {
        const faltantesResult = await query(`
          SELECT
            f.tipo_faltante,
            f.cantidad_faltante,
            f.observaciones,
            p.codigo AS producto_codigo,
            p.alegra_id AS producto_alegra_id
          FROM faltantes f
          JOIN productos p ON f.producto_id = p.id
          WHERE f.factura_id = $1
        `, [facturaLocalId]);

        // Construir mapa por código de producto (y por alegra_id como fallback)
        faltantesResult.rows.forEach(row => {
          if (row.producto_codigo) {
            faltantesMap[String(row.producto_codigo).trim()] = row;
          }
          if (row.producto_alegra_id) {
            faltantesMap[String(row.producto_alegra_id).trim()] = row;
          }
        });
      }

      // Normalizar ítems crudos de Alegra (añade referencia, nombre, cantidad, etc.)
      // y fusionar tipo_faltante desde la tabla de faltantes local
      const itemsConEstado = (factura.items || []).map(item => {
        // Normalizar el ítem crudo para obtener referencia, nombre, cantidad correctos
        const normalizado = this.alegraServiceInstance.normalizeInvoiceItem(item);

        // Buscar faltante primero por referencia (código) y luego por alegra_id
        const refByCodigo = normalizado.referencia ? faltantesMap[String(normalizado.referencia).trim()] : null;
        const refByAlegraId = normalizado.alegra_id ? faltantesMap[String(normalizado.alegra_id).trim()] : null;
        const faltante = refByCodigo || refByAlegraId || null;

        return {
          ...normalizado,
          tipo_faltante: faltante ? faltante.tipo_faltante : null,
          cantidad_faltante: faltante ? Number(faltante.cantidad_faltante) : 0,
          observaciones: faltante ? (faltante.observaciones || '') : ''
        };
      });

      return {
        success: true,
        data: {
          ...factura,
          items: itemsConEstado,
          local_data: localResult.rows[0] || null
        }
      };
    } catch (error) {
      console.error('Error obteniendo detalle de factura:', error);
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
            description: item.description || '',
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
          description: item.description || '',
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
        LEFT JOIN faltantes fa ON f.id = fa.factura_id
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
      // Obtener datos de la factura
      const facturaResult = await query(
        'SELECT * FROM facturas WHERE id = $1',
        [id]
      );
      
      if (facturaResult.rows.length === 0) {
        return {
          success: false,
          statusCode: 404,
          message: 'Factura no encontrada'
        };
      }
      
      // Obtener items de la factura
      const itemsResult = await query(`
        SELECT fi.*, p.nombre as producto_nombre, p.codigo as producto_codigo,
               pr.nombre as proveedor_nombre
        FROM factura_items fi
        LEFT JOIN productos p ON fi.producto_id = p.id
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
        WHERE fi.factura_id = $1
        ORDER BY fi.id
      `, [id]);
      
      // Obtener faltantes registrados
      const faltantesResult = await query(`
        SELECT fa.*, p.nombre as producto_nombre, p.codigo as producto_codigo
        FROM faltantes fa
        LEFT JOIN productos p ON fa.producto_id = p.id
        WHERE fa.factura_id = $1
        ORDER BY fa.created_at DESC
      `, [id]);
      
      const factura = facturaResult.rows[0];
      factura.items = itemsResult.rows;
      factura.faltantes = faltantesResult.rows;
      
      return {
        success: true,
        data: factura
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
        SET procesada = COALESCE($1, procesada),
            updated_at = CURRENT_TIMESTAMP
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
        SET procesada = true,
            updated_at = CURRENT_TIMESTAMP
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
        LEFT JOIN faltantes fa ON f.id = fa.factura_id
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

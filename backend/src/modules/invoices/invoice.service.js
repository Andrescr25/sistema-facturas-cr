/**
 * Servicio de Negocio de Facturas
 * Coordina operaciones entre la BD local y la API de Alegra
 */

const { getInvoiceService: getAlegraInvoiceService, getProductService: getAlegraProductService } = require('../../integrations/alegra');
const DatabaseHelper = require('../../utils/database.helper');
const { resolverProductoLocal } = require('../../utils/resolverProducto');
const { query } = require('../../../config/database');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');

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
   * Obtener facturas pendientes de reimpresión
   */
  async getPendingReprintInvoices() {
    try {
      console.log('📋 Obteniendo facturas pendientes de reimpresión...');

      const sql = `
        SELECT * FROM (
          SELECT DISTINCT ON (fa.alegra_id)
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
          ORDER BY fa.alegra_id, fr.fecha_creacion DESC
        ) t
        ORDER BY t.fecha_creacion DESC
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

      // Buscar en BD local por alegra_id (cast a INTEGER) o número de factura completo
      const alegraIdInt = parseInt(invoiceId, 10);
      const numeroFacturaCompleto = factura.numberTemplate?.fullNumber || null;

      const localResult = await query(
        `SELECT id, estado_bodega, estado_procesamiento, observaciones_adicionales 
         FROM facturas 
         WHERE alegra_id = $1 OR (numero_factura = $2 AND $2 IS NOT NULL)
         ORDER BY CASE WHEN estado_bodega = 'procesado' THEN 1 ELSE 2 END, id DESC`,
        [alegraIdInt, numeroFacturaCompleto]
      );

      const localInvoiceIds = localResult.rows.map(r => r.id);

      // Si existe en BD local, obtener los faltantes guardados para esta factura
      let faltantesMap = {};
      if (localInvoiceIds.length > 0) {
        const faltantesResult = await query(`
          SELECT
            f.tipo_faltante,
            f.cantidad_faltante,
            f.observaciones,
            p.codigo AS producto_codigo,
            p.alegra_id AS producto_alegra_id
          FROM faltantes f
          JOIN productos p ON f.producto_id = p.id
          WHERE f.factura_id = ANY($1::int[])
        `, [localInvoiceIds]);

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
        const normalizado = this.alegraInvoiceService.normalizeInvoiceItem(item);

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
  /** Precio de catálogo de cada item editado, indexado por su id de Alegra. */
  async _preciosDeCatalogo(items) {
    const ids = [...new Set(
      items.map(i => i.id || i.itemId || i.item?.id).filter(Boolean).map(String)
    )];
    const precios = new Map();

    for (const id of ids) {
      try {
        const precio = await this.alegraInvoiceService.getUpdatedPriceById(id);
        if (precio !== null && precio !== undefined) precios.set(id, precio);
      } catch (error) {
        console.warn(`  ⚠️ Sin precio de catálogo para ${id}:`, error.message);
      }
    }
    return precios;
  }

  /** Precio con el que cada línea está HOY en la factura de Alegra. */
  async _preciosEnFactura(alegraId) {
    const precios = new Map();
    try {
      const r = await this.alegraInvoiceService.getInvoiceById(alegraId);
      for (const linea of (r?.data?.items || [])) {
        const id = linea.item?.id || linea.id;
        if (id) precios.set(String(id), Number(linea.price) || 0);
      }
    } catch (error) {
      // Sin esto no se puede saber si alguien tocó el precio, así que ante la
      // duda se respeta lo que mandó la pantalla: el mapa queda vacío.
      console.warn('  ⚠️ No se pudo leer la factura para comparar precios:', error.message);
    }
    return precios;
  }

  async updateInvoicePricesFromAlegra(alegra_id, ajustes, itemsEditados = null, actualizarPrecios = true) {
    try {
      console.log(`💰 Actualizando precios y cantidades para factura ${alegra_id}... (Actualizar precios: ${actualizarPrecios})`);

      // 0. Si el usuario envió items editados manualmente, usarlos directamente
      if (itemsEditados && itemsEditados.length > 0) {
        console.log(`✏️ Usando ${itemsEditados.length} items editados manualmente por el usuario`);

        // EL PRECIO NUEVO TAMBIÉN SE APLICA ACÁ, pero solo si nadie lo tocó.
        //
        // Antes esta rama salía derecho a Alegra y el refresco de precios de
        // más abajo no llegaba a correr: la pantalla carga las líneas DESDE LA
        // FACTURA, así que se reimprimía con el precio con que se emitió aunque
        // el catálogo ya tuviera otro.
        //
        // No se pisan todos porque el precio SE PUEDE ESCRIBIR A MANO en la
        // pantalla, y pisar lo que alguien tecleó es peor que el problema que
        // se arregla. Se compara contra el precio que tiene la factura hoy: si
        // es el mismo, nadie lo tocó y se le pone el del catálogo; si cambió,
        // lo escribió una persona y se respeta.
        const preciosDeCatalogo = actualizarPrecios
          ? await this._preciosDeCatalogo(itemsEditados)
          : new Map();
        const preciosEnFactura = preciosDeCatalogo.size > 0
          ? await this._preciosEnFactura(alegra_id)
          : new Map();

        // Formatear items para Alegra
        const updatedItems = itemsEditados.map(item => {
          // Extraer ID del item
          let itemId = item.id || item.itemId;
          if (!itemId && item.item) {
            itemId = item.item.id;
          }

          const clave = itemId ? String(itemId) : '';
          const precioEscrito = Number(item.price) || 0;
          const precioEmitido = preciosEnFactura.get(clave);
          const loTocoAlguien = precioEmitido !== undefined && precioEmitido !== precioEscrito;

          let precio = precioEscrito;
          if (!loTocoAlguien && preciosDeCatalogo.has(clave)) {
            precio = preciosDeCatalogo.get(clave);
            if (precio !== precioEscrito) {
              console.log(`  💰 ${clave}: precio actualizado (₡${precioEscrito} → ₡${precio})`);
            }
          }

          return {
            id: itemId ? Number(itemId) : undefined,
            reference: item.reference || item.item?.reference || '',
            description: item.description || item.name || '',
            quantity: Number(item.quantity) || 0,
            price: precio,
            tax: Array.isArray(item.tax) ? item.tax : []
          };
        }).filter(item => item.quantity > 0);

        // Actualizar factura en Alegra
        const updateResult = await this.alegraInvoiceService.updateInvoice(alegra_id, {
          items: updatedItems
        });

        if (!updateResult.success) {
          throw new Error('No se pudo actualizar la factura con los items editados en Alegra');
        }

        console.log(`✅ Factura ${alegra_id} actualizada exitosamente con items editados manualmente`);
        return { success: true, updated: itemsEditados.length };
      }

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

      // 2. Identificar productos que necesitan actualización de precios
      // Si actualizarPrecios es true, actualizamos todos los productos de la factura.
      // Si es false, no actualizamos ninguno.
      let productosParaActualizar = [];
      if (actualizarPrecios) {
        productosParaActualizar = currentItems.map(item => {
          const alegraItemId = item.item?.id || item.id;
          let ref = item.reference || item.item?.reference;
          if (!ref && alegraItemId) {
            const idStr = alegraItemId.toString();
            if (alegraIdToCodigoMap.has(idStr)) {
              ref = alegraIdToCodigoMap.get(idStr);
            }
          }
          return {
            alegraItemId,
            reference: ref
          };
        }).filter(p => p.alegraItemId);
      }

      const preciosActualizadosPorId = new Map();

      if (productosParaActualizar.length > 0) {
        console.log(`📦 ${productosParaActualizar.length} productos requieren actualización de precios`);

        // 3. Obtener precios actualizados de Alegra (batch para optimizar)
        const batchSize = 5; // Procesar de 5 en 5 para no saturar API

        for (let i = 0; i < productosParaActualizar.length; i += batchSize) {
          const batch = productosParaActualizar.slice(i, i + batchSize);

          await Promise.all(batch.map(async (prod) => {
            try {
              let precio = null;
              // Primero intentar obtener por ID de item de Alegra (más exacto)
              if (prod.alegraItemId) {
                precio = await this.alegraInvoiceService.getUpdatedPriceById(prod.alegraItemId);
              }
              // Fallback por referencia si no funcionó por ID
              if (precio === null && prod.reference) {
                precio = await this.alegraInvoiceService.getUpdatedPrice(prod.reference);
              }

              if (precio !== null) {
                preciosActualizadosPorId.set(prod.alegraItemId.toString(), precio);
                console.log(`  ✓ Precio actualizado para ID ${prod.alegraItemId} (${prod.reference || 'sin ref'}): ₡${precio}`);
              }
            } catch (error) {
              console.warn(`  ⚠️ No se pudo obtener precio para ID ${prod.alegraItemId}:`, error.message);
            }
          }));

          // Pequeña pausa entre batches para no saturar la API
          if (i + batchSize < productosParaActualizar.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      } else {
        console.log(`✅ No hay productos que requieran actualización de precios. Se continuará con el ajuste de faltantes.`);
      }

      // 4. Construir array de items actualizados
      const updatedItems = currentItems.map(item => {
        const alegraItemId = item.item?.id || item.id;
        const alegraItemIdStr = alegraItemId ? alegraItemId.toString() : '';

        // Intentar obtener la referencia de múltiples fuentes
        let itemReference = item.reference || item.item?.reference;

        // Si reference es null, intentar obtenerlo del mapa usando el ID de Alegra
        if (!itemReference && alegraItemId) {
          const idStr = alegraItemId.toString();
          if (alegraIdToCodigoMap.has(idStr)) {
            itemReference = alegraIdToCodigoMap.get(idStr);
            console.log(`  🔑 Match por ID de Alegra: ${alegraItemId} → Código ${itemReference}`);
          }
        }

        // Buscar ajuste por código de producto o ID
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

        // Obtener precio de catálogo actualizado (si está disponible en nuestro mapa)
        const precioNuevo = (actualizarPrecios && preciosActualizadosPorId.has(alegraItemIdStr))
          ? preciosActualizadosPorId.get(alegraItemIdStr)
          : item.price;

        if (preciosActualizadosPorId.has(alegraItemIdStr) && item.price !== precioNuevo) {
          console.log(`  💰 ${itemReference || alegraItemIdStr}: Precio actualizado (₡${item.price} → ₡${precioNuevo})`);
        }

        // Si el producto tiene ajustes
        if (ajuste) {
          // Calcular nueva cantidad según el estado del ajuste
          let nuevaCantidad = item.quantity;

          // Calcular cuánto hay que rebajar
          const cantidadPendiente = ajuste.cantidad_faltante - (ajuste.cantidad_entregada || 0);

          if (ajuste.estado === 'no_llego') {
            // No llegó nada → Rebajar todo lo faltante
            nuevaCantidad = Math.max(item.quantity - ajuste.cantidad_faltante, 0);
            console.log(`  🔴 ${itemReference || alegraItemIdStr}: NO LLEGÓ - Rebajando ${ajuste.cantidad_faltante} unidades (${item.quantity} → ${nuevaCantidad})`);
          } else if (ajuste.estado === 'parcial') {
            // Llegó parte → Rebajar lo pendiente
            nuevaCantidad = Math.max(item.quantity - cantidadPendiente, 0);
            console.log(`  🟡 ${itemReference || alegraItemIdStr}: PARCIAL - Rebajando ${cantidadPendiente} unidades (${item.quantity} → ${nuevaCantidad})`);
          } else if (ajuste.estado === 'completo') {
            // Todo llegó → No rebajar
            console.log(`  🟢 ${itemReference || alegraItemIdStr}: COMPLETO - Cantidad sin cambios (${item.quantity})`);
          }

          return {
            id: item.id,
            reference: itemReference || '',
            description: item.description || '',
            quantity: nuevaCantidad, // CANTIDAD AJUSTADA
            price: precioNuevo, // PRECIO ACTUALIZADO
            tax: item.tax,
            item: item.item
          };
        }

        return {
          id: item.id,
          reference: itemReference || '',
          description: item.description || '',
          quantity: item.quantity,
          price: precioNuevo,
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

      console.log(`✅ Factura ${alegra_id} actualizada con ${preciosActualizadosPorId.size} precios nuevos`);

      return {
        success: true,
        updated: preciosActualizadosPorId.size,
        preciosActualizados: Array.from(preciosActualizadosPorId.entries()).map(([alegraId, precio]) => ({
          alegraId,
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
      const { alegra_id, numero_factura, cliente_nombre, fecha_emision, ajustes, estado, items_editados, marcar_como_procesada, actualizar_precios } = invoiceData;

      console.log(`📋 Procesando factura individual: ${numero_factura}`);
      console.log(`📦 Ajustes recibidos:`, JSON.stringify(ajustes, null, 2));
      console.log(`📊 Total ajustes: ${ajustes?.length || 0}`);

      // Asegurar que la factura exista en la base de datos local
      let facturaLocal = await query('SELECT id FROM facturas WHERE alegra_id = $1', [parseInt(alegra_id)]);
      let facturaLocalId;

      if (facturaLocal.rows.length === 0) {
        console.log(`📝 Factura ${alegra_id} no existe en BD local al procesar, creándola desde Alegra...`);
        try {
          const alegraResult = await this.alegraInvoiceService.getInvoiceById(alegra_id);
          if (alegraResult.success && alegraResult.data) {
            const date = new Date(alegraResult.data.date);
            const startOfYear = new Date(date.getFullYear(), 0, 1);
            const dayOfYear = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
            const semanaDelAno = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);

            const nuevaFactura = await query(`
              INSERT INTO facturas (
                numero_factura, alegra_id, cliente_nombre, cliente_email,
                fecha_emision, semana, mes, ano, total
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              RETURNING id
            `, [
              alegraResult.data.numberTemplate?.fullNumber || alegraResult.data.numberTemplate?.formattedNumber || numero_factura || String(alegra_id),
              parseInt(alegra_id),
              alegraResult.data.client?.name || cliente_nombre || 'Cliente no especificado',
              alegraResult.data.client?.email || null,
              alegraResult.data.date,
              semanaDelAno,
              parseInt(alegraResult.data.date?.split('-')[1]) || 1,
              parseInt(alegraResult.data.date?.split('-')[0]) || 2026,
              parseFloat(alegraResult.data.total || 0)
            ]);
            facturaLocalId = nuevaFactura.rows[0].id;
            console.log(`✅ Factura creada localmente desde Alegra con ID: ${facturaLocalId}`);
          } else {
            throw new Error('No se pudo obtener factura de Alegra');
          }
        } catch (alegraError) {
          console.warn(`⚠️ Error obteniendo de Alegra, usando fallback de payload:`, alegraError.message);
          const date = new Date(fecha_emision || new Date());
          const startOfYear = new Date(date.getFullYear(), 0, 1);
          const dayOfYear = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
          const semanaDelAno = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);

          const nuevaFactura = await query(`
            INSERT INTO facturas (
              numero_factura, alegra_id, cliente_nombre,
              fecha_emision, semana, mes, ano, total
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
          `, [
            numero_factura || String(alegra_id),
            parseInt(alegra_id),
            cliente_nombre || 'Cliente no especificado',
            fecha_emision || new Date().toISOString(),
            semanaDelAno,
            parseInt(String(fecha_emision || '').split('-')[1]) || 1,
            parseInt(String(fecha_emision || '').split('-')[0]) || 2026,
            0
          ]);
          facturaLocalId = nuevaFactura.rows[0].id;
          console.log(`✅ Factura creada localmente (fallback payload) con ID: ${facturaLocalId}`);
        }
      } else {
        facturaLocalId = facturaLocal.rows[0].id;
      }

      // NUEVO: Actualizar precios y cantidades desde Alegra SOLO al procesar (marcar_como_procesada === true)
      let alegraResult = null;
      if (marcar_como_procesada) {
        if ((ajustes && ajustes.length > 0) || (items_editados && items_editados.length > 0)) {
          alegraResult = await this.updateInvoicePricesFromAlegra(alegra_id, ajustes, items_editados, actualizar_precios);
        }
      }

      // 1. Si requiere reimpresión o se indica marcar como procesada, guardar o actualizar en facturas_reimpresion
      const existeReimpresion = await query(`
        SELECT fr.id FROM facturas_reimpresion fr
        JOIN facturas fa ON fr.factura_id = fa.id
        WHERE fa.alegra_id = $1
      `, [alegra_id]);

      if (existeReimpresion.rows.length > 0 || estado.includes('requiere_reimpresion') || marcar_como_procesada) {
        if (existeReimpresion.rows.length > 0) {
          await query(`
            UPDATE facturas_reimpresion
            SET ajustes_realizados = $2,
                estado = $3,
                fecha_creacion = ${AHORA_CR_SQL},
                fecha_procesamiento = $4
            FROM facturas fa
            WHERE facturas_reimpresion.factura_id = fa.id
            AND fa.alegra_id = $1
          `, [
            alegra_id,
            JSON.stringify(ajustes),
            marcar_como_procesada ? 'procesada' : 'pendiente',
            marcar_como_procesada ? new Date() : null
          ]);
        } else {
          await query(`
            INSERT INTO facturas_reimpresion (factura_id, ajustes_realizados, estado, fecha_creacion, fecha_procesamiento)
            VALUES ($1, $2, $3, ${AHORA_CR_SQL}, $4)
          `, [
            facturaLocalId,
            JSON.stringify(ajustes),
            marcar_como_procesada ? 'procesada' : 'pendiente',
            marcar_como_procesada ? new Date() : null
          ]);
        }
      }

      // 2. Guardar ajustes locales temporales
      await this._saveAdjustments(alegra_id, ajustes);

      let procesamientoId = null;

      if (marcar_como_procesada) {
        // Solo registrar procesamiento final cuando se procesa de verdad
        const procesamiento = await query(`
          INSERT INTO procesamientos (
            total_facturas, facturas_para_historial, facturas_para_reimpresion,
            procesado_por, detalles
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [
          1,
          1,
          1,
          'Usuario Individual',
          JSON.stringify({
            factura_procesada: {
              alegra_id,
              numero_factura,
              cliente_nombre,
              fecha_emision,
              ajustes,
              estado,
              alegraResult
            }
          })
        ]);
        procesamientoId = procesamiento.rows[0].id;

        // 3. Marcar faltantes como procesados en DB local solo al finalizar
        await query(`
          UPDATE faltantes
          SET estado = 'procesado'
          FROM facturas fa
          WHERE faltantes.factura_id = fa.id
          AND fa.alegra_id = $1
        `, [alegra_id]);

        // 4. Actualizar estado de factura a procesado en DB local solo al finalizar
        await query(`
          UPDATE facturas
          SET estado_procesamiento = 'procesado'
          WHERE alegra_id = $1
        `, [alegra_id]);
      }

      console.log(`✅ Factura ${numero_factura} procesada (marcar_como_procesada: ${marcar_como_procesada})`);

      return {
        success: true,
        message: marcar_como_procesada
          ? `Factura ${numero_factura} procesada y actualizada en Alegra correctamente`
          : `Factura ${numero_factura} agregada a la cola de reimpresión`,
        data: {
          procesamiento_id: procesamientoId,
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

      // 3. Restaurar registro de reimpresión a pendiente
      const reimpresionActualizada = await query(`
        UPDATE facturas_reimpresion
        SET estado = 'pendiente',
            fecha_procesamiento = NULL
        WHERE facturas_reimpresion.factura_id IN (
          SELECT fa.id FROM facturas fa WHERE fa.alegra_id = $1
        )
        AND facturas_reimpresion.estado = 'procesada'
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
          reimpresion_restaurada: reimpresionActualizada.rows.length
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
        // item_id/producto_codigo (si llegan) se tratan siempre como
        // referencia, nunca como alegra_id.
        const referencia = faltante.referencia || faltante.item_id || faltante.producto_codigo || null;
        const alegraItemId = faltante.alegra_item_id || null;

        if (!referencia && !alegraItemId) {
          console.warn('⚠️ Faltante sin identificador:', faltante);
          continue;
        }

        const resuelto = await resolverProductoLocal({
          alegraId: alegraItemId,
          referencia,
          nombreFallback: faltante.nombre_producto
        });

        if (!resuelto) {
          console.warn(`⚠️ No se pudo resolver el producto (ref=${referencia}, alegraId=${alegraItemId}), se omite el faltante.`);
          continue;
        }

        const productoId = resuelto.productoId;

        const existingFaltante = await query(`
          SELECT id FROM faltantes 
          WHERE factura_id = $1 AND producto_id = $2
          LIMIT 1
        `, [facturaLocalId, productoId]);

        if (existingFaltante.rows.length > 0) {
          await query(`
            UPDATE faltantes
            SET cantidad_faltante = $1,
                tipo_faltante = $2,
                observaciones = $3,
                registrado_por = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
          `, [
            faltante.cantidad_faltante,
            faltante.tipo_faltante,
            faltante.observaciones || '',
            registradoPor,
            existingFaltante.rows[0].id
          ]);
        } else {
          await query(`
            INSERT INTO faltantes (
              factura_id, producto_id, cantidad_faltante, tipo_faltante,
              observaciones, registrado_por, estado
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')
          `, [
            facturaLocalId,
            productoId,
            faltante.cantidad_faltante,
            faltante.tipo_faltante,
            faltante.observaciones || '',
            registradoPor
          ]);
        }
      }

      // 3. Guardar observaciones adicionales si existen
      if (observacionesAdicionales) {
        await query(`
          UPDATE facturas
          SET observaciones_adicionales = $1
          WHERE id = $2
        `, [observacionesAdicionales, facturaLocalId]);
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
          const faltantesResult = await query(`
            SELECT fa.*, p.nombre as producto_nombre, p.codigo as producto_codigo
            FROM faltantes fa
            LEFT JOIN productos p ON fa.producto_id = p.id
            WHERE fa.factura_id = $1
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
          SELECT fa.*, p.nombre as producto_nombre, p.codigo as producto_codigo
          FROM faltantes fa
          LEFT JOIN productos p ON fa.producto_id = p.id
          WHERE fa.factura_id = $1
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

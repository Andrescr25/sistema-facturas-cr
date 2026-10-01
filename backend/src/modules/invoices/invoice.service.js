/**
 * Servicio de Negocio de Facturas
 * Coordina operaciones entre la BD local y la API de Alegra
 */

const { getInvoiceService: getAlegraInvoiceService, getProductService: getAlegraProductService } = require('../../integrations/alegra');
const DatabaseHelper = require('../../utils/database.helper');
const colaImpresion = require('../reprinting/colaImpresion');
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
   * Las facturas de la cola de impresión: ahora cuelgan de la factura propia
   * (migración independencia/032) y las arma reprinting/colaImpresion.js.
   */
  async getPendingReprintInvoices() {
    try {
      return await colaImpresion.listarPendientes();
    } catch (error) {
      console.error('❌ Error obteniendo facturas pendientes:', error);
      return { success: false, error: error.message };
    }
  }

  async getProcessedReprintInvoices() {
    try {
      return await colaImpresion.listarProcesadas();
    } catch (error) {
      console.error('❌ Error obteniendo facturas procesadas:', error);
      return { success: false, error: error.message };
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

      // Los faltantes guardados para esta factura: cuelgan de la factura
      // propia (migración independencia/032), que se busca por el id de Alegra.
      let faltantesMap = {};
      {
        const faltantesResult = await query(`
          SELECT
            f.tipo_faltante,
            f.cantidad_faltante,
            f.observaciones,
            p.referencia AS producto_codigo,
            p.alegra_id AS producto_alegra_id
          FROM faltantes f
          JOIN producto p ON p.id = f.producto_propio_id
          JOIN factura fa ON fa.id = f.factura_propia_id
          WHERE fa.alegra_id = $1::text
        `, [String(alegraIdInt)]);

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
      // La cola y los faltantes cuelgan de la factura PROPIA (migración 032);
      // este camino todavía llega con el id de Alegra y la busca por él.
      const existeReimpresion = await query(`
        SELECT fr.id FROM facturas_reimpresion fr
        JOIN factura f ON f.id = fr.factura_propia_id
        WHERE f.alegra_id = $1::text
      `, [String(alegra_id)]);

      if (existeReimpresion.rows.length > 0 || estado.includes('requiere_reimpresion') || marcar_como_procesada) {
        if (existeReimpresion.rows.length > 0) {
          await query(`
            UPDATE facturas_reimpresion
            SET ajustes_realizados = $2,
                estado = $3,
                fecha_creacion = CURRENT_TIMESTAMP,
                fecha_procesamiento = $4
            WHERE factura_propia_id = (SELECT id FROM factura WHERE alegra_id = $1::text)
          `, [
            String(alegra_id),
            JSON.stringify(ajustes),
            marcar_como_procesada ? 'procesada' : 'pendiente',
            marcar_como_procesada ? new Date() : null
          ]);
        } else {
          await query(`
            INSERT INTO facturas_reimpresion (factura_propia_id, ajustes_realizados, estado, fecha_creacion, fecha_procesamiento)
            VALUES ((SELECT id FROM factura WHERE alegra_id = $1::text), $2, $3, CURRENT_TIMESTAMP, $4)
          `, [
            String(alegra_id),
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
          WHERE factura_propia_id = (SELECT id FROM factura WHERE alegra_id = $1::text)
        `, [String(alegra_id)]);

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
        WHERE factura_propia_id = (SELECT id FROM factura WHERE alegra_id = $1::text)
        AND estado = 'procesado'
        RETURNING id
      `, [String(invoiceId)]);

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
        WHERE factura_propia_id = (SELECT id FROM factura WHERE alegra_id = $1::text)
        AND estado = 'procesada'
        RETURNING id
      `, [String(invoiceId)]);

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
          JOIN producto p ON p.id = f.producto_propio_id
          JOIN factura fa ON fa.id = f.factura_propia_id
          WHERE fa.alegra_id = $1::text
          AND p.referencia = $2
          AND f.estado = 'pendiente'
          LIMIT 1
        `, [String(alegraId), ajuste.producto_codigo]);

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

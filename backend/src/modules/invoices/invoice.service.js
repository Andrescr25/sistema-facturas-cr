/**
 * Servicio de Negocio de Facturas
 * Coordina operaciones entre la BD local y la API de Alegra
 */

const { getInvoiceService: getAlegraInvoiceService, getProductService: getAlegraProductService } = require('../../integrations/alegra');
const DatabaseHelper = require('../../utils/database.helper');
const { resolverProductoLocal } = require('../../utils/resolverProducto');
const { query, getClient } = require('../../../config/database');
const { referencia, idProducto, coincide, prepararAjustes, cantidadFinal, descuentoParaAlegra } = require('./ajustesImpresion');
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

  /** Precio de catálogo de cada item editado, indexado por su id de Alegra. */
  async _preciosDeCatalogo(items, exigirPrecios = false) {
    const ids = [...new Set(
      items.map(idProducto).filter(Boolean).map(String)
    )];
    const precios = new Map();

    for (const id of ids) {
      try {
        const precio = await this.alegraInvoiceService.getUpdatedPriceById(id);
        if (precio !== null && precio !== undefined && Number.isFinite(Number(precio)) && Number(precio) >= 0) {
          precios.set(id, Number(precio));
        } else if (exigirPrecios) {
          throw new Error(`No se pudo verificar el precio actual del producto ${id}. Intentá nuevamente antes de imprimir.`);
        }
      } catch (error) {
        if (exigirPrecios) throw error;
        console.warn(`  ⚠️ Sin precio de catálogo para ${id}:`, error.message);
      }
    }
    return precios;
  }

  async _codigosDeItems(items, ejecutar = query) {
    const ids = items.map(idProducto).filter(Boolean);
    if (!ids.length) return new Map();
    const resultado = await ejecutar(`SELECT alegra_id, codigo FROM productos WHERE alegra_id = ANY($1::int[])`, [ids]);
    return new Map(resultado.rows.map(row => [String(row.alegra_id), row.codigo]));
  }

  async updateInvoicePricesFromAlegra(alegra_id, ajustes = [], itemsEditados = null, actualizarPrecios = true, exigirPrecios = false) {
    try {
      const resultado = await this.alegraInvoiceService.getInvoiceById(alegra_id);
      if (!resultado.success || !resultado.data) throw new Error('No se pudo obtener la factura de Alegra');
      const actuales = resultado.data.items || [];
      let items;

      if (Array.isArray(itemsEditados)) {
        // Una lista vacía es una edición vacía; nunca vuelve a usar la factura original.
        items = itemsEditados.map(item => {
          const actual = actuales.find(a => String(idProducto(a)) === String(idProducto(item)));
          return {
            ...item,
            discount: item.discount ?? actual?.discount ?? 0,
            tax: item.tax ?? actual?.tax ?? [],
            // Los clientes anteriores no mandaban la bandera. Para ellos se
            // conserva la comparación con el precio que tenía la factura.
            precio_editado: item.precio_editado ?? (actual && Number(actual.price) !== Number(item.price))
          };
        });
      } else {
        const codigos = await this._codigosDeItems(actuales);
        const preparados = prepararAjustes(actuales, ajustes, ajustes, codigos);
        items = [...actuales];
        for (const ajuste of preparados) {
          if (!items.some(item => coincide(item, ajuste, codigos))) items.push(ajuste.item_original);
        }
        items = items.map(item => {
          const ajuste = preparados.find(a => coincide(item, a, codigos));
          return {
            ...item,
            reference: referencia(item.reference ?? item.item?.reference) || codigos.get(String(idProducto(item))) || '',
            quantity: ajuste ? cantidadFinal(ajuste) : item.quantity,
            precio_editado: false
          };
        });
      }

      if (items.some(item => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0 ||
          !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
        throw new Error('Las cantidades y precios deben ser números mayores o iguales a cero.');
      }
      items = items.filter(item => Number(item.quantity) > 0);
      if (!items.length) throw new Error('La factura debe conservar al menos un producto entregado. Revisá el pedido antes de imprimir.');

      const precios = actualizarPrecios ? await this._preciosDeCatalogo(items.filter(item => !item.precio_editado), exigirPrecios) : new Map();
      const updatedItems = items.map(item => {
        const id = idProducto(item);
        const precio = !item.precio_editado && precios.has(String(id)) ? Number(precios.get(String(id))) : Number(item.price);
        if (!Number.isFinite(precio) || precio < 0) throw new Error(`Precio inválido para el producto ${id}.`);
        return {
          id: id == null ? undefined : Number(id),
          reference: referencia(item.reference ?? item.item?.reference),
          description: item.description || item.name || '',
          quantity: Number(item.quantity),
          price: precio,
          discount: descuentoParaAlegra(item, actuales),
          tax: Array.isArray(item.tax) ? item.tax : item.tax ? [item.tax] : []
        };
      });
      const actualizado = await this.alegraInvoiceService.updateInvoice(alegra_id, { items: updatedItems });
      // `error` es el texto de axios ("Request failed with status code 400");
      // el motivo que dio Alegra viene en `data.message` y es el que sirve en pantalla.
      if (!actualizado.success) throw new Error(actualizado.data?.message || actualizado.error || 'No se pudo actualizar la factura en Alegra');
      return { success: true, updated: updatedItems.length, total: actualizado.data?.total };
    } catch (error) {
      console.error('Error ajustando factura:', error.message);
      return { success: false, error: error.message, updated: 0 };
    }
  }

  /**
   * Procesar factura individual
   */
  async processIndividualInvoice(invoiceData) {
    let client, enTransaccion = false;
    try {
      const { alegra_id, numero_factura, cliente_nombre, fecha_emision, estado = '',
        items_editados, marcar_como_procesada = false, actualizar_precios = false } = invoiceData;
      let ajustes = invoiceData.ajustes || [];
      const id = Number(alegra_id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('ID de factura inválido');
      if (Array.isArray(items_editados)) {
        if (items_editados.some(item => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0 ||
            !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
          throw new Error('Las cantidades y precios deben ser números mayores o iguales a cero.');
        }
        if (!items_editados.some(item => Number(item.quantity) > 0)) {
          throw new Error('La factura debe conservar al menos un producto entregado. Revisá el pedido antes de imprimir.');
        }
      }
      client = await getClient();
      const ejecutar = (sql, params) => client.query(sql, params);
      // Dos clics o un reintento comparten el mismo pedido y no lo rebajan dos veces.
      await ejecutar('BEGIN');
      enTransaccion = true;
      await ejecutar('SELECT pg_advisory_xact_lock(71308, $1::int)', [id]);
      const local = await ejecutar('SELECT id FROM facturas WHERE alegra_id = $1 ORDER BY id DESC LIMIT 1', [id]);
      let facturaLocalId = local.rows[0]?.id;
      if (!facturaLocalId) {
        const r = await this.alegraInvoiceService.getInvoiceById(alegra_id);
        if (!r.success || !r.data) throw new Error('No se pudo obtener factura de Alegra');
        const fecha = r.data.date || fecha_emision;
        const [ano, mes] = String(fecha).split('-').map(Number);
        const creada = await ejecutar(`
          INSERT INTO facturas (numero_factura, alegra_id, cliente_nombre, cliente_email,
            fecha_emision, semana, mes, ano, total)
          VALUES ($1, $2, $3, $4, $5, EXTRACT(WEEK FROM $5::date), $6, $7, $8) RETURNING id
        `, [numero_factura, id, r.data.client?.name || cliente_nombre, r.data.client?.email || null,
          fecha, mes, ano, r.data.total || 0]);
        facturaLocalId = creada.rows[0].id;
      }
      const cola = await ejecutar(`SELECT id, estado, ajustes_realizados, categoria FROM facturas_reimpresion
        WHERE factura_id = $1 ORDER BY fecha_creacion DESC NULLS LAST, id DESC LIMIT 1`, [facturaLocalId]);
      const anterior = cola.rows[0];
      if (marcar_como_procesada && anterior?.estado === 'procesada') {
        await ejecutar('COMMIT');
        enTransaccion = false;
        return { success: true, message: `Factura ${numero_factura} ya procesada`, data: { factura_procesada: numero_factura } };
      }
      if (ajustes.length) {
        const r = await this.alegraInvoiceService.getInvoiceById(alegra_id);
        if (!r.success || !r.data) throw new Error('No se pudo obtener la factura para verificar los faltantes');
        const guardados = typeof anterior?.ajustes_realizados === 'string'
          ? JSON.parse(anterior.ajustes_realizados) : anterior?.ajustes_realizados || [];
        const codigos = await this._codigosDeItems(r.data.items || [], ejecutar);
        ajustes = prepararAjustes(r.data.items || [], ajustes, guardados, codigos);
        if (Array.isArray(items_editados)) {
          ajustes = ajustes.map(ajuste => ({ ...ajuste,
            cantidad_final_manual: Number(items_editados.find(item => coincide(item, ajuste, codigos))?.quantity ?? 0)
          }));
        }
        ajustes.forEach(cantidadFinal);
      }

      // Guardar el pedido original ANTES de escribir en Alegra. Si la respuesta
      // se pierde, el reintento calcula las mismas cantidades absolutas.
      if (anterior) {
        await ejecutar(`UPDATE facturas_reimpresion SET ajustes_realizados = $2,
          estado = 'pendiente', fecha_procesamiento = NULL,
          fecha_creacion = CASE WHEN $3::boolean THEN fecha_creacion ELSE ${AHORA_CR_SQL} END
          WHERE id = $1`, [anterior.id, JSON.stringify(ajustes), marcar_como_procesada]);
      } else if (estado.includes('requiere_reimpresion') || marcar_como_procesada) {
        await ejecutar(`INSERT INTO facturas_reimpresion
          (factura_id, ajustes_realizados, estado, fecha_creacion)
          VALUES ($1, $2, 'pendiente', ${AHORA_CR_SQL})`, [facturaLocalId, JSON.stringify(ajustes)]);
      }
      await this._saveAdjustments(alegra_id, ajustes, ejecutar);
      await ejecutar('COMMIT');
      enTransaccion = false;

      let procesamientoId = null;
      if (marcar_como_procesada) {
        // El pooler de Supabase usa modo transacción: los bloqueos de sesión
        // no son seguros. Volver a tomar el bloqueo dentro de esta transacción
        // y comprobar si otro clic terminó mientras se guardaba la copia.
        await ejecutar('BEGIN');
        enTransaccion = true;
        await ejecutar('SELECT pg_advisory_xact_lock(71308, $1::int)', [id]);
        const estadoActual = await ejecutar(`SELECT estado FROM facturas_reimpresion
          WHERE factura_id = $1 ORDER BY fecha_creacion DESC NULLS LAST, id DESC LIMIT 1`, [facturaLocalId]);
        if (estadoActual.rows[0]?.estado === 'procesada') {
          await ejecutar('COMMIT');
          enTransaccion = false;
          return { success: true, message: `Factura ${numero_factura} ya procesada`, data: { factura_procesada: numero_factura } };
        }
        await ejecutar('UPDATE facturas_reimpresion SET ajustes_realizados = $2 WHERE factura_id = $1', [facturaLocalId, JSON.stringify(ajustes)]);
        let resultadoAlegra = null;
        if (actualizar_precios || ajustes.length || Array.isArray(items_editados)) {
          resultadoAlegra = await this.updateInvoicePricesFromAlegra(alegra_id, ajustes, items_editados, actualizar_precios, true);
          if (!resultadoAlegra.success) {
            await ejecutar('COMMIT');
            enTransaccion = false;
            throw new Error(resultadoAlegra.error);
          }
        }
        // Una factura solo llega a Historial después de confirmar la modificación.
        await ejecutar(`UPDATE facturas_reimpresion SET estado = 'procesada',
          fecha_procesamiento = ${AHORA_CR_SQL} WHERE factura_id = $1`, [facturaLocalId]);
        const procesamiento = await ejecutar(`INSERT INTO procesamientos
          (total_facturas, facturas_para_historial, facturas_para_reimpresion, procesado_por, detalles)
          VALUES (1, 1, 1, 'Usuario Individual', $1) RETURNING id`,
          [JSON.stringify({ factura_procesada: { alegra_id, numero_factura, ajustes, resultadoAlegra } })]);
        procesamientoId = procesamiento.rows[0].id;
        await ejecutar("UPDATE faltantes SET estado = 'procesado' WHERE factura_id = $1", [facturaLocalId]);
        await ejecutar(`UPDATE facturas SET estado_procesamiento = 'procesado',
          total = COALESCE($2::numeric, total) WHERE id = $1`, [facturaLocalId, resultadoAlegra?.total ?? null]);
        await ejecutar('COMMIT');
        enTransaccion = false;
      }
      return {
        success: true,
        message: marcar_como_procesada ? `Factura ${numero_factura} procesada y actualizada correctamente` : `Factura ${numero_factura} agregada a la cola de impresión`,
        data: { procesamiento_id: procesamientoId, factura_procesada: numero_factura, ajustes_guardados: ajustes.length }
      };
    } catch (error) {
      if (enTransaccion) await client.query('ROLLBACK').catch(() => {});
      console.error('Error procesando factura:', error.message);
      return { success: false, error: error.message };
    } finally {
      client?.release();
    }
  }

  /**
   * Recuperar factura procesada
   */
  async recoverProcessedInvoice(invoiceId) {
    let client, enTransaccion = false;
    try {
      const id = Number(invoiceId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('ID de factura inválido');
      client = await getClient();
      const ejecutar = (sql, params) => client.query(sql, params);
      await ejecutar('BEGIN');
      enTransaccion = true;
      await ejecutar('SELECT pg_advisory_xact_lock(71308, $1::int)', [id]);
      console.log(`🔄 Recuperando factura ${invoiceId}...`);

      // 1. Cambiar estado de faltantes
      const faltantesRecuperados = await ejecutar(`
        UPDATE faltantes
        SET estado = 'pendiente'
        FROM facturas fa
        WHERE faltantes.factura_id = fa.id
        AND fa.alegra_id = $1
        AND faltantes.estado = 'procesado'
        RETURNING faltantes.id
      `, [invoiceId]);

      // 2. Cambiar estado de factura
      await ejecutar(`
        UPDATE facturas
        SET estado_procesamiento = 'pendiente'
        WHERE alegra_id = $1
      `, [invoiceId]);

      // 3. Restaurar registro de reimpresión a pendiente
      const reimpresionActualizada = await ejecutar(`
        UPDATE facturas_reimpresion
        SET estado = 'pendiente',
            fecha_procesamiento = NULL
        WHERE facturas_reimpresion.factura_id IN (
          SELECT fa.id FROM facturas fa WHERE fa.alegra_id = $1
        )
        AND facturas_reimpresion.estado = 'procesada'
        RETURNING facturas_reimpresion.id
      `, [invoiceId]);

      await ejecutar('COMMIT');
      enTransaccion = false;
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
      if (enTransaccion) await client.query('ROLLBACK').catch(() => {});
      console.error('Error recuperando factura:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client?.release();
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
  async _saveAdjustments(alegraId, ajustes, ejecutar = query) {
    for (const ajuste of ajustes) {
      try {
        const faltanteResult = await ejecutar(`
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

          await ejecutar(`
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
        throw error;
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

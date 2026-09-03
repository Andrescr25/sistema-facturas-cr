/**
 * Warehouse Module - Service
 * Lógica de negocio para operaciones de bodega/almacén
 */

const { getInvoiceService, getClient } = require('../../integrations/alegra');
const invoiceService = getInvoiceService();
const client = getClient();
const { query } = require('../../../config/database');

// Sistema de caché para facturas de bodega
const bodegaFacturasCache = {
  data: null,
  timestamp: null,
  TTL: 5 * 60 * 1000 // 5 minutos en milisegundos
};

/**
 * Normaliza una fecha a formato YYYY-MM-DD
 */
function normalizeDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.includes('T')) {
    return value.split('T')[0];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().split('T')[0];
}

/**
 * Calcula el número de semana del año para una fecha
 */
function calculateWeekNumberFromDate(dateString) {
  if (!dateString) return 1;
  const fecha = new Date(dateString);
  if (Number.isNaN(fecha.getTime())) return 1;
  const startOfYear = new Date(fecha.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((fecha - startOfYear) / (24 * 60 * 60 * 1000));
  return Math.max(1, Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7));
}

/**
 * Inserta o actualiza una factura desde Alegra en la BD local
 */
async function upsertFacturaDesdeAlegra(invoice) {
  if (!invoice) return null;

  const numeroFactura =
    invoice.numberTemplate?.fullNumber ||
    invoice.numero_factura ||
    invoice.numberTemplate?.formattedNumber ||
    invoice.numero_completo ||
    invoice.alegra_id?.toString();

  if (!numeroFactura) {
    console.warn('⚠️ No se pudo determinar numero_factura para upsert:', invoice);
    return null;
  }

  const fechaEmision = normalizeDateOnly(invoice.fecha_emision || invoice.date);
  const semana = invoice.semana || calculateWeekNumberFromDate(fechaEmision);
  const mes = invoice.mes || (fechaEmision ? parseInt(fechaEmision.split('-')[1], 10) : null) || 1;
  const ano = invoice.ano || (fechaEmision ? parseInt(fechaEmision.split('-')[0], 10) : null) || new Date().getFullYear();
  const total = parseFloat(invoice.total || invoice.subtotal || 0);

  const values = [
    numeroFactura,
    parseInt(invoice.alegra_id || invoice.id, 10),
    invoice.cliente_nombre || invoice.client?.name || 'Cliente no especificado',
    invoice.cliente_email || invoice.client?.email || null,
    fechaEmision,
    semana,
    mes,
    ano,
    total
  ];

  const result = await query(`
    INSERT INTO facturas (
      numero_factura, alegra_id, cliente_nombre, cliente_email,
      fecha_emision, semana, mes, ano, total, estado_bodega
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, 'pendiente')
    ON CONFLICT (alegra_id) DO UPDATE SET
      numero_factura = EXCLUDED.numero_factura,
      cliente_nombre = EXCLUDED.cliente_nombre,
      cliente_email = EXCLUDED.cliente_email,
      fecha_emision = EXCLUDED.fecha_emision,
      semana = EXCLUDED.semana,
      mes = EXCLUDED.mes,
      ano = EXCLUDED.ano,
      total = EXCLUDED.total
      -- estado_bodega no se toca: con el conflicto en alegra_id (la
      -- identidad real de la factura) esta fila ya es la misma factura,
      -- nunca una distinta reusando el mismo numero.
    RETURNING *
  `, values);

  return result.rows[0] || null;
}

/**
 * Invalida el caché de facturas de bodega
 */
function invalidateCache() {
  bodegaFacturasCache.data = null;
  bodegaFacturasCache.timestamp = null;
  console.log('🔄 Caché de facturas de bodega invalidado');
}

/**
 * Obtiene las facturas para el módulo de bodega
 */
/**
 * Deja anotado en la base que estas facturas se anularon en Alegra.
 *
 * POR QUÉ ACÁ Y NO EN UN PROCESO APARTE
 * Bodega ya se enteraba de la anulación —filtra las `void` y no las alista—
 * pero no lo escribía en ningún lado, así que el resto del sistema seguía
 * sin saberlo. Reporte Clientes lee solo de la base local y nunca le
 * pregunta a Alegra: por eso una factura anulada seguía apareciendo con sus
 * faltantes pendientes, como si hubiera que alistarla.
 *
 * Pasó de verdad con la 001000014828 del gimnasio de Palmares: anulada en
 * Alegra el 2 de setiembre y todavía en el reporte, al lado de la
 * electrónica del mismo cliente. Parecía un duplicado y no lo era — eran dos
 * ventas distintas, una de ellas ya anulada.
 *
 * Esta corrida ya trae el estado de Alegra, así que anotarlo no cuesta ni
 * una petición más. Solo se tocan las facturas que ya existen en la base:
 * una anulada que nunca llegó a registrarse no tiene nada que corregir.
 */
async function marcarAnuladasEnLocal(invoicesAnuladas) {
  const ids = invoicesAnuladas
    .map((f) => parseInt(f.id, 10))
    .filter((id) => Number.isInteger(id));
  if (ids.length === 0) return 0;

  const r = await query(`
    UPDATE facturas
    SET estado_bodega = 'anulada'
    WHERE alegra_id = ANY($1::int[])
      AND estado_bodega IS DISTINCT FROM 'anulada'
    RETURNING alegra_id, numero_factura;
  `, [ids]);

  for (const fila of r.rows) {
    console.log(`   ↳ factura ${fila.numero_factura} marcada como anulada en la base`);
  }
  return r.rows.length;
}


async function getFacturasBodega({ dias = 30, limit = 40, forceRefresh = false }) {
  // Verificar si hay datos en caché válidos
  const now = new Date();
  const cacheIsValid = !forceRefresh &&
                      bodegaFacturasCache.data &&
                      bodegaFacturasCache.timestamp &&
                      (now.getTime() - bodegaFacturasCache.timestamp) < bodegaFacturasCache.TTL;

  if (cacheIsValid) {
    console.log(`📦 Sirviendo facturas de bodega desde caché (${Math.round((now.getTime() - bodegaFacturasCache.timestamp) / 1000)}s desde última actualización)`);
    return bodegaFacturasCache.data;
  }

  const endDate = normalizeDateOnly(now.toISOString());
  const startDateObj = new Date(now);
  startDateObj.setDate(startDateObj.getDate() - dias);
  const startDate = startDateObj.toISOString().split('T')[0];

  console.log(`📦 Sincronizando facturas de Alegra para bodega (${startDate} → ${endDate}, límite ${limit})`);

  const invoicesRaw = [];
  let fetched = 0;
  let start = 0;

  while (fetched < limit) {
    const pageLimit = Math.min(30, limit - fetched);

    try {
      // timeout explícito a 60s: el cliente compartido usa 30s por defecto
      // (alegra.config.js), pero esta sincronización masiva por rango de
      // fechas necesitaba los 60s que tenía el axios del servicio legacy.
      const response = await client.requestWithRetry(
        () => client.api.get('/invoices', {
          params: {
            start_date: startDate,
            end_date: endDate,
            start,
            limit: pageLimit,
            metadata: true,
            order_field: 'date',
            order_direction: 'DESC'
          },
          timeout: 60000
        }),
        3,
        1000,
        { metodo: 'GET' }
      );

      const pageData = response.data?.data || response.data || [];
      if (!Array.isArray(pageData) || pageData.length === 0) {
        break;
      }

      invoicesRaw.push(...pageData);
      fetched += pageData.length;
      if (pageData.length < pageLimit) {
        break;
      }
      start += pageLimit;

      if (fetched < limit) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      if (error.response?.status === 500) {
        console.warn(`⚠️ Alegra API error 500 al obtener página ${start}, continuando con lo obtenido...`);
        break;
      }

      if (error.code === 'ECONNABORTED') {
        console.error(`❌ Error de timeout obteniendo facturas después de múltiples reintentos`);
        console.error(`📊 Facturas obtenidas antes del timeout: ${invoicesRaw.length}`);

        if (invoicesRaw.length > 0) {
          console.log(`✅ Continuando con ${invoicesRaw.length} facturas obtenidas antes del error`);
          break;
        }
      }

      throw error;
    }
  }

  console.log(`✅ ${invoicesRaw.length} facturas sincronizadas desde Alegra`);

  // Una factura anulada en Alegra no se alista. Hasta ahora acá no se
  // filtraba por estado, así que las copias que deja la conversión a
  // electrónica seguían apareciendo como orden pendiente incluso después de
  // anularlas — y lo mismo cualquier factura que se anule por otro motivo.
  const invoicesVigentes = invoicesRaw.filter((invoice) => invoice.status !== 'void');
  const invoicesAnuladas = invoicesRaw.filter((invoice) => invoice.status === 'void');
  if (invoicesAnuladas.length > 0) {
    console.log(`   ↳ ${invoicesAnuladas.length} anulada(s) en Alegra, fuera de la lista de bodega`);
    await marcarAnuladasEnLocal(invoicesAnuladas);
  }

  const invoicesNormalized = invoicesVigentes.map((invoice) => invoiceService.transformInvoiceForFrontend(invoice));

  // Actualizar/insertar en BD local para mantener tracking de estados
  await Promise.all(invoicesNormalized.map((invoice) => upsertFacturaDesdeAlegra(invoice)));

  const numerosFactura = invoicesNormalized.map((inv) => inv.numero_factura);
  let estadosMap = new Map();
  let faltantesMap = new Map();

  if (numerosFactura.length > 0) {
    const estadosResult = await query(`
      SELECT numero_factura, estado_bodega, estado_procesamiento, observaciones_adicionales, id, alegra_id
      FROM facturas
      WHERE numero_factura = ANY($1::text[])
    `, [numerosFactura]);

    estadosMap = new Map(estadosResult.rows.map((row) => [row.numero_factura, row]));

    const faltantesResult = await query(`
      SELECT
        fa.alegra_id,
        SUM(CASE WHEN f.estado = 'pendiente' THEN 1 ELSE 0 END) AS faltantes_pendientes,
        SUM(CASE WHEN f.estado = 'pendiente' THEN f.cantidad_faltante ELSE 0 END) AS cantidad_pendiente
      FROM faltantes f
      JOIN facturas fa ON f.factura_id = fa.id
      WHERE fa.numero_factura = ANY($1::text[])
      GROUP BY fa.alegra_id
    `, [numerosFactura]);

    faltantesMap = new Map(faltantesResult.rows.map((row) => [row.alegra_id?.toString(), row]));
  }

  const enriched = invoicesNormalized.map((invoice) => {
    const estadoLocal = estadosMap.get(invoice.numero_factura);
    const faltanteInfo = faltantesMap.get(invoice.alegra_id?.toString());

    return {
      ...invoice,
      estado_bodega: estadoLocal?.estado_bodega || 'pendiente',
      estado_procesamiento: estadoLocal?.estado_procesamiento || 'pendiente',
      observaciones_adicionales: estadoLocal?.observaciones_adicionales || null,
      factura_local_id: estadoLocal?.id || null,
      faltantes_pendientes: parseInt(faltanteInfo?.faltantes_pendientes || 0, 10),
      cantidad_faltante: parseInt(faltanteInfo?.cantidad_pendiente || 0, 10)
    };
  });

  const pendientes = enriched.filter((inv) => inv.estado_bodega !== 'procesado');
  const listas = enriched.filter((inv) => inv.estado_bodega === 'procesado');

  const response = {
    success: true,
    data: {
      pendientes,
      listas,
      resumen: {
        total: enriched.length,
        pendientes: pendientes.length,
        listas: listas.length
      }
    },
    metadata: {
      filtros: { dias, limit, startDate, endDate },
      lastSync: new Date().toISOString()
    }
  };

  // Guardar en caché
  bodegaFacturasCache.data = response;
  bodegaFacturasCache.timestamp = now.getTime();
  console.log(`💾 Facturas de bodega guardadas en caché (válido por ${bodegaFacturasCache.TTL / 60000} minutos)`);

  return response;
}

/**
 * Actualiza el estado de una factura en bodega
 */
async function actualizarEstadoFactura(alegraId, { estado, observaciones, enviarAImpresion }) {
  if (!['pendiente', 'procesado'].includes(estado)) {
    throw new Error('Estado inválido. Usa "pendiente" o "procesado".');
  }

  let facturaLocal = await query('SELECT * FROM facturas WHERE alegra_id = $1 LIMIT 1', [parseInt(alegraId, 10)]);

  if (facturaLocal.rows.length === 0) {
    console.log(`ℹ️ Factura ${alegraId} no existe localmente. Recuperando desde Alegra...`);
    const detalle = await invoiceService.getInvoiceById(alegraId);
    if (!detalle.success) {
      throw new Error('Factura no encontrada en Alegra');
    }
    const transformada = invoiceService.transformInvoiceForFrontend(detalle.data);
    await upsertFacturaDesdeAlegra(transformada);
    facturaLocal = await query('SELECT * FROM facturas WHERE alegra_id = $1 LIMIT 1', [parseInt(alegraId, 10)]);
  }

  const updateResult = await query(`
    UPDATE facturas
    SET estado_bodega = $1,
        -- Cuándo salió de bodega, para la línea de tiempo que ve el cliente
        -- en el portal. Al volver a 'pendiente' se borra: si no, un pedido
        -- reabierto seguiría mostrándole "Listo para envío" con su fecha.
        --
        -- El "¿es procesado?" viaja en su PROPIO parámetro ($2) y no se
        -- vuelve a comparar $1 acá. Reusar $1 en los dos lugares rompía la
        -- consulta entera: en la asignación Postgres lo deduce varchar (por
        -- la columna) y en la comparación contra un literal lo deduce text,
        -- y aborta con "inconsistent types deduced for parameter $1"
        -- (SQLSTATE 42P08) antes de tocar la tabla. Castear no alcanza —
        -- cada uso sigue tirando para su lado; hay que desacoplarlos.
        bodega_procesado_en = CASE WHEN $2::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
        observaciones_adicionales = CASE
          WHEN $3::text IS NULL THEN observaciones_adicionales
          ELSE $3::text
        END
    WHERE alegra_id = $4
    RETURNING *
  `, [estado, estado === 'procesado', observaciones, parseInt(alegraId, 10)]);

  console.log(`✅ Factura ${alegraId} marcada como ${estado} en BODEGA`);

  // Enviar a cola de impresión si se solicita
  // NOTA: categoria = 'sin_pendientes' permite omitir ajuste de precios en centro de impresión
  if (estado === 'procesado' && enviarAImpresion && facturaLocal.rows.length > 0) {
    const facturaId = facturaLocal.rows[0].id;
    
    const existeReimpresion = await query(`
      SELECT id FROM facturas_reimpresion WHERE factura_id = $1
    `, [facturaId]);

    if (existeReimpresion.rows.length === 0) {
      // Insertar como 'pendiente' con categoría 'sin_pendientes'
      await query(`
        INSERT INTO facturas_reimpresion (factura_id, ajustes_realizados, estado, categoria, total_ajustes, fecha_creacion)
        VALUES ($1, '[]'::jsonb, 'pendiente', 'sin_pendientes', 0, CURRENT_TIMESTAMP)
      `, [facturaId]);
      console.log(`🖨️ Factura ${alegraId} agregada a cola de impresión (sin_pendientes)`);
    } else {
      // Actualizar existente a pendiente
      await query(`
        UPDATE facturas_reimpresion 
        SET estado = 'pendiente', 
            ajustes_realizados = '[]'::jsonb,
            categoria = 'sin_pendientes',
            total_ajustes = 0,
            fecha_creacion = CURRENT_TIMESTAMP,
            fecha_procesamiento = NULL
        WHERE factura_id = $1
      `, [facturaId]);
      console.log(`🖨️ Factura ${alegraId} actualizada en cola de impresión (sin_pendientes)`);
    }
  }

  // Invalidar caché
  invalidateCache();

  return {
    success: true,
    data: updateResult.rows[0],
    enviada_a_impresion: estado === 'procesado' && enviarAImpresion
  };
}

/**
 * Obtiene el caché actual (para fallback en caso de error)
 */
function getCachedData() {
  if (bodegaFacturasCache.data && bodegaFacturasCache.timestamp) {
    const cacheAge = Math.round((Date.now() - bodegaFacturasCache.timestamp) / 1000);
    return {
      ...bodegaFacturasCache.data,
      _fallback: true,
      _cacheAge: cacheAge,
      _warning: 'Datos del caché debido a que Alegra no está disponible'
    };
  }
  return null;
}

module.exports = {
  // Exportada para poder probarla: es la que evita que una factura anulada
  // siga apareciendo como trabajo pendiente.
  marcarAnuladasEnLocal,
  getFacturasBodega,
  actualizarEstadoFactura,
  invalidateCache,
  getCachedData,
  upsertFacturaDesdeAlegra
};

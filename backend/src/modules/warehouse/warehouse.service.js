/**
 * Warehouse Module - Service
 * Lógica de negocio para operaciones de bodega/almacén
 */

const { getInvoiceService, getClient } = require('../../integrations/alegra');
const invoiceService = getInvoiceService();
const client = getClient();
const { query } = require('../../../config/database');
const { hoyEnCostaRica } = require('../../utils/fechaCR');

/**
 * LO DE ALEGRA SE GUARDA; LO NUESTRO SE LEE SIEMPRE.
 *
 * Antes la caché guardaba la respuesta ENTERA —facturas de Alegra con sus
 * estados de bodega pegados— y cada factura despachada la invalidaba. Como se
 * despacha una tras otra, casi cada apertura de la pantalla terminaba en una
 * sincronización completa con Alegra (6-10 s en un buen momento; con Alegra
 * lenta, 60 s por página × 4 intentos). Ese era el "timeout al sincronizar"
 * del teléfono: el navegador corta a los 3 minutos.
 *
 * Ahora la caché guarda solo lo que viene de Alegra (las facturas y sus
 * productos), por ventana de días; los estados, los faltantes y la hora de
 * despacho se leen de la base en cada pedido, que es barato. Despachar una
 * factura ya no obliga a volver a preguntarle nada a Alegra.
 *
 * Y el teléfono NO espera a Alegra: con la caché vencida se le contesta con
 * lo guardado y se actualiza por detrás (`actualizando: true`). Solo espera
 * la primera vez de cada ventana o cuando alguien aprieta "Actualizar". Si ya
 * hay una sincronización en curso, las demás peticiones se cuelgan de ELLA en
 * vez de lanzar otra: varios teléfonos abriendo a la vez eran varias
 * sincronizaciones en paralelo, y Alegra respondía limitando peticiones.
 */
const FRESCA_MS = 2 * 60 * 1000;
const TIMEOUT_PAGINA_MS = 25000;
const REINTENTOS_PAGINA = 2;
const cacheAlegra = new Map(); // `${dias}:${limit}` → { facturas, timestamp }
const enCurso = new Map();     // `${dias}:${limit}` → Promise

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
  cacheAlegra.clear();
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


/** El día `n` días antes de `dia` (YYYY-MM-DD), sin pasar por la hora del servidor. */
function diaMenos(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Trae de Alegra las facturas de la ventana, deja anotadas las anuladas y
 * registra las vigentes en la base. Es la parte lenta: corre una vez por
 * ventana cada tanto, no en cada pedido.
 */
async function sincronizarConAlegra({ dias, limit }) {
  const endDate = hoyEnCostaRica();
  const startDate = diaMenos(endDate, dias);
  console.log(`📦 Sincronizando facturas de Alegra para bodega (${startDate} → ${endDate}, límite ${limit})`);

  const invoicesRaw = [];
  let fetched = 0;
  let start = 0;

  while (fetched < limit) {
    const pageLimit = Math.min(30, limit - fetched);
    try {
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
          timeout: TIMEOUT_PAGINA_MS
        }),
        REINTENTOS_PAGINA,
        1000,
        { metodo: 'GET' }
      );

      const pageData = response.data?.data || response.data || [];
      if (!Array.isArray(pageData) || pageData.length === 0) break;

      invoicesRaw.push(...pageData);
      fetched += pageData.length;
      if (pageData.length < pageLimit) break;
      start += pageLimit;
      if (fetched < limit) await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      // Con algo ya traído, se sigue con eso: una lista corta es mejor que
      // ninguna. Sin nada, el error sube.
      if (invoicesRaw.length > 0) {
        console.warn(`⚠️ Alegra falló en la página ${start} (${error.code || error.response?.status || error.message}); se sigue con ${invoicesRaw.length} facturas`);
        break;
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

  const facturas = invoicesVigentes.map((invoice) => invoiceService.transformInvoiceForFrontend(invoice));
  await Promise.all(facturas.map((invoice) => upsertFacturaDesdeAlegra(invoice)));
  return facturas;
}

/**
 * Las facturas de Alegra de una ventana: de la caché si está fresca; si
 * venció, la vieja al toque y una actualización por detrás; si no hay nada
 * (o se pidió forzar), se espera la sincronización. Nunca dos sincronizaciones
 * de la misma ventana a la vez.
 */
async function facturasDeAlegra({ dias, limit, forceRefresh }) {
  const clave = `${dias}:${limit}`;
  const guardada = cacheAlegra.get(clave);

  const sincronizar = () => {
    if (!enCurso.has(clave)) {
      const promesa = sincronizarConAlegra({ dias, limit })
        .then((facturas) => {
          cacheAlegra.set(clave, { facturas, timestamp: Date.now() });
          return facturas;
        })
        .finally(() => enCurso.delete(clave));
      enCurso.set(clave, promesa);
    }
    return enCurso.get(clave);
  };

  if (guardada && !forceRefresh) {
    const edad = Date.now() - guardada.timestamp;
    if (edad < FRESCA_MS) return { ...guardada, actualizando: false };
    // Vencida: se contesta con lo guardado y se actualiza por detrás.
    sincronizar().catch((error) => console.error('⚠️ Sincronización de bodega en segundo plano falló:', error.message));
    return { ...guardada, actualizando: true };
  }

  try {
    const facturas = await sincronizar();
    return { facturas, timestamp: cacheAlegra.get(clave)?.timestamp || Date.now(), actualizando: false };
  } catch (error) {
    // Forzada y falló, pero hay algo guardado: se muestra eso, diciéndolo.
    if (guardada) {
      return {
        ...guardada,
        actualizando: false,
        aviso: 'Alegra no respondió: se muestran las facturas de la última sincronización.'
      };
    }
    throw error;
  }
}

/**
 * Lo nuestro, siempre fresco: estado de bodega y cuándo se despachó, por
 * `alegra_id` (la identidad real de la factura; antes se cruzaba por número).
 * Los faltantes no se cuentan acá: se siguen en su propio módulo.
 */
async function estadosLocales(alegraIds) {
  if (alegraIds.length === 0) return new Map();
  const { rows } = await query(`
    SELECT alegra_id, estado_bodega, estado_procesamiento, observaciones_adicionales, id, bodega_procesado_en
    FROM facturas
    WHERE alegra_id = ANY($1::int[])
  `, [alegraIds]);
  return new Map(rows.map((row) => [String(row.alegra_id), row]));
}

/**
 * El historial en ORDEN DE DESPACHO: la última factura despachada primero, la
 * anterior segunda, y así. Las despachadas antes de que existiera la hora
 * (antes del 25 de agosto) van al final, por fecha de emisión.
 */
function ordenarHistorial(listas) {
  return [...listas].sort((a, b) => {
    const ta = a.despachada_en ? new Date(a.despachada_en).getTime() : null;
    const tb = b.despachada_en ? new Date(b.despachada_en).getTime() : null;
    if (ta !== null && tb !== null) return tb - ta;
    if (ta !== null) return -1;
    if (tb !== null) return 1;
    return String(b.fecha_emision || '').localeCompare(String(a.fecha_emision || ''));
  });
}

async function getFacturasBodega({ dias = 30, limit = 40, forceRefresh = false }) {
  const alegra = await facturasDeAlegra({ dias, limit, forceRefresh });

  const alegraIds = alegra.facturas
    .map((inv) => parseInt(inv.alegra_id, 10))
    .filter((id) => Number.isInteger(id));
  const estados = await estadosLocales(alegraIds);

  const enriched = alegra.facturas.map((invoice) => {
    const estadoLocal = estados.get(String(invoice.alegra_id));
    return {
      ...invoice,
      estado_bodega: estadoLocal?.estado_bodega || 'pendiente',
      estado_procesamiento: estadoLocal?.estado_procesamiento || 'pendiente',
      observaciones_adicionales: estadoLocal?.observaciones_adicionales || null,
      factura_local_id: estadoLocal?.id || null,
      despachada_en: estadoLocal?.bodega_procesado_en || null
    };
  });

  // Una anulada que ya estaba en la base (la marcó `marcarAnuladasEnLocal`)
  // no se alista ni va al historial.
  const vigentes = enriched.filter((inv) => inv.estado_bodega !== 'anulada');
  const pendientes = vigentes.filter((inv) => inv.estado_bodega !== 'procesado');
  const listas = ordenarHistorial(vigentes.filter((inv) => inv.estado_bodega === 'procesado'));

  return {
    success: true,
    data: {
      pendientes,
      listas,
      resumen: {
        total: vigentes.length,
        pendientes: pendientes.length,
        listas: listas.length
      }
    },
    metadata: {
      filtros: { dias, limit },
      // Cuándo se habló con Alegra por última vez, no cuándo se armó esta respuesta.
      lastSync: new Date(alegra.timestamp).toISOString(),
      actualizando: alegra.actualizando,
      aviso: alegra.aviso || null
    }
  };
}

/**
 * Lo que bodega ya registró de una factura, producto por producto, leído de
 * la base: para abrir una del historial sin preguntarle a Alegra. Antes se
 * pedía el detalle completo a Alegra, y al llegar (2-6 s después) pisaba lo
 * que el bodeguero ya había empezado a marcar.
 */
async function estadosDeFactura(alegraId) {
  const id = parseInt(alegraId, 10);
  if (!Number.isInteger(id)) {
    const error = new Error('Factura inválida.');
    error.status = 400;
    throw error;
  }
  const { rows } = await query(`
    SELECT f.tipo_faltante, f.cantidad_faltante, f.observaciones,
           p.codigo AS referencia, p.alegra_id AS alegra_item_id
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      JOIN facturas fa ON fa.id = f.factura_id
     WHERE fa.alegra_id = $1
  `, [id]);
  return rows.map((r) => ({
    referencia: r.referencia ? String(r.referencia).trim() : null,
    alegraItemId: r.alegra_item_id ? String(r.alegra_item_id).trim() : null,
    tipoFaltante: r.tipo_faltante,
    cantidadFaltante: Number(r.cantidad_faltante) || 0,
    observaciones: r.observaciones || ''
  }));
}

/**
 * Manda una factura despachada SIN faltantes a la cola de impresión.
 * `facturaLocalId` es el id de la tabla vieja `facturas` (la cola todavía
 * cuelga de ella: paso 2 de la sección 11). La categoría 'sin_pendientes'
 * permite omitir el ajuste de precios en el centro de impresión.
 * La usan el camino de Alegra y el de la factura propia (bodegaPropia.js).
 */
async function encolarImpresion(facturaLocalId, etiqueta = facturaLocalId) {
  const existe = await query(`SELECT id FROM facturas_reimpresion WHERE factura_id = $1`, [facturaLocalId]);
  if (existe.rows.length === 0) {
    await query(`
      INSERT INTO facturas_reimpresion (factura_id, ajustes_realizados, estado, categoria, total_ajustes, fecha_creacion)
      VALUES ($1, '[]'::jsonb, 'pendiente', 'sin_pendientes', 0, CURRENT_TIMESTAMP)
    `, [facturaLocalId]);
    console.log(`🖨️ Factura ${etiqueta} agregada a cola de impresión (sin_pendientes)`);
  } else {
    await query(`
      UPDATE facturas_reimpresion
      SET estado = 'pendiente',
          ajustes_realizados = '[]'::jsonb,
          categoria = 'sin_pendientes',
          total_ajustes = 0,
          fecha_creacion = CURRENT_TIMESTAMP,
          fecha_procesamiento = NULL
      WHERE factura_id = $1
    `, [facturaLocalId]);
    console.log(`🖨️ Factura ${etiqueta} actualizada en cola de impresión (sin_pendientes)`);
  }
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
  if (estado === 'procesado' && enviarAImpresion && facturaLocal.rows.length > 0) {
    await encolarImpresion(facturaLocal.rows[0].id, alegraId);
  }

  // La caché NO se invalida: guarda solo lo de Alegra, y el estado se lee de
  // la base en cada pedido. Invalidarla acá era lo que forzaba una
  // sincronización completa con Alegra después de cada factura despachada.

  return {
    success: true,
    data: updateResult.rows[0],
    enviada_a_impresion: estado === 'procesado' && enviarAImpresion
  };
}

module.exports = {
  // Exportada para poder probarla: es la que evita que una factura anulada
  // siga apareciendo como trabajo pendiente.
  marcarAnuladasEnLocal,
  getFacturasBodega,
  estadosDeFactura,
  ordenarHistorial,
  actualizarEstadoFactura,
  encolarImpresion,
  invalidateCache,
  upsertFacturaDesdeAlegra
};

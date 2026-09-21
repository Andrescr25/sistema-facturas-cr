/**
 * Inventario-Auditorias Module - Service
 * Lógica de negocio para auditorías cíclicas de inventario (conteo físico
 * vs. sistema) y su ajuste en Alegra.
 */

const { query } = require('../../../config/database');
const { getInventoryService, getClient } = require('../../integrations/alegra');
const { listarVigentes } = require('../../utils/descuentosExceso');
const { hoyEnCostaRica, diaEnCostaRica } = require('../../utils/fechaCR');

const inventoryService = getInventoryService();
const client = getClient();

// Ventana móvil de historial de ventas que se mantiene en venta_items: más
// grande que VENTANA_DIAS_SIN_VENTA para tener margen, pero acotada (no todo
// el histórico) porque solo hace falta saber si algo se vendió "recientemente".
const VENTANA_DIAS_HISTORIAL_VENTAS = 120;
// Días sin venta para considerar un producto "exceso" (decisión de negocio,
// acordada con el usuario 2026-07-20).
const VENTANA_DIAS_SIN_VENTA = 60;
// Tope semanal de productos a liquidar (decisión de negocio, acordada con el
// usuario 2026-07-20) — de todos los candidatos detectados, solo se crean
// los N con más valor inmovilizado (stock × costo), para que la lista sea
// manejable en vez de volcar todo lo detectado de una sola vez.
const MAX_EXCESOS_POR_SEMANA = 10;
// Descuento con el que arranca un producto la primera vez que se detecta
// como exceso (decisión de negocio, acordada con el usuario 2026-07-21).
// YA NO ESCALA cada semana: el usuario pidió quitar ese crecimiento
// automático (2026-09-20) — ver escalarDescuentosExceso. Subirlo de ahí en
// adelante es decisión de una persona (guardarDescuentoExceso,
// aplicarDescuentoTanda), no del sistema.
const DESCUENTO_INICIAL = 10;

// IDs de Alegra que nunca deben salir como "exceso": no son inventario real,
// son productos comodín que el usuario usa para registrar gastos (recepción
// de facturas de comida, combustible, etc. que no ingresa como compra real).
// COMBUSTIBLE (ref 10062, id 1322), No inv (ref 0000, id 1245).
const PRODUCTOS_EXCLUIDOS_EXCESO = ['1322', '1245'];

/**
 * Error con código de estado HTTP para que el controller responda con el status correcto.
 */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Máximo de ítems permitidos por solicitud a la API de Alegra (POST /inventory-adjustments).
// Alegra no documenta este límite, pero en producción se confirmó que enviar ~390 ítems en un solo
// llamado devuelve HTTP 400 (code 14009, "El campo 'items' debe ser un arreglo no vacío"), un mensaje
// engañoso que en realidad indica que se excedió un límite de tamaño no documentado.
const ALEGRA_ADJUSTMENT_BATCH_SIZE = 100;

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/**
 * Envía a Alegra los ajustes de inventario de `items` (filas de inventario_auditoria_items con
 * id, alegra_id, stock_sistema, stock_real, costo_unitario) en lotes secuenciales de tamaño
 * ALEGRA_ADJUSTMENT_BATCH_SIZE. Tras confirmar éxito de un lote, marca ESE lote como ajustado en
 * la base de datos antes de continuar: si un lote posterior falla, el progreso de los lotes
 * anteriores ya quedó persistido y un reintento sólo reprocesará lo que sigue en FALSE.
 * Nunca lanza: un error de Alegra en un lote se devuelve en el resultado para que cada endpoint
 * decida cómo formatear su propia respuesta.
 */
async function applyBatchedAdjustments(items, baseObservations) {
  const batches = chunkArray(items, ALEGRA_ADJUSTMENT_BATCH_SIZE);
  const today = hoyEnCostaRica();
  const adjustmentIds = [];
  let itemsAdjusted = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const adjustmentItems = batch.map(item => {
      const qtyDiff = Number(item.stock_real) - Number(item.stock_sistema);
      return {
        id: String(item.alegra_id),
        type: qtyDiff > 0 ? 'in' : 'out',
        unitCost: Number(item.costo_unitario || 0),
        quantity: Math.abs(qtyDiff)
      };
    });

    const payload = {
      date: today,
      observations: batches.length > 1 ? `${baseObservations} - Lote ${i + 1}/${batches.length}` : baseObservations,
      items: adjustmentItems
    };

    let responseData;
    try {
      console.log(`Enviando lote ${i + 1}/${batches.length} de ajuste de inventario a Alegra (${adjustmentItems.length} ítems)...`);
      responseData = await inventoryService.createInventoryAdjustment(payload);
    } catch (error) {
      const errorDetail = error.response?.data || error.message;
      console.error(`Error enviando lote ${i + 1}/${batches.length} de ajuste de inventario a Alegra:`, errorDetail);
      return { ok: false, itemsAdjusted, totalBatches: batches.length, totalItems: items.length, batchesCompleted: i, errorDetail };
    }

    // Marcar SOLO los ítems de este lote como ajustados de inmediato.
    await query(`
      UPDATE inventario_auditoria_items
      SET ajustado_alegra = TRUE
      WHERE id = ANY($1::int[]);
    `, [batch.map(item => item.id)]);

    adjustmentIds.push(responseData.id);
    itemsAdjusted += batch.length;
  }

  return { ok: true, itemsAdjusted, totalBatches: batches.length, totalItems: items.length, adjustmentIds };
}

// Inicializar tablas de auditoría de inventario
async function inicializarTablas() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS inventario_auditorias (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL,
          tipo VARCHAR(50) NOT NULL, -- 'random', 'categoria', 'critico'
          categoria VARCHAR(100),
          estado VARCHAR(50) DEFAULT 'en_progreso', -- 'en_progreso', 'finalizado'
          precision_porcentaje DECIMAL(5,2),
          descuadre_dinero DECIMAL(12,2) DEFAULT 0.00,
          observaciones TEXT,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_finalizacion TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS inventario_auditoria_items (
          id SERIAL PRIMARY KEY,
          auditoria_id INTEGER REFERENCES inventario_auditorias(id) ON DELETE CASCADE,
          alegra_id VARCHAR(100) NOT NULL,
          nombre_producto VARCHAR(255) NOT NULL,
          referencia VARCHAR(100),
          category VARCHAR(100),
          stock_sistema DECIMAL(10,2) DEFAULT 0.00,
          stock_real DECIMAL(10,2),
          costo_unitario DECIMAL(12,2) DEFAULT 0.00,
          precio_venta DECIMAL(12,2) DEFAULT 0.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      ALTER TABLE inventario_auditoria_items
      ADD COLUMN IF NOT EXISTS ajustado_alegra BOOLEAN DEFAULT FALSE;
    `);

    await query(`
      ALTER TABLE inventario_auditoria_items
      ADD COLUMN IF NOT EXISTS ultima_venta DATE;
    `);

    // Marca que un producto de un exceso ya fue revisado/empacado por un
    // empleado (independiente de si su stock_real coincide o no con Alegra).
    await query(`
      ALTER TABLE inventario_auditoria_items
      ADD COLUMN IF NOT EXISTS empacado BOOLEAN DEFAULT FALSE;
    `);

    // Historial reciente de ventas por producto (ventana móvil, no histórico
    // completo) — usado para detectar excesos de inventario (productos con
    // stock que no se han vendido en los últimos N días). Alegra no expone
    // un endpoint de "última venta por producto", así que se arma acá a
    // partir de las facturas de venta sincronizadas periódicamente.
    await query(`
      CREATE TABLE IF NOT EXISTS venta_items (
          id SERIAL PRIMARY KEY,
          alegra_invoice_id INTEGER NOT NULL,
          alegra_item_id VARCHAR(100) NOT NULL,
          cantidad DECIMAL(10,2) NOT NULL DEFAULT 0,
          fecha_emision DATE NOT NULL,
          precio_unitario DECIMAL(12,2) DEFAULT 0.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (alegra_invoice_id, alegra_item_id)
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_venta_items_alegra_item_id ON venta_items(alegra_item_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_venta_items_fecha ON venta_items(fecha_emision);
    `);

    // Nombre del cliente de la factura — se usa como bolsa de donde elegir al
    // azar el destinatario de una regalía (ver regalos_exceso más abajo).
    await query(`
      ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(255);
    `);

    // Descuento acumulado por producto (no por tanda de exceso): un producto
    // que sigue sin venderse semana tras semana va subiendo su descuento acá,
    // independiente de en cuántas tandas de "Excesos N" haya aparecido.
    await query(`
      CREATE TABLE IF NOT EXISTS producto_descuento_exceso (
          id SERIAL PRIMARY KEY,
          alegra_item_id VARCHAR(100) NOT NULL UNIQUE,
          nombre_producto VARCHAR(255) NOT NULL,
          referencia VARCHAR(100),
          descuento_porcentaje INTEGER NOT NULL DEFAULT 0,
          veces_detectado INTEGER NOT NULL DEFAULT 0,
          primera_deteccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          regalado BOOLEAN DEFAULT FALSE
      );
    `);

    // Registro de productos que llegaron a 100% de descuento y a qué
    // cliente (elegido al azar entre los clientes reales recientes) se le
    // regaló.
    await query(`
      CREATE TABLE IF NOT EXISTS regalos_exceso (
          id SERIAL PRIMARY KEY,
          alegra_item_id VARCHAR(100) NOT NULL,
          nombre_producto VARCHAR(255) NOT NULL,
          cliente_nombre VARCHAR(255),
          fecha_regalo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Tablas de auditoría de inventario inicializadas/verificadas');
  } catch (err) {
    console.error('Error inicializando tablas de inventario:', err);
  }
}

inicializarTablas();

/**
 * Listar todas las auditorías
 */
async function listarAuditorias(tipo) {
  // Sin tipo: auditorías cíclicas normales (se excluyen las devoluciones para
  // no mezclarlas en el historial de auditorías). Con tipo: filtra exacto —
  // usado por la pestaña de Devoluciones (tipo='devolucion').
  const result = tipo
    ? await query(`SELECT * FROM inventario_auditorias WHERE tipo = $1 ORDER BY fecha_creacion DESC;`, [tipo])
    : await query(`SELECT * FROM inventario_auditorias WHERE tipo != 'devolucion' ORDER BY fecha_creacion DESC;`);
  return result.rows;
}

/**
 * Listar categorías únicas de productos activos (para el selector de auditoría por categoría)
 */
async function listarCategorias() {
  const result = await query(`
    SELECT DISTINCT category
    FROM alegra_products_cache
    WHERE status = 'active' AND category IS NOT NULL AND category != ''
    ORDER BY category;
  `);
  return result.rows.map(row => row.category);
}

/**
 * Crear una nueva auditoría usando stock y productos en vivo de Alegra
 */
async function crearAuditoria({ tipo, categoria, nombre }) {
  console.log('Obteniendo catálogo de inventario en vivo directamente de Alegra...');
  const allAlegraItems = await inventoryService.getInventariableItems();

  // Mapear los ítems de Alegra a nuestro formato uniforme
  const mappedItems = allAlegraItems.map(product => {
    const mainPrice = product.price?.find(p => p.main === true) || product.price?.[0];
    const price = mainPrice ? parseFloat(mainPrice.price) : 0;
    const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;
    const reference = product.reference?.reference || product.reference || '';
    const catName = product.itemCategory?.name || product.category?.name || '';
    const stock = product.inventory?.availableQuantity ? parseFloat(product.inventory.availableQuantity) : 0;

    return {
      alegra_id: product.id,
      name: product.name,
      reference: reference,
      category: catName,
      costo_unitario: cost,
      price: price,
      stock_sistema: stock
    };
  });

  let candidateProducts = [];

  if (tipo === 'random') {
    const shuffled = [...mappedItems].sort(() => 0.5 - Math.random());
    candidateProducts = shuffled.slice(0, 50);
  } else if (tipo === 'categoria') {
    if (!categoria) {
      throw httpError(400, 'La categoría es requerida para este tipo de auditoría.');
    }
    candidateProducts = mappedItems.filter(item => item.category === categoria);
  } else if (tipo === 'critico') {
    const dbRes = await query(`
      SELECT p.alegra_id, COUNT(*) as total_incidencias
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      WHERE p.alegra_id IS NOT NULL
      GROUP BY p.alegra_id
      ORDER BY total_incidencias DESC
      LIMIT 30;
    `);
    const criticalIds = new Set(dbRes.rows.map(row => row.alegra_id.toString()));

    candidateProducts = mappedItems.filter(item => criticalIds.has(item.alegra_id.toString()));

    if (candidateProducts.length < 30) {
      const remainingCount = 30 - candidateProducts.length;
      const notCritical = mappedItems.filter(item => !criticalIds.has(item.alegra_id.toString()));
      const shuffledNotCritical = notCritical.sort(() => 0.5 - Math.random());
      candidateProducts = candidateProducts.concat(shuffledNotCritical.slice(0, remainingCount));
    }
  } else {
    throw httpError(400, 'Tipo de auditoría no válido.');
  }

  if (candidateProducts.length === 0) {
    throw httpError(400, 'No se encontraron productos para auditar.');
  }

  // Insertar la auditoría
  const nombreFinal = nombre || `Auditoría ${tipo === 'random' ? 'Aleatoria 50' : tipo === 'categoria' ? `Categoría: ${categoria}` : 'Críticos'} - ${new Date().toLocaleDateString('es-CR')}`;

  const auditRes = await query(`
    INSERT INTO inventario_auditorias (nombre, tipo, categoria, estado)
    VALUES ($1, $2, $3, 'en_progreso')
    RETURNING *;
  `, [nombreFinal, tipo, categoria || null]);

  const audit = auditRes.rows[0];

  // Insertar los ítems de la auditoría
  for (const item of candidateProducts) {
    await query(`
      INSERT INTO inventario_auditoria_items
        (auditoria_id, alegra_id, nombre_producto, referencia, category, stock_sistema, costo_unitario, precio_venta)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      audit.id,
      item.alegra_id.toString(),
      item.name,
      item.reference || '',
      item.category || '',
      item.stock_sistema,
      item.costo_unitario,
      item.price || 0
    ]);
  }

  return audit;
}

/**
 * Obtener una auditoría específica con sus ítems (y validar expiración de 24h)
 */
async function getAuditoria(id) {
  const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [id]);
  if (auditRes.rows.length === 0) {
    throw httpError(404, 'Auditoría no encontrada.');
  }

  const audit = auditRes.rows[0];
  const fechaCreacion = new Date(audit.fecha_creacion);
  const ahora = new Date();
  const difHoras = (ahora - fechaCreacion) / (1000 * 60 * 60);
  // Las devoluciones y excesos no expiran a las 24h: cada ítem de devolución
  // captura su propio stock fresco al agregarse (no hay un baseline único
  // que se vuelva obsoleto como en una auditoría cíclica), y los excesos son
  // una "factura de empaque" que puede quedar abierta varios días mientras
  // los empleados van revisando producto por producto.
  const expirada = !['devolucion', 'exceso'].includes(audit.tipo) && audit.estado === 'en_progreso' && difHoras >= 24;

  const itemsRes = await query(`
    SELECT
      iai.id, iai.auditoria_id, iai.alegra_id, iai.nombre_producto, iai.referencia,
      iai.category, iai.stock_sistema, iai.stock_real, iai.costo_unitario,
      iai.precio_venta, iai.created_at, iai.ajustado_alegra, iai.empacado,
      iai.ultima_venta, apc.image_url,
      -- El descuento vive en otra tabla y es lo que de verdad decide si el
      -- producto se ve en el catálogo público. Sin traerlo acá, la pantalla
      -- de empaque no da ninguna pista de que un producto va a quedar
      -- invisible, que es justo lo que hacía parecer roto al catálogo.
      pde.descuento_porcentaje, pde.regalado
    FROM inventario_auditoria_items iai
    LEFT JOIN alegra_products_cache apc ON apc.alegra_id = iai.alegra_id
    LEFT JOIN producto_descuento_exceso pde ON pde.alegra_item_id = iai.alegra_id
    WHERE iai.auditoria_id = $1
    ORDER BY iai.nombre_producto;
  `, [id]);

  return {
    ...audit,
    expirada,
    items: itemsRes.rows
  };
}

/**
 * Guardar conteos y aplicar ajustes en Alegra de inmediato
 */
async function guardarConteos(id, items) {
  // 1. Guardar todos los conteos en la base de datos local
  for (const item of items) {
    const stockVal = item.stock_real !== null && item.stock_real !== undefined && item.stock_real !== '' ? Number(item.stock_real) : null;

    await query(`
      UPDATE inventario_auditoria_items
      SET stock_real = $1
      WHERE id = $2 AND auditoria_id = $3;
    `, [stockVal, item.id, id]);
  }

  // 2. Obtener la sesión de auditoría para el historial de observaciones
  const auditRes = await query(`SELECT nombre FROM inventario_auditorias WHERE id = $1;`, [id]);
  const auditNombre = auditRes.rows[0]?.nombre || 'Auditoría';

  // 3. Obtener los ítems para ver cuáles necesitan ajuste (con conteo, con diferencia y no ajustados previamente)
  const itemsRes = await query(`
    SELECT id, alegra_id, stock_sistema, stock_real, ajustado_alegra, costo_unitario
    FROM inventario_auditoria_items
    WHERE auditoria_id = $1 AND stock_real IS NOT NULL AND ajustado_alegra = FALSE;
  `, [id]);

  const itemsAJustar = itemsRes.rows.filter(
    item => Number(item.stock_real) !== Number(item.stock_sistema)
  );
  const itemsSinDiferencia = itemsRes.rows.filter(
    item => Number(item.stock_real) === Number(item.stock_sistema)
  );

  let message = 'Conteos guardados exitosamente.';

  // Los que no tienen diferencia no requieren llamada a Alegra: marcar de una vez.
  if (itemsSinDiferencia.length > 0) {
    await query(`
      UPDATE inventario_auditoria_items
      SET ajustado_alegra = TRUE
      WHERE id = ANY($1::int[]);
    `, [itemsSinDiferencia.map(item => item.id)]);
  }

  if (itemsAJustar.length > 0) {
    const result = await applyBatchedAdjustments(
      itemsAJustar,
      `Ajuste incremental automático desde Módulo de Auditoría (ID: ${id} - ${auditNombre})`
    );

    if (!result.ok) {
      // Progreso parcial ya persistido por applyBatchedAdjustments: los lotes previos ya están
      // marcados ajustado_alegra = TRUE, así que volver a guardar sólo reintenta lo pendiente.
      throw Object.assign(httpError(500, ''), {
        partialResult: result
      });
    }

    message = result.totalBatches > 1
      ? `Conteos guardados y ajuste de inventario aplicado con éxito en Alegra (${result.itemsAdjusted} ítems en ${result.totalBatches} lotes).`
      : 'Conteos guardados y ajuste de inventario aplicado con éxito en Alegra.';
  }

  return { message };
}

/**
 * Guarda el conteo de UN solo ítem apenas el usuario lo escribe (sin
 * disparar ningún ajuste en Alegra — eso sigue siendo una acción explícita
 * vía guardarConteos/finalizarAuditoria). El único propósito es que un
 * conteo ya tecleado no se pierda si el navegador se recarga o se cierra
 * antes de presionar "Guardar y Ajustar".
 */
async function guardarConteoIndividual(auditoriaId, itemId, stockReal) {
  const stockVal = stockReal !== null && stockReal !== undefined && stockReal !== ''
    ? Number(stockReal)
    : null;

  await query(`
    UPDATE inventario_auditoria_items
    SET stock_real = $1
    WHERE id = $2 AND auditoria_id = $3 AND ajustado_alegra = FALSE;
  `, [stockVal, itemId, auditoriaId]);
}

/**
 * Finalizar una auditoría calculando sus estadísticas de precisión y descuadre
 */
async function finalizarAuditoria(id, observaciones) {
  // Un exceso ("factura de empaque") no puede finalizarse hasta que el
  // empleado marcó todos los productos como empacados.
  const auditRes = await query(`SELECT tipo FROM inventario_auditorias WHERE id = $1;`, [id]);
  const tipoAuditoria = auditRes.rows[0]?.tipo;
  if (tipoAuditoria === 'exceso') {
    const pendientesRes = await query(`
      SELECT COUNT(*) FROM inventario_auditoria_items WHERE auditoria_id = $1 AND empacado = FALSE;
    `, [id]);
    const pendientes = parseInt(pendientesRes.rows[0].count, 10);
    if (pendientes > 0) {
      throw httpError(400, `Todavía quedan ${pendientes} producto(s) sin marcar como empacados.`);
    }
  } else if (tipoAuditoria !== 'devolucion') {
    // Una auditoría normal (categoria/random/critico) tampoco puede finalizarse
    // hasta que todos los productos tengan un conteo real registrado — igual
    // que Excesos, esto respalda del lado del servidor el bloqueo que ya
    // existe en el botón "Finalizar Auditoría" del frontend.
    const pendientesRes = await query(`
      SELECT COUNT(*) FROM inventario_auditoria_items
      WHERE auditoria_id = $1 AND ajustado_alegra = FALSE AND stock_real IS NULL;
    `, [id]);
    const pendientes = parseInt(pendientesRes.rows[0].count, 10);
    if (pendientes > 0) {
      throw httpError(400, `Todavía quedan ${pendientes} producto(s) sin contar.`);
    }
  }

  const itemsRes = await query(`
    SELECT stock_sistema, stock_real, costo_unitario
    FROM inventario_auditoria_items
    WHERE auditoria_id = $1;
  `, [id]);

  const items = itemsRes.rows;
  let totalItems = items.length;
  let itemsCorrectos = 0;
  let descuadreDinero = 0.0;

  items.forEach(item => {
    const stockReal = item.stock_real !== null ? Number(item.stock_real) : Number(item.stock_sistema);
    const stockSistema = Number(item.stock_sistema);
    const costo = Number(item.costo_unitario || 0);

    if (stockReal === stockSistema) {
      itemsCorrectos++;
    } else {
      const diferencia = stockReal - stockSistema;
      descuadreDinero += (diferencia * costo);
    }
  });

  const precisionPorcentaje = totalItems > 0 ? (itemsCorrectos / totalItems) * 100 : 100;

  const result = await query(`
    UPDATE inventario_auditorias
    SET
      estado = 'finalizado',
      precision_porcentaje = $1,
      descuadre_dinero = $2,
      observaciones = $3,
      fecha_finalizacion = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *;
  `, [precisionPorcentaje, descuadreDinero, observaciones || null, id]);

  return result.rows[0];
}

/**
 * Aplicar ajuste manual en la API de Alegra (botón "Aplicar Ajuste en Alegra")
 */
async function ajustarEnAlegra(id) {
  const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [id]);
  if (auditRes.rows.length === 0) {
    throw httpError(404, 'Auditoría no encontrada.');
  }
  const audit = auditRes.rows[0];

  // Igual que en guardarConteos: sólo ítems con conteo real y aún NO ajustados en Alegra. Evita
  // reenviar el mismo ajuste si este botón se presiona más de una vez, o si ya se aplicó vía
  // el guardado incremental automático.
  const itemsRes = await query(`
    SELECT id, alegra_id, stock_sistema, stock_real, costo_unitario
    FROM inventario_auditoria_items
    WHERE auditoria_id = $1 AND stock_real IS NOT NULL AND ajustado_alegra = FALSE;
  `, [id]);

  const itemsConDiferencia = itemsRes.rows.filter(
    item => Number(item.stock_real) !== Number(item.stock_sistema)
  );
  const itemsSinDiferencia = itemsRes.rows.filter(
    item => Number(item.stock_real) === Number(item.stock_sistema)
  );

  // Ítems contados sin diferencia real: no requieren ajuste en Alegra, se marcan de una vez.
  if (itemsSinDiferencia.length > 0) {
    await query(`
      UPDATE inventario_auditoria_items
      SET ajustado_alegra = TRUE
      WHERE id = ANY($1::int[]);
    `, [itemsSinDiferencia.map(item => item.id)]);
  }

  if (itemsConDiferencia.length === 0) {
    return {
      message: itemsRes.rows.length > 0
        ? 'No hay diferencias de stock para ajustar. Los ítems contados ya estaban conciliados.'
        : 'No hay diferencias de stock pendientes de ajustar.'
    };
  }

  const result = await applyBatchedAdjustments(
    itemsConDiferencia,
    `Ajuste automático generado desde Módulo de Auditoría de Inventario (Auditoría ID: ${id} - ${audit.nombre})`
  );

  if (!result.ok) {
    throw Object.assign(httpError(500, ''), {
      partialResult: result
    });
  }

  return {
    message: result.totalBatches > 1
      ? `Se aplicó con éxito el ajuste de inventario en Alegra (${result.itemsAdjusted} ítems en ${result.totalBatches} lotes, IDs: ${result.adjustmentIds.join(', ')}).`
      : `Se aplicó con éxito el ajuste de inventario en Alegra con ID ${result.adjustmentIds[0]}`,
    data: { adjustmentIds: result.adjustmentIds, totalBatches: result.totalBatches, itemsAdjusted: result.itemsAdjusted }
  };
}

/**
 * Re-sincronizar stocks/costos/precios desde Alegra para una auditoría (usado en auditorías expiradas)
 */
async function resincronizarAuditoria(id) {
  const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [id]);
  if (auditRes.rows.length === 0) {
    throw httpError(404, 'Auditoría no encontrada.');
  }

  console.log(`🔄 Re-sincronizando catálogo en vivo de Alegra para auditoría ID: ${id}...`);
  const allAlegraItems = await inventoryService.getInventariableItems();

  // Mapear los ítems a un mapa rápido de buscar por alegra_id
  const alegraMap = new Map();
  allAlegraItems.forEach(product => {
    const mainPrice = product.price?.find(p => p.main === true) || product.price?.[0];
    const price = mainPrice ? parseFloat(mainPrice.price) : 0;
    const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;
    const stock = product.inventory?.availableQuantity ? parseFloat(product.inventory.availableQuantity) : 0;
    alegraMap.set(product.id.toString(), { price, cost, stock });
  });

  const itemsRes = await query(`SELECT id, alegra_id FROM inventario_auditoria_items WHERE auditoria_id = $1;`, [id]);

  // Actualizar cada ítem en la base de datos con los datos actuales de Alegra
  for (const item of itemsRes.rows) {
    const liveData = alegraMap.get(item.alegra_id.toString());
    if (liveData) {
      await query(`
        UPDATE inventario_auditoria_items
        SET stock_sistema = $1, costo_unitario = $2, precio_venta = $3
        WHERE id = $4;
      `, [liveData.stock, liveData.cost, liveData.price, item.id]);
    }
  }

  // Reiniciar la fecha de creación a NOW() para renovar el plazo de 24 horas y vaciar conteos no ajustados
  await query(`
    UPDATE inventario_auditorias
    SET fecha_creacion = CURRENT_TIMESTAMP
    WHERE id = $1;
  `, [id]);
}

/**
 * Crear una devolución vacía (tipo='devolucion'): a diferencia de crearAuditoria, no precarga
 * ningún producto — se van agregando uno por uno con agregarItemDevolucion a medida que llegan.
 */
/**
 * Nombre autoincremental "<Prefijo> N" para un tipo de registro: se busca el
 * número más alto ya usado (sin asumir que son consecutivos, por si alguna
 * vez se borra uno a mano — que ahora se puede, ver eliminarAuditoria) y se
 * usa el siguiente. Lo comparten devoluciones ("Ajuste N") y excesos
 * ("Excesos N"), automáticos y manuales.
 */
async function siguienteNombreAutoincremental(tipo, prefijo) {
  const existentes = await query(`SELECT nombre FROM inventario_auditorias WHERE tipo = $1;`, [tipo]);
  const patron = new RegExp(`^${prefijo}\\s+(\\d+)$`, 'i');

  let maxNumero = 0;
  existentes.rows.forEach(row => {
    const match = patron.exec((row.nombre || '').trim());
    if (match) {
      const numero = parseInt(match[1], 10);
      if (numero > maxNumero) maxNumero = numero;
    }
  });

  return `${prefijo} ${maxNumero + 1}`;
}

async function crearDevolucion() {
  const nombre = await siguienteNombreAutoincremental('devolucion', 'Ajuste');

  const result = await query(`
    INSERT INTO inventario_auditorias (nombre, tipo, estado)
    VALUES ($1, 'devolucion', 'en_progreso')
    RETURNING *;
  `, [nombre]);

  return result.rows[0];
}

/**
 * Buscar productos inventariables en vivo en Alegra por nombre/referencia, para agregarlos a una
 * devolución. Mismo dato fresco (stock/costo) que usa crearAuditoria, filtrado por texto.
 */
async function buscarProductosParaDevolucion(q) {
  if (!q || !q.trim()) return [];

  // Búsqueda contra la caché local (alegra_products_cache), no en vivo contra
  // Alegra: getInventariableItems() pagina TODO el catálogo (2000+ productos,
  // ~80s medido en producción) — inviable para una búsqueda en cada tecleo.
  // La caché no guarda existencias, así que el stock/costo frescos se
  // consultan puntualmente (1 sola llamada) recién al agregar el producto,
  // en agregarItemDevolucion.
  const result = await query(`
    SELECT alegra_id, name, reference, category, cost, price
    FROM alegra_products_cache
    WHERE status = 'active' AND hidden_locally = FALSE
      AND search_text ILIKE '%' || $1 || '%'
    ORDER BY name ASC
    LIMIT 30;
  `, [q.trim().toLowerCase()]);

  return result.rows.map(row => ({
    alegraId: row.alegra_id,
    nombre: row.name,
    referencia: row.reference,
    categoria: row.category,
    costoUnitario: Number(row.cost) || 0,
    precioVenta: Number(row.price) || 0
  }));
}

/**
 * Agregar un producto devuelto a una devolución en progreso. Los datos del producto (nombre,
 * referencia, categoría, costo, stock actual) vienen del resultado de buscarProductosParaDevolucion
 * que el frontend acaba de mostrar — no se re-consulta Alegra para evitar una llamada extra por
 * cada producto agregado. stock_real se calcula de una vez (stock actual + cantidad devuelta), así
 * que finalizarAuditoria/ajustarEnAlegra (genéricos, comparan stock_sistema vs stock_real) funcionan
 * sin ningún cambio para este tipo de registro.
 */
async function agregarItemDevolucion(auditoriaId, item) {
  const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [auditoriaId]);
  if (auditRes.rows.length === 0) {
    throw httpError(404, 'Devolución no encontrada.');
  }
  const devolucion = auditRes.rows[0];
  if (devolucion.tipo !== 'devolucion') {
    throw httpError(400, 'Este registro no es una devolución.');
  }
  if (devolucion.estado !== 'en_progreso') {
    throw httpError(400, 'Esta devolución ya fue finalizada.');
  }

  const { alegraId, cantidadDevuelta } = item;
  const cantidad = Number(cantidadDevuelta);

  if (!alegraId) {
    throw httpError(400, 'Producto inválido.');
  }
  if (!cantidad || cantidad <= 0) {
    throw httpError(400, 'La cantidad devuelta debe ser mayor a 0.');
  }

  // El buscador usa la caché local (rápida, sin existencias) — se consulta
  // el producto puntual en vivo en Alegra (1 sola llamada, rápida) para tener
  // el stock/costo frescos justo al momento de agregarlo a la devolución.
  let productoAlegra;
  try {
    productoAlegra = await inventoryService.getItemById(alegraId);
  } catch (error) {
    throw httpError(400, 'No se pudo obtener el producto desde Alegra. Intenta de nuevo.');
  }

  const mainPrice = productoAlegra.price?.find(p => p.main === true) || productoAlegra.price?.[0];
  const precioVenta = mainPrice ? parseFloat(mainPrice.price) : 0;
  const costoUnitario = productoAlegra.inventory?.unitCost ? parseFloat(productoAlegra.inventory.unitCost) : 0;
  const referencia = productoAlegra.reference?.reference || productoAlegra.reference || '';
  const categoria = productoAlegra.itemCategory?.name || productoAlegra.category?.name || '';
  const stockActual = productoAlegra.inventory?.availableQuantity ? parseFloat(productoAlegra.inventory.availableQuantity) : 0;

  const result = await query(`
    INSERT INTO inventario_auditoria_items
      (auditoria_id, alegra_id, nombre_producto, referencia, category, stock_sistema, stock_real, costo_unitario, precio_venta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `, [
    auditoriaId,
    String(alegraId),
    productoAlegra.name,
    referencia,
    categoria,
    stockActual,
    stockActual + cantidad,
    costoUnitario,
    precioVenta
  ]);

  return result.rows[0];
}

/**
 * Quitar un producto agregado por error a una devolución o a una tanda de
 * excesos, antes de que su ajuste se haya aplicado en Alegra. El guard de
 * `ajustado_alegra = FALSE` es lo que hace seguro exponerlo también para
 * excesos: si el ajuste ya se mandó a Alegra, borrar la fila acá dejaría el
 * inventario movido sin rastro de por qué.
 */
async function eliminarItemDevolucion(auditoriaId, itemId) {
  const result = await query(`
    DELETE FROM inventario_auditoria_items
    WHERE id = $1 AND auditoria_id = $2 AND ajustado_alegra = FALSE
    RETURNING id;
  `, [itemId, auditoriaId]);

  if (result.rows.length === 0) {
    throw httpError(404, 'Ítem no encontrado o ya fue ajustado en Alegra.');
  }
}

// --- Excesos de inventario ---

/**
 * Sincroniza venta_items con las facturas de venta de los últimos
 * VENTANA_DIAS_HISTORIAL_VENTAS días (GET /invoices ya trae el array
 * "items" completo por factura, confirmado en vivo — no hace falta pedir
 * cada factura por separado). Poda filas fuera de la ventana para que la
 * tabla no crezca indefinidamente: solo importa saber qué se vendió
 * recientemente, no guardar histórico completo.
 */
async function sincronizarVentasRecientes() {
  const hoy = new Date();
  const ventanaDesde = new Date(hoy);
  ventanaDesde.setDate(ventanaDesde.getDate() - VENTANA_DIAS_HISTORIAL_VENTAS);
  const ventanaDesdeStr = diaEnCostaRica(ventanaDesde);
  const endDate = diaEnCostaRica(hoy);

  // Incremental: se pide solo desde la última factura ya sincronizada (con
  // 1 día de margen, por si quedaron facturas del mismo día sin traer por
  // límite de paginación) en vez de repetir la ventana completa de
  // VENTANA_DIAS_HISTORIAL_VENTAS días en cada corrida — la mayoría de esos
  // días ya están guardados de la corrida anterior. El ON CONFLICT hace que
  // volver a traer un día ya sincronizado sea inofensivo.
  const ultimaRes = await query(`SELECT MAX(fecha_emision) as ultima FROM venta_items;`);
  const ultimaFecha = ultimaRes.rows[0]?.ultima;
  let startDate = ventanaDesdeStr;
  if (ultimaFecha) {
    const margen = new Date(ultimaFecha);
    margen.setDate(margen.getDate() - 1);
    const margenStr = margen.toISOString().split('T')[0];
    startDate = margenStr > ventanaDesdeStr ? margenStr : ventanaDesdeStr;
  }

  console.log(`🔄 Sincronizando ventas desde ${startDate} → ${endDate}${ultimaFecha ? ' (incremental)' : ' (primera vez, ventana completa de ' + VENTANA_DIAS_HISTORIAL_VENTAS + ' días)'}...`);

  let start = 0;
  const limit = 30;
  let totalFacturas = 0;
  let totalItems = 0;

  while (true) {
    const response = await client.requestWithRetry(
      () => client.api.get('/invoices', {
        params: {
          date_after: startDate,
          date_before: endDate,
          start,
          limit,
          order_field: 'date',
          order_direction: 'DESC'
        },
        timeout: 60000
      }),
      3, 1000, { metodo: 'GET' }
    );

    const invoices = response.data?.data || response.data || [];
    if (!Array.isArray(invoices) || invoices.length === 0) break;

    for (const invoice of invoices) {
      const fecha = (invoice.date || '').split('T')[0];
      if (!fecha) continue;
      const clienteNombre = invoice.client?.name || null;

      for (const item of invoice.items || []) {
        if (!item.id) continue;
        await query(`
          INSERT INTO venta_items (alegra_invoice_id, alegra_item_id, cantidad, fecha_emision, precio_unitario, cliente_nombre)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (alegra_invoice_id, alegra_item_id) DO UPDATE SET
            cantidad = EXCLUDED.cantidad,
            fecha_emision = EXCLUDED.fecha_emision,
            precio_unitario = EXCLUDED.precio_unitario,
            cliente_nombre = EXCLUDED.cliente_nombre;
        `, [
          parseInt(invoice.id, 10),
          String(item.id),
          parseFloat(item.quantity) || 0,
          fecha,
          parseFloat(item.price) || 0,
          clienteNombre
        ]);
        totalItems++;
      }
    }

    totalFacturas += invoices.length;
    if (invoices.length < limit) break;
    start += limit;
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Podar filas fuera de la ventana móvil (siempre contra el límite fijo de
  // VENTANA_DIAS_HISTORIAL_VENTAS días, no contra el punto de arranque
  // incremental de esta corrida en particular)
  const podado = await query(`DELETE FROM venta_items WHERE fecha_emision < $1 RETURNING id;`, [ventanaDesdeStr]);

  console.log(`✅ Ventas sincronizadas: ${totalFacturas} facturas, ${totalItems} líneas procesadas, ${podado.rows.length} filas viejas podadas`);
  return { facturas: totalFacturas, items: totalItems, podadas: podado.rows.length };
}

/**
 * Da de alta el descuento inicial de los candidatos que todavía no tienen
 * uno. YA NO ESCALA: antes, cada vez que un producto reaparecía detectado
 * le sumaba un % más —hasta llegar a 100% y regalarlo solo, sin que nadie
 * lo pidiera— y el usuario pidió quitar ese crecimiento automático
 * (2026-09-20). Un producto que ya tiene descuento se deja tal cual: subirlo,
 * bajarlo o regalarlo de verdad es decisión de una persona
 * (guardarDescuentoExceso, aplicarDescuentoTanda), no de esta función.
 *
 * Devuelve `[]` siempre — se mantiene el arreglo de salida (en vez de
 * quitarlo) para no tener que tocar a quien la llama.
 */
async function escalarDescuentosExceso(candidatos) {
  for (const item of candidatos) {
    const alegraItemId = String(item.alegra_id);
    const existente = await query(`SELECT id FROM producto_descuento_exceso WHERE alegra_item_id = $1;`, [alegraItemId]);
    if (existente.rows.length > 0) continue;

    await query(`
      INSERT INTO producto_descuento_exceso (alegra_item_id, nombre_producto, referencia, descuento_porcentaje, veces_detectado)
      VALUES ($1, $2, $3, $4, 1);
    `, [alegraItemId, item.name, item.reference, DESCUENTO_INICIAL]);
  }

  return [];
}

/**
 * Saca de liquidación los productos que ya se agotaron.
 *
 * EL PROBLEMA QUE ARREGLA
 * Que un producto esté en oferta se decidía contra el stock CONGELADO en el
 * ítem de la tanda —la cantidad que el empacador contó el día que lo empacó—
 * y esa foto envejece. En la revisión del 2026-09-08 había 37 ofertas vivas
 * con stock congelado del 23 de julio y del 16 de agosto; ALAMBRINA GDE
 * METAL figuraba con 17 unidades y en Alegra ya estaba en cero. El catálogo
 * lo mostraba con -25% y "AGOTADO" al mismo tiempo: se le ofrecía al cliente
 * algo que no había.
 *
 * Al llegar a cero el descuento vuelve a 0 y el producto sale del catálogo.
 * No se borra la fila: si el producto se vuelve a surtir y vuelve a quedarse
 * quieto, la detección lo agarra otra vez y el descuento arranca de nuevo
 * desde abajo, que es lo correcto — se agotó, o sea que a ese precio sí
 * salía.
 *
 * @param {Array} [itemsAlegra] catálogo en vivo, si quien llama ya lo tiene.
 *        Sin él se pregunta producto por producto, que para las pocas
 *        ofertas vigentes sale más barato que paginar las 2.000 fichas.
 */
async function depurarOfertasSinStock(itemsAlegra = null) {
  const vigentes = await listarVigentes();
  if (vigentes.length === 0) return { revisados: 0, sacados: [] };

  const stockDe = new Map();
  if (Array.isArray(itemsAlegra)) {
    for (const item of itemsAlegra) {
      stockDe.set(String(item.id), parseFloat(item.inventory?.availableQuantity) || 0);
    }
  } else {
    for (const oferta of vigentes) {
      const r = await client.get(`/items/${oferta.id}`);
      // Si Alegra no contesta por ese producto se lo deja como está: sacarlo
      // de la oferta por un fallo de red sería peor que dejarlo un día más.
      if (!r.success) {
        console.warn(`⚠️ No se pudo leer el stock de ${oferta.id} (${oferta.nombre}), se deja como está`);
        continue;
      }
      stockDe.set(String(oferta.id), parseFloat(r.data?.inventory?.availableQuantity) || 0);
    }
  }

  const sinStock = vigentes.filter(o => stockDe.has(o.id) && stockDe.get(o.id) <= 0);
  if (sinStock.length === 0) {
    console.log(`✅ Liquidación al día: las ${vigentes.length} ofertas vigentes tienen stock.`);
    return { revisados: vigentes.length, sacados: [] };
  }

  await query(`
    UPDATE producto_descuento_exceso
    SET descuento_porcentaje = 0, ultima_actualizacion = CURRENT_TIMESTAMP
    WHERE alegra_item_id = ANY($1::varchar[]);
  `, [sinStock.map(o => o.id)]);

  for (const o of sinStock) {
    console.log(`📤 "${o.nombre}" se agotó — sale de liquidación (tenía ${o.descuentoPorcentaje}%)`);
  }

  return {
    revisados: vigentes.length,
    sacados: sinStock.map(o => ({ id: o.id, nombre: o.nombre, descuentoAnterior: o.descuentoPorcentaje }))
  };
}

/**
 * Los productos que hoy califican como exceso: tienen stock y no se venden
 * hace VENTANA_DIAS_SIN_VENTA días. Devuelve TODOS los candidatos, ordenados
 * por plata inmovilizada (stock x costo) de mayor a menor.
 *
 * Está separado de la creación de la tanda a propósito: la detección corre
 * sola todas las semanas —para escalar descuentos y para saber qué hay— pero
 * la tanda de empaque la crea una persona cuando decide ponerse a empacar.
 *
 * Devuelve también `itemsAlegra` porque traerlo cuesta cerca de un minuto y
 * quien llama casi siempre lo necesita después (para depurar las ofertas sin
 * stock, sin pagar el fetch dos veces).
 */
async function detectarCandidatosExceso() {
  console.log('🔍 Detectando productos en exceso...');
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - VENTANA_DIAS_SIN_VENTA);
  const fechaLimiteStr = diaEnCostaRica(fechaLimite);

  // Última venta conocida (dentro de la ventana de historial) por producto
  const ultimasVentasRes = await query(`
    SELECT alegra_item_id, MAX(fecha_emision) as ultima_venta
    FROM venta_items
    GROUP BY alegra_item_id;
  `);
  const ultimaVentaMap = new Map(
    ultimasVentasRes.rows.map(row => [row.alegra_item_id, row.ultima_venta])
  );

  // Stock/costo actuales en vivo de Alegra (mismo dato fresco que ya usa
  // crearAuditoria — es un fetch pesado, ~1 minuto, aceptable acá porque
  // corre desatendido, no bloqueando a un usuario esperando en pantalla).
  const allAlegraItems = await inventoryService.getInventariableItems();

  const candidatos = allAlegraItems
    .map(product => {
      const stock = product.inventory?.availableQuantity ? parseFloat(product.inventory.availableQuantity) : 0;
      const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;
      const mainPrice = product.price?.find(p => p.main === true) || product.price?.[0];
      const price = mainPrice ? parseFloat(mainPrice.price) : 0;
      const reference = product.reference?.reference || product.reference || '';
      const category = product.itemCategory?.name || product.category?.name || '';
      const ultimaVenta = ultimaVentaMap.get(String(product.id)) || null;

      return {
        alegra_id: product.id,
        name: product.name,
        reference,
        category,
        stock,
        cost,
        price,
        ultimaVenta
      };
    })
    // Con stock, y sin venta registrada en la ventana de historial O cuya
    // última venta conocida es anterior al límite de días. Se excluyen los
    // productos comodín de gastos (ver PRODUCTOS_EXCLUIDOS_EXCESO).
    .filter(item =>
      item.stock > 0 &&
      (!item.ultimaVenta || item.ultimaVenta < fechaLimiteStr) &&
      !PRODUCTOS_EXCLUIDOS_EXCESO.includes(String(item.alegra_id))
    )
    // Los que más plata tienen inmovilizada primero.
    .sort((a, b) => (b.stock * b.cost) - (a.stock * a.cost));

  console.log(`📊 ${candidatos.length} productos en exceso detectados (de ${allAlegraItems.length} inventariables)`);
  return { candidatos, itemsAlegra: allAlegraItems };
}

/**
 * Crea la tanda de empaque "Excesos N" con los candidatos de mayor valor
 * inmovilizado.
 *
 * LA CREA UNA PERSONA, NO EL RELOJ. Antes la armaba el cron todos los
 * domingos y aparecían tandas que nadie había pedido: se acumulaban sin
 * empacar y el historial dejaba de decir nada. Después hubo un cron
 * intermedio que solo escalaba descuentos sin armar tanda; también se quitó
 * (2026-09-20) — ya no hay nada de excesos corriendo sin que alguien lo pida
 * desde "Generar Ahora".
 */
async function generarTandaDeExcesos() {
  await sincronizarVentasRecientes();

  const { candidatos, itemsAlegra } = await detectarCandidatosExceso();
  const totalDetectados = candidatos.length;
  const seleccionados = candidatos.slice(0, MAX_EXCESOS_POR_SEMANA);

  // El descuento se da de alta para TODOS los detectados, no solo los
  // seleccionados para empacar — es un problema de venta, no de capacidad de
  // los empleados para revisarlos físicamente.
  const regalosNuevos = await escalarDescuentosExceso(candidatos);

  // Se aprovecha el catálogo en vivo que ya se trajo: sale gratis y evita
  // que la tanda nueva conviva con ofertas de productos ya agotados.
  const depurados = await depurarOfertasSinStock(itemsAlegra);

  if (seleccionados.length === 0) {
    return { creado: false, message: 'No se detectaron productos en exceso.', regalosNuevos, depurados };
  }

  const nombre = await siguienteNombreAutoincremental('exceso', 'Excesos');

  const auditRes = await query(`
    INSERT INTO inventario_auditorias (nombre, tipo, estado)
    VALUES ($1, 'exceso', 'en_progreso')
    RETURNING *;
  `, [nombre]);
  const registro = auditRes.rows[0];

  // stock_real queda pendiente (NULL) y ajustado_alegra en FALSE — a
  // diferencia del diseño anterior (solo lectura), un exceso ahora es una
  // "factura de empaque": el empleado revisa cada producto y, si la
  // cantidad física real difiere de la que muestra Alegra, la corrige ahí
  // mismo reusando el mismo guardarConteos/ajustarEnAlegra que ya usan las
  // auditorías normales.
  for (const item of seleccionados) {
    await query(`
      INSERT INTO inventario_auditoria_items
        (auditoria_id, alegra_id, nombre_producto, referencia, category, stock_sistema, costo_unitario, precio_venta, ultima_venta)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `, [
      registro.id,
      String(item.alegra_id),
      item.name,
      item.reference,
      item.category,
      item.stock,
      item.cost,
      item.price,
      item.ultimaVenta
    ]);
  }

  console.log(`✅ "${nombre}" creado con ${seleccionados.length} productos (de ${totalDetectados} detectados en total).`);
  return { creado: true, id: registro.id, nombre, total: seleccionados.length, totalDetectados, regalosNuevos, depurados };
}

/**
 * Marcar/desmarcar un producto de un exceso como empacado, y opcionalmente
 * corregir su cantidad física (si el empleado la encontró distinta a la que
 * muestra Alegra). La corrección de cantidad reusa applyBatchedAdjustments
 * — el mismo mecanismo que ya usan las auditorías normales — para aplicar
 * el ajuste real en Alegra de inmediato.
 */
async function actualizarItemExceso(auditoriaId, itemId, { empacado, stockReal }) {
  const itemRes = await query(`
    SELECT * FROM inventario_auditoria_items WHERE id = $1 AND auditoria_id = $2;
  `, [itemId, auditoriaId]);
  if (itemRes.rows.length === 0) {
    throw httpError(404, 'Producto no encontrado en este exceso.');
  }
  const item = itemRes.rows[0];

  if (stockReal !== undefined && stockReal !== null && stockReal !== '') {
    const nuevoStockReal = Number(stockReal);
    if (isNaN(nuevoStockReal) || nuevoStockReal < 0) {
      throw httpError(400, 'Cantidad inválida.');
    }

    await query(`UPDATE inventario_auditoria_items SET stock_real = $1 WHERE id = $2;`, [nuevoStockReal, itemId]);

    if (!item.ajustado_alegra && nuevoStockReal !== Number(item.stock_sistema)) {
      const result = await applyBatchedAdjustments(
        [{ ...item, stock_real: nuevoStockReal }],
        `Corrección de cantidad al empacar exceso (Auditoría ID: ${auditoriaId})`
      );
      if (!result.ok) {
        throw Object.assign(httpError(500, 'No se pudo aplicar el ajuste de inventario en Alegra.'), {
          partialResult: result
        });
      }
    }
  }

  if (empacado !== undefined) {
    await query(`UPDATE inventario_auditoria_items SET empacado = $1 WHERE id = $2;`, [Boolean(empacado), itemId]);
  }

  const actualizado = await query(`SELECT * FROM inventario_auditoria_items WHERE id = $1;`, [itemId]);
  return actualizado.rows[0];
}

// --- Control manual de excesos ---
//
// La detección automática (detectarCandidatosExceso, disparada desde
// "Generar Ahora") decide por stock y días sin venta. Eso cubre el caso
// normal, pero no todo: hay productos que uno
// sabe que sobran por razones que el sistema no ve (temporada que pasó,
// proveedor que ya no se trabaja, empaque dañado) y otros que la regla
// marca pero no conviene rematar. Estas funciones dejan corregir eso a mano
// sin tocar la detección automática, que sigue igual.

/**
 * Crea una tanda de excesos vacía, para armarla a mano producto por
 * producto. Mismo nombre autoincremental que las automáticas: una vez
 * creada es indistinguible de una generada por el cron, y la revisan y
 * empacan con la misma pantalla.
 */
async function crearExcesoManual() {
  const nombre = await siguienteNombreAutoincremental('exceso', 'Excesos');

  const result = await query(`
    INSERT INTO inventario_auditorias (nombre, tipo, estado)
    VALUES ($1, 'exceso', 'en_progreso')
    RETURNING *;
  `, [nombre]);

  return result.rows[0];
}

/**
 * Elimina una tanda de excesos completa (los ítems caen solos por el ON
 * DELETE CASCADE de inventario_auditoria_items).
 *
 * Se niega si algún ítem ya se ajustó en Alegra: ese ajuste movió
 * inventario de verdad, y borrar la tanda dejaría el movimiento sin
 * respaldo de por qué se hizo. Mismo criterio que eliminarItemDevolucion.
 */
async function eliminarAuditoria(id) {
  const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [id]);
  if (auditRes.rows.length === 0) {
    throw httpError(404, 'Registro no encontrado.');
  }
  if (auditRes.rows[0].tipo !== 'exceso') {
    throw httpError(400, 'Solo se pueden eliminar tandas de excesos.');
  }

  const ajustados = await query(
    `SELECT COUNT(*)::int AS n FROM inventario_auditoria_items WHERE auditoria_id = $1 AND ajustado_alegra = TRUE;`,
    [id]
  );
  if (ajustados.rows[0].n > 0) {
    throw httpError(400, `No se puede eliminar: ${ajustados.rows[0].n} producto(s) de esta tanda ya se ajustaron en Alegra.`);
  }

  await query(`DELETE FROM inventario_auditorias WHERE id = $1;`, [id]);
  return { eliminado: true, nombre: auditRes.rows[0].nombre };
}

/**
 * Agrega un producto elegido a mano a una tanda de excesos en progreso.
 *
 * A diferencia de agregarItemDevolucion, stock_real queda NULL: el exceso
 * es una "factura de empaque" y esa cantidad la llena quien empaca si la
 * física no coincide con Alegra (ver actualizarItemExceso).
 */
async function agregarItemExceso(auditoriaId, { alegraId }) {
  const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [auditoriaId]);
  if (auditRes.rows.length === 0) {
    throw httpError(404, 'Tanda de excesos no encontrada.');
  }
  const exceso = auditRes.rows[0];
  if (exceso.tipo !== 'exceso') {
    throw httpError(400, 'Este registro no es una tanda de excesos.');
  }
  if (exceso.estado !== 'en_progreso') {
    throw httpError(400, 'Esta tanda ya fue finalizada.');
  }
  if (!alegraId) {
    throw httpError(400, 'Producto inválido.');
  }

  const yaEsta = await query(
    `SELECT id FROM inventario_auditoria_items WHERE auditoria_id = $1 AND alegra_id = $2;`,
    [auditoriaId, String(alegraId)]
  );
  if (yaEsta.rows.length > 0) {
    throw httpError(400, 'Ese producto ya está en esta tanda.');
  }

  // Igual que en devoluciones: el buscador usa la caché local (rápida, sin
  // existencias) y el stock/costo frescos se piden puntualmente acá.
  let productoAlegra;
  try {
    productoAlegra = await inventoryService.getItemById(alegraId);
  } catch (error) {
    throw httpError(400, 'No se pudo obtener el producto desde Alegra. Intenta de nuevo.');
  }

  const mainPrice = productoAlegra.price?.find(p => p.main === true) || productoAlegra.price?.[0];
  const precioVenta = mainPrice ? parseFloat(mainPrice.price) : 0;
  const costoUnitario = productoAlegra.inventory?.unitCost ? parseFloat(productoAlegra.inventory.unitCost) : 0;
  const referencia = productoAlegra.reference?.reference || productoAlegra.reference || '';
  const categoria = productoAlegra.itemCategory?.name || productoAlegra.category?.name || '';
  const stockActual = productoAlegra.inventory?.availableQuantity ? parseFloat(productoAlegra.inventory.availableQuantity) : 0;

  const result = await query(`
    INSERT INTO inventario_auditoria_items
      (auditoria_id, alegra_id, nombre_producto, referencia, category, stock_sistema, stock_real, costo_unitario, precio_venta)
    VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)
    RETURNING *;
  `, [
    auditoriaId,
    String(alegraId),
    productoAlegra.name,
    referencia,
    categoria,
    stockActual,
    costoUnitario,
    precioVenta
  ]);

  // Sin fila en producto_descuento_exceso el producto NO llega al catálogo
  // público: listarOfertas hace INNER JOIN contra esa tabla. La detección
  // automática la crea para todos los candidatos (escalarDescuentosExceso),
  // así que hasta acá solo las tandas armadas a mano quedaban invisibles —
  // se armaba una de 33 productos, se empacaba entera, y el catálogo
  // mostraba 3: los que por casualidad ya venían con descuento de una
  // detección automática anterior.
  //
  // DO NOTHING a propósito: si el producto ya tenía descuento (escalado por
  // detecciones previas o puesto a mano), meterlo en una tanda no es razón
  // para bajárselo de vuelta a DESCUENTO_INICIAL.
  await query(`
    INSERT INTO producto_descuento_exceso
      (alegra_item_id, nombre_producto, referencia, descuento_porcentaje, veces_detectado)
    VALUES ($1, $2, $3, $4, 1)
    ON CONFLICT (alegra_item_id) DO NOTHING;
  `, [String(alegraId), productoAlegra.name, referencia, DESCUENTO_INICIAL]);

  return result.rows[0];
}

/**
 * Pone el mismo descuento a todos los productos de una tanda de excesos, de
 * un solo golpe.
 *
 * escalarDescuentosExceso solo pone el descuento inicial una vez por
 * producto; no sirve para rematar un lote completo al precio que uno ya
 * decidió, producto por producto.
 *
 * Reactiva los regalados por la misma razón que guardarDescuentoExceso: el
 * flag es historial de una regalía real, no una prohibición para que una
 * persona decida volver a ofrecerlos.
 *
 * Descuento 0 = sacarlos del catálogo. Es la contraparte necesaria: una vez
 * rematada la tanda hay que poder bajarla entera sin borrar producto por
 * producto. Se pierde veces_detectado, igual que en eliminarDescuentoExceso.
 */
async function aplicarDescuentoTanda(auditoriaId, { descuentoPorcentaje }) {
  const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [auditoriaId]);
  if (auditRes.rows.length === 0) {
    throw httpError(404, 'Tanda de excesos no encontrada.');
  }
  if (auditRes.rows[0].tipo !== 'exceso') {
    throw httpError(400, 'Este registro no es una tanda de excesos.');
  }

  const descuento = Number(descuentoPorcentaje);
  if (!Number.isFinite(descuento) || descuento < 0 || descuento > 100) {
    throw httpError(400, 'El descuento debe estar entre 0 y 100.');
  }

  if (descuento === 0) {
    const borrados = await query(`
      DELETE FROM producto_descuento_exceso
      WHERE alegra_item_id IN (
        SELECT alegra_id FROM inventario_auditoria_items WHERE auditoria_id = $1
      )
      RETURNING alegra_item_id;
    `, [auditoriaId]);
    return { afectados: borrados.rows.length, descuentoPorcentaje: 0, quitados: true };
  }

  // DISTINCT ON: si el mismo alegra_id apareciera dos veces en la tanda,
  // Postgres aborta con "ON CONFLICT DO UPDATE command cannot affect row a
  // second time". agregarItemExceso ya lo impide, pero ese error sería
  // ilegible y la guarda no cuesta nada.
  const result = await query(`
    INSERT INTO producto_descuento_exceso
      (alegra_item_id, nombre_producto, referencia, descuento_porcentaje, veces_detectado, regalado)
    SELECT DISTINCT ON (iai.alegra_id)
      iai.alegra_id, iai.nombre_producto, COALESCE(iai.referencia, ''), $2::numeric, 1, FALSE
    FROM inventario_auditoria_items iai
    WHERE iai.auditoria_id = $1
    ORDER BY iai.alegra_id
    ON CONFLICT (alegra_item_id) DO UPDATE SET
      descuento_porcentaje = EXCLUDED.descuento_porcentaje,
      nombre_producto = EXCLUDED.nombre_producto,
      regalado = FALSE,
      ultima_actualizacion = CURRENT_TIMESTAMP
    RETURNING alegra_item_id;
  `, [auditoriaId, descuento]);

  return { afectados: result.rows.length, descuentoPorcentaje: descuento, quitados: false };
}

/**
 * Lista los descuentos por exceso con el dato que de verdad importa:
 * `visibleEnCatalogo`. Un descuento NO se ve en el catálogo público solo por
 * existir — la consulta de catalogo-agente.service.js exige además que el
 * producto haya sido marcado empacado en alguna tanda y que le quede stock.
 * Sin exponer eso, alguien pone un 40% a mano, no pasa nada en el catálogo,
 * y parece que el sistema está roto.
 */
async function listarDescuentosExceso() {
  const result = await query(`
    WITH ultimo_empaque AS (
      SELECT DISTINCT ON (iai.alegra_id)
        iai.alegra_id,
        COALESCE(iai.stock_real, iai.stock_sistema) AS stock_efectivo
      FROM inventario_auditoria_items iai
      JOIN inventario_auditorias ia ON ia.id = iai.auditoria_id AND ia.tipo = 'exceso'
      WHERE iai.empacado = TRUE
      ORDER BY iai.alegra_id, iai.created_at DESC
    )
    SELECT pde.*, ue.stock_efectivo
    FROM producto_descuento_exceso pde
    LEFT JOIN ultimo_empaque ue ON ue.alegra_id = pde.alegra_item_id
    ORDER BY pde.regalado ASC, pde.descuento_porcentaje DESC, pde.nombre_producto ASC;
  `);

  return result.rows.map(row => {
    const stockEfectivo = row.stock_efectivo !== null ? Number(row.stock_efectivo) : null;
    const empacado = stockEfectivo !== null;
    return {
      alegraItemId: row.alegra_item_id,
      nombreProducto: row.nombre_producto,
      referencia: row.referencia,
      descuentoPorcentaje: Number(row.descuento_porcentaje),
      vecesDetectado: row.veces_detectado,
      regalado: row.regalado,
      ultimaActualizacion: row.ultima_actualizacion,
      stockEfectivo,
      visibleEnCatalogo: !row.regalado && empacado && stockEfectivo > 0,
      motivoNoVisible: row.regalado
        ? 'Ya se regaló'
        : !empacado
          ? 'Todavía no se ha empacado en ninguna tanda'
          : stockEfectivo <= 0
            ? 'No queda stock'
            : null
    };
  });
}

/**
 * Pone o cambia a mano el descuento de un producto. Sirve tanto para meter
 * uno que la detección automática no agarró como para corregirle el
 * porcentaje a uno que ya estaba.
 *
 * Si el producto estaba marcado como regalado, ponerle un descuento nuevo lo
 * reactiva: el `regalado` existe para que el escalado automático no lo siga
 * tocando, no para prohibir que una persona decida volver a ofrecerlo.
 */
async function guardarDescuentoExceso({ alegraItemId, descuentoPorcentaje }) {
  if (!alegraItemId) throw httpError(400, 'Producto inválido.');

  const descuento = Number(descuentoPorcentaje);
  if (!Number.isFinite(descuento) || descuento < 0 || descuento > 100) {
    throw httpError(400, 'El descuento debe estar entre 0 y 100.');
  }

  const productoRes = await query(
    `SELECT alegra_id, name, reference FROM alegra_products_cache WHERE alegra_id = $1;`,
    [String(alegraItemId)]
  );
  if (productoRes.rows.length === 0) {
    throw httpError(404, 'Producto no encontrado en el catálogo.');
  }
  const producto = productoRes.rows[0];

  const result = await query(`
    INSERT INTO producto_descuento_exceso
      (alegra_item_id, nombre_producto, referencia, descuento_porcentaje, veces_detectado, regalado)
    VALUES ($1, $2, $3, $4, 1, FALSE)
    ON CONFLICT (alegra_item_id) DO UPDATE SET
      descuento_porcentaje = EXCLUDED.descuento_porcentaje,
      nombre_producto = EXCLUDED.nombre_producto,
      regalado = FALSE,
      ultima_actualizacion = CURRENT_TIMESTAMP
    RETURNING *;
  `, [String(alegraItemId), producto.name, producto.reference || '', descuento]);

  return result.rows[0];
}

/**
 * Saca un producto de la lista de descuentos. Deja de verse en el catálogo
 * público de inmediato. Si la detección automática lo vuelve a marcar como
 * exceso, arranca de nuevo desde DESCUENTO_INICIAL — no recuerda el
 * porcentaje anterior, que es justo lo que se quiere al sacarlo a propósito.
 */
async function eliminarDescuentoExceso(alegraItemId) {
  const result = await query(
    `DELETE FROM producto_descuento_exceso WHERE alegra_item_id = $1 RETURNING nombre_producto;`,
    [String(alegraItemId)]
  );
  if (result.rows.length === 0) {
    throw httpError(404, 'Ese producto no tenía descuento por exceso.');
  }
  return { eliminado: true, nombre: result.rows[0].nombre_producto };
}

/**
 * Listar regalías entregadas (productos que llegaron a 100% de descuento).
 * Ya no se generan solas (ver escalarDescuentosExceso) — esto queda como
 * historial de lo que sí llegó a regalarse mientras la escalada automática
 * existió.
 */
async function listarRegalos() {
  const result = await query(`
    SELECT * FROM regalos_exceso ORDER BY fecha_regalo DESC;
  `);
  return result.rows;
}

module.exports = {
  listarAuditorias,
  listarCategorias,
  crearAuditoria,
  getAuditoria,
  guardarConteos,
  guardarConteoIndividual,
  finalizarAuditoria,
  ajustarEnAlegra,
  resincronizarAuditoria,
  crearDevolucion,
  buscarProductosParaDevolucion,
  agregarItemDevolucion,
  eliminarItemDevolucion,
  sincronizarVentasRecientes,
  detectarCandidatosExceso,
  escalarDescuentosExceso,
  generarTandaDeExcesos,
  depurarOfertasSinStock,
  actualizarItemExceso,
  listarRegalos,
  // Control manual de excesos
  crearExcesoManual,
  eliminarAuditoria,
  agregarItemExceso,
  aplicarDescuentoTanda,
  listarDescuentosExceso,
  guardarDescuentoExceso,
  eliminarDescuentoExceso
};

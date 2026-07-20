/**
 * Inventario-Auditorias Module - Service
 * Lógica de negocio para auditorías cíclicas de inventario (conteo físico
 * vs. sistema) y su ajuste en Alegra.
 */

const { query } = require('../../../config/database');
const { getInventoryService } = require('../../integrations/alegra');

const inventoryService = getInventoryService();

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
  const today = new Date().toISOString().split('T')[0];
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
  // Las devoluciones no expiran a las 24h: cada ítem captura su propio stock
  // fresco al agregarse (no hay un baseline único que se vuelva obsoleto como
  // en una auditoría cíclica), y pueden quedar abiertas varios días mientras
  // van llegando productos devueltos.
  const expirada = audit.tipo !== 'devolucion' && audit.estado === 'en_progreso' && difHoras >= 24;

  const itemsRes = await query(`
    SELECT
      iai.id, iai.auditoria_id, iai.alegra_id, iai.nombre_producto, iai.referencia,
      iai.category, iai.stock_sistema, iai.stock_real, iai.costo_unitario,
      iai.precio_venta, iai.created_at, iai.ajustado_alegra,
      apc.image_url
    FROM inventario_auditoria_items iai
    LEFT JOIN alegra_products_cache apc ON apc.alegra_id = iai.alegra_id
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
 * Finalizar una auditoría calculando sus estadísticas de precisión y descuadre
 */
async function finalizarAuditoria(id, observaciones) {
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
async function crearDevolucion() {
  // Nombre autoincremental "Ajuste N": se busca el número más alto ya usado
  // entre las devoluciones existentes (sin asumir que son consecutivas, por
  // si alguna vez se borra una a mano) y se usa el siguiente.
  const existentes = await query(`SELECT nombre FROM inventario_auditorias WHERE tipo = 'devolucion';`);
  let maxNumero = 0;
  existentes.rows.forEach(row => {
    const match = /^ajuste\s+(\d+)$/i.exec((row.nombre || '').trim());
    if (match) {
      const numero = parseInt(match[1], 10);
      if (numero > maxNumero) maxNumero = numero;
    }
  });
  const nombre = `Ajuste ${maxNumero + 1}`;

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
 * Quitar un producto agregado por error a una devolución, antes de aplicar el ajuste en Alegra.
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

module.exports = {
  listarAuditorias,
  listarCategorias,
  crearAuditoria,
  getAuditoria,
  guardarConteos,
  finalizarAuditoria,
  ajustarEnAlegra,
  resincronizarAuditoria,
  crearDevolucion,
  buscarProductosParaDevolucion,
  agregarItemDevolucion,
  eliminarItemDevolucion
};

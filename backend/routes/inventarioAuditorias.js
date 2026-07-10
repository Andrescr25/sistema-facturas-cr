const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const AlegraService = require('../services/alegraService');
const alegraService = new AlegraService();

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
      responseData = await alegraService.createInventoryAdjustment(payload);
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

// 1. GET / - Listar todas las auditorías
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM inventario_auditorias 
      ORDER BY fecha_creacion DESC;
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listando auditorías:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET /categorias - Listar categorías únicas
router.get('/categorias', async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT category 
      FROM alegra_products_cache 
      WHERE status = 'active' AND category IS NOT NULL AND category != ''
      ORDER BY category;
    `);
    const categorias = result.rows.map(row => row.category);
    res.json({ success: true, data: categorias });
  } catch (error) {
    console.error('Error obteniendo categorías de productos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST / - Crear nueva auditoría usando stock y productos en vivo de Alegra
router.post('/', async (req, res) => {
  const { tipo, categoria, nombre } = req.body; // tipo: 'random', 'categoria', 'critico'

  try {
    console.log('Obteniendo catálogo de inventario en vivo directamente de Alegra...');
    const allAlegraItems = await alegraService.getInventariableItems();
    
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
        return res.status(400).json({ success: false, message: 'La categoría es requerida para este tipo de auditoría.' });
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
      return res.status(400).json({ success: false, message: 'Tipo de auditoría no válido.' });
    }

    if (candidateProducts.length === 0) {
      return res.status(400).json({ success: false, message: 'No se encontraron productos para auditar.' });
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

    res.json({ success: true, data: audit });
  } catch (error) {
    console.error('Error creando auditoría de inventario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. GET /:id - Obtener una auditoría específica con sus ítems (y validar expiración de 24h)
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [id]);
    if (auditRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Auditoría no encontrada.' });
    }

    const audit = auditRes.rows[0];
    const fechaCreacion = new Date(audit.fecha_creacion);
    const ahora = new Date();
    const difHoras = (ahora - fechaCreacion) / (1000 * 60 * 60);
    const expirada = audit.estado === 'en_progreso' && difHoras >= 24;

    const itemsRes = await query(`
      SELECT * FROM inventario_auditoria_items 
      WHERE auditoria_id = $1 
      ORDER BY nombre_producto;
    `, [id]);

    res.json({
      success: true,
      data: {
        ...audit,
        expirada,
        items: itemsRes.rows
      }
    });
  } catch (error) {
    console.error('Error obteniendo detalle de auditoría:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. PUT /:id/items - Guardar conteos y aplicar ajustes en Alegra de inmediato
router.put('/:id/items', async (req, res) => {
  const { id } = req.params;
  const { items } = req.body; // Array de { id, stock_real }

  try {
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
        return res.status(500).json({
          success: false,
          message: result.itemsAdjusted > 0
            ? `Conteos guardados. Se aplicó el ajuste en Alegra para ${result.itemsAdjusted} de ${result.totalItems} ítems (lote ${result.batchesCompleted} de ${result.totalBatches}) antes de un error. Guarda de nuevo para reintentar los restantes.`
            : 'Los conteos se guardaron, pero no se pudo aplicar el ajuste de inventario en Alegra. Guarda de nuevo para reintentarlo.',
          error: result.errorDetail
        });
      }

      message = result.totalBatches > 1
        ? `Conteos guardados y ajuste de inventario aplicado con éxito en Alegra (${result.itemsAdjusted} ítems en ${result.totalBatches} lotes).`
        : 'Conteos guardados y ajuste de inventario aplicado con éxito en Alegra.';
    }

    res.json({ success: true, message });
  } catch (error) {
    console.error('Error actualizando conteos:', error);
    res.status(500).json({
      success: false,
      message: 'No se pudieron guardar los conteos.',
      error: error.response?.data || error.message
    });
  }
});

// 6. POST /:id/finalizar - Cerrar sesión calculando estadísticas
router.post('/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  const { observaciones } = req.body;

  try {
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

    res.json({
      success: true,
      message: 'Auditoría finalizada con éxito',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error finalizando auditoría:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. POST /:id/ajustar-alegra - Aplicar ajuste en la API de Alegra
router.post('/:id/ajustar-alegra', async (req, res) => {
  const { id } = req.params;

  try {
    const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [id]);
    if (auditRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Auditoría no encontrada.' });
    }
    const audit = auditRes.rows[0];

    // Igual que en PUT /:id/items: sólo ítems con conteo real y aún NO ajustados en Alegra. Evita
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
      return res.json({
        success: true,
        message: itemsRes.rows.length > 0
          ? 'No hay diferencias de stock para ajustar. Los ítems contados ya estaban conciliados.'
          : 'No hay diferencias de stock pendientes de ajustar.'
      });
    }

    const result = await applyBatchedAdjustments(
      itemsConDiferencia,
      `Ajuste automático generado desde Módulo de Auditoría de Inventario (Auditoría ID: ${id} - ${audit.nombre})`
    );

    if (!result.ok) {
      return res.status(500).json({
        success: false,
        message: result.itemsAdjusted > 0
          ? `Se aplicó el ajuste en Alegra para ${result.itemsAdjusted} de ${result.totalItems} ítems (lote ${result.batchesCompleted} de ${result.totalBatches}) antes de un error. Presiona "Aplicar Ajuste en Alegra" nuevamente para reintentar los restantes.`
          : 'No se pudo aplicar el ajuste en Alegra. Verifique los detalles de error.',
        error: result.errorDetail
      });
    }

    res.json({
      success: true,
      message: result.totalBatches > 1
        ? `Se aplicó con éxito el ajuste de inventario en Alegra (${result.itemsAdjusted} ítems en ${result.totalBatches} lotes, IDs: ${result.adjustmentIds.join(', ')}).`
        : `Se aplicó con éxito el ajuste de inventario en Alegra con ID ${result.adjustmentIds[0]}`,
      data: { adjustmentIds: result.adjustmentIds, totalBatches: result.totalBatches, itemsAdjusted: result.itemsAdjusted }
    });
  } catch (error) {
    console.error('Error aplicando ajuste en Alegra:', error);
    res.status(500).json({
      success: false,
      message: 'No se pudo aplicar el ajuste en Alegra. Verifique los detalles de error.',
      error: error.response?.data || error.message
    });
  }
});

// 8. POST /:id/resync - Re-sincronizar stocks desde Alegra para auditorías expiradas
router.post('/:id/resync', async (req, res) => {
  const { id } = req.params;

  try {
    const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [id]);
    if (auditRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Auditoría no encontrada.' });
    }

    console.log(`🔄 Re-sincronizando catálogo en vivo de Alegra para auditoría ID: ${id}...`);
    const allAlegraItems = await alegraService.getInventariableItems();

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

    res.json({ success: true, message: 'Auditoría re-sincronizada correctamente con los stocks y costos actuales de Alegra.' });
  } catch (error) {
    console.error('Error re-sincronizando auditoría:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

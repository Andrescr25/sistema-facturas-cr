const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const AlegraService = require('../services/alegraService');
const alegraService = new AlegraService();

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

// 4. GET /:id - Obtener una auditoría específica con sus ítems
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const auditRes = await query(`SELECT * FROM inventario_auditorias WHERE id = $1;`, [id]);
    if (auditRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Auditoría no encontrada.' });
    }

    const itemsRes = await query(`
      SELECT * FROM inventario_auditoria_items 
      WHERE auditoria_id = $1 
      ORDER BY nombre_producto;
    `, [id]);

    res.json({
      success: true,
      data: {
        ...auditRes.rows[0],
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
      SELECT id, alegra_id, stock_sistema, stock_real, ajustado_alegra
      FROM inventario_auditoria_items
      WHERE auditoria_id = $1 AND stock_real IS NOT NULL AND ajustado_alegra = FALSE;
    `, [id]);

    const itemsAJustar = itemsRes.rows.filter(
      item => Number(item.stock_real) !== Number(item.stock_sistema)
    );

    let message = 'Conteos guardados exitosamente.';

    if (itemsAJustar.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const adjustmentItems = itemsAJustar.map(item => ({
        id: Number(item.alegra_id),
        quantity: Number(item.stock_real) - Number(item.stock_sistema)
      }));

      const payload = {
        date: today,
        observations: `Ajuste incremental automático desde Módulo de Auditoría (ID: ${id} - ${auditNombre})`,
        items: adjustmentItems
      };

      console.log(`Enviando ajuste de inventario incremental a Alegra para ${adjustmentItems.length} ítems...`);
      const responseData = await alegraService.createInventoryAdjustment(payload);

      // Marcar los ítems procesados como ajustados
      const idsAjustados = itemsRes.rows.map(item => item.id);
      await query(`
        UPDATE inventario_auditoria_items
        SET ajustado_alegra = TRUE
        WHERE id = ANY($1::int[]);
      `, [idsAjustados]);

      message = `Conteos guardados y ajuste de inventario aplicado con éxito en Alegra.`;
    } else {
      // Si no hay diferencias pero tienen conteo real, también los marcamos como ajustados (su diferencia fue 0)
      const idsSinDiferencia = itemsRes.rows.map(item => item.id);
      if (idsSinDiferencia.length > 0) {
        await query(`
          UPDATE inventario_auditoria_items
          SET ajustado_alegra = TRUE
          WHERE id = ANY($1::int[]);
        `, [idsSinDiferencia]);
      }
    }

    res.json({ success: true, message });
  } catch (error) {
    console.error('Error actualizando conteos:', error);
    res.status(500).json({ success: false, error: error.message });
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

    const itemsRes = await query(`
      SELECT id, alegra_id, stock_sistema, stock_real 
      FROM inventario_auditoria_items 
      WHERE auditoria_id = $1 AND stock_real IS NOT NULL;
    `, [id]);

    const itemsConDiferencia = itemsRes.rows.filter(
      item => Number(item.stock_real) !== Number(item.stock_sistema)
    );

    if (itemsConDiferencia.length === 0) {
      return res.json({ success: true, message: 'No hay diferencias de stock para ajustar.' });
    }

    const today = new Date().toISOString().split('T')[0];

    const adjustmentItems = itemsConDiferencia.map(item => {
      // Diferencia = Real - Sistema
      const qtyDiff = Number(item.stock_real) - Number(item.stock_sistema);
      return {
        id: Number(item.alegra_id),
        quantity: qtyDiff
      };
    });

    const payload = {
      date: today,
      observations: `Ajuste automático generado desde Módulo de Auditoría de Inventario (Auditoría ID: ${id} - ${audit.nombre})`,
      items: adjustmentItems
    };

    console.log(`📤 Enviando ajuste de inventario a Alegra para ${adjustmentItems.length} ítems...`);
    const responseData = await alegraService.createInventoryAdjustment(payload);

    res.json({
      success: true,
      message: `Se aplicó con éxito el ajuste de inventario en Alegra con ID ${responseData.id}`,
      data: responseData
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

module.exports = router;

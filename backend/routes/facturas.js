const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// Obtener todas las facturas locales
router.get('/', async (req, res) => {
  try {
    const { semana, mes, ano, procesada, cliente } = req.query;
    
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
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
      filters: { semana, mes, ano, procesada, cliente }
    });
  } catch (error) {
    console.error('Error obteniendo facturas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo facturas'
    });
  }
});

// Obtener una factura específica con sus items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener datos de la factura
    const facturaResult = await query(
      'SELECT * FROM facturas WHERE id = $1',
      [id]
    );
    
    if (facturaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada'
      });
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
    
    res.json({
      success: true,
      data: factura
    });
  } catch (error) {
    console.error('Error obteniendo factura:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo factura'
    });
  }
});

// Crear nueva factura (sincronizar desde Alegra)
router.post('/', async (req, res) => {
  try {
    const {
      numero_factura,
      alegra_id,
      cliente_nombre,
      cliente_email,
      fecha_emision,
      total,
      items
    } = req.body;
    
    // Validaciones
    if (!numero_factura || !alegra_id || !cliente_nombre || !fecha_emision) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: numero_factura, alegra_id, cliente_nombre, fecha_emision'
      });
    }
    
    // Calcular semana, mes y año
    const fecha = new Date(fecha_emision);
    const semana = calculateWeekOfMonth(fecha);
    const mes = fecha.getMonth() + 1;
    const ano = fecha.getFullYear();
    
    // Insertar factura
    const facturaResult = await query(`
      INSERT INTO facturas (numero_factura, alegra_id, cliente_nombre, cliente_email, 
                           fecha_emision, semana, mes, ano, total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [numero_factura, alegra_id, cliente_nombre, cliente_email, fecha_emision, semana, mes, ano, total]);
    
    const facturaId = facturaResult.rows[0].id;
    
    // Insertar items si se proporcionan
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
          item.cantidad, // Inicialmente, entregada = original
          item.precio_unitario,
          item.subtotal
        ]);
      }
    }
    
    res.status(201).json({
      success: true,
      data: facturaResult.rows[0],
      message: 'Factura creada exitosamente'
    });
  } catch (error) {
    console.error('Error creando factura:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: 'Ya existe una factura con ese número'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error creando factura'
    });
  }
});

// Actualizar factura
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { procesada, observaciones } = req.body;
    
    const result = await query(`
      UPDATE facturas 
      SET procesada = COALESCE($1, procesada),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [procesada, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Factura actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error actualizando factura:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error actualizando factura'
    });
  }
});

// Marcar factura como procesada
router.patch('/:id/procesada', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      UPDATE facturas 
      SET procesada = true
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Factura marcada como procesada'
    });
  } catch (error) {
    console.error('Error marcando factura como procesada:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error marcando factura como procesada'
    });
  }
});

// Buscar facturas
router.get('/buscar/:termino', async (req, res) => {
  try {
    const { termino } = req.params;
    
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
    
    res.json({
      success: true,
      data: result.rows,
      searchTerm: termino,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error buscando facturas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error buscando facturas'
    });
  }
});

// Función helper para calcular semana del mes
function calculateWeekOfMonth(date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfMonth = date.getDate();
  const dayOfWeek = firstDay.getDay();
  
  return Math.ceil((dayOfMonth + dayOfWeek) / 7);
}

module.exports = router;
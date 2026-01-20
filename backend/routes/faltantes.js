const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// Obtener todos los faltantes
router.get('/', async (req, res) => {
  try {
    const { semana, mes, ano, tipo_faltante, proveedor_id } = req.query;
    
    let sql = `
      SELECT f.*, 
             fa.numero_factura, fa.cliente_nombre, fa.fecha_emision,
             p.nombre as producto_nombre, p.codigo as producto_codigo,
             pr.nombre as proveedor_nombre
      FROM faltantes f
      JOIN facturas fa ON f.factura_id = fa.id
      JOIN productos p ON f.producto_id = p.id
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
    `;
    
    const conditions = ["f.tipo_faltante != 'completo'", "f.cantidad_faltante > 0"];
    const params = [];
    let paramIndex = 1;
    
    if (semana) {
      conditions.push(`fa.semana = $${paramIndex++}`);
      params.push(semana);
    }
    
    if (mes) {
      conditions.push(`fa.mes = $${paramIndex++}`);
      params.push(mes);
    }
    
    if (ano) {
      conditions.push(`fa.ano = $${paramIndex++}`);
      params.push(ano);
    }
    
    if (tipo_faltante) {
      conditions.push(`f.tipo_faltante = $${paramIndex++}`);
      params.push(tipo_faltante);
    }
    
    if (proveedor_id) {
      conditions.push(`p.proveedor_id = $${paramIndex++}`);
      params.push(proveedor_id);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY f.created_at DESC';
    
    const result = await query(sql, params);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
      filters: { semana, mes, ano, tipo_faltante, proveedor_id }
    });
  } catch (error) {
    console.error('Error obteniendo faltantes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo faltantes'
    });
  }
});

// Registrar nuevo faltante
router.post('/', async (req, res) => {
  try {
    const {
      factura_id,
      producto_id,
      cantidad_faltante,
      tipo_faltante,
      observaciones,
      registrado_por
    } = req.body;
    
    // Validaciones
    if (!factura_id || !producto_id || !cantidad_faltante || !tipo_faltante) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: factura_id, producto_id, cantidad_faltante, tipo_faltante'
      });
    }
    
    if (!['total', 'parcial'].includes(tipo_faltante)) {
      return res.status(400).json({
        success: false,
        message: 'tipo_faltante debe ser "total" o "parcial"'
      });
    }
    
    // Verificar que la factura y producto existan
    const facturaCheck = await query('SELECT id FROM facturas WHERE id = $1', [factura_id]);
    if (facturaCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada'
      });
    }
    
    const productoCheck = await query('SELECT id FROM productos WHERE id = $1', [producto_id]);
    if (productoCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }
    
    // Insertar faltante
    const result = await query(`
      INSERT INTO faltantes (factura_id, producto_id, cantidad_faltante, 
                           tipo_faltante, observaciones, registrado_por)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [factura_id, producto_id, cantidad_faltante, tipo_faltante, observaciones, registrado_por]);
    
    // Si es faltante parcial, actualizar cantidad entregada en factura_items
    if (tipo_faltante === 'parcial') {
      await query(`
        UPDATE factura_items 
        SET cantidad_entregada = cantidad_original - $1
        WHERE factura_id = $2 AND producto_id = $3
      `, [cantidad_faltante, factura_id, producto_id]);
    } else if (tipo_faltante === 'total') {
      // Si es faltante total, cantidad entregada = 0
      await query(`
        UPDATE factura_items 
        SET cantidad_entregada = 0
        WHERE factura_id = $1 AND producto_id = $2
      `, [factura_id, producto_id]);
    }
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Faltante registrado exitosamente'
    });
  } catch (error) {
    console.error('Error registrando faltante:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error registrando faltante'
    });
  }
});

// Registrar múltiples faltantes de una factura
router.post('/factura/:id/multiple', async (req, res) => {
  try {
    const { id: factura_id } = req.params;
    const { faltantes, registrado_por } = req.body;
    
    if (!faltantes || !Array.isArray(faltantes) || faltantes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de faltantes'
      });
    }
    
    const insertedFaltantes = [];
    
    for (const faltante of faltantes) {
      const {
        producto_id,
        cantidad_faltante,
        tipo_faltante,
        observaciones
      } = faltante;
      
      // Validar cada faltante
      if (!producto_id || !cantidad_faltante || !tipo_faltante) {
        continue; // Saltar este faltante si faltan datos
      }
      
      // Insertar faltante
      const result = await query(`
        INSERT INTO faltantes (factura_id, producto_id, cantidad_faltante, 
                             tipo_faltante, observaciones, registrado_por)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [factura_id, producto_id, cantidad_faltante, tipo_faltante, observaciones, registrado_por]);
      
      insertedFaltantes.push(result.rows[0]);
      
      // Actualizar cantidad entregada
      if (tipo_faltante === 'parcial') {
        await query(`
          UPDATE factura_items 
          SET cantidad_entregada = cantidad_original - $1
          WHERE factura_id = $2 AND producto_id = $3
        `, [cantidad_faltante, factura_id, producto_id]);
      } else if (tipo_faltante === 'total') {
        await query(`
          UPDATE factura_items 
          SET cantidad_entregada = 0
          WHERE factura_id = $1 AND producto_id = $2
        `, [factura_id, producto_id]);
      }
    }
    
    res.status(201).json({
      success: true,
      data: insertedFaltantes,
      total: insertedFaltantes.length,
      message: `${insertedFaltantes.length} faltantes registrados exitosamente`
    });
  } catch (error) {
    console.error('Error registrando múltiples faltantes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error registrando múltiples faltantes'
    });
  }
});

// Obtener faltantes de una factura específica
router.get('/factura/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      SELECT f.*, 
             p.nombre as producto_nombre, p.codigo as producto_codigo,
             pr.nombre as proveedor_nombre
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      WHERE f.factura_id = $1 AND f.tipo_faltante != 'completo' AND f.cantidad_faltante > 0
      ORDER BY f.created_at DESC
    `, [id]);
    
    res.json({
      success: true,
      data: result.rows,
      factura_id: id,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error obteniendo faltantes de factura:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo faltantes de factura'
    });
  }
});

// Actualizar faltante
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad_faltante, tipo_faltante, observaciones } = req.body;
    
    const result = await query(`
      UPDATE faltantes 
      SET cantidad_faltante = COALESCE($1, cantidad_faltante),
          tipo_faltante = COALESCE($2, tipo_faltante),
          observaciones = COALESCE($3, observaciones)
      WHERE id = $4
      RETURNING *
    `, [cantidad_faltante, tipo_faltante, observaciones, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Faltante no encontrado'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Faltante actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error actualizando faltante:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error actualizando faltante'
    });
  }
});

// Eliminar faltante
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener información del faltante antes de eliminarlo
    const faltanteInfo = await query(`
      SELECT factura_id, producto_id, cantidad_faltante, tipo_faltante 
      FROM faltantes 
      WHERE id = $1
    `, [id]);
    
    if (faltanteInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Faltante no encontrado'
      });
    }
    
    const { factura_id, producto_id, cantidad_faltante, tipo_faltante } = faltanteInfo.rows[0];
    
    // Eliminar faltante
    await query('DELETE FROM faltantes WHERE id = $1', [id]);
    
    // Restaurar cantidad entregada en factura_items
    if (tipo_faltante === 'total') {
      // Si era faltante total, restaurar cantidad original
      await query(`
        UPDATE factura_items 
        SET cantidad_entregada = cantidad_original
        WHERE factura_id = $1 AND producto_id = $2
      `, [factura_id, producto_id]);
    } else if (tipo_faltante === 'parcial') {
      // Si era faltante parcial, sumar la cantidad que faltaba
      await query(`
        UPDATE factura_items 
        SET cantidad_entregada = cantidad_entregada + $1
        WHERE factura_id = $2 AND producto_id = $3
      `, [cantidad_faltante, factura_id, producto_id]);
    }
    
    res.json({
      success: true,
      message: 'Faltante eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando faltante:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error eliminando faltante'
    });
  }
});

// Obtener resumen de faltantes por período
router.get('/resumen/:ano/:mes/:semana', async (req, res) => {
  try {
    const { ano, mes, semana } = req.params;
    
    const result = await query(`
      SELECT 
        COUNT(*) as total_faltantes,
        COUNT(DISTINCT f.factura_id) as facturas_con_faltantes,
        COUNT(DISTINCT f.producto_id) as productos_faltantes,
        SUM(f.cantidad_faltante) as cantidad_total_faltante,
        COUNT(CASE WHEN f.tipo_faltante = 'total' THEN 1 END) as faltantes_totales,
        COUNT(CASE WHEN f.tipo_faltante = 'parcial' THEN 1 END) as faltantes_parciales
      FROM faltantes f
      JOIN facturas fa ON f.factura_id = fa.id
      WHERE fa.ano = $1 AND fa.mes = $2 AND fa.semana = $3
        AND f.tipo_faltante != 'completo' AND f.cantidad_faltante > 0
    `, [ano, mes, semana]);
    
    res.json({
      success: true,
      data: result.rows[0],
      periodo: { ano, mes, semana }
    });
  } catch (error) {
    console.error('Error obteniendo resumen de faltantes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo resumen de faltantes'
    });
  }
});

module.exports = router;
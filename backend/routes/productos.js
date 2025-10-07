const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// Obtener todos los productos
router.get('/', async (req, res) => {
  try {
    const { proveedor_id, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Query base simple
    let sql = `
      SELECT p.id, p.nombre, p.codigo, p.descripcion, p.precio_unitario, p.created_at,
             pr.nombre as proveedor_nombre
      FROM productos p
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
    `;
    
    let countSql = 'SELECT COUNT(*) FROM productos p';
    
    const params = [];
    const countParams = [];
    
    // Agregar condiciones si existen
    const conditions = [];
    
    if (proveedor_id) {
      conditions.push('p.proveedor_id = $' + (params.length + 1));
      params.push(proveedor_id);
      countParams.push(proveedor_id);
    }
    
    if (search) {
      conditions.push('(p.nombre ILIKE $' + (params.length + 1) + ' OR p.codigo ILIKE $' + (params.length + 1) + ')');
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }
    
    // Aplicar condiciones
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Agregar ORDER BY, LIMIT y OFFSET
    sql += ' ORDER BY p.nombre';
    sql += ' LIMIT $' + (params.length + 1);
    sql += ' OFFSET $' + (params.length + 2);
    
    params.push(parseInt(limit));
    params.push(offset);
    
    console.log('✅ SQL Productos:', sql);
    console.log('✅ Params:', params);
    
    const result = await query(sql, params);
    
    console.log('✅ Count SQL:', countSql);
    console.log('✅ Count Params:', countParams);
    
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo productos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo productos'
    });
  }
});

// Obtener un producto específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      SELECT p.*, pr.nombre as proveedor_nombre, pr.contacto as proveedor_contacto
      FROM productos p
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      WHERE p.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error obteniendo producto:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo producto'
    });
  }
});

// Crear nuevo producto
router.post('/', async (req, res) => {
  try {
    const { nombre, codigo, descripcion, proveedor_id, precio_unitario } = req.body;
    
    if (!nombre || !proveedor_id) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y proveedor_id son requeridos'
      });
    }
    
    // Verificar que el proveedor existe
    const proveedorCheck = await query('SELECT id FROM proveedores WHERE id = $1', [proveedor_id]);
    if (proveedorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }
    
    const result = await query(`
      INSERT INTO productos (nombre, codigo, descripcion, proveedor_id, precio_unitario)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [nombre, codigo, descripcion, proveedor_id, precio_unitario]);
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Producto creado exitosamente'
    });
  } catch (error) {
    console.error('Error creando producto:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: 'Ya existe un producto con ese código'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error creando producto'
    });
  }
});

// Buscar productos
router.get('/buscar/:termino', async (req, res) => {
  try {
    const { termino } = req.params;
    
    const result = await query(`
      SELECT p.*, pr.nombre as proveedor_nombre
      FROM productos p
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      WHERE p.nombre ILIKE $1 
         OR p.codigo ILIKE $1
         OR p.descripcion ILIKE $1
      ORDER BY p.nombre
      LIMIT 50
    `, [`%${termino}%`]);
    
    res.json({
      success: true,
      data: result.rows,
      searchTerm: termino,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error buscando productos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error buscando productos'
    });
  }
});

// Obtener productos por proveedor
router.get('/proveedor/:proveedor_id', async (req, res) => {
  try {
    const { proveedor_id } = req.params;
    
    const result = await query(`
      SELECT p.*, pr.nombre as proveedor_nombre
      FROM productos p
      JOIN proveedores pr ON p.proveedor_id = pr.id
      WHERE p.proveedor_id = $1
      ORDER BY p.nombre
    `, [proveedor_id]);
    
    res.json({
      success: true,
      data: result.rows,
      proveedor_id: parseInt(proveedor_id),
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error obteniendo productos por proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo productos por proveedor'
    });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// Obtener todos los proveedores
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Consulta simple sin JOINs complejos
    let sql = `
      SELECT p.id, p.nombre, p.contacto, p.telefono, p.email, p.created_at
      FROM proveedores p
    `;
    
    let countSql = 'SELECT COUNT(*) FROM proveedores p';
    
    const params = [];
    const countParams = [];
    
    // Agregar búsqueda si existe
    if (search) {
      sql += ' WHERE (p.nombre ILIKE $1 OR p.contacto ILIKE $1 OR p.email ILIKE $1)';
      countSql += ' WHERE (p.nombre ILIKE $1 OR p.contacto ILIKE $1 OR p.email ILIKE $1)';
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }
    
    // Agregar ORDER BY, LIMIT y OFFSET
    sql += ' ORDER BY p.nombre';
    sql += ' LIMIT $' + (params.length + 1);
    sql += ' OFFSET $' + (params.length + 2);
    
    params.push(parseInt(limit));
    params.push(offset);
    
    console.log('✅ SQL Proveedores:', sql);
    console.log('✅ Params:', params);
    
    const result = await query(sql, params);
    
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    // Agregar conteos de productos para cada proveedor
    for (let proveedor of result.rows) {
      const productCount = await query(
        'SELECT COUNT(*) FROM productos WHERE proveedor_id = $1',
        [proveedor.id]
      );
      proveedor.total_productos = parseInt(productCount.rows[0].count);
      proveedor.total_faltantes = 0;
    }
    
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
    console.error('❌ Error obteniendo proveedores:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo proveedores'
    });
  }
});

// Obtener un proveedor específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query('SELECT * FROM proveedores WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }
    
    // Obtener productos del proveedor
    const productos = await query(
      'SELECT * FROM productos WHERE proveedor_id = $1 ORDER BY nombre',
      [id]
    );
    
    const proveedor = result.rows[0];
    proveedor.productos = productos.rows;
    proveedor.total_productos = productos.rows.length;
    
    res.json({
      success: true,
      data: proveedor
    });
  } catch (error) {
    console.error('Error obteniendo proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo proveedor'
    });
  }
});

// Crear nuevo proveedor
router.post('/', async (req, res) => {
  try {
    const { nombre, contacto, telefono, email } = req.body;
    
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del proveedor es requerido'
      });
    }
    
    const result = await query(`
      INSERT INTO proveedores (nombre, contacto, telefono, email)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [nombre, contacto, telefono, email]);
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Proveedor creado exitosamente'
    });
  } catch (error) {
    console.error('Error creando proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error creando proveedor'
    });
  }
});

module.exports = router;
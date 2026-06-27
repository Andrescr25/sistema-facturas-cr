const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// Reporte de faltantes por proveedor
router.get('/faltantes/proveedor', async (req, res) => {
  try {
    const { semana, mes, ano } = req.query;
    
    let sql = `
      SELECT 
        pr.id as proveedor_id,
        pr.nombre as proveedor_nombre,
        pr.contacto as proveedor_contacto,
        pr.telefono as proveedor_telefono,
        pr.email as proveedor_email,
        COUNT(DISTINCT f.id) as total_faltantes,
        COUNT(DISTINCT f.producto_id) as productos_afectados,
        SUM(f.cantidad_faltante) as cantidad_total_faltante,
        COUNT(CASE WHEN f.tipo_faltante = 'total' THEN 1 END) as faltantes_totales,
        COUNT(CASE WHEN f.tipo_faltante = 'parcial' THEN 1 END) as faltantes_parciales,
        STRING_AGG(DISTINCT p.nombre, ', ') as productos_nombres
      FROM proveedores pr
      JOIN productos p ON pr.id = p.proveedor_id
      JOIN faltantes f ON p.id = f.producto_id
      JOIN facturas fa ON f.factura_id = fa.id
    `;
    
    const conditions = ["f.tipo_faltante != 'completo'", "f.cantidad_faltante > 0"];
    const params = [];
    let paramIndex = 1;
    
    if (ano) {
      conditions.push(`fa.ano = $${paramIndex++}`);
      params.push(ano);
    }
    
    if (mes) {
      conditions.push(`fa.mes = $${paramIndex++}`);
      params.push(mes);
    }
    
    if (semana) {
      conditions.push(`fa.semana = $${paramIndex++}`);
      params.push(semana);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    // ✅ Agregado: Filtro por fecha de inicio (si se proporciona)
    const { fecha_inicio } = req.query;
    if (fecha_inicio) {
       // SQL dinámico para la cláusula WHERE si ya existe o no
       const operator = conditions.length > 0 ? ' AND ' : ' WHERE ';
       sql += `${operator} fa.fecha_emision >= $${paramIndex++}`;
       params.push(fecha_inicio);
       
       // Agregar también a conditions para el subquery
       conditions.push(`fa.fecha_emision >= $${paramIndex-1}`); 
    }
    
    sql += `
      GROUP BY pr.id, pr.nombre, pr.contacto, pr.telefono, pr.email
      ORDER BY cantidad_total_faltante DESC, pr.nombre
    `;
    
    const result = await query(sql, params);
    
    // Obtener detalles de productos por proveedor
    for (let proveedor of result.rows) {
      // Reutilizar las mismas condiciones pero ajustando los índices de parámetros
      // El parámetro $1 será el ID del proveedor
      // Los parámetros de filtros (año, mes, fecha_inicio) empezarán desde $2
      
      const subqueryConditions = conditions.map((cond) => {
        // Ajustar índice de parámetros: $1 -> $2, $2 -> $3, etc.
        return cond.replace(/\$(\d+)/g, (match, number) => `$${parseInt(number) + 1}`);
      });

      const productosDetalle = await query(`
        SELECT 
          p.id,
          p.nombre,
          p.codigo,
          SUM(f.cantidad_faltante) as cantidad_faltante,
          COUNT(f.id) as veces_faltante,
          COUNT(CASE WHEN f.tipo_faltante = 'total' THEN 1 END) as faltantes_totales,
          COUNT(CASE WHEN f.tipo_faltante = 'parcial' THEN 1 END) as faltantes_parciales,
          STRING_AGG(DISTINCT fa.numero_factura, ', ') as facturas_afectadas,
          p.factor_conversion,
          p.codigo_proveedor,
          p.nombre_proveedor,
          p.observaciones,
          p.descripcion_factura
        FROM productos p
        JOIN faltantes f ON p.id = f.producto_id
        JOIN facturas fa ON f.factura_id = fa.id
        WHERE p.proveedor_id = $1
        ${subqueryConditions.length > 0 ? ' AND ' + subqueryConditions.join(' AND ') : ''}
        GROUP BY p.id, p.nombre, p.codigo
        ORDER BY cantidad_faltante DESC
      `, [proveedor.proveedor_id, ...params]);
      
      proveedor.productos_detalle = productosDetalle.rows;
      
      // Mapeo para frontend (productos_faltantes es lo que espera el UI)
      proveedor.productos_faltantes = productosDetalle.rows.map(p => ({
        ...p,
        // Asegurar campos calculados si faltan
        clientes_afectados: 0, // Se podría calcular si fuera necesario en el query
        facturas_afectadas: p.veces_faltante // Aproximación válida
      }));
    }
    
    res.json({
      success: true,
      data: result.rows,
      total_proveedores: result.rows.length,
      filters: { semana, mes, ano },
      resumen: {
        total_faltantes: result.rows.reduce((sum, p) => sum + parseInt(p.total_faltantes), 0),
        cantidad_total: result.rows.reduce((sum, p) => sum + parseInt(p.cantidad_total_faltante || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error generando reporte por proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error generando reporte por proveedor'
    });
  }
});

// Reporte de faltantes por cliente
router.get('/faltantes/cliente', async (req, res) => {
  try {
    const { semana, mes, ano } = req.query;
    
    let sql = `
      SELECT 
        fa.cliente_nombre,
        fa.cliente_email,
        COUNT(DISTINCT f.id) as total_faltantes,
        COUNT(DISTINCT fa.id) as facturas_con_faltantes,
        COUNT(DISTINCT f.producto_id) as productos_afectados,
        SUM(f.cantidad_faltante) as cantidad_total_faltante,
        COUNT(CASE WHEN f.tipo_faltante = 'total' THEN 1 END) as faltantes_totales,
        COUNT(CASE WHEN f.tipo_faltante = 'parcial' THEN 1 END) as faltantes_parciales,
        STRING_AGG(DISTINCT fa.numero_factura, ', ') as numeros_facturas
      FROM facturas fa
      JOIN faltantes f ON fa.id = f.factura_id
      JOIN productos p ON f.producto_id = p.id
    `;
    
    const conditions = ["f.tipo_faltante != 'completo'", "f.cantidad_faltante > 0"];
    const params = [];
    let paramIndex = 1;
    
    if (ano) {
      conditions.push(`fa.ano = $${paramIndex++}`);
      params.push(ano);
    }
    
    if (mes) {
      conditions.push(`fa.mes = $${paramIndex++}`);
      params.push(mes);
    }
    
    if (semana) {
      conditions.push(`fa.semana = $${paramIndex++}`);
      params.push(semana);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += `
      GROUP BY fa.cliente_nombre, fa.cliente_email
      ORDER BY cantidad_total_faltante DESC, fa.cliente_nombre
    `;
    
    const result = await query(sql, params);
    
    // Obtener detalles de facturas por cliente
    for (let cliente of result.rows) {
      const facturasDetalle = await query(`
        SELECT 
          fa.id,
          fa.numero_factura,
          fa.fecha_emision,
          fa.total as total_factura,
          COUNT(f.id) as faltantes_count,
          SUM(f.cantidad_faltante) as cantidad_faltante,
          STRING_AGG(p.nombre, ', ') as productos_faltantes
        FROM facturas fa
        JOIN faltantes f ON fa.id = f.factura_id
        JOIN productos p ON f.producto_id = p.id
        WHERE fa.cliente_nombre = $1
        ${conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : ''}
        GROUP BY fa.id, fa.numero_factura, fa.fecha_emision, fa.total
        ORDER BY fa.fecha_emision DESC
      `, [cliente.cliente_nombre, ...params.slice(conditions.length === 0 ? 0 : 1)]);
      
      cliente.facturas_detalle = facturasDetalle.rows;
    }
    
    res.json({
      success: true,
      data: result.rows,
      total_clientes: result.rows.length,
      filters: { semana, mes, ano },
      resumen: {
        total_faltantes: result.rows.reduce((sum, c) => sum + parseInt(c.total_faltantes), 0),
        cantidad_total: result.rows.reduce((sum, c) => sum + parseInt(c.cantidad_total_faltante || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error generando reporte por cliente:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error generando reporte por cliente'
    });
  }
});

// Reporte consolidado de faltantes
router.get('/faltantes/consolidado', async (req, res) => {
  try {
    const { semana, mes, ano } = req.query;
    
    let whereClause = '';
    const params = [];
    let paramIndex = 1;
    
    const conditions = ["f.tipo_faltante != 'completo'", "f.cantidad_faltante > 0"];
    if (ano) {
      conditions.push(`fa.ano = $${paramIndex++}`);
      params.push(ano);
    }
    
    if (mes) {
      conditions.push(`fa.mes = $${paramIndex++}`);
      params.push(mes);
    }
    
    if (semana) {
      conditions.push(`fa.semana = $${paramIndex++}`);
      params.push(semana);
    }
    
    if (conditions.length > 0) {
      whereClause = ' WHERE ' + conditions.join(' AND ');
    }
    
    // Resumen general
    const resumenGeneral = await query(`
      SELECT 
        COUNT(DISTINCT f.id) as total_faltantes,
        COUNT(DISTINCT f.factura_id) as facturas_afectadas,
        COUNT(DISTINCT f.producto_id) as productos_afectados,
        COUNT(DISTINCT p.proveedor_id) as proveedores_afectados,
        SUM(f.cantidad_faltante) as cantidad_total_faltante,
        COUNT(CASE WHEN f.tipo_faltante = 'total' THEN 1 END) as faltantes_totales,
        COUNT(CASE WHEN f.tipo_faltante = 'parcial' THEN 1 END) as faltantes_parciales,
        AVG(f.cantidad_faltante) as promedio_cantidad_faltante
      FROM faltantes f
      JOIN facturas fa ON f.factura_id = fa.id
      JOIN productos p ON f.producto_id = p.id
      ${whereClause}
    `, params);
    
    // Top 5 productos más faltantes
    const topProductos = await query(`
      SELECT 
        p.id,
        p.nombre,
        p.codigo,
        pr.nombre as proveedor_nombre,
        SUM(f.cantidad_faltante) as cantidad_total_faltante,
        COUNT(f.id) as veces_faltante,
        COUNT(DISTINCT f.factura_id) as facturas_afectadas
      FROM productos p
      JOIN faltantes f ON p.id = f.producto_id
      JOIN facturas fa ON f.factura_id = fa.id
      JOIN proveedores pr ON p.proveedor_id = pr.id
      ${whereClause}
      GROUP BY p.id, p.nombre, p.codigo, pr.nombre
      ORDER BY cantidad_total_faltante DESC
      LIMIT 5
    `, params);
    
    // Top 5 proveedores más afectados
    const topProveedores = await query(`
      SELECT 
        pr.id,
        pr.nombre,
        pr.contacto,
        COUNT(DISTINCT f.id) as total_faltantes,
        SUM(f.cantidad_faltante) as cantidad_total_faltante,
        COUNT(DISTINCT f.producto_id) as productos_afectados
      FROM proveedores pr
      JOIN productos p ON pr.id = p.proveedor_id
      JOIN faltantes f ON p.id = f.producto_id
      JOIN facturas fa ON f.factura_id = fa.id
      ${whereClause}
      GROUP BY pr.id, pr.nombre, pr.contacto
      ORDER BY cantidad_total_faltante DESC
      LIMIT 5
    `, params);
    
    // Faltantes por día de la semana (últimas 4 semanas)
    const faltantesPorDia = await query(`
      SELECT 
        EXTRACT(DOW FROM fa.fecha_emision) as dia_semana,
        CASE EXTRACT(DOW FROM fa.fecha_emision)
          WHEN 0 THEN 'Domingo'
          WHEN 1 THEN 'Lunes'
          WHEN 2 THEN 'Martes'
          WHEN 3 THEN 'Miércoles'
          WHEN 4 THEN 'Jueves'
          WHEN 5 THEN 'Viernes'
          WHEN 6 THEN 'Sábado'
        END as nombre_dia,
        COUNT(f.id) as total_faltantes,
        SUM(f.cantidad_faltante) as cantidad_total
      FROM faltantes f
      JOIN facturas fa ON f.factura_id = fa.id
      WHERE fa.fecha_emision >= CURRENT_DATE - INTERVAL '28 days'
      GROUP BY EXTRACT(DOW FROM fa.fecha_emision)
      ORDER BY dia_semana
    `);
    
    res.json({
      success: true,
      data: {
        resumen_general: resumenGeneral.rows[0],
        top_productos: topProductos.rows,
        top_proveedores: topProveedores.rows,
        faltantes_por_dia: faltantesPorDia.rows
      },
      filters: { semana, mes, ano },
      periodo: { semana, mes, ano }
    });
  } catch (error) {
    console.error('Error generando reporte consolidado:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error generando reporte consolidado'
    });
  }
});

// Reporte de compras sugeridas por proveedor
router.get('/compras/sugeridas', async (req, res) => {
  try {
    const { semana, mes, ano, multiplicador = 1.2 } = req.query;
    
    let whereClause = '';
    const params = [];
    let paramIndex = 1;
    
    const conditions = ["f.tipo_faltante != 'completo'", "f.cantidad_faltante > 0"];
    if (ano) {
      conditions.push(`fa.ano = $${paramIndex++}`);
      params.push(ano);
    }
    
    if (mes) {
      conditions.push(`fa.mes = $${paramIndex++}`);
      params.push(mes);
    }
    
    if (semana) {
      conditions.push(`fa.semana = $${paramIndex++}`);
      params.push(semana);
    }
    
    if (conditions.length > 0) {
      whereClause = ' WHERE ' + conditions.join(' AND ');
    }
    
    const result = await query(`
      SELECT 
        pr.id as proveedor_id,
        pr.nombre as proveedor_nombre,
        pr.contacto as proveedor_contacto,
        pr.telefono as proveedor_telefono,
        pr.email as proveedor_email,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'producto_id', p.id,
            'producto_nombre', p.nombre,
            'producto_codigo', p.codigo,
            'cantidad_faltante', total_faltante,
            'cantidad_sugerida', CEIL(total_faltante * $${paramIndex}),
            'precio_unitario', p.precio_unitario,
            'subtotal_sugerido', CEIL(total_faltante * $${paramIndex}) * COALESCE(p.precio_unitario, 0),
            'veces_faltante', veces_faltante
          )
          ORDER BY total_faltante DESC
        ) as productos_sugeridos,
        SUM(CEIL(total_faltante * $${paramIndex}) * COALESCE(p.precio_unitario, 0)) as total_compra_sugerida
      FROM (
        SELECT 
          p.id,
          p.nombre,
          p.codigo,
          p.proveedor_id,
          p.precio_unitario,
          SUM(f.cantidad_faltante) as total_faltante,
          COUNT(f.id) as veces_faltante
        FROM productos p
        JOIN faltantes f ON p.id = f.producto_id
        JOIN facturas fa ON f.factura_id = fa.id
        ${whereClause}
        GROUP BY p.id, p.nombre, p.codigo, p.proveedor_id, p.precio_unitario
      ) p
      JOIN proveedores pr ON p.proveedor_id = pr.id
      GROUP BY pr.id, pr.nombre, pr.contacto, pr.telefono, pr.email
      ORDER BY total_compra_sugerida DESC
    `, [...params, parseFloat(multiplicador)]);
    
    res.json({
      success: true,
      data: result.rows,
      total_proveedores: result.rows.length,
      filters: { semana, mes, ano, multiplicador },
      resumen: {
        total_compra_general: result.rows.reduce((sum, p) => sum + parseFloat(p.total_compra_sugerida || 0), 0),
        total_productos: result.rows.reduce((sum, p) => sum + (p.productos_sugeridos?.length || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error generando reporte de compras sugeridas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error generando reporte de compras sugeridas'
    });
  }
});

module.exports = router;
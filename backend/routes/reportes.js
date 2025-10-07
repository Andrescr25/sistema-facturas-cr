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
    
    const conditions = [];
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
      GROUP BY pr.id, pr.nombre, pr.contacto, pr.telefono, pr.email
      ORDER BY cantidad_total_faltante DESC, pr.nombre
    `;
    
    const result = await query(sql, params);
    
    // Obtener detalles de productos por proveedor
    for (let proveedor of result.rows) {
      const productosDetalle = await query(`
        SELECT 
          p.id,
          p.nombre,
          p.codigo,
          SUM(f.cantidad_faltante) as cantidad_faltante,
          COUNT(f.id) as veces_faltante,
          COUNT(CASE WHEN f.tipo_faltante = 'total' THEN 1 END) as faltantes_totales,
          COUNT(CASE WHEN f.tipo_faltante = 'parcial' THEN 1 END) as faltantes_parciales
        FROM productos p
        JOIN faltantes f ON p.id = f.producto_id
        JOIN facturas fa ON f.factura_id = fa.id
        WHERE p.proveedor_id = $1
        ${conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : ''}
        GROUP BY p.id, p.nombre, p.codigo
        ORDER BY cantidad_faltante DESC
      `, [proveedor.proveedor_id, ...params.slice(conditions.length === 0 ? 0 : 1)]);
      
      proveedor.productos_detalle = productosDetalle.rows;
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
    
    const conditions = [];
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
    
    const conditions = [];
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
    
    const conditions = [];
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

// Endpoint para cantidad sugerida inteligente - USANDO HISTÓRICO
router.get('/cantidad-sugerida', async (req, res) => {
  try {
    const { proveedor_id } = req.query;
    
    if (!proveedor_id) {
      return res.status(400).json({
        success: false,
        message: 'proveedor_id es requerido'
      });
    }

    // 📊 PASO 1: Obtener faltantes actuales para mostrar solo productos con faltantes
    const faltantesActuales = await query(`
      SELECT DISTINCT
        f.producto_id,
        p.nombre as producto_nombre,
        p.codigo as producto_codigo,
        SUM(f.cantidad_faltante) as cantidad_faltante_actual
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      JOIN facturas fa ON f.factura_id = fa.id
      WHERE p.proveedor_id = $1
        AND fa.procesada = false
      GROUP BY f.producto_id, p.nombre, p.codigo
    `, [proveedor_id]);

    if (faltantesActuales.rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No hay faltantes actuales para este proveedor'
      });
    }

    // 📊 PASO 2: Obtener histórico de los últimos 90 días desde faltantes_historico
    const historico90Dias = await query(`
      SELECT 
        producto_id,
        producto_nombre,
        producto_codigo,
        cantidad_faltante,
        cantidad_entregada,
        cantidad_ajustada,
        fecha_faltante_original,
        EXTRACT(WEEK FROM fecha_faltante_original) as semana_num,
        EXTRACT(YEAR FROM fecha_faltante_original) as ano_num
      FROM faltantes_historico
      WHERE proveedor_id = $1
        AND fecha_faltante_original >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY producto_id, fecha_faltante_original
    `, [proveedor_id]);

    console.log(`📊 Histórico encontrado: ${historico90Dias.rows.length} registros para proveedor ${proveedor_id}`);

    // 📈 PASO 3: Calcular estadísticas por producto
    const productosConEstadisticas = [];

    for (const faltanteActual of faltantesActuales.rows) {
      const productoId = faltanteActual.producto_id;
      
      // Filtrar histórico para este producto
      const historicoProducto = historico90Dias.rows.filter(
        h => h.producto_id === productoId
      );

      console.log(`📦 Producto ${productoId}: ${historicoProducto.length} registros históricos`);

      // 🗓️ Agrupar por semanas y calcular cantidad efectiva
      const faltantesPorSemana = {};
      const semanasConPedidos = new Set();
      
      historicoProducto.forEach(registro => {
        const semanaKey = `${registro.ano_num}-${registro.semana_num}`;
        
        if (!faltantesPorSemana[semanaKey]) {
          faltantesPorSemana[semanaKey] = 0;
        }
        
        // Cantidad efectiva = faltante original - lo que se entregó después
        const cantidadEfectiva = registro.cantidad_faltante - (registro.cantidad_entregada || 0);
        faltantesPorSemana[semanaKey] += Math.max(0, cantidadEfectiva); // No permitir negativos
        
        if (cantidadEfectiva > 0) {
          semanasConPedidos.add(semanaKey);
        }
      });

      // 📊 Calcular métricas
      const totalSemanas = 12; // 90 días / 7 = ~12 semanas
      const semanasActivas = semanasConPedidos.size;
      const totalFaltantesEfectivos = Object.values(faltantesPorSemana).reduce((sum, val) => sum + val, 0);
      const promedioSemanal = totalSemanas > 0 ? totalFaltantesEfectivos / totalSemanas : 0;

      console.log(`📈 Producto ${productoId}: promedio ${promedioSemanal.toFixed(2)}/semana, ${semanasActivas} semanas activas`);

      // 🎯 Clasificación de rotación
      let clasificacion = 'baja';
      if (promedioSemanal > 10 && semanasActivas >= 6) {
        clasificacion = 'alta';
      }

      // 📈 Cálculo de cantidad sugerida
      let cantidadSugerida = 0;
      let razonamiento = '';
      
      if (clasificacion === 'alta') {
        // Alta rotación: promedio semanal × 4 semanas de buffer
        cantidadSugerida = Math.ceil(promedioSemanal * 4);
        razonamiento = `Alta rotación: ${promedioSemanal.toFixed(1)}/sem × 4 semanas`;
      } else {
        // Baja rotación: verificar frecuencia en últimos 30 días
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - 30);
        
        const pedidosUltimos30Dias = historicoProducto.filter(
          h => new Date(h.fecha_faltante_original) >= fechaLimite
        ).length;

        if (pedidosUltimos30Dias >= 4) {
          // Stock mínimo basado en promedio histórico (2 semanas)
          cantidadSugerida = Math.ceil(promedioSemanal * 2);
          razonamiento = `Baja rotación frecuente: ${promedioSemanal.toFixed(1)}/sem × 2 semanas (${pedidosUltimos30Dias} pedidos/30d)`;
        } else {
          // Solo cubrir faltantes actuales
          cantidadSugerida = faltanteActual.cantidad_faltante_actual;
          razonamiento = `Baja rotación esporádica: solo faltantes actuales (${pedidosUltimos30Dias} pedidos/30d)`;
        }
      }

      // Asegurar cantidad mínima (nunca menos que lo que falta actualmente)
      cantidadSugerida = Math.max(cantidadSugerida, faltanteActual.cantidad_faltante_actual);

      productosConEstadisticas.push({
        producto_id: productoId,
        producto_nombre: faltanteActual.producto_nombre,
        producto_codigo: faltanteActual.producto_codigo,
        cantidad_faltante_actual: faltanteActual.cantidad_faltante_actual,
        clasificacion_rotacion: clasificacion,
        promedio_semanal: Math.round(promedioSemanal * 100) / 100, // 2 decimales
        semanas_activas: semanasActivas,
        total_semanas: totalSemanas,
        frecuencia_porcentaje: Math.round((semanasActivas / totalSemanas) * 100),
        cantidad_sugerida: cantidadSugerida,
        diferencia_sugerida: cantidadSugerida - faltanteActual.cantidad_faltante_actual,
        razonamiento_calculo: razonamiento,
        registros_historicos: historicoProducto.length
      });
    }

    // 📋 Resumen general
    const resumen = {
      total_productos: productosConEstadisticas.length,
      productos_alta_rotacion: productosConEstadisticas.filter(p => p.clasificacion_rotacion === 'alta').length,
      productos_baja_rotacion: productosConEstadisticas.filter(p => p.clasificacion_rotacion === 'baja').length,
      cantidad_total_sugerida: productosConEstadisticas.reduce((sum, p) => sum + p.cantidad_sugerida, 0),
      cantidad_total_faltante: productosConEstadisticas.reduce((sum, p) => sum + p.cantidad_faltante_actual, 0),
      registros_historicos_total: historico90Dias.rows.length
    };

    console.log(`✅ Cantidad sugerida calculada: ${productosConEstadisticas.length} productos analizados`);

    res.json({
      success: true,
      data: productosConEstadisticas,
      resumen,
      proveedor_id: parseInt(proveedor_id),
      periodo_analisis: '90 días (desde histórico)',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error calculando cantidad sugerida:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error calculando cantidad sugerida'
    });
  }
});

module.exports = router;
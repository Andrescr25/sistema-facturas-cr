/**
 * Servicio de Reportes
 * Genera reportes de faltantes por cliente y proveedor
 */

const { query } = require('../../../config/database');

class ReportService {
  /**
   * Obtener reporte de faltantes por proveedor
   */
  /**
   * Obtener reporte de faltantes por proveedor (Optimizado: Menor Costo)
   */
  /**
   * Obtener reporte de faltantes por proveedor (Optimizado: Menor Costo)
   */
  async getMissingItemsBySupplier() {
    try {
      console.log('📋 Generando reporte de faltantes por proveedor (Prioridad: Menor Costo)...');

      // CTE para encontrar el mejor proveedor basado en historial de precios
      const sql = `
        WITH BestProviderPerProduct AS (
            SELECT DISTINCT ON (spm.alegra_item_id)
                spm.id, -- ✅ Incluir ID del mapeo
                spm.supplier_code, -- ✅ Incluir Código Proveedor
                spm.factor_conversion, -- ✅ Incluir Factor
                spm.alegra_item_id,
                spm.supplier_name,
                spm.supplier_cedula,
                pfp.precio_unitario,
                (pfp.total_linea / NULLIF(pfp.cantidad, 0)) as calculated_cost,
                pfp.factura_id
            FROM supplier_product_mapping spm
            JOIN productos_factura_proveedor pfp ON pfp.mapeo_id = spm.id
            JOIN facturas_proveedores fp ON fp.id = pfp.factura_id
            ORDER BY 
                spm.alegra_item_id, 
                (pfp.total_linea / NULLIF(pfp.cantidad, 0)) ASC, -- Menor costo primero
                fp.fecha_emision DESC
        )
        SELECT
          -- Usar datos del mapping (Mejor Proveedor) si existe, sino fallback al original
          -- Convertimos ID a texto para consistencia
          COALESCE(bp.supplier_cedula, CAST(pr.id AS TEXT)) as proveedor_id,
          COALESCE(bp.supplier_name, pr.nombre) as proveedor_nombre,
          
          -- Datos del producto
          p.id as producto_id,
          p.codigo as producto_codigo,
          p.nombre as producto_nombre,
          
          -- Datos del mapeo (para PDF)
          bp.id as mapping_id,
          bp.supplier_code as codigo_proveedor,
          bp.supplier_name as nombre_proveedor_mapeo,
          bp.factor_conversion,
          bp.alegra_item_id,

          -- Agregación
          SUM(f.cantidad_faltante) as cantidad_total_faltante,
          COUNT(DISTINCT f.factura_id) as numero_facturas_afectadas,
          
          -- Debug field
          (bp.supplier_name IS NOT NULL AND bp.supplier_name != pr.nombre) as fue_reasignado
          
        FROM faltantes f
        JOIN productos p ON f.producto_id = p.id
        
        -- Join original (proveedor asignado en la ficha del producto)
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
        
        -- Join con el mejor proveedor calculado
        LEFT JOIN BestProviderPerProduct bp ON p.alegra_id = bp.alegra_item_id

        WHERE f.estado = 'pendiente'
        GROUP BY 
            COALESCE(bp.supplier_cedula, CAST(pr.id AS TEXT)), 
            COALESCE(bp.supplier_name, pr.nombre),
            p.id, p.codigo, p.nombre,
            bp.id, bp.supplier_code, bp.supplier_name, bp.factor_conversion, bp.alegra_item_id, -- ✅ Group by mapping details
            bp.supplier_name, pr.nombre
        ORDER BY 
            proveedor_nombre, cantidad_total_faltante DESC
      `;

      const result = await query(sql);

      // Agrupar por proveedor
      const reporteAgrupado = {};

      result.rows.forEach(row => {
        const proveedorKey = row.proveedor_id || `temp_${row.proveedor_nombre}` || 'sin_proveedor';
        const proveedorNombre = row.proveedor_nombre || 'Sin Proveedor';

        if (!reporteAgrupado[proveedorKey]) {
          reporteAgrupado[proveedorKey] = {
            proveedor_id: row.proveedor_id,
            proveedor_nombre: proveedorNombre,
            productos_faltantes: [],
            total_cantidad: 0,
            total_productos: 0,
            reasignados: 0
          };
        }

        reporteAgrupado[proveedorKey].productos_faltantes.push({
          producto_id: row.producto_id,
          producto_codigo: row.producto_codigo,
          producto_nombre: row.producto_nombre,
          mapping_id: row.mapping_id, // ✅ ID del mapeo
          codigo_proveedor: row.codigo_proveedor, // ✅ Código del proveedor
          nombre_proveedor: row.nombre_proveedor_mapeo, // ✅ Nombre según proveedor
          factor_conversion: parseFloat(row.factor_conversion || 1), // ✅ Factor
          alegra_item_id: row.alegra_item_id, // ✅ ID Alegra
          cantidad_faltante: parseInt(row.cantidad_total_faltante),
          facturas_afectadas: parseInt(row.numero_facturas_afectadas),
          fue_reasignado: row.fue_reasignado
        });

        reporteAgrupado[proveedorKey].total_cantidad += parseInt(row.cantidad_total_faltante);
        reporteAgrupado[proveedorKey].total_productos += 1;
        if (row.fue_reasignado) reporteAgrupado[proveedorKey].reasignados += 1;
      });

      const reporteFinal = Object.values(reporteAgrupado);
      
      // Ordenar alfabéticamente por nombre de proveedor
      reporteFinal.sort((a, b) => a.proveedor_nombre.localeCompare(b.proveedor_nombre));

      return {
        success: true,
        data: reporteFinal,
        total_proveedores: reporteFinal.length
      };
    } catch (error) {
      console.error('❌ Error generando reporte por proveedor (Menor Costo):', error);
      // Fallback a lógica simple si falla el SQL complejo
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener reporte de faltantes por cliente
   */
  async getMissingItemsByClient() {
    try {
      console.log('📋 Generando reporte de faltantes por cliente...');

      const sql = `
        SELECT
          c.id as cliente_id,
          c.nombre as cliente_nombre,
          c.email as cliente_email,
          fa.id as factura_local_id,
          fa.alegra_id,
          fa.numero_factura,
          fa.fecha_emision,
          fa.estado_procesamiento,
          fa.fecha_procesamiento,
          p.id as producto_id,
          p.codigo as producto_codigo,
          p.nombre as producto_nombre,
          pr.nombre as proveedor,
          f.cantidad_faltante,
          f.tipo_faltante,
          f.observaciones,
          fa.observaciones_adicionales,
          COALESCE(faj.cantidad_entregada, 0) as cantidad_entregada,
          COALESCE(faj.estado, 'pendiente') as ajuste_estado,
          COALESCE(faj.requiere_actualizacion, false) as requiere_actualizacion
        FROM faltantes f
        JOIN facturas fa ON f.factura_id = fa.id
        LEFT JOIN clientes c ON fa.cliente_id = c.id
        JOIN productos p ON f.producto_id = p.id
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
        LEFT JOIN faltantes_ajustes faj ON f.id = faj.faltante_id
        WHERE f.estado = 'pendiente'
        ORDER BY c.nombre, fa.fecha_emision DESC
      `;

      const result = await query(sql);

      // Agrupar por cliente
      const reporteAgrupado = {};

      result.rows.forEach(row => {
        const clienteKey = row.cliente_id || 'sin_cliente';
        const clienteNombre = row.cliente_nombre || 'Sin Cliente';

        if (!reporteAgrupado[clienteKey]) {
          reporteAgrupado[clienteKey] = {
            cliente_id: row.cliente_id,
            nombre: clienteNombre,
            email: row.cliente_email,
            facturas_con_faltantes: [],
            total_cantidad: 0,
            ultima_actividad: row.fecha_emision
          };
        }

        // Buscar si ya existe la factura
        let factura = reporteAgrupado[clienteKey].facturas_con_faltantes.find(
          f => f.factura_local_id === row.factura_local_id
        );

        if (!factura) {
          factura = {
            factura_local_id: row.factura_local_id,
            alegra_id: row.alegra_id,
            numero_factura: row.numero_factura,
            fecha_emision: row.fecha_emision,
            estado_procesamiento: row.estado_procesamiento,
            fecha_procesamiento: row.fecha_procesamiento,
            observaciones_adicionales: row.observaciones_adicionales,
            productos_faltantes: []
          };
          reporteAgrupado[clienteKey].facturas_con_faltantes.push(factura);
        }

        factura.productos_faltantes.push({
          producto_id: row.producto_id,
          codigo: row.producto_codigo,
          nombre: row.producto_nombre,
          proveedor: row.proveedor,
          cantidad_faltante: parseInt(row.cantidad_faltante),
          cantidad_entregada: parseInt(row.cantidad_entregada),
          tipo_faltante: row.tipo_faltante,
          observaciones: row.observaciones,
          ajuste_estado: row.ajuste_estado,
          requiere_actualizacion: row.requiere_actualizacion
        });

        reporteAgrupado[clienteKey].total_cantidad += parseInt(row.cantidad_faltante);
      });

      const reporteFinal = Object.values(reporteAgrupado);

      return {
        success: true,
        data: reporteFinal,
        total_clientes: reporteFinal.length,
        resumen: {
          total_facturas_afectadas: reporteFinal.reduce((sum, c) => sum + c.facturas_con_faltantes.length, 0),
          total_cantidad_faltante: reporteFinal.reduce((sum, c) => sum + c.total_cantidad, 0)
        }
      };
    } catch (error) {
      console.error('❌ Error generando reporte por cliente:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Limpiar faltantes de proveedor procesados
   */
  async clearProcessedSupplierMissingItems() {
    try {
      console.log('🗑️ Limpiando faltantes de proveedores procesados...');

      const result = await query(`
        DELETE FROM faltantes
        WHERE estado = 'procesado'
        RETURNING id
      `);

      return {
        success: true,
        message: 'Faltantes procesados eliminados',
        eliminados: result.rows.length
      };
    } catch (error) {
      console.error('❌ Error limpiando faltantes:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener historial de procesamientos
   */
  async getProcessingHistory() {
    try {
      const sql = `
        SELECT * FROM procesamientos
        ORDER BY fecha_procesamiento DESC
        LIMIT 50
      `;

      const result = await query(sql);

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('❌ Error obteniendo historial:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ReportService;

/**
 * Servicio de Reportes
 * Genera reportes de faltantes por cliente y proveedor
 */

const { query } = require('../../../config/database');

class ReportService {
  /**
   * Obtener reporte de faltantes por proveedor
   */
  async getMissingItemsBySupplier() {
    try {
      console.log('📋 Generando reporte de faltantes por proveedor...');

      const sql = `
        SELECT
          pr.id as proveedor_id,
          pr.nombre as proveedor_nombre,
          p.id as producto_id,
          p.codigo as producto_codigo,
          p.nombre as producto_nombre,
          SUM(f.cantidad_faltante) as cantidad_total_faltante,
          COUNT(DISTINCT f.factura_id) as numero_facturas_afectadas
        FROM faltantes f
        JOIN productos p ON f.producto_id = p.id
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
        WHERE f.estado = 'pendiente'
        GROUP BY pr.id, pr.nombre, p.id, p.codigo, p.nombre
        ORDER BY pr.nombre, cantidad_total_faltante DESC
      `;

      const result = await query(sql);

      // Agrupar por proveedor
      const reporteAgrupado = {};

      result.rows.forEach(row => {
        const proveedorKey = row.proveedor_id || 'sin_proveedor';
        const proveedorNombre = row.proveedor_nombre || 'Sin Proveedor';

        if (!reporteAgrupado[proveedorKey]) {
          reporteAgrupado[proveedorKey] = {
            proveedor_id: row.proveedor_id,
            proveedor_nombre: proveedorNombre,
            productos_faltantes: [],
            total_cantidad: 0,
            total_productos: 0
          };
        }

        reporteAgrupado[proveedorKey].productos_faltantes.push({
          producto_id: row.producto_id,
          producto_codigo: row.producto_codigo,
          producto_nombre: row.producto_nombre,
          cantidad_faltante: parseInt(row.cantidad_total_faltante),
          facturas_afectadas: parseInt(row.numero_facturas_afectadas)
        });

        reporteAgrupado[proveedorKey].total_cantidad += parseInt(row.cantidad_total_faltante);
        reporteAgrupado[proveedorKey].total_productos += 1;
      });

      const reporteFinal = Object.values(reporteAgrupado);

      return {
        success: true,
        data: reporteFinal,
        total_proveedores: reporteFinal.length
      };
    } catch (error) {
      console.error('❌ Error generando reporte por proveedor:', error);
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

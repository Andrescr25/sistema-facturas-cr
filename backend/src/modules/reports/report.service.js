/**
 * Servicio de Reportes
 * Genera reportes de faltantes por cliente y proveedor
 */

const { query } = require('../../../config/database');
const { faltanteOperativo, cantidadSinEnviar } = require('./faltantesCompra.sql');
const { createHash } = require('node:crypto');
const { JOIN_CICLO, filtrosOperacion } = require('../rutas/operacionCiclo.service');

class ReportService {
  /**
   * Obtener reporte de faltantes por proveedor con mapping
   */
  async getMissingItemsBySupplier(fechaInicio = null, { rutaId, cicloId, db = { query }, incluirEnviadas = true } = {}) {
    try {
      console.log('📋 Generando reporte de faltantes por proveedor con mapping...', fechaInicio ? `desde ${fechaInicio}` : '');

      // PASO 1: Obtener faltantes de la BD local
      let whereClause = `${faltanteOperativo()} AND ${cantidadSinEnviar()}>0`;
      const queryParams = [];

      if (fechaInicio) {
        whereClause += ` AND fa.fecha >= $1::date`;
        queryParams.push(fechaInicio);
      }

      const whereCiclo = [];
      filtrosOperacion({ rutaId, cicloId }, whereCiclo, queryParams);
      if (whereCiclo.length) whereClause += ' AND ' + whereCiclo.join(' AND ');
      const origenes = `jsonb_agg(jsonb_build_object(
        'faltanteId',f.id,'facturaId',fa.id,'factura',fa.numero,'clienteId',fa.cliente_id,
        'cliente',COALESCE(c.nombre,fa.cliente_nombre),'cantidad',${cantidadSinEnviar()},
        'anticipado',fa.preventa_anticipada,'cicloId',cr.id,'rutaId',cr.ruta_id,
        'rutaNombre',cr.ruta_nombre,'semana',cr.semana::text,'orden',rc.orden)
        ORDER BY cr.semana NULLS LAST,cr.id,rc.orden,fa.id,f.id) AS origenes`;
      const sqlFaltantes = `
        SELECT
         p.id as producto_id,          p.referencia as producto_codigo,          p.nombre as producto_nombre,          p.nombre as producto_nombre_actual,
          SUM(${cantidadSinEnviar()}) as total_faltante, ${origenes},
          COUNT(f.id) as facturas_afectadas,
          STRING_AGG(DISTINCT COALESCE(c.nombre,fa.cliente_nombre), ', ') as clientes_afectados,
          STRING_AGG(DISTINCT f.descripcion_factura, ' | ') FILTER (WHERE f.descripcion_factura IS NOT NULL AND f.descripcion_factura != '') as descripcion_factura,
          MAX(f.proveedor_asignado) as proveedor_asignado,
          MAX(f.proveedor_cedula) as proveedor_cedula,
          MAX(f.precio_asignado) as precio_asignado,
          MAX(f.asignacion_tipo) as asignacion_tipo,
          (MAX(m.id::text) FILTER (WHERE m.id IS NOT NULL))::uuid as mapping_id
        FROM faltantes f        JOIN producto p ON p.id = f.producto_propio_id        JOIN factura fa ON fa.id = f.factura_propia_id LEFT JOIN cliente c ON c.id=fa.cliente_id ${JOIN_CICLO('fa')}
        LEFT JOIN LATERAL (SELECT m.id FROM supplier_product_mapping m WHERE m.producto_id=p.id AND (
          m.proveedor_id=(SELECT pr.id FROM proveedor pr WHERE pr.identificacion=NULLIF(NULLIF(btrim(f.proveedor_cedula),'SIN_PROVEEDOR'),'') LIMIT 1)
          OR (m.proveedor_id IS NULL AND m.supplier_cedula=NULLIF(NULLIF(btrim(f.proveedor_cedula),'SIN_PROVEEDOR'),''))
          OR (NULLIF(NULLIF(btrim(f.proveedor_cedula),'SIN_PROVEEDOR'),'') IS NULL
            AND lower(btrim(m.supplier_name))=lower(btrim(f.proveedor_asignado))))
          ORDER BY m.last_used_date DESC NULLS LAST,m.times_used DESC,m.id LIMIT 1) m ON true
        WHERE ${whereClause}        GROUP BY p.id, p.referencia, p.nombre, COALESCE(NULLIF(NULLIF(btrim(f.proveedor_cedula),'SIN_PROVEEDOR'),''),upper(btrim(f.proveedor_asignado)))
        ORDER BY total_faltante DESC,p.id,COALESCE(NULLIF(NULLIF(btrim(f.proveedor_cedula),'SIN_PROVEEDOR'),''),upper(btrim(f.proveedor_asignado)))
      `;

      const faltantesResult = await db.query(sqlFaltantes, queryParams);
      console.log(`📊 Encontrados ${faltantesResult.rows.length} productos con faltantes`);

      // Consultar el reporte nunca cambia asignaciones ni prepara órdenes.

      // PASO 3: Obtener mapping info solo para productos con asignación
      const mappingIds = faltantesResult.rows
        .filter(f => f.mapping_id)
        .map(f => f.mapping_id);
      
      let mappingsInfo = new Map();
      if (mappingIds.length > 0) {
        const mappingsResult = await db.query(`
          SELECT
            id,
            supplier_code as "supplierCode",
            supplier_desc as "supplierDesc",
            alegra_name as "alegraName",
            confidence,
            factor_conversion as "factorConversion"
          FROM supplier_product_mapping
          WHERE id = ANY($1::uuid[])
        `, [mappingIds]);
        
        mappingsResult.rows.forEach(m => {
          mappingsInfo.set(m.id, m);
        });
      }

      // PASO 4: Agrupar productos por proveedor
      const proveedoresMap = new Map();
      for (const faltante of faltantesResult.rows) {
        const proveedorNombre = (faltante.proveedor_asignado || 'Sin_Proveedor').trim();
        const proveedorCedulaRaw = faltante.proveedor_cedula && faltante.proveedor_cedula !== 'SIN_PROVEEDOR'
          ? faltante.proveedor_cedula.trim()
          : null;
        const proveedorCedula = proveedorCedulaRaw || 'SIN_PROVEEDOR';
        const precioAsignado = faltante.precio_asignado ? parseFloat(faltante.precio_asignado) : null;
        const asignacionTipo = faltante.asignacion_tipo || 'automatica';
        const proveedorKey = proveedorCedulaRaw || proveedorNombre.toUpperCase();
        
        const mappingInfo = faltante.mapping_id ? mappingsInfo.get(faltante.mapping_id) : null;

        if (!proveedoresMap.has(proveedorKey)) {
          proveedoresMap.set(proveedorKey, {
            id: proveedorKey,
            cedula: proveedorCedulaRaw,
            nombre: proveedorNombre,
            contacto: proveedorCedula,
            productos_faltantes: [],
            total_productos: 0,
            total_cantidad: 0,
            aliases: proveedorCedulaRaw ? [proveedorNombre] : []
          });
        }

        const proveedor = proveedoresMap.get(proveedorKey);

        if (proveedorNombre && proveedor.nombre !== proveedorNombre) {
          if (!proveedor.aliases.includes(proveedorNombre)) {
            proveedor.aliases.push(proveedorNombre);
          }
          proveedor.nombre = proveedorNombre;
        }

        proveedor.productos_faltantes.push({
          producto_id: faltante.producto_id,
          nombre: faltante.producto_nombre_actual || mappingInfo?.alegraName || faltante.producto_nombre,
          nombre_proveedor: mappingInfo?.supplierDesc || null,
          codigo: faltante.producto_codigo,
          codigo_proveedor: mappingInfo?.supplierCode || null,
          mapping_id: faltante.mapping_id || null,
          cantidad_faltante: Number(faltante.total_faltante),
          origenes: faltante.origenes || [],
          facturas_afectadas: parseInt(faltante.facturas_afectadas),
          tipo_faltante: faltante.tipo_faltante,
          clientes_afectados: faltante.clientes_afectados,
          descripcion_factura: faltante.descripcion_factura || null,
          confianza_mapping: mappingInfo?.confidence || 0,
          factor_conversion: Number(Number(mappingInfo?.factorConversion ?? 1).toFixed(6)),
          precio_asignado: precioAsignado,
          asignacion_automatica: asignacionTipo === 'automatica'
        });

        proveedor.total_productos++;
        proveedor.total_cantidad += Number(faltante.total_faltante);
      }

      const proveedoresArray = Array.from(proveedoresMap.values()).map(proveedor => ({
        ...proveedor,
        fechaInicio:fechaInicio || null,
        revisionReporte: createHash('sha256').update(JSON.stringify(proveedor.productos_faltantes.map(p => ({ id:p.producto_id, nombre:p.nombre, codigo:p.codigo, nombreProveedor:p.nombre_proveedor, codigoProveedor:p.codigo_proveedor, cantidad:p.cantidad_faltante, factor:p.factor_conversion, mapping:p.mapping_id, origenes:p.origenes })))).digest('hex'),
        aliases: proveedor.aliases && proveedor.aliases.length > 0 ? proveedor.aliases : undefined
      }));

      const totalProductos = new Set(faltantesResult.rows.map(f => f.producto_id)).size;
      const productosConAsignacion = new Set(faltantesResult.rows.filter(f => f.proveedor_asignado && f.proveedor_asignado !== 'Sin_Proveedor').map(f => f.producto_id)).size;
      const productosAsignacionManual = faltantesResult.rows.filter(f => f.asignacion_tipo === 'manual').length;
      const productosAsignacionAutomatica = faltantesResult.rows.filter(f => f.asignacion_tipo === 'automatica').length;

      return {
        success: true,
        data: [...proveedoresArray, ...(incluirEnviadas ? await require('../orders-whatsapp/ordenesReporte.service').enviadasEn(db, { fechaInicio, rutaId, cicloId }) : [])],
        total_proveedores: proveedoresArray.length,
        resumen: {
          total_productos_faltantes: totalProductos,
          total_cantidad_faltante: proveedoresArray.reduce((sum, p) => sum + p.total_cantidad, 0),
          productos_con_asignacion: productosConAsignacion,
          productos_sin_asignacion: totalProductos - productosConAsignacion,
          asignaciones_manuales: productosAsignacionManual,
          asignaciones_automaticas: productosAsignacionAutomatica,
          porcentaje_asignado: totalProductos > 0 ? Math.round((productosConAsignacion / totalProductos) * 100) : 0
        }
      };

    } catch (error) {
      console.error('❌ Error generando reporte por proveedor:', error);
      return { success: false, error: error.message, status: error.status };
    }
  }

  /** La ruta operativa de clientes sale de su ficha, no del ciclo del papel. */
  getMissingItemsByClient(filtros = {}) {
    return require('./reporteClientes.service').getMissingItemsByClient(filtros);
  }

  /** Ruta antigua: responder sin consultar ni borrar datos. */
  async clearProcessedSupplierMissingItems() {
    return { success: false, status: 410,
      error: 'La limpieza global fue retirada. Los ciclos y faltantes conservan su historial.' };
  }

  /**
   * Obtener historial (No usado en vistas directas del reporte de proveedores pero mantenido por compatibilidad)
   */
  async getProcessingHistory() {
    try {
      const result = await query(`
        SELECT * FROM procesamientos
        ORDER BY fecha_procesamiento DESC
        LIMIT 50
      `);
      return { success: true, data: result.rows };
    } catch (error) {
      console.error('❌ Error obteniendo historial:', error);
      return { success: false, error: error.message, status: error.status };
    }
  }

}

module.exports = ReportService;

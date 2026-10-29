/**
 * Servicio de Reportes
 * Genera reportes de faltantes por cliente y proveedor
 */

const { query } = require('../../../config/database');
const { faltanteOperativo, cantidadSinEnviar } = require('./faltantesCompra.sql');
const { createHash } = require('node:crypto');
const { cedulaAsignada, fichaAsignada, mappingProveedor, asignadoAlProveedor } = require('./proveedorCompra.sql');

class ReportService {
  /**
   * Obtener reporte de faltantes por proveedor con mapping
   */
  async getMissingItemsBySupplier(fechaInicio = null, { db = { query }, incluirEnviadas = true, proveedor = null } = {}) {
    try {
      console.log('📋 Generando reporte de faltantes por proveedor con mapping...', fechaInicio ? `desde ${fechaInicio}` : '');

      // PASO 1: Obtener faltantes de la BD local
      let whereClause = `${faltanteOperativo()} AND ${cantidadSinEnviar()}>0`;
      const queryParams = [];

      // Una revisión de envío ya identificó su ficha. Comprobar sus mismos
      // orígenes y huella no necesita agrupar otra vez todos los proveedores.
      if (proveedor?.id) {
        queryParams.push(proveedor.id,proveedor.identificacion,proveedor.nombre);
        whereClause += ` AND ${asignadoAlProveedor('$1','$2','$3')}`;
      }

      if (fechaInicio) {
        queryParams.push(fechaInicio);
        whereClause += ` AND fa.fecha >= $${queryParams.length}::date`;
      }

      const origenes = `jsonb_agg(jsonb_build_object(
        'faltanteId',f.id,'facturaId',fa.id,'factura',fa.numero,'clienteId',fa.cliente_id,
        'cliente',COALESCE(c.nombre,fa.cliente_nombre),'cantidad',${cantidadSinEnviar()})
        ORDER BY fa.id,f.id) AS origenes`;
      // Materializar sólo las facturas que tienen faltantes evita evaluar
      // crédito/última impresión en miles de facturas ajenas a esta consulta.
      const sqlFaltantes = `
        WITH facturas_candidatas AS MATERIALIZED (
          SELECT fa.* FROM factura fa JOIN (
            SELECT DISTINCT factura_propia_id FROM faltantes
            WHERE estado='pendiente' AND tipo_faltante<>'completo' AND cantidad_faltante>0
          ) pendientes ON pendientes.factura_propia_id=fa.id
        )
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
        FROM faltantes f        JOIN producto p ON p.id = f.producto_propio_id        JOIN facturas_candidatas fa ON fa.id = f.factura_propia_id LEFT JOIN cliente c ON c.id=fa.cliente_id
        LEFT JOIN LATERAL (${fichaAsignada()}) pr ON true
        LEFT JOIN LATERAL (${mappingProveedor('p.id','pr.id',`COALESCE(pr.identificacion,${cedulaAsignada()})`)}) m ON true
        WHERE ${whereClause}        GROUP BY p.id, p.referencia, p.nombre, COALESCE(${cedulaAsignada()},upper(btrim(f.proveedor_asignado)))
        ORDER BY total_faltante DESC,p.id,COALESCE(${cedulaAsignada()},upper(btrim(f.proveedor_asignado)))
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

      if (incluirEnviadas) await require('../orders-whatsapp/comprobacionEnviosReporte.service').comprobarEn(db,proveedoresArray);

      const totalProductos = new Set(faltantesResult.rows.map(f => f.producto_id)).size;
      const productosConAsignacion = new Set(faltantesResult.rows.filter(f => f.proveedor_asignado && f.proveedor_asignado !== 'Sin_Proveedor').map(f => f.producto_id)).size;
      const productosAsignacionManual = faltantesResult.rows.filter(f => f.asignacion_tipo === 'manual').length;
      const productosAsignacionAutomatica = faltantesResult.rows.filter(f => f.asignacion_tipo === 'automatica').length;

      return {
        success: true,
        data: [...proveedoresArray, ...(incluirEnviadas ? await require('../orders-whatsapp/ordenesReporte.service').enviadasEn(db, { fechaInicio }) : [])],
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

  /** La ruta de los clientes sale de su ficha. */
  getMissingItemsByClient(filtros = {}) {
    return require('./reporteClientes.service').getMissingItemsByClient(filtros);
  }

  /** Ruta antigua: responder sin consultar ni borrar datos. */
  async clearProcessedSupplierMissingItems() {
    return { success: false, status: 410,
      error: 'La limpieza global fue retirada. Los faltantes conservan su historial.' };
  }

}

module.exports = ReportService;

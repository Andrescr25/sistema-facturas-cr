/**
 * Servicio de Reportes
 * Genera reportes de faltantes por cliente y proveedor
 */

const { query } = require('../../../config/database');
const { asignarProveedorAutomatico } = require('../../../services/proveedorAsignacionService');

class ReportService {
  /**
   * Obtener reporte de faltantes por proveedor con mapping
   */
  async getMissingItemsBySupplier(fechaInicio = null) {
    try {
      console.log('📋 Generando reporte de faltantes por proveedor con mapping...', fechaInicio ? `desde ${fechaInicio}` : '');

      // PASO 1: Obtener faltantes de la BD local
      let whereClause = `
        f.estado IN ('pendiente', 'procesado')
        AND f.tipo_faltante != 'completo' 
        AND (f.cantidad_faltante::numeric > 0)
      `;
      const queryParams = [];

      if (fechaInicio) {
        whereClause += ` AND fa.fecha_emision >= $1`;
        queryParams.push(fechaInicio);
      }

      const sqlFaltantes = `
        SELECT
          p.codigo as producto_codigo,
          p.alegra_id as producto_alegra_id,
          p.nombre as producto_nombre,
          MAX(apc.name) as producto_nombre_actual,
          SUM(f.cantidad_faltante) as total_faltante,
          COUNT(f.id) as facturas_afectadas,
          STRING_AGG(DISTINCT fa.cliente_nombre, ', ') as clientes_afectados,
          STRING_AGG(DISTINCT f.descripcion_factura, ' | ') FILTER (WHERE f.descripcion_factura IS NOT NULL AND f.descripcion_factura != '') as descripcion_factura,
          MAX(f.proveedor_asignado) as proveedor_asignado,
          MAX(f.proveedor_cedula) as proveedor_cedula,
          MAX(f.precio_asignado) as precio_asignado,
          MAX(f.asignacion_tipo) as asignacion_tipo,
          (MAX(f.mapping_id::text) FILTER (WHERE f.mapping_id IS NOT NULL))::uuid as mapping_id
        FROM faltantes f
        JOIN productos p ON f.producto_id = p.id
        JOIN facturas fa ON f.factura_id = fa.id
        LEFT JOIN alegra_products_cache apc ON apc.alegra_id = p.alegra_id::text
        WHERE ${whereClause}
        GROUP BY p.codigo, p.alegra_id, p.nombre
        ORDER BY total_faltante DESC
      `;

      const faltantesResult = await query(sqlFaltantes, queryParams);
      console.log(`📊 Encontrados ${faltantesResult.rows.length} productos con faltantes`);

      if (faltantesResult.rows.length === 0) {
        return {
          success: true,
          data: [],
          total_proveedores: 0,
          resumen: {
            total_productos_faltantes: 0,
            total_cantidad_faltante: 0
          }
        };
      }

      // PASO 2: Asignar automáticamente productos sin asignación
      const productosSinAsignacion = faltantesResult.rows.filter(f => !f.proveedor_asignado);
      if (productosSinAsignacion.length > 0) {
        console.log(`⚠️ ${productosSinAsignacion.length} productos sin asignación guardada. Asignando automáticamente...`);
        
        for (const producto of productosSinAsignacion) {
          const faltantesDelProducto = await query(`
            SELECT f.id, f.producto_id
            FROM faltantes f
            JOIN productos p ON f.producto_id = p.id
            WHERE p.codigo = $1
              AND f.estado IN ('pendiente', 'procesado')
              AND f.proveedor_asignado IS NULL
          `, [producto.producto_codigo]);
          
          for (const faltante of faltantesDelProducto.rows) {
            await asignarProveedorAutomatico(
              faltante.id,
              faltante.producto_id,
              producto.producto_alegra_id,
              producto.producto_codigo
            );
          }
        }
        
        console.log(`✅ ${productosSinAsignacion.length} productos asignados automáticamente`);
        
        // Recargar faltantes ahora con asignaciones
        const faltantesActualizados = await query(`
          SELECT
            p.codigo as producto_codigo,
            p.alegra_id as producto_alegra_id,
            p.nombre as producto_nombre,
            MAX(apc.name) as producto_nombre_actual,
            SUM(f.cantidad_faltante) as total_faltante,
            COUNT(f.id) as facturas_afectadas,
            STRING_AGG(DISTINCT fa.cliente_nombre, ', ') as clientes_afectados,
            STRING_AGG(DISTINCT f.descripcion_factura, ' | ') FILTER (WHERE f.descripcion_factura IS NOT NULL AND f.descripcion_factura != '') as descripcion_factura,
            MAX(f.proveedor_asignado) as proveedor_asignado,
            MAX(f.proveedor_cedula) as proveedor_cedula,
            MAX(f.precio_asignado) as precio_asignado,
            MAX(f.asignacion_tipo) as asignacion_tipo,
            (MAX(f.mapping_id::text) FILTER (WHERE f.mapping_id IS NOT NULL))::uuid as mapping_id
          FROM faltantes f
          JOIN productos p ON f.producto_id = p.id
          JOIN facturas fa ON f.factura_id = fa.id
          LEFT JOIN alegra_products_cache apc ON apc.alegra_id = p.alegra_id::text
          WHERE ${whereClause}
          GROUP BY p.codigo, p.alegra_id, p.nombre
          ORDER BY total_faltante DESC
        `, queryParams);
        
        faltantesResult.rows = faltantesActualizados.rows;
      }

      // PASO 3: Obtener mapping info solo para productos con asignación
      const mappingIds = faltantesResult.rows
        .filter(f => f.mapping_id)
        .map(f => f.mapping_id);
      
      let mappingsInfo = new Map();
      if (mappingIds.length > 0) {
        const mappingsResult = await query(`
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
          nombre: faltante.producto_nombre_actual || mappingInfo?.alegraName || faltante.producto_nombre,
          nombre_proveedor: mappingInfo?.supplierDesc || null,
          codigo: faltante.producto_codigo,
          alegra_item_id: faltante.producto_alegra_id || null,
          codigo_proveedor: mappingInfo?.supplierCode || null,
          mapping_id: faltante.mapping_id || null,
          cantidad_faltante: parseInt(faltante.total_faltante),
          facturas_afectadas: parseInt(faltante.facturas_afectadas),
          tipo_faltante: faltante.tipo_faltante,
          clientes_afectados: faltante.clientes_afectados,
          descripcion_factura: faltante.descripcion_factura || null,
          confianza_mapping: mappingInfo?.confidence || 0,
          factor_conversion: mappingInfo?.factorConversion || 1,
          precio_asignado: precioAsignado,
          asignacion_automatica: asignacionTipo === 'automatica'
        });

        proveedor.total_productos++;
        proveedor.total_cantidad += parseInt(faltante.total_faltante);
      }

      const proveedoresArray = Array.from(proveedoresMap.values()).map(proveedor => ({
        ...proveedor,
        aliases: proveedor.aliases && proveedor.aliases.length > 0 ? proveedor.aliases : undefined
      }));

      const totalProductos = faltantesResult.rows.length;
      const productosConAsignacion = faltantesResult.rows.filter(f => f.proveedor_asignado && f.proveedor_asignado !== 'Sin_Proveedor').length;
      const productosAsignacionManual = faltantesResult.rows.filter(f => f.asignacion_tipo === 'manual').length;
      const productosAsignacionAutomatica = faltantesResult.rows.filter(f => f.asignacion_tipo === 'automatica').length;

      return {
        success: true,
        data: proveedoresArray,
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
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener reporte de faltantes por cliente (Lógica original de reportes.js/alegra.js)
   */
  async getMissingItemsByClient() {
    try {
      console.log('📋 Generando reporte de faltantes por cliente (Lógica original)...');

      const result = await query(`
        SELECT
          f.id AS faltante_id,
          fa.cliente_nombre,
          fa.cliente_email,
          fa.numero_factura,
          fa.fecha_emision,
          fa.alegra_id as factura_alegra_id,
          fa.estado_procesamiento,
          p.id as producto_id,
          p.nombre as producto_nombre,
          p.codigo as producto_codigo,
          p.alegra_id as producto_alegra_id,
          f.proveedor_asignado,
          f.cantidad_faltante,
          f.tipo_faltante,
          f.observaciones,
          f.estado as faltante_estado,
          fa.observaciones_adicionales,
          f.created_at as fecha_registro,
          f.updated_at as fecha_procesamiento,
          aj.cantidad_entregada,
          aj.estado as ajuste_estado,
          aj.requiere_actualizacion,
          aj.revisado as ajuste_revisado,
          fr.id as reimpresion_id,
          fr.estado as reimpresion_estado,
          (SELECT COUNT(*) FROM faltantes f2 WHERE f2.factura_id = fa.id) as total_items_factura
        FROM faltantes f
        JOIN productos p ON f.producto_id = p.id
        JOIN facturas fa ON f.factura_id = fa.id
        LEFT JOIN faltantes_ajustes aj ON aj.faltante_id = f.id
        LEFT JOIN facturas_reimpresion fr ON fa.id = fr.factura_id
        WHERE f.estado IN ('pendiente', 'procesado')
          AND f.tipo_faltante != 'completo'
          AND (f.cantidad_faltante::numeric > 0)
          -- Una factura anulada no se alista ni se entrega, así que sus
          -- faltantes tampoco. Sin esto seguía saliendo en el reporte junto
          -- a las vivas del mismo cliente y parecía un duplicado: pasó con
          -- la 001000014828 del gimnasio de Palmares, anulada en Alegra y
          -- todavía pendiente acá. Bodega ya la excluía; este reporte lee
          -- solo de la base local y nunca se enteraba.
          --
          -- Se excluye por el estado, no se borran los faltantes: si la
          -- factura se reactiva en Alegra, vuelve con su trabajo intacto.
          AND fa.estado_bodega IS DISTINCT FROM 'anulada'
        ORDER BY fa.cliente_nombre, fa.fecha_emision DESC
      `);

      // PASO 2: Asignar automáticamente el proveedor de los faltantes que aún no
      // lo tienen (mismo mecanismo que usa Reporte Proveedores). Sin esto, un
      // faltante nuevo cae al fallback de la tabla legacy `proveedores` aunque el
      // producto ya tenga una relación real y vigente en supplier_product_mapping.
      const sinAsignar = result.rows.filter(row => !row.proveedor_asignado);
      if (sinAsignar.length > 0) {
        console.log(`⚠️ ${sinAsignar.length} faltantes sin proveedor asignado. Asignando automáticamente...`);
        for (const row of sinAsignar) {
          await asignarProveedorAutomatico(row.faltante_id, row.producto_id, row.producto_alegra_id, row.producto_codigo);
        }

        const idsAsignados = sinAsignar.map(row => row.faltante_id);
        const actualizados = await query(
          `SELECT id, proveedor_asignado FROM faltantes WHERE id = ANY($1::int[])`,
          [idsAsignados]
        );
        const proveedorPorFaltante = new Map(actualizados.rows.map(r => [r.id, r.proveedor_asignado]));
        result.rows.forEach(row => {
          if (proveedorPorFaltante.has(row.faltante_id)) {
            row.proveedor_asignado = proveedorPorFaltante.get(row.faltante_id);
          }
        });
      }

      const clientesMap = new Map();

      result.rows.forEach(row => {
        if (!clientesMap.has(row.cliente_nombre)) {
          clientesMap.set(row.cliente_nombre, {
            nombre: row.cliente_nombre,
            email: row.cliente_email,
            facturas_con_faltantes: new Map(),
            total_productos: 0,
            total_cantidad: 0,
            ultima_actividad: null
          });
        }

        const cliente = clientesMap.get(row.cliente_nombre);
        const facturaKey = row.numero_factura;

        if (!cliente.facturas_con_faltantes.has(facturaKey)) {
          cliente.facturas_con_faltantes.set(facturaKey, {
            numero_factura: row.numero_factura,
            fecha_emision: row.fecha_emision,
            alegra_id: row.factura_alegra_id,
            estado_procesamiento: row.estado_procesamiento,
            fecha_procesamiento: row.fecha_procesamiento,
            observaciones_adicionales: row.observaciones_adicionales,
            en_cola_impresion: row.reimpresion_id && row.reimpresion_estado === 'pendiente',
            total_items_factura: parseInt(row.total_items_factura) || 0,
            productos_faltantes: []
          });
        }

        const factura = cliente.facturas_con_faltantes.get(facturaKey);
        factura.productos_faltantes.push({
          faltante_id: row.faltante_id,
          nombre: row.producto_nombre,
          codigo: row.producto_codigo,
          proveedor: row.proveedor_asignado || 'Sin proveedor',
          proveedor_asignado: row.proveedor_asignado || 'Sin proveedor',
          cantidad_faltante: parseInt(row.cantidad_faltante),
          tipo_faltante: row.tipo_faltante,
          observaciones: row.observaciones,
          fecha_registro: row.fecha_registro,
          estado: row.faltante_estado,
          cantidad_entregada: row.cantidad_entregada || 0,
          ajuste_estado: row.ajuste_estado || 'pendiente',
          requiere_actualizacion: row.requiere_actualizacion || false,
          ajuste_revisado: row.ajuste_revisado === true
        });

        if (row.faltante_estado === 'pendiente') {
          cliente.total_productos++;
          cliente.total_cantidad += parseInt(row.cantidad_faltante);
        }

        if (!cliente.ultima_actividad || new Date(row.fecha_registro) > new Date(cliente.ultima_actividad)) {
          cliente.ultima_actividad = row.fecha_registro;
        }
      });

      const clientesArray = Array.from(clientesMap.values()).map(cliente => ({
        ...cliente,
        facturas_con_faltantes: Array.from(cliente.facturas_con_faltantes.values())
      }));

      return {
        success: true,
        data: clientesArray,
        total_clientes: clientesArray.length,
        resumen: {
          total_productos_faltantes: result.rows.filter(r => r.faltante_estado === 'pendiente').length,
          total_cantidad_faltante: clientesArray.reduce((sum, c) => sum + c.total_cantidad, 0),
          total_facturas_afectadas: Array.from(new Set(result.rows.map(r => r.numero_factura))).length
        }
      };

    } catch (error) {
      console.error('❌ Error generando reporte por cliente:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Limpiar faltantes por proveedor y procesados (Lógica original)
   */
  async clearProcessedSupplierMissingItems() {
    try {
      console.log('🗑️ Limpiando faltantes de la BD (pendientes y procesados)...');

      // Obtener faltantes pendientes
      const faltantesPendientes = await query(`
        SELECT 
          f.id, 
          f.factura_id,
          p.nombre as producto_nombre, 
          COALESCE(pr.nombre, 'Sin proveedor') as proveedor_nombre
        FROM faltantes f
        JOIN productos p ON f.producto_id = p.id
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
        WHERE f.estado = 'pendiente'
      `);

      // Obtener faltantes procesados
      const faltantesProcesados = await query(`
        SELECT 
          f.id,
          f.factura_id,
          p.nombre as producto_nombre,
          fa.numero_factura,
          fa.cliente_nombre
        FROM faltantes f
        JOIN productos p ON f.producto_id = p.id
        JOIN facturas fa ON f.factura_id = fa.id
        WHERE f.estado = 'procesado'
      `);

      if (faltantesPendientes.rows.length === 0 && faltantesProcesados.rows.length === 0) {
        return {
          success: true,
          message: 'No hay faltantes pendientes ni procesados para limpiar.',
          eliminados: 0
        };
      }

      const stats = {
        pendientes: { faltantes: 0, ajustes: 0 },
        procesados: { faltantes: 0, ajustes: 0 }
      };

      const faltantesPendientesIds = faltantesPendientes.rows.map(f => f.id);
      if (faltantesPendientesIds.length > 0) {
        const ajustesPendientes = await query(`
          DELETE FROM faltantes_ajustes
          WHERE faltante_id = ANY($1::int[])
          RETURNING id
        `, [faltantesPendientesIds]);

        const pendientesEliminados = await query(`
          DELETE FROM faltantes 
          WHERE id = ANY($1::int[])
          RETURNING id
        `, [faltantesPendientesIds]);

        stats.pendientes.ajustes = ajustesPendientes.rows.length;
        stats.pendientes.faltantes = pendientesEliminados.rows.length;
      }

      const faltantesProcesadosIds = faltantesProcesados.rows.map(f => f.id);
      if (faltantesProcesadosIds.length > 0) {
        const ajustesProcesados = await query(`
          DELETE FROM faltantes_ajustes
          WHERE faltante_id = ANY($1::int[])
          RETURNING id
        `, [faltantesProcesadosIds]);

        const procesadosEliminados = await query(`
          DELETE FROM faltantes
          WHERE id = ANY($1::int[])
          RETURNING id
        `, [faltantesProcesadosIds]);

        stats.procesados.ajustes = ajustesProcesados.rows.length;
        stats.procesados.faltantes = procesadosEliminados.rows.length;
      }

      const facturaIdsParaLimpiar = Array.from(new Set([
        ...faltantesPendientes.rows.map(f => f.factura_id),
        ...faltantesProcesados.rows.map(f => f.factura_id)
      ])).filter(Boolean);

      let pendientesManualesEliminados = 0;
      if (facturaIdsParaLimpiar.length > 0) {
        const pendientesResult = await query(`
          DELETE FROM facturas_pendientes
          WHERE factura_id = ANY($1::int[])
          RETURNING id
        `, [facturaIdsParaLimpiar]);
        pendientesManualesEliminados = pendientesResult.rows.length;
      }

      await query(`
        UPDATE facturas 
        SET observaciones_adicionales = NULL
        WHERE observaciones_adicionales IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM faltantes f 
            WHERE f.factura_id = facturas.id 
              AND f.estado = 'pendiente'
          )
      `);

      return {
        success: true,
        message: `Faltantes limpiados: ${stats.pendientes.faltantes} pendientes y ${stats.procesados.faltantes} procesados.`,
        eliminados: stats.pendientes.faltantes + stats.procesados.faltantes
      };

    } catch (error) {
      console.error('❌ Error limpiando faltantes:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener encargos especiales (Lógica original)
   */
  async getEncargosEspeciales() {
    try {
      console.log('📋 Obteniendo encargos especiales...');
      const result = await query(`
        SELECT 
          fa.numero_factura,
          fa.cliente_nombre,
          fa.fecha_emision,
          fa.observaciones_adicionales
        FROM facturas fa
        WHERE fa.observaciones_adicionales IS NOT NULL 
        AND fa.observaciones_adicionales != ''
        ORDER BY fa.fecha_emision DESC
      `);

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('❌ Error obteniendo encargos especiales:', error);
      return { success: false, error: error.message };
    }
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
      return { success: false, error: error.message };
    }
  }

  /**
   * Reporte consolidado de faltantes
   */
  async getMissingItemsConsolidated(filters = {}) {
    try {
      const { semana, mes, ano } = filters;
      
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
      
      return {
        success: true,
        data: {
          resumen_general: resumenGeneral.rows[0],
          top_productos: topProductos.rows,
          top_proveedores: topProveedores.rows,
          faltantes_por_dia: faltantesPorDia.rows
        }
      };
    } catch (error) {
      console.error('❌ Error obteniendo reporte consolidado:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reporte de compras sugeridas
   */
  async getSuggestedPurchases(filters = {}) {
    try {
      const { semana, mes, ano, multiplicador = 1.2 } = filters;
      
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
      
      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('❌ Error obteniendo reporte de compras sugeridas:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ReportService;

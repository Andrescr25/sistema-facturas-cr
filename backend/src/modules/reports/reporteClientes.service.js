/** Reporte operativo por la ruta ACTUAL de la ficha, sin semanas (ROT-03).
 * Consultarlo no asigna proveedores ni guarda respuestas. Los documentos
 * conservan su recorrido histórico; cambiar de ruta no lo reescribe.
 */
const { query } = require('../../../config/database');
const { ULTIMA_ATENCION_SQL, rotacionDe, ordenPorProximaVisita } = require('../clientes/rotacion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const {
  vistaReporteClientes, condicionVista, impresaFueraDePlazo, MOVIMIENTOS_REPORTE, ULTIMA_COLA, JOIN_HISTORIAL_REPORTE
} = require('./historialClientes.sql');
const { filtroRutaActual, listarRutasActuales: listarRutas } = require('../rutas/rutaActual.service');
const { ingresoDisponibleSql } = require('../missing-items/ingresoFaltante');

async function getMissingItemsByClient({ rutaId, vista: vistaCruda } = {}) {
  try {
    console.log('📋 Generando reporte de faltantes por la ruta del cliente...');

    const vista = vistaReporteClientes(vistaCruda);
    const params = [];
    const whereRuta = filtroRutaActual(rutaId, params);
    const hoy = hoyEnCostaRica();
    const result = await query(`
      ${MOVIMIENTOS_REPORTE}
      SELECT
        f.id AS faltante_id,
        c.id AS cliente_id, COALESCE(c.nombre, fa.cliente_nombre) AS cliente_nombre,
        c.ruta_id AS ruta_actual_id, r.nombre AS ruta_actual_nombre,
        COALESCE(c.correo, fa.cliente_correo) AS cliente_email,
        fa.numero AS numero_factura,
        fa.fecha::text AS fecha_emision,
        fa.id AS factura_id,
        -- Procesada es lo que Impresión ya reimprimió: al procesarla, sus
        -- faltantes pasan a 'procesado', y al recuperarla vuelven (la tabla
        -- vieja lo copiaba además a facturas.estado_procesamiento).
        CASE WHEN f.estado = 'procesado' THEN 'procesado' ELSE 'pendiente' END AS estado_procesamiento,
        p.id as producto_id,
        p.nombre as producto_nombre,
        p.referencia as producto_codigo,
        f.proveedor_asignado,
        f.cantidad_faltante,
        f.tipo_faltante,
        f.observaciones,
        f.estado as faltante_estado,
        fa.bodega_observaciones AS observaciones_adicionales,
        f.created_at as fecha_registro,
        -- Cuándo la procesó Impresión; si no hay fila, lo de antes.
        COALESCE(fr.fecha_procesamiento, f.updated_at) AT TIME ZONE 'America/Costa_Rica' as fecha_procesamiento,
        -- Cuándo se mandó a Impresión: es la hora de la nota "En impresión".
        fr.fecha_creacion AT TIME ZONE 'America/Costa_Rica' as enviada_a_impresion_en,
        actividad.ultima_gestion AT TIME ZONE 'America/Costa_Rica' AS ultima_gestion_en,
        archivo.historial_desde AT TIME ZONE 'America/Costa_Rica' AS historial_programado_en,
        CASE WHEN archivo.en_historial THEN archivo.historial_desde AT TIME ZONE 'America/Costa_Rica' END AS historial_desde,
        CASE WHEN archivo.en_historial THEN archivo.sale_del_historial AT TIME ZONE 'America/Costa_Rica' END AS sale_del_historial_en,
        archivo.en_historial,
        -- Lo mismo que exige devolverAlReporte (colaImpresion.js) al recuperar.
        NOT (archivo.en_historial OR ${impresaFueraDePlazo('fr')}) AS puede_recuperar,
        aj.cantidad_entregada,
        aj.estado as ajuste_estado,
        aj.requiere_actualizacion,
        aj.revisado as ajuste_revisado,
        -- Cuánto ingresó por Revisión de precios que este faltante puede usar:
        -- sin eso no se marca que llegó (missing-items/ingresoFaltante.js).
        CASE WHEN f.estado = 'pendiente' THEN ${ingresoDisponibleSql('f')} END AS ingreso_disponible,
        fr.id as reimpresion_id,
        fr.estado as reimpresion_estado,
        (SELECT COUNT(*) FROM faltantes f2 WHERE f2.factura_propia_id = fa.id) as total_items_factura
      FROM faltantes f
      JOIN producto p ON p.id = f.producto_propio_id
      JOIN factura fa ON fa.id = f.factura_propia_id
      LEFT JOIN cliente c ON c.id = fa.cliente_id
      LEFT JOIN ruta_cliente r ON r.id = c.ruta_id
      LEFT JOIN faltantes_ajustes aj ON aj.faltante_id = f.id
      ${ULTIMA_COLA}
      ${JOIN_HISTORIAL_REPORTE}
      WHERE f.estado IN ('pendiente', 'procesado')
        AND f.tipo_faltante != 'completo'
        AND (f.cantidad_faltante::numeric > 0)
        -- Una factura anulada no se alista ni se entrega, así que sus
        -- faltantes tampoco (pasó con la 001000014828 del gimnasio de
        -- Palmares: anulada y todavía en el reporte, parecía un duplicado).
        -- Se excluye por el estado, no se borran los faltantes.
        AND fa.estado <> 'anulada'
        AND ${condicionVista(vista)}
        ${whereRuta}
      ORDER BY c.id NULLS LAST, fa.cliente_nombre, fa.fecha DESC, fa.id
    `, params);

    // Una consulta por el conjunto de fichas, no una por producto ni una
    // visita calculada desde la factura que casualmente tiene faltantes.
    const ids = [...new Set(result.rows.map(r => r.cliente_id).filter(Boolean))];
    const frecuencias = ids.length ? (await query(`SELECT c.id, c.rotacion_dias,
      ${ULTIMA_ATENCION_SQL('c.id')} AS ultima_factura FROM cliente c WHERE c.id=ANY($1::int[])`, [ids])).rows : [];
    const rotaciones = new Map(frecuencias.map(c => [c.id, rotacionDe({
      rotacionDias: c.rotacion_dias, ultimaFactura: c.ultima_factura, hoy })]));

    const clientesMap = new Map();

    result.rows.forEach(row => {
      // Dos fichas pueden compartir nombre. Un documento histórico sin
      // ficha conserva su identidad sin inventar un cliente por ese nombre.
      const clave = row.cliente_id ? `cliente-${row.cliente_id}` : `factura-${row.factura_id}`;
      if (!clientesMap.has(clave)) {
        clientesMap.set(clave, {
          id: row.cliente_id || null, clave,
          ruta: { id: row.ruta_actual_id || null, nombre: row.ruta_actual_nombre || null },
          rotacion: rotaciones.get(row.cliente_id) || rotacionDe({ rotacionDias: null, ultimaFactura: null, hoy }),
          nombre: row.cliente_nombre,
          email: row.cliente_email,
          facturas_con_faltantes: new Map(),
          total_productos: 0,
          total_cantidad: 0,
          ultima_actividad: null
        });
      }

      const cliente = clientesMap.get(clave);
      const facturaKey = row.factura_id;

      if (!cliente.facturas_con_faltantes.has(facturaKey)) {
        cliente.facturas_con_faltantes.set(facturaKey, {
          factura_id: row.factura_id,
          numero_factura: row.numero_factura,
          fecha_emision: row.fecha_emision,
          estado_procesamiento: row.estado_procesamiento,
          fecha_procesamiento: row.fecha_procesamiento,
          enviada_a_impresion_en: row.enviada_a_impresion_en || null,
          ultima_gestion_en: row.ultima_gestion_en || null,
          historial_programado_en: row.historial_programado_en || null,
          historial_desde: row.historial_desde || null,
          sale_del_historial_en: row.sale_del_historial_en || null,
          en_historial: row.en_historial === true,
          puede_recuperar: row.puede_recuperar === true,
          observaciones_adicionales: row.observaciones_adicionales,
          en_cola_impresion: Boolean(row.reimpresion_id) && row.reimpresion_estado === 'pendiente',
          total_items_factura: parseInt(row.total_items_factura) || 0,
          productos_faltantes: []
        });
      }

      const factura = cliente.facturas_con_faltantes.get(facturaKey);
      factura.productos_faltantes.push({
        faltante_id: row.faltante_id,
        producto_id: row.producto_id,
        nombre: row.producto_nombre,
        codigo: row.producto_codigo,
        proveedor: row.proveedor_asignado || 'Sin proveedor',
        proveedor_asignado: row.proveedor_asignado || 'Sin proveedor',
        cantidad_faltante: Number(row.cantidad_faltante),
        tipo_faltante: row.tipo_faltante,
        observaciones: row.observaciones,
        fecha_registro: row.fecha_registro,
        estado: row.faltante_estado,
        cantidad_entregada: row.cantidad_entregada || 0,
        ajuste_estado: row.ajuste_estado || 'pendiente',
        requiere_actualizacion: row.requiere_actualizacion || false,
        ajuste_revisado: row.ajuste_revisado === true,
        ingreso_disponible: row.ingreso_disponible == null ? null : Number(row.ingreso_disponible)
      });

      if (row.faltante_estado === 'pendiente' || vista === 'historial') {
        cliente.total_productos++;
        cliente.total_cantidad += Number(row.cantidad_faltante);
      }

      const ultimaGestion = row.ultima_gestion_en || row.fecha_registro;
      if (!cliente.ultima_actividad || new Date(ultimaGestion) > new Date(cliente.ultima_actividad)) {
        cliente.ultima_actividad = ultimaGestion;
      }
    });

    const clientesArray = Array.from(clientesMap.values()).map(cliente => ({
      ...cliente,
      facturas_con_faltantes: Array.from(cliente.facturas_con_faltantes.values())
    })).sort(vista === 'historial'
      ? (a, b) => new Date(b.ultima_actividad) - new Date(a.ultima_actividad) || a.nombre.localeCompare(b.nombre)
      : ordenPorProximaVisita);

    return {
      success: true,
      data: clientesArray,
      total_clientes: clientesArray.length,
      resumen: {
        total_productos_faltantes: result.rows.filter(r => r.faltante_estado === 'pendiente' || vista === 'historial').length,
        total_cantidad_faltante: clientesArray.reduce((sum, c) => sum + c.total_cantidad, 0),
        total_facturas_afectadas: Array.from(new Set(result.rows.map(r => r.factura_id))).length
      }
    };

  } catch (error) {
    console.error('❌ Error generando reporte por cliente:', error);
    return { success: false, error: error.message, status: error.status };
  }
}

module.exports = { getMissingItemsByClient, listarRutas };

/** Reporte operativo por la ruta ACTUAL de la ficha, sin semanas (ROT-03).
 * Consultarlo no asigna proveedores ni guarda respuestas. Los documentos
 * conservan su recorrido histórico; cambiar de ruta no lo reescribe.
 */
const { query } = require('../../../config/database');
const { COLUMNAS_CICLO, JOIN_CICLO, contextoDocumento } = require('../rutas/operacionCiclo.service');
const { ULTIMA_ATENCION_SQL, rotacionDe, ordenPorProximaVisita } = require('../clientes/rotacion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { httpError } = require('../../utils/validacion');

function filtroRuta({ rutaId, cicloId }, params) {
  if (cicloId != null && cicloId !== '') throw httpError(400, 'El Reporte de clientes ahora se filtra solo por ruta. Recargá la pantalla.');
  if (rutaId == null || rutaId === '') return '';
  if (rutaId === 'sin-ruta') return 'AND c.ruta_id IS NULL';
  if (!((typeof rutaId === 'string' && /^[1-9]\d*$/.test(rutaId)) ||
    (typeof rutaId === 'number' && Number.isSafeInteger(rutaId) && rutaId > 0)) || Number(rutaId) > 2147483647) {
    throw httpError(400, 'Ruta inválida.');
  }
  params.push(Number(rutaId));
  return `AND c.ruta_id=$${params.length}`;
}

/** Metadatos mínimos bajo permiso Reporte Clientes, sin pedir permiso Clientes.
 * Una ruta sin ciclos también se puede elegir. Las inactivas asignadas se
 * conservan para que sus clientes con trabajo pendiente no desaparezcan.
 */
async function listarRutas() {
  return (await query(`SELECT r.id, r.nombre, r.activo FROM ruta_cliente r
    WHERE r.activo OR EXISTS(SELECT 1 FROM cliente c WHERE c.ruta_id=r.id)
    ORDER BY lower(r.nombre), r.id`)).rows;
}

async function getMissingItemsByClient({ rutaId, cicloId } = {}) {
  try {
    console.log('📋 Generando reporte de faltantes por la ruta del cliente...');

    const params = [];
    const whereRuta = filtroRuta({ rutaId, cicloId }, params);
    const hoy = hoyEnCostaRica();
    const result = await query(`
      SELECT
        f.id AS faltante_id,
        c.id AS cliente_id, COALESCE(c.nombre, fa.cliente_nombre) AS cliente_nombre,
        c.ruta_id AS ruta_actual_id, r.nombre AS ruta_actual_nombre,
        COALESCE(c.correo, fa.cliente_correo) AS cliente_email,
        fa.numero AS numero_factura,
        fa.fecha::text AS fecha_emision,
        fa.id AS factura_id, fa.preventa_anticipada, ${COLUMNAS_CICLO}, rc.ubicacion_maps,
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
        COALESCE(fr.fecha_procesamiento, f.updated_at) as fecha_procesamiento,
        -- Cuándo se mandó a Impresión: es la hora de la nota "En impresión".
        fr.fecha_creacion as enviada_a_impresion_en,
        aj.cantidad_entregada,
        aj.estado as ajuste_estado,
        aj.requiere_actualizacion,
        aj.revisado as ajuste_revisado,
        fr.id as reimpresion_id,
        fr.estado as reimpresion_estado,
        (SELECT COUNT(*) FROM faltantes f2 WHERE f2.factura_propia_id = fa.id) as total_items_factura
      FROM faltantes f
      JOIN producto p ON p.id = f.producto_propio_id
      JOIN factura fa ON fa.id = f.factura_propia_id ${JOIN_CICLO('fa')}
      LEFT JOIN cliente c ON c.id = fa.cliente_id
      LEFT JOIN ruta_cliente r ON r.id = c.ruta_id
      LEFT JOIN faltantes_ajustes aj ON aj.faltante_id = f.id
      -- La fila más reciente de la cola: hay facturas con dos (de antes de
      -- que la cola reusara la suya), y un JOIN directo duplicaba cada
      -- producto de esas facturas en el reporte y no decía de cuál era la hora.
      LEFT JOIN LATERAL (
        SELECT r.id, r.estado, r.fecha_creacion, r.fecha_procesamiento
          FROM facturas_reimpresion r
         WHERE r.factura_propia_id = fa.id
         ORDER BY r.fecha_creacion DESC NULLS LAST, r.id DESC
         LIMIT 1
      ) fr ON true
      WHERE f.estado IN ('pendiente', 'procesado')
        AND f.tipo_faltante != 'completo'
        AND (f.cantidad_faltante::numeric > 0)
        -- Una factura anulada no se alista ni se entrega, así que sus
        -- faltantes tampoco (pasó con la 001000014828 del gimnasio de
        -- Palmares: anulada y todavía en el reporte, parecía un duplicado).
        -- Se excluye por el estado, no se borran los faltantes.
        AND fa.estado <> 'anulada'
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
          ...contextoDocumento(row),
          factura_id: row.factura_id,
          numero_factura: row.numero_factura,
          fecha_emision: row.fecha_emision,
          estado_procesamiento: row.estado_procesamiento,
          fecha_procesamiento: row.fecha_procesamiento,
          enviada_a_impresion_en: row.enviada_a_impresion_en || null,
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
        ajuste_revisado: row.ajuste_revisado === true
      });

      if (row.faltante_estado === 'pendiente') {
        cliente.total_productos++;
        cliente.total_cantidad += Number(row.cantidad_faltante);
      }

      if (!cliente.ultima_actividad || new Date(row.fecha_registro) > new Date(cliente.ultima_actividad)) {
        cliente.ultima_actividad = row.fecha_registro;
      }
    });

    const clientesArray = Array.from(clientesMap.values()).map(cliente => ({
      ...cliente,
      facturas_con_faltantes: Array.from(cliente.facturas_con_faltantes.values())
    })).sort(ordenPorProximaVisita);

    return {
      success: true,
      data: clientesArray,
      total_clientes: clientesArray.length,
      resumen: {
        total_productos_faltantes: result.rows.filter(r => r.faltante_estado === 'pendiente').length,
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

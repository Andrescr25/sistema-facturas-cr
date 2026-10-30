const { query } = require('../../../config/database');
const { filtroRutaActual, listarRutasActuales } = require('../rutas/rutaActual.service');
const { ULTIMA_ATENCION_SQL, rotacionDe, ordenPorProximaVisita } = require('../clientes/rotacion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { httpError } = require('../../utils/validacion');
const { REPROGRAMADA_SQL, conReprogramacion, fechaSugerida } = require('./visitas');

/** Agenda de TODOS los clientes activos de la ruta actual, tengan o no
 * faltantes. Leerla no crea visitas, pedidos ni facturas. La fecha se calcula
 * desde la venta vigente con la misma regla de la ficha y el reporte.
 */
async function agenda({ rutaId } = {}, { rutasPermitidas = null } = {}) {
  if (rutaId == null || rutaId === '') throw httpError(400, 'Seleccioná una ruta o los clientes sin ruta.');
  // Quien no ve todas las rutas (el agente): solo las suyas, y no «sin ruta».
  if (rutasPermitidas && !rutasPermitidas.includes(Number(rutaId))) {
    throw httpError(403, 'Esa ruta no está asignada a su usuario.');
  }
  const params = [], where = filtroRutaActual(rutaId, params), hoy = hoyEnCostaRica();
  const { rows } = await query(`SELECT c.id, c.nombre, c.correo, c.telefono,
    c.telefono_secundario, c.celular, c.provincia, c.canton, c.distrito,
    c.barrio, c.otras_senas, c.rotacion_dias, c.ubicacion_maps,
    c.ruta_id, r.nombre AS ruta_nombre, ${ULTIMA_ATENCION_SQL('c.id')} AS ultima_factura,
    ${REPROGRAMADA_SQL('c.id')} AS reprogramada
    FROM cliente c LEFT JOIN ruta_cliente r ON r.id=c.ruta_id
    WHERE c.activo ${where}`, params);
  const clientes = rows.map(({ rotacion_dias, ultima_factura, ruta_id, ruta_nombre, reprogramada, ...cliente }) => ({
    ...cliente,
    ruta: { id: ruta_id, nombre: ruta_nombre },
    // La «próxima visita» que marcó el agente manda hasta que vuelva a comprar (visitas.js).
    rotacion: conReprogramacion(rotacionDe({ rotacionDias: rotacion_dias, ultimaFactura: ultima_factura, hoy }), reprogramada, hoy),
    // Lo que «Próxima visita» propone por defecto: hoy más su rotación.
    proximaSugerida: fechaSugerida(rotacion_dias, hoy)
  })).sort(ordenPorProximaVisita);
  return { hoy, clientes };
}

module.exports = { agenda, listarRutas: listarRutasActuales };

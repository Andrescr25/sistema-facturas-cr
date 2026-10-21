const { query } = require('../../../config/database');
const { filtroRutaActual, listarRutasActuales } = require('../rutas/rutaActual.service');
const { ULTIMA_ATENCION_SQL, rotacionDe, ordenPorProximaVisita } = require('../clientes/rotacion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { httpError } = require('../../utils/validacion');

/** Agenda de TODOS los clientes activos de la ruta actual, tengan o no
 * faltantes. Leerla no crea visitas, pedidos ni facturas. La fecha se calcula
 * desde la venta vigente con la misma regla de la ficha y el reporte.
 */
async function agenda({ rutaId } = {}) {
  if (rutaId == null || rutaId === '') throw httpError(400, 'Seleccioná una ruta o los clientes sin ruta.');
  const params = [], where = filtroRutaActual(rutaId, params), hoy = hoyEnCostaRica();
  const { rows } = await query(`SELECT c.id, c.nombre, c.correo, c.telefono,
    c.telefono_secundario, c.celular, c.provincia, c.canton, c.distrito,
    c.barrio, c.otras_senas, c.rotacion_dias,
    c.ruta_id, r.nombre AS ruta_nombre, ${ULTIMA_ATENCION_SQL('c.id')} AS ultima_factura
    FROM cliente c LEFT JOIN ruta_cliente r ON r.id=c.ruta_id
    WHERE c.activo ${where}`, params);
  const clientes = rows.map(({ rotacion_dias, ultima_factura, ruta_id, ruta_nombre, ...cliente }) => ({
    ...cliente,
    ruta: { id: ruta_id, nombre: ruta_nombre },
    rotacion: rotacionDe({ rotacionDias: rotacion_dias, ultimaFactura: ultima_factura, hoy })
  })).sort(ordenPorProximaVisita);
  return { hoy, clientes };
}

module.exports = { agenda, listarRutas: listarRutasActuales };

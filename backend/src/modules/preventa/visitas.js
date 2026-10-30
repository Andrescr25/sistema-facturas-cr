/**
 * Las visitas del agente en Preventa (F4, 2026-10-29; tabla `visita`, migración 070).
 *
 * El usuario: «si el cliente pasa a una próxima visita, el agente de ventas
 * marque que será para próxima visita»; por defecto, hoy más su rotación, y
 * «que el agente planifique bien cómo va a visitar y esto sea más
 * personalizable» → puede elegir otra fecha. Y GPS en cada acción.
 *
 * DOS CLASES DE VISITA
 * · `proxima_visita`: no compró. Lleva el motivo y la nueva fecha. Mueve su
 *   próxima visita en la agenda HASTA QUE VUELVA A COMPRAR: una factura con
 *   fecha igual o posterior a la del aviso la deja sin efecto, porque la
 *   factura manda (rotacion.js). Se compara por día de Costa Rica, no por hora.
 * · `venta`: se facturó desde la visita. Se guarda en la MISMA transacción que
 *   la factura, con su id (también la que se armó sin señal y subió después).
 *
 * NADA DE ESTO CAMBIA LA ROTACIÓN NI LA FICHA: la próxima visita se sigue
 * calculando al leer.
 */
const { query } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { hoyEnCostaRica, sumarDias, diasEntre, diaDeBase } = require('../../utils/fechaCR');
const { SIN_CREDITO_TOTAL } = require('../facturacion/saldo.sql');

const MOTIVOS = ['no_necesita', 'cerrado', 'sin_encargado', 'sin_dinero', 'otro'];
const DIAS_MAXIMOS = 180;
const NOTA_MAXIMA = 500;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El GPS como lo manda el dispositivo, revisado. Lo que no sirve no tumba la
 * visita (ni la factura): queda como «no disponible».
 */
function ubicacionLimpia(u) {
  const estado = ['tomada', 'negada', 'no_disponible'].includes(u?.estado) ? u.estado : 'no_disponible';
  const lat = Number(u?.latitud), lng = Number(u?.longitud), precision = Number(u?.precision);
  if (estado === 'tomada' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { estado, latitud: lat, longitud: lng, precision: Number.isFinite(precision) && precision >= 0 ? Math.round(precision) : null };
  }
  return { estado: estado === 'tomada' ? 'no_disponible' : estado, latitud: null, longitud: null, precision: null };
}

async function insertar(db, v) {
  const u = ubicacionLimpia(v.ubicacion);
  const { rows: [fila] } = await db.query(
    `INSERT INTO visita (cliente_id, usuario_id, ruta_id, fecha, resultado, motivo, nota, proxima_fecha, factura_id,
                         ubicacion_estado, latitud, longitud, precision_m)
     VALUES ($1, $2, (SELECT ruta_id FROM cliente WHERE id = $1), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [v.clienteId, v.usuarioId || null, v.fecha, v.resultado, v.motivo || null, v.nota || null, v.proximaFecha || null,
      v.facturaId || null, u.estado, u.latitud, u.longitud, u.precision]);
  return fila;
}

/**
 * «Próxima visita»: el cliente no compró hoy.
 * @param {{clienteId, motivo, proximaFecha, nota?, ubicacion?}} datos
 * @param {{usuarioId: number, rutasPermitidas: number[]|null}} quien  `rutasPermitidas`
 *   null = ve todas; si no, solo puede marcar clientes de esas rutas.
 */
async function registrarProximaVisita(datos = {}, { usuarioId, rutasPermitidas = null } = {}) {
  const clienteId = idValido(datos.clienteId);
  const { rows: [cliente] } = await query('SELECT id, activo, ruta_id FROM cliente WHERE id = $1', [clienteId]);
  if (!cliente || !cliente.activo) throw httpError(404, 'No existe ese cliente.');
  if (rutasPermitidas && !rutasPermitidas.includes(Number(cliente.ruta_id))) {
    throw httpError(403, 'Ese cliente no es de una ruta asignada a su usuario.');
  }
  if (!MOTIVOS.includes(datos.motivo)) throw httpError(400, 'Elegí por qué no compró.');

  const hoy = hoyEnCostaRica();
  const proximaFecha = String(datos.proximaFecha || '');
  if (!FECHA.test(proximaFecha) || diasEntre(hoy, proximaFecha) < 1) throw httpError(400, 'La próxima visita tiene que ser de mañana en adelante.');
  if (diasEntre(hoy, proximaFecha) > DIAS_MAXIMOS) throw httpError(400, `La próxima visita puede quedar hasta ${DIAS_MAXIMOS} días adelante.`);
  const nota = String(datos.nota || '').trim();
  if (nota.length > NOTA_MAXIMA) throw httpError(400, `La nota va hasta ${NOTA_MAXIMA} caracteres.`);

  return insertar({ query }, {
    clienteId, usuarioId, fecha: hoy, resultado: 'proxima_visita',
    motivo: datos.motivo, nota: nota || null, proximaFecha, ubicacion: datos.ubicacion
  });
}

/** La venta de una visita, dentro de la transacción de la factura. */
async function registrarVentaEn(db, { factura, usuarioId, ubicacion }) {
  return insertar(db, {
    clienteId: factura.cliente_id, usuarioId, fecha: diaDeBase(factura.fecha) || hoyEnCostaRica(),
    resultado: 'venta', facturaId: factura.id, ubicacion
  });
}

/**
 * En SQL: la «próxima visita» que sigue vigente para el cliente —la última,
 * de un día POSTERIOR a su última factura válida—, como JSON o null.
 * @param {string} cliente  la expresión SQL del id del cliente
 */
const REPROGRAMADA_SQL = (cliente) => `(
  SELECT json_build_object('proximaFecha', v.proxima_fecha, 'motivo', v.motivo, 'nota', v.nota,
                           'fecha', v.fecha, 'usuario', u.nombre)
    FROM visita v LEFT JOIN usuario u ON u.id = v.usuario_id
   WHERE v.cliente_id = ${cliente} AND v.resultado = 'proxima_visita'
     AND v.fecha > COALESCE((SELECT MAX(f.fecha) FROM factura f
                              WHERE f.cliente_id = ${cliente} AND f.estado = 'emitida' AND ${SIN_CREDITO_TOTAL}), '-infinity'::date)
   ORDER BY v.fecha DESC, v.id DESC LIMIT 1)`;

/**
 * La rotación del cliente, con la próxima visita que marcó el agente si
 * sigue vigente. Conserva la frecuencia y la última atención: solo cambia
 * CUÁNDO toca, y dice por qué.
 */
function conReprogramacion(rotacion, reprogramada, hoy) {
  if (!reprogramada) return rotacion;
  const proximaVisita = diaDeBase(reprogramada.proximaFecha);
  const faltan = diasEntre(hoy, proximaVisita);
  const estado = faltan < 0 ? 'atrasado' : faltan === 0 ? 'hoy' : 'proximo';
  return {
    ...rotacion, proximaVisita, faltan, estado,
    reprogramada: { motivo: reprogramada.motivo, nota: reprogramada.nota, el: diaDeBase(reprogramada.fecha), por: reprogramada.usuario }
  };
}

/** Lo que la pantalla ofrece por defecto: hoy más su rotación, o en 7 días si no tiene. */
function fechaSugerida(rotacionDias, hoy = hoyEnCostaRica()) {
  const n = Number(rotacionDias);
  return sumarDias(hoy, Number.isInteger(n) && n >= 1 && n <= DIAS_MAXIMOS ? n : 7);
}

module.exports = { MOTIVOS, registrarProximaVisita, registrarVentaEn, REPROGRAMADA_SQL, conReprogramacion, ubicacionLimpia, fechaSugerida };

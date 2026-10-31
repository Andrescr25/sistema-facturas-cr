/**
 * Las jornadas del empleado (2026-10-30; tabla `jornada`, migración 072).
 *
 * El usuario decidió que el agente «marca entrada y salida» y se le paga por
 * hora trabajada. Por eso:
 * · La hora la pone el SERVIDOR al tocar «Iniciar» o «Terminar jornada», no
 *   el teléfono; el GPS del momento se anota como en cada visita (y si no lo
 *   hay, por qué). Una sola abierta por usuario; puede haber varios tramos en
 *   un día (salir a almorzar).
 * · La que pasó de 16 horas abierta se olvidó de terminar: se lee «sin
 *   salida» y cuenta 0 horas hasta que quien lleva Empleados la corrija. Él
 *   no la puede cerrar después: serían horas que nadie vio.
 * · Corregir, agregar un tramo que no se marcó o anularlo pide motivo y queda
 *   en la bitácora con el antes y el después.
 */
const { pool, query } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');
const { enTransaccion } = require('../../utils/transaccion');
const { ubicacionLimpia } = require('../preventa/visitas');
const { HORAS_MAXIMAS } = require('./liquidacion');

const CR = "'America/Costa_Rica'";
const MOTIVO_MAXIMO = 300;
const DIAS_AVISO = 45;
const SIN_FICHA = 'Tu usuario no está configurado como empleado: pedíselo al administrador.';
// Lo que da <input type="datetime-local">, en hora de Costa Rica.
const MOMENTO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const OLVIDADA = `(j.estado = 'abierta' AND j.inicio < now() - interval '${HORAS_MAXIMAS} hours')`;
const ESTADO_SQL = `CASE WHEN ${OLVIDADA} THEN 'sin_salida' ELSE j.estado END`;
const COLUMNAS = `j.id, j.usuario_id, to_char(j.fecha, 'YYYY-MM-DD') AS fecha, j.inicio, j.fin, ${ESTADO_SQL} AS estado, j.origen,
  j.inicio_ubicacion_estado, j.inicio_latitud, j.inicio_longitud, j.inicio_precision_m,
  j.fin_ubicacion_estado, j.fin_latitud, j.fin_longitud, j.fin_precision_m,
  j.motivo_correccion, c.nombre AS corregida_por_nombre`;
const DESDE = 'FROM jornada j LEFT JOIN usuario c ON c.id = j.corregida_por';

const num = (v) => (v === null || v === undefined ? null : Number(v));
const gps = (estado, lat, lng, precision) => (estado ? { estado, latitud: num(lat), longitud: num(lng), precision: num(precision) } : null);
const diaCorto = (dia) => dia.split('-').reverse().slice(0, 2).join('/');

function comoJornada(f) {
  return {
    id: f.id, fecha: f.fecha, inicio: f.inicio, fin: f.fin, estado: f.estado, aMano: f.origen === 'a_mano',
    gpsInicio: gps(f.inicio_ubicacion_estado, f.inicio_latitud, f.inicio_longitud, f.inicio_precision_m),
    gpsFin: gps(f.fin_ubicacion_estado, f.fin_latitud, f.fin_longitud, f.fin_precision_m),
    correccion: f.motivo_correccion ? { motivo: f.motivo_correccion, por: f.corregida_por_nombre } : null
  };
}

async function leer(db, id) {
  const { rows: [f] } = await db.query(`SELECT ${COLUMNAS} ${DESDE} WHERE j.id = $1`, [id]);
  return f ? comoJornada(f) : null;
}

/** Los tramos de un usuario cuya entrada cae entre dos días de Costa Rica. */
async function jornadasEntre(usuarioId, desde, hasta) {
  const { rows } = await query(
    `SELECT ${COLUMNAS} ${DESDE} WHERE j.usuario_id = $1 AND j.fecha BETWEEN $2::date AND $3::date ORDER BY j.inicio, j.id`,
    [usuarioId, desde, hasta]);
  return rows.map(comoJornada);
}

/** La jornada abierta y las que quedaron sin salida en las últimas semanas. */
async function estadoDe(usuarioId) {
  const id = idValido(usuarioId);
  const { rows: [ficha] } = await query('SELECT activo FROM empleado WHERE usuario_id = $1', [id]);
  if (!ficha?.activo) return { empleado: false, abierta: null, sinSalida: [] };
  const { rows } = await query(
    `SELECT ${COLUMNAS} ${DESDE}
      WHERE j.usuario_id = $1 AND j.estado IN ('abierta', 'sin_salida') AND j.fecha >= (now() AT TIME ZONE ${CR})::date - ${DIAS_AVISO}
      ORDER BY j.inicio DESC`, [id]);
  const jornadas = rows.map(comoJornada);
  return { empleado: true, abierta: jornadas.find(j => j.estado === 'abierta') || null, sinSalida: jornadas.filter(j => j.estado === 'sin_salida') };
}

// Bloquea la ficha: «Iniciar», «Terminar» y las correcciones de un mismo
// empleado van de a una.
async function bloquearFicha(db, usuarioId, { soloActiva }) {
  const { rows: [e] } = await db.query('SELECT usuario_id, activo FROM empleado WHERE usuario_id = $1 FOR UPDATE', [usuarioId]);
  if (!e || (soloActiva && !e.activo)) {
    throw httpError(404, soloActiva ? SIN_FICHA : 'Ese usuario no es empleado.');
  }
  return e;
}

// La abierta que pasó de 16 horas queda guardada como «sin salida».
async function guardarOlvidadas(db, usuarioId) {
  const { rows } = await db.query(
    `UPDATE jornada j SET estado = 'sin_salida' WHERE j.usuario_id = $1 AND ${OLVIDADA} RETURNING to_char(j.fecha, 'YYYY-MM-DD') AS fecha`, [usuarioId]);
  return rows;
}

async function iniciar(usuarioId, ubicacion) {
  const id = idValido(usuarioId);
  const u = ubicacionLimpia(ubicacion);
  return enTransaccion(pool, async (db) => {
    await bloquearFicha(db, id, { soloActiva: true });
    await guardarOlvidadas(db, id);
    const { rows: [abierta] } = await db.query(
      `SELECT to_char(inicio AT TIME ZONE ${CR}, 'HH24:MI') AS hora FROM jornada WHERE usuario_id = $1 AND estado = 'abierta'`, [id]);
    if (abierta) throw httpError(409, `Ya tenés la jornada abierta desde las ${abierta.hora}.`);
    const { rows: [nueva] } = await db.query(
      `INSERT INTO jornada (usuario_id, fecha, inicio, estado, inicio_ubicacion_estado, inicio_latitud, inicio_longitud, inicio_precision_m)
       VALUES ($1, (now() AT TIME ZONE ${CR})::date, now(), 'abierta', $2, $3, $4, $5) RETURNING id`,
      [id, u.estado, u.latitud, u.longitud, u.precision]);
    return leer(db, nueva.id);
  });
}

async function terminar(usuarioId, ubicacion) {
  const id = idValido(usuarioId);
  const u = ubicacionLimpia(ubicacion);
  const { jornada, olvidada } = await enTransaccion(pool, async (db) => {
    await bloquearFicha(db, id, { soloActiva: true });
    const [vieja] = await guardarOlvidadas(db, id);
    const { rows: [cerrada] } = await db.query(
      `UPDATE jornada SET fin = now(), estado = 'cerrada',
              fin_ubicacion_estado = $2, fin_latitud = $3, fin_longitud = $4, fin_precision_m = $5
        WHERE usuario_id = $1 AND estado = 'abierta' RETURNING id`, [id, u.estado, u.latitud, u.longitud, u.precision]);
    return { jornada: cerrada ? await leer(db, cerrada.id) : null, olvidada: vieja || null };
  });
  if (jornada) return jornada;
  // Lo de «sin salida» ya quedó guardado; recién ahora se avisa.
  throw httpError(409, olvidada
    ? `La jornada del ${diaCorto(olvidada.fecha)} pasó de ${HORAS_MAXIMAS} horas sin terminarse: quedó sin salida y la corrige el administrador.`
    : 'No tenés una jornada abierta.');
}

function motivoValido(v) {
  const m = String(v || '').trim();
  if (m.length < 3) throw httpError(400, 'Escribí el motivo de la corrección.');
  if (m.length > MOTIVO_MAXIMO) throw httpError(400, `El motivo va hasta ${MOTIVO_MAXIMO} caracteres.`);
  return m;
}

function momentoValido(v, etiqueta) {
  if (!MOMENTO.test(String(v || ''))) throw httpError(400, `${etiqueta}: elegí el día y la hora.`);
  return String(v);
}

/**
 * Un tramo corregido o agregado tiene que poder haber pasado: salida después
 * de la entrada, hasta 16 horas, nada en el futuro, y sin pisar otro tramo del
 * mismo empleado (serían horas contadas dos veces). `fin` null = sigue abierta.
 */
async function validarTramo(db, usuarioId, inicio, fin, excepto) {
  if (fin !== null) {
    if (fin <= inicio) throw httpError(400, 'La salida tiene que ser después de la entrada.');
    const horas = (Date.parse(`${fin}:00Z`) - Date.parse(`${inicio}:00Z`)) / 3600000;
    if (horas > HORAS_MAXIMAS) throw httpError(400, `Un tramo va hasta ${HORAS_MAXIMAS} horas: partilo en dos si hace falta.`);
  }
  const { rows: [r] } = await db.query(
    `SELECT ($1::timestamp AT TIME ZONE ${CR}) > now() OR COALESCE(($2::timestamp AT TIME ZONE ${CR}) > now(), FALSE) AS futuro`, [inicio, fin]);
  if (r.futuro) throw httpError(400, 'La entrada y la salida no pueden ser en el futuro.');
  const { rows: [cruce] } = await db.query(
    `SELECT to_char(j.inicio AT TIME ZONE ${CR}, 'DD/MM HH24:MI') AS desde ${DESDE}
      WHERE j.usuario_id = $1 AND j.id IS DISTINCT FROM $4::int
        AND (j.estado = 'cerrada' OR (j.estado = 'abierta' AND NOT ${OLVIDADA}))
        AND tstzrange(j.inicio, COALESCE(j.fin, now())) && tstzrange($2::timestamp AT TIME ZONE ${CR}, COALESCE($3::timestamp AT TIME ZONE ${CR}, now()))
      LIMIT 1`, [usuarioId, inicio, fin, excepto]);
  if (cruce) throw httpError(409, `Se cruza con el tramo que empieza el ${cruce.desde}.`);
}

const foto = (j) => ({ fecha: j.fecha, inicio: j.inicio, fin: j.fin, estado: j.estado });

/**
 * Corrige la entrada y la salida de un tramo, o lo anula (`{anular: true}`).
 * A la jornada abierta de hoy se le puede corregir solo la entrada: sigue abierta.
 */
async function corregir(jornadaId, datos = {}, corrigeId) {
  const id = idValido(jornadaId);
  const motivo = motivoValido(datos.motivo);
  return enTransaccion(pool, async (db) => {
    const { rows: [fila] } = await db.query('SELECT usuario_id FROM jornada WHERE id = $1', [id]);
    if (!fila) throw httpError(404, 'No existe esa jornada.');
    await bloquearFicha(db, fila.usuario_id, { soloActiva: false });
    const antes = await leer(db, id);
    if (antes.estado === 'anulada') throw httpError(409, 'Esa jornada ya está anulada.');

    if (datos.anular === true) {
      await db.query(`UPDATE jornada SET estado = 'anulada', corregida_por = $2, motivo_correccion = $3 WHERE id = $1`, [id, corrigeId, motivo]);
      const despues = await leer(db, id);
      await registrarCambio(db, { entidad: 'jornada', entidadId: id, accion: 'anular', antes: foto(antes), despues: foto(despues), usuarioId: corrigeId, motivo });
      return despues;
    }

    const inicio = momentoValido(datos.inicio, 'Entrada');
    const sigueAbierta = antes.estado === 'abierta' && !datos.fin;
    const fin = sigueAbierta ? null : momentoValido(datos.fin, 'Salida');
    await validarTramo(db, fila.usuario_id, inicio, fin, id);
    await db.query(
      `UPDATE jornada SET inicio = $2::timestamp AT TIME ZONE ${CR}, fin = $3::timestamp AT TIME ZONE ${CR},
              fecha = $2::timestamp::date, estado = $4, corregida_por = $5, motivo_correccion = $6
        WHERE id = $1`, [id, inicio, fin, sigueAbierta ? 'abierta' : 'cerrada', corrigeId, motivo]);
    const despues = await leer(db, id);
    await registrarCambio(db, { entidad: 'jornada', entidadId: id, accion: 'editar', antes: foto(antes), despues: foto(despues), usuarioId: corrigeId, motivo });
    return despues;
  });
}

/** Un tramo que no se marcó (se le olvidó, o no tenía el teléfono). */
async function agregar(usuarioId, datos = {}, agregaId) {
  const id = idValido(usuarioId);
  const motivo = motivoValido(datos.motivo);
  const inicio = momentoValido(datos.inicio, 'Entrada');
  const fin = momentoValido(datos.fin, 'Salida');
  return enTransaccion(pool, async (db) => {
    await bloquearFicha(db, id, { soloActiva: false });
    await validarTramo(db, id, inicio, fin, null);
    const { rows: [nueva] } = await db.query(
      `INSERT INTO jornada (usuario_id, fecha, inicio, fin, estado, origen, corregida_por, motivo_correccion)
       VALUES ($1, $2::timestamp::date, $2::timestamp AT TIME ZONE ${CR}, $3::timestamp AT TIME ZONE ${CR}, 'cerrada', 'a_mano', $4, $5) RETURNING id`,
      [id, inicio, fin, agregaId, motivo]);
    const jornada = await leer(db, nueva.id);
    await registrarCambio(db, { entidad: 'jornada', entidadId: nueva.id, accion: 'crear', despues: { usuario_id: id, ...foto(jornada) }, usuarioId: agregaId, motivo });
    return jornada;
  });
}

module.exports = { SIN_FICHA, jornadasEntre, estadoDe, iniciar, terminar, corregir, agregar };

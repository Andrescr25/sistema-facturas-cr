/**
 * Empleados: la ficha con sus tarifas y lo que va ganando (2026-10-30;
 * tabla `empleado`, migración 072).
 *
 * El usuario: desde su panel, «Empleados»: «qué hizo, cuántas horas,
 * comisión, viáticos, el total que le debo»; y el agente, en «Mis ingresos»,
 * ve lo mismo pero SOLO lo suyo (el controlador de `ingresos` le pasa su
 * propio id, nunca uno que venga de la pantalla).
 *
 * Una sola cuenta para los dos lados: `quincenaDe`.
 */
const { query } = require('../../../config/database');
const { httpError, idValido, numero, booleano, validar } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const liquidacion = require('./liquidacion');
const jornadas = require('./jornada.service');
const { clientesNuevos } = require('./clientesNuevos');

// Las tarifas, con sus nombres de la pantalla. Lo que no venga queda como estaba
// (al crear, lo pone la base: 2 %, ₡2.000 y ₡5.000, lo que decidió el usuario).
const CAMPOS = {
  pago_hora: { desde: 'pagoHora', etiqueta: 'Pago por hora', validar: numero({ min: 0, max: 100000 }), requerido: true },
  comision_porcentaje: { desde: 'comisionPorcentaje', etiqueta: 'Comisión', validar: numero({ min: 0, max: 100 }) },
  incentivo_cliente_nuevo: { desde: 'incentivoClienteNuevo', etiqueta: 'Incentivo por cliente nuevo', validar: numero({ min: 0, max: 1000000 }) },
  gasolina_diaria: { desde: 'gasolinaDiaria', etiqueta: 'Gasolina por día', validar: numero({ min: 0, max: 100000 }) },
  activo: { desde: 'activo', etiqueta: 'Activo', validar: booleano }
};

function tarifasDe(datos, { crear }) {
  const crudo = {};
  for (const [columna, def] of Object.entries(CAMPOS)) if (datos[def.desde] !== undefined) crudo[columna] = datos[def.desde];
  const fila = validar(CAMPOS, crudo, { crear });
  for (const columna of Object.keys(fila)) if (fila[columna] === null) throw httpError(400, `${CAMPOS[columna].etiqueta}: es obligatorio.`);
  return fila;
}

const FICHA_SQL = `SELECT e.*, to_char(e.desde, 'YYYY-MM-DD') AS desde_dia, u.nombre, u.usuario, u.activo AS usuario_activo
  FROM empleado e JOIN usuario u ON u.id = e.usuario_id`;

const comoFicha = (e) => ({
  usuarioId: e.usuario_id, nombre: e.nombre, usuario: e.usuario, activo: e.activo, usuarioActivo: e.usuario_activo, desde: e.desde_dia,
  tarifas: {
    pagoHora: Number(e.pago_hora), comisionPorcentaje: Number(e.comision_porcentaje),
    incentivoClienteNuevo: Number(e.incentivo_cliente_nuevo), gasolinaDiaria: Number(e.gasolina_diaria)
  }
});

async function fichaDe(usuarioId, sinFicha = 'Ese usuario no es empleado.') {
  const { rows: [e] } = await query(`${FICHA_SQL} WHERE e.usuario_id = $1`, [idValido(usuarioId)]);
  if (!e) throw httpError(404, sinFicha);
  return comoFicha(e);
}

// La foto para la bitácora: las columnas que se pueden cambiar.
const foto = (f) => ({
  pago_hora: f.tarifas.pagoHora, comision_porcentaje: f.tarifas.comisionPorcentaje,
  incentivo_cliente_nuevo: f.tarifas.incentivoClienteNuevo, gasolina_diaria: f.tarifas.gasolinaDiaria, activo: f.activo
});

/** Los usuarios activos que todavía no tienen ficha de empleado. */
async function usuariosSinFicha() {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.usuario FROM usuario u
      WHERE u.activo AND NOT EXISTS (SELECT 1 FROM empleado e WHERE e.usuario_id = u.id)
      ORDER BY lower(u.nombre), u.id`);
  return rows;
}

async function crear(datos = {}, creaId) {
  const usuarioId = idValido(datos.usuarioId);
  const fila = tarifasDe(datos, { crear: true });
  const { rows: [usuario] } = await query('SELECT id, activo FROM usuario WHERE id = $1', [usuarioId]);
  if (!usuario || !usuario.activo) throw httpError(400, 'Elegí un usuario activo.');
  const columnas = Object.keys(fila);
  try {
    await query(
      `INSERT INTO empleado (usuario_id, creado_por${columnas.map(c => `, ${c}`).join('')})
       VALUES ($1, $2${columnas.map((_, i) => `, $${i + 3}`).join('')})`,
      [usuarioId, creaId || null, ...columnas.map(c => fila[c])]);
  } catch (e) {
    if (e.code === '23505') throw httpError(409, 'Ese usuario ya es empleado.');
    throw e;
  }
  const ficha = await fichaDe(usuarioId);
  await registrarCambio({ query }, { entidad: 'empleado', entidadId: usuarioId, accion: 'crear', despues: { nombre: ficha.nombre, ...foto(ficha) }, usuarioId: creaId });
  return ficha;
}

async function actualizar(usuarioId, datos = {}, editaId) {
  const antes = await fichaDe(usuarioId);
  const fila = tarifasDe(datos, { crear: false });
  const columnas = Object.keys(fila);
  if (columnas.length === 0) return antes;
  await query(
    `UPDATE empleado SET ${columnas.map((c, i) => `${c} = $${i + 2}`).join(', ')}, actualizado_en = now() WHERE usuario_id = $1`,
    [antes.usuarioId, ...columnas.map(c => fila[c])]);
  const despues = await fichaDe(usuarioId);
  await registrarCambio({ query }, { entidad: 'empleado', entidadId: antes.usuarioId, accion: 'editar', antes: foto(antes), despues: foto(despues), usuarioId: editaId });
  return despues;
}

/**
 * Lo de una quincena: las horas día por día y lo ganado por horas. La que
 * está corriendo, si no se pide otra. `anterior`/`siguiente` para recorrerlas,
 * sin pasar de hoy ni de antes de su ficha.
 */
async function quincenaDe(ficha, clave) {
  const actual = liquidacion.quincenaDe(hoyEnCostaRica());
  const q = clave ? liquidacion.quincenaPorClave(clave) : actual;
  if (!q) throw httpError(400, 'Elegí una quincena.');
  if (q.desde > actual.desde) throw httpError(400, 'Esa quincena todavía no empieza.');
  const anterior = liquidacion.quincenaAnterior(q);
  const dias = liquidacion.horasPorDia(await jornadas.jornadasEntre(ficha.usuarioId, q.desde, q.hasta));
  const minutos = dias.reduce((s, d) => s + d.minutos, 0);
  const clientes = await clientesNuevos(ficha.usuarioId, q);
  return {
    periodo: {
      ...q, enCurso: q.clave === actual.clave,
      anterior: anterior.hasta >= ficha.desde ? anterior.clave : null,
      siguiente: q.clave === actual.clave ? null : liquidacion.quincenaSiguiente(q).clave
    },
    dias, minutos, porHoras: liquidacion.montoPorHoras(minutos, ficha.tarifas.pagoHora),
    clientesNuevos: { ...clientes, monto: liquidacion.montoPorCada(clientes.cuentan.length, ficha.tarifas.incentivoClienteNuevo) }
  };
}

/** Lo que ve cada uno de su ficha: tarifas, jornada y la quincena. `propio`: lo pide el mismo empleado. */
async function ingresosDe(usuarioId, clave, { propio = false } = {}) {
  const ficha = await fichaDe(usuarioId, propio ? jornadas.SIN_FICHA : undefined);
  return { ficha, jornada: await jornadas.estadoDe(ficha.usuarioId), quincena: await quincenaDe(ficha, clave) };
}

/** La lista de Empleados: cada uno con su quincena en curso. */
async function listar() {
  const { rows } = await query(`${FICHA_SQL} ORDER BY e.activo DESC, lower(u.nombre), e.id`);
  const lista = [];
  for (const fila of rows) {
    const ficha = comoFicha(fila);
    const { quincena, jornada } = await ingresosDe(ficha.usuarioId);
    const { periodo, minutos, porHoras, clientesNuevos: nuevos } = quincena;
    lista.push({ ...ficha, jornada, quincena: { periodo, minutos, porHoras, clientesNuevos: { cuentan: nuevos.cuentan.length, esperando: nuevos.esperando.length, monto: nuevos.monto } } });
  }
  return lista;
}

module.exports = { usuariosSinFicha, crear, actualizar, fichaDe, ingresosDe, listar };

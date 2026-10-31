/**
 * Usuarios y permisos - Service
 *
 * Crear gente del equipo, decidir qué módulos ve cada quien, desactivar a
 * alguien que se fue. Solo lo usan administradores (ver usuarios.routes.js).
 *
 * QUÉ NO SE DEVUELVE NUNCA: password_hash. Las columnas se listan una por
 * una, sin SELECT *, para que el hash no se escape por agregar una consulta
 * nueva sin pensarlo.
 */

const bcrypt = require('bcryptjs');
const { query } = require('../../../config/database');
const { CLAVES } = require('./modulos');
const { rutasDe, rutasPorUsuario, guardarRutas } = require('./rutasAsignadas');
const { limpiarModulosOcultos, modulosOcultosDe } = require('./vistaModulos');

const RONDAS_BCRYPT = 12;
const MIN_PASSWORD = 8;
const MIN_USUARIO = 3;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const COLUMNAS = `id, usuario, nombre, activo, es_admin, ultimo_ingreso, creado_en, modulos_ocultos`;

function mapUsuario(row, modulos = [], rutas = []) {
  return {
    id: row.id,
    usuario: row.usuario,
    nombre: row.nombre,
    activo: row.activo,
    esAdmin: row.es_admin,
    ultimoIngreso: row.ultimo_ingreso,
    creadoEn: row.creado_en,
    // Un admin no tiene filas en usuario_modulo: las tendría que mantener
    // sincronizadas cada vez que se agrega un módulo nuevo. Se le devuelven
    // todas las claves como permisos; su vista se elige con modulosOcultos.
    modulos: row.es_admin ? [...CLAVES] : modulos,
    modulosOcultos: modulosOcultosDe(row),
    // Las rutas que atiende en Preventa (rutasAsignadas.js): [{ id, nombre }].
    rutas
  };
}

/** Las claves válidas, descartando lo que no exista en el catálogo. */
function limpiarModulos(modulos) {
  const pedidos = Array.isArray(modulos) ? modulos.map(String) : [];
  const validas = pedidos.filter(m => CLAVES.includes(m));
  const invalidas = pedidos.filter(m => !CLAVES.includes(m));
  if (invalidas.length > 0) {
    throw httpError(400, `Estos módulos no existen: ${invalidas.join(', ')}.`);
  }
  return [...new Set(validas)];
}

async function listar() {
  const u = await query(`SELECT ${COLUMNAS} FROM usuario ORDER BY es_admin DESC, usuario ASC;`);
  const p = await query(`SELECT usuario_id, modulo FROM usuario_modulo;`);

  const porUsuario = new Map();
  for (const row of p.rows) {
    if (!porUsuario.has(row.usuario_id)) porUsuario.set(row.usuario_id, []);
    porUsuario.get(row.usuario_id).push(row.modulo);
  }

  const rutas = await rutasPorUsuario();
  return u.rows.map(row => mapUsuario(row, porUsuario.get(row.id) || [], rutas.get(row.id) || []));
}

async function obtener(usuarioId) {
  const u = await query(`SELECT ${COLUMNAS} FROM usuario WHERE id = $1;`, [usuarioId]);
  if (u.rows.length === 0) throw httpError(404, 'Usuario no encontrado.');
  const p = await query(`SELECT modulo FROM usuario_modulo WHERE usuario_id = $1;`, [usuarioId]);
  return mapUsuario(u.rows[0], p.rows.map(x => x.modulo), (await rutasPorUsuario()).get(Number(usuarioId)) || []);
}

/**
 * Los permisos de alguien, para autorizar sus llamadas.
 * Devuelve null si el usuario no existe o está inactivo — que es distinto de
 * "existe y no tiene permisos": el middleware trata los dos casos aparte.
 */
async function permisosDe(usuarioId) {
  const u = await query(`SELECT id, es_admin, activo, modulos_ocultos FROM usuario WHERE id = $1;`, [usuarioId]);
  const row = u.rows[0];
  if (!row || !row.activo) return null;
  if (row.es_admin) return { esAdmin: true, modulos: new Set(CLAVES), modulosOcultos: modulosOcultosDe(row) };

  const p = await query(`SELECT modulo FROM usuario_modulo WHERE usuario_id = $1;`, [usuarioId]);
  return { esAdmin: false, modulos: new Set(p.rows.map(x => x.modulo)), modulosOcultos: [] };
}

async function crear({ usuario, nombre, password, esAdmin = false, modulos = [], modulosOcultos = [], rutas }, creadoPor) {
  const nombreUsuario = String(usuario || '').trim().toLowerCase();
  if (nombreUsuario.length < MIN_USUARIO) {
    throw httpError(400, `El usuario debe tener al menos ${MIN_USUARIO} caracteres.`);
  }
  if (!String(nombre || '').trim()) throw httpError(400, 'El nombre es obligatorio.');
  if (String(password || '').length < MIN_PASSWORD) {
    throw httpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }

  const limpios = limpiarModulos(modulos);
  const ocultos = limpiarModulosOcultos(modulosOcultos, esAdmin);
  const hash = await bcrypt.hash(String(password), RONDAS_BCRYPT);

  const res = await query(`
    INSERT INTO usuario (usuario, nombre, password_hash, es_admin, modulos_ocultos)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (usuario) DO NOTHING
    RETURNING ${COLUMNAS};
  `, [nombreUsuario, String(nombre).trim(), hash, Boolean(esAdmin), ocultos]);

  if (res.rows.length === 0) throw httpError(400, `El usuario "${nombreUsuario}" ya existe.`);

  const creado = res.rows[0];
  if (!esAdmin && limpios.length > 0) {
    await guardarModulos(creado.id, limpios, creadoPor);
  }
  if (!esAdmin && rutas !== undefined) await guardarRutas(creado.id, rutas, creadoPor);
  return mapUsuario(creado, limpios, (await rutasPorUsuario()).get(creado.id) || []);
}

/**
 * Reemplaza los módulos de un usuario por la lista que llega.
 *
 * Borra e inserta en vez de calcular diferencias: la lista completa es lo que
 * manda la pantalla (un tablero de casillas), y así el resultado es
 * exactamente lo que se ve marcado, sin estados intermedios que dependan de
 * lo que hubiera antes.
 */
async function guardarModulos(usuarioId, modulos, otorgadoPor) {
  await query(`DELETE FROM usuario_modulo WHERE usuario_id = $1;`, [usuarioId]);
  if (modulos.length === 0) return;

  const filas = modulos.map((_, i) => `($1, $${i + 2}, $${modulos.length + 2})`).join(', ');
  await query(
    `INSERT INTO usuario_modulo (usuario_id, modulo, otorgado_por) VALUES ${filas};`,
    [usuarioId, ...modulos, otorgadoPor || null]
  );
}

/**
 * Cambia nombre, permisos, si es admin y si está activo.
 *
 * `usuarioQueEdita` NO es decorativo: impide que un administrador se quite a
 * sí mismo el rol o se desactive y deje el sistema sin nadie que pueda
 * repartir permisos. Es el error que no se puede deshacer desde la pantalla.
 */
async function actualizar(usuarioId, { nombre, esAdmin, activo, modulos, modulosOcultos, rutas }, usuarioQueEdita) {
  const actual = await query(`SELECT ${COLUMNAS} FROM usuario WHERE id = $1;`, [usuarioId]);
  if (actual.rows.length === 0) throw httpError(404, 'Usuario no encontrado.');

  const seEditaASiMismo = String(usuarioId) === String(usuarioQueEdita);
  if (seEditaASiMismo && esAdmin === false) {
    throw httpError(400, 'No puede quitarse a usted mismo el rol de administrador.');
  }
  if (seEditaASiMismo && activo === false) {
    throw httpError(400, 'No puede desactivar su propia cuenta.');
  }

  // Con un solo administrador activo, degradarlo o apagarlo deja el sistema
  // sin nadie que pueda volver a repartir permisos.
  if (esAdmin === false || activo === false) {
    await comprobarQueQuedaUnAdmin(usuarioId);
  }

  const nuevoNombre = nombre === undefined ? actual.rows[0].nombre : String(nombre).trim();
  const nuevoAdmin = esAdmin === undefined ? actual.rows[0].es_admin : Boolean(esAdmin);
  const nuevoActivo = activo === undefined ? actual.rows[0].activo : Boolean(activo);
  // Validar antes del UPDATE: un error de casillas no debe guardar el resto.
  let limpios = modulos === undefined ? null : limpiarModulos(modulos);
  const ocultos = limpiarModulosOcultos(modulosOcultos === undefined
    ? (nuevoAdmin ? modulosOcultosDe(actual.rows[0]) : []) : modulosOcultos, nuevoAdmin);

  const res = await query(`
    UPDATE usuario SET nombre = $1, es_admin = $2, activo = $3, modulos_ocultos = $5 WHERE id = $4
    RETURNING ${COLUMNAS};
  `, [nuevoNombre, nuevoAdmin, nuevoActivo, usuarioId, ocultos]);

  if (modulos !== undefined) {
    // Un admin tiene todos los permisos por su rol; no dependen de su vista.
    await guardarModulos(usuarioId, nuevoAdmin ? [] : limpios, usuarioQueEdita);
  } else {
    const p = await query(`SELECT modulo FROM usuario_modulo WHERE usuario_id = $1;`, [usuarioId]);
    limpios = p.rows.map(x => x.modulo);
  }
  // Un admin ve todas las rutas por su rol: sin filas, como con los módulos.
  if (rutas !== undefined || nuevoAdmin) await guardarRutas(Number(usuarioId), nuevoAdmin ? [] : rutas, usuarioQueEdita);

  return mapUsuario(res.rows[0], limpios, (await rutasPorUsuario()).get(Number(usuarioId)) || []);
}

async function comprobarQueQuedaUnAdmin(usuarioIdQueCambia) {
  const r = await query(
    `SELECT COUNT(*)::int n FROM usuario WHERE es_admin = TRUE AND activo = TRUE AND id <> $1;`,
    [usuarioIdQueCambia]
  );
  if (r.rows[0].n === 0) {
    throw httpError(400, 'Es el único administrador activo. Nombre a otro antes de cambiar este.');
  }
}

/** Le pone contraseña nueva a alguien que la olvidó. No pide la anterior. */
async function restablecerPassword(usuarioId, { password }) {
  if (String(password || '').length < MIN_PASSWORD) {
    throw httpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }
  const hash = await bcrypt.hash(String(password), RONDAS_BCRYPT);
  const r = await query(`UPDATE usuario SET password_hash = $1 WHERE id = $2 RETURNING id;`, [hash, usuarioId]);
  if (r.rows.length === 0) throw httpError(404, 'Usuario no encontrado.');
  return { restablecida: true };
}

/**
 * Borra un usuario. Sus permisos se van con él (ON DELETE CASCADE).
 *
 * Lo que dice "quién hizo qué" con un campo ON DELETE SET NULL no lo impide.
 * Lo que es de esa persona sí: sus jornadas, su ficha de empleado y los
 * clientes que consiguió (2026-10-30), o el efectivo que entregó. Ahí la base no deja borrarlo y se
 * desactiva en su lugar, para no perder lo trabajado ni lo pagado.
 */
async function eliminar(usuarioId, usuarioQueBorra) {
  if (String(usuarioId) === String(usuarioQueBorra)) {
    throw httpError(400, 'No puede borrar su propia cuenta.');
  }
  await comprobarQueQuedaUnAdmin(usuarioId);

  const r = await query(`DELETE FROM usuario WHERE id = $1 RETURNING usuario;`, [usuarioId]).catch((e) => {
    if (e.code === '23503') throw httpError(409, 'Este usuario tiene registros propios (jornadas, clientes que consiguió o entregas de efectivo): desactívelo en vez de borrarlo.');
    throw e;
  });
  if (r.rows.length === 0) throw httpError(404, 'Usuario no encontrado.');
  return { eliminado: true, usuario: r.rows[0].usuario };
}

module.exports = {
  listar, obtener, crear, actualizar, eliminar,
  restablecerPassword, permisosDe, limpiarModulos, MIN_PASSWORD, MIN_USUARIO
};

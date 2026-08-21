/**
 * Auth - Service
 *
 * Autenticación por usuario y contraseña con token JWT. Se eligió token en
 * cabecera y no cookie de sesión porque en producción el frontend y la API
 * viven en orígenes distintos (sistema-facturas-cr.onrender.com contra
 * sistema-facturas-cr-web.onrender.com): una cookie ahí exige SameSite=None
 * más HTTPS y configuración de CORS con credenciales, y cualquier descuido
 * deja a la gente sin poder entrar.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../../../config/database');

const RONDAS_BCRYPT = 12;
const VIGENCIA_TOKEN = '12h'; // una jornada: no obliga a reingresar a media mañana

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * El secreto NO tiene valor por defecto a propósito. Un fallback tipo
 * 'cambiar-esto' que alguien olvida en producción es peor que no arrancar:
 * cualquiera que conozca el valor puede firmarse un token válido.
 */
function secreto() {
  const valor = process.env.JWT_SECRET;
  if (!valor || valor.length < 32) {
    throw new Error(
      'Falta JWT_SECRET en el .env (mínimo 32 caracteres). Generá uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  return valor;
}

async function login({ usuario, password }) {
  if (!usuario || !password) {
    throw httpError(400, 'Usuario y contraseña son obligatorios.');
  }

  const res = await query(
    `SELECT * FROM usuario WHERE LOWER(usuario) = LOWER($1);`,
    [String(usuario).trim()]
  );
  const row = res.rows[0];

  // Mismo mensaje y mismo costo si el usuario no existe o si la contraseña
  // está mal: responder distinto permite averiguar qué usuarios existen.
  // El hash falso mantiene parecido el tiempo de respuesta en ambos casos.
  const hash = row?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const coincide = await bcrypt.compare(String(password), hash);

  if (!row || !coincide || !row.activo) {
    throw httpError(401, 'Usuario o contraseña incorrectos.');
  }

  await query(`UPDATE usuario SET ultimo_ingreso = CURRENT_TIMESTAMP WHERE id = $1;`, [row.id]);

  const token = jwt.sign(
    { sub: String(row.id), usuario: row.usuario, nombre: row.nombre },
    secreto(),
    { expiresIn: VIGENCIA_TOKEN }
  );

  return { token, usuario: { id: row.id, usuario: row.usuario, nombre: row.nombre } };
}

function verificarToken(token) {
  try {
    return jwt.verify(token, secreto());
  } catch (error) {
    return null;
  }
}

async function crearUsuario({ usuario, nombre, password }) {
  if (!usuario || !nombre || !password) {
    throw httpError(400, 'Usuario, nombre y contraseña son obligatorios.');
  }
  if (String(password).length < 8) {
    throw httpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  }

  const hash = await bcrypt.hash(String(password), RONDAS_BCRYPT);
  const res = await query(`
    INSERT INTO usuario (usuario, nombre, password_hash)
    VALUES (LOWER($1), $2, $3)
    ON CONFLICT (usuario) DO NOTHING
    RETURNING id, usuario, nombre;
  `, [String(usuario).trim(), String(nombre).trim(), hash]);

  if (res.rows.length === 0) {
    throw httpError(400, `El usuario "${usuario}" ya existe.`);
  }
  return res.rows[0];
}

async function cambiarPassword(usuarioId, { passwordActual, passwordNueva }) {
  if (String(passwordNueva || '').length < 8) {
    throw httpError(400, 'La contraseña nueva debe tener al menos 8 caracteres.');
  }

  const res = await query(`SELECT * FROM usuario WHERE id = $1;`, [usuarioId]);
  const row = res.rows[0];
  if (!row) throw httpError(404, 'Usuario no encontrado.');

  const coincide = await bcrypt.compare(String(passwordActual || ''), row.password_hash);
  if (!coincide) throw httpError(401, 'La contraseña actual no coincide.');

  const hash = await bcrypt.hash(String(passwordNueva), RONDAS_BCRYPT);
  await query(`UPDATE usuario SET password_hash = $1 WHERE id = $2;`, [hash, usuarioId]);
  return { cambiada: true };
}

async function hayUsuarios() {
  const res = await query(`SELECT COUNT(*)::int AS n FROM usuario WHERE activo = TRUE;`);
  return res.rows[0].n > 0;
}

module.exports = { login, verificarToken, crearUsuario, cambiarPassword, hayUsuarios };

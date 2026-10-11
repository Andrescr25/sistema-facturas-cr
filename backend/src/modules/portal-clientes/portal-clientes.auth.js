/**
 * Portal de clientes - Autenticación
 *
 * POR QUÉ UN SECRETO APARTE
 * Los tokens de cliente se firman con JWT_SECRET_CLIENTES, distinto del
 * JWT_SECRET del personal. La alternativa —un solo secreto y un campo
 * `tipo: 'cliente'` dentro del token— deja la seguridad dependiendo de que
 * TODAS las rutas comprueben ese campo: el día que una lo olvide, un cliente
 * entra a Cuentas por Cobrar con su propio token.
 *
 * Con secretos distintos eso no puede pasar. Un token de cliente ni siquiera
 * verifica contra el secreto del personal: falla la firma, no una condición
 * que alguien pudo haber olvidado escribir.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../../../config/database');

const RONDAS_BCRYPT = 12;
const VIGENCIA_TOKEN = '30d';   // el cliente no debería reingresar cada día
const DIAS_INVITACION = 7;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function secretoClientes() {
  const valor = process.env.JWT_SECRET_CLIENTES;
  if (!valor || valor.length < 32) {
    throw new Error(
      'Falta JWT_SECRET_CLIENTES en el .env (mínimo 32 caracteres). Generá uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  if (valor === process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET_CLIENTES no puede ser igual a JWT_SECRET: el punto es que un token de cliente no valide como token del personal.');
  }
  return valor;
}

/** El token viaja en el enlace; en la base solo queda su hash. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function firmarToken(cuenta) {
  return jwt.sign(
    { sub: String(cuenta.id), clienteId: cuenta.cliente_id, nombre: cuenta.nombre },
    secretoClientes(),
    { expiresIn: VIGENCIA_TOKEN }
  );
}

function verificarTokenCliente(token) {
  try {
    return jwt.verify(token, secretoClientes());
  } catch (error) {
    return null;
  }
}

module.exports = {
  bcrypt, jwt, crypto, query, httpError,
  RONDAS_BCRYPT, DIAS_INVITACION,
  secretoClientes, hashToken, firmarToken, verificarTokenCliente
};

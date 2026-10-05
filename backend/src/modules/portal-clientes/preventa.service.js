const { createHmac, timingSafeEqual } = require('node:crypto');
const { query, pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { secretoClientes, hashToken } = require('./portal-clientes.auth');
const { httpError, idValido } = require('../../utils/validacion');
const ciclos = require('../rutas/documentosCiclo.service');
const { telefonosDeCliente, enviarYRegistrar } = require('../envios-whatsapp/envios.service');

// Es contexto firmado, nunca una sesión ni una invitación de acceso. El
// prefijo y el dominio del HMAC impiden usarlo como JWT del portal. Estable
// por cliente/ciclo: copiarlo otra vez no invalida lo ya enviado al cliente.
const firma = cuerpo => createHmac('sha256', secretoClientes())
  .update(`preventa-ciclo-v1\0${cuerpo}`).digest('base64url');
function crearToken(clienteId, cicloId) {
  const cuerpo = `${idValido(clienteId)}.${idValido(cicloId)}`;
  return `pv1.${cuerpo}.${firma(cuerpo)}`;
}
function leerToken(token) {
  const partes = typeof token === 'string' && token.length <= 100
    ? /^pv1\.([1-9]\d{0,9})\.([1-9]\d{0,9})\.([A-Za-z0-9_-]{43})$/.exec(token) : null;
  if (!partes) throw httpError(404, 'El enlace no corresponde a su cuenta o ya no está disponible.');
  const cuerpo = `${partes[1]}.${partes[2]}`;
  if (!timingSafeEqual(Buffer.from(partes[3]), Buffer.from(firma(cuerpo)))) {
    throw httpError(404, 'El enlace no corresponde a su cuenta o ya no está disponible.');
  }
  return { clienteId: Number(partes[1]), cicloId: Number(partes[2]) };
}

async function preparar(clienteId, cicloId) {
  const id = idValido(clienteId);
  const { rows: [cliente] } = await query(`SELECT c.id, cp.usuario, cp.activo AS cuenta_activa
    FROM cliente c LEFT JOIN cliente_portal cp ON cp.cliente_id=c.id WHERE c.id=$1 AND c.activo`, [id]);
  if (!cliente) throw httpError(404, 'No existe ese cliente activo.');
  if (cliente.cuenta_activa === false) throw httpError(409, 'El acceso está revocado. Revisalo en Cuentas antes de preparar el enlace.');
  const contexto = await ciclos.validarEn({ query }, id, idValido(cicloId));
  if (contexto.estado !== 'preventa') throw httpError(409, 'Prepará los catálogos desde un ciclo en preventa.');
  return { token: crearToken(id, cicloId), clienteId: id, ciclo: contexto.ciclo,
    requiereInvitacion: !cliente.usuario, ...await telefonosDeCliente(id) };
}

async function validarEn(db, cuenta, token, cicloId) {
  const datos = leerToken(token);
  if (datos.clienteId !== cuenta.cliente_id) throw httpError(404, 'El enlace no corresponde a su cuenta o ya no está disponible.');
  if (cicloId !== undefined && Number(cicloId) !== datos.cicloId) {
    throw httpError(400, 'La semana del pedido debe coincidir con la del enlace.');
  }
  return ciclos.validarEn(db, cuenta.cliente_id, datos.cicloId);
}
async function resolver(cuentaId, token) {
  const { rows: [cuenta] } = await query(`SELECT cp.cliente_id FROM cliente_portal cp
    JOIN cliente c ON c.id=cp.cliente_id WHERE cp.id=$1 AND cp.activo AND c.activo`, [idValido(cuentaId)]);
  if (!cuenta) throw httpError(403, 'Su cuenta está desactivada.');
  const contexto = await validarEn({ query }, cuenta, token);
  return { ...contexto.ciclo, estado: contexto.estado };
}
async function invitar(clienteId, { cicloId }, usuarioId) {
  return enTransaccion(pool, async db => {
    const id = idValido(clienteId);
    // Serializa una nueva cuenta y una revocación concurrente; no basta la
    // comprobación que se hizo al abrir el modal varios minutos antes.
    const { rows: [cliente] } = await db.query('SELECT id FROM cliente WHERE id=$1 AND activo FOR UPDATE', [id]);
    if (!cliente) throw httpError(404, 'No existe ese cliente activo.');
    const { rows: [cuenta] } = await db.query('SELECT activo, usuario FROM cliente_portal WHERE cliente_id=$1 FOR UPDATE', [id]);
    if (cuenta?.activo === false) throw httpError(409, 'El acceso está revocado. Revisalo en Cuentas antes de preparar el enlace.');
    if (cuenta?.usuario) throw httpError(409, 'El cliente ya tiene acceso. Usá su enlace de catálogo.');
    const contexto = await ciclos.validarEn(db, id, idValido(cicloId));
    if (contexto.estado !== 'preventa') throw httpError(409, 'Prepará los catálogos desde un ciclo en preventa.');
    // Reutiliza el token de un solo uso y su hash, en la MISMA transacción.
    return require('./portal-clientes.service').generarInvitacion(id, usuarioId, db);
  });
}
async function enviar(clienteId, { cicloId, token, invitacionToken, telefono, mensaje }, usuarioId) {
  const datos = leerToken(token);
  if (datos.clienteId !== idValido(clienteId) || datos.cicloId !== idValido(cicloId)) {
    throw httpError(400, 'El enlace debe pertenecer a ese cliente y semana.');
  }
  const enlace = await preparar(clienteId, cicloId);
  if (enlace.requiereInvitacion) {
    const { rows } = await query(`SELECT id FROM cliente_invitacion WHERE cliente_id=$1
      AND token_hash=$2 AND usado_en IS NULL AND expira_en>CURRENT_TIMESTAMP`, [datos.clienteId, hashToken(invitacionToken || '')]);
    if (!rows.length) throw httpError(409, 'Prepará una invitación vigente para que el cliente pueda entrar.');
  }
  if (typeof mensaje !== 'string' || !mensaje.includes(`preventa=${token}`)
      || (enlace.requiereInvitacion && !mensaje.includes(`/portal/activar/${invitacionToken}`))) {
    throw httpError(400, 'Conservá el enlace del catálogo en el mensaje.');
  }
  // Registro por cliente y ciclo, sin guardar el enlace o la invitación.
  return enviarYRegistrar({ tipo: 'preventa', referencia: `${datos.cicloId}:${datos.clienteId}`,
    clienteId: datos.clienteId, telefono, mensaje, usuarioId });
}
module.exports = { preparar, resolver, validarEn, invitar, enviar, crearToken, leerToken };

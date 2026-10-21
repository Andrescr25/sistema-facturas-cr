const { createHash } = require('node:crypto');
const { httpError } = require('../../utils/validacion');

function leerIdempotencia(datos, aplicaciones, fecha, usuarioId) {
  if (datos.claveIdempotencia === undefined) return null;
  const clave = String(datos.claveIdempotencia);
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(clave)) {
    throw httpError(400, 'La clave de reintento del pago no es válida.');
  }
  const huella = createHash('sha256').update(JSON.stringify({
    aplicaciones: [...aplicaciones].sort((a, b) => a.id.localeCompare(b.id)), fecha,
    metodo: Number(datos.metodoPagoId), referencia: String(datos.referencia || '').trim().slice(0, 60),
    observaciones: String(datos.observaciones || '').slice(0, 2000), usuario: Number(usuarioId) || null
  })).digest('hex');
  return { clave, huella };
}

async function pagoPrevio(db, intento) {
  if (!intento) return null;
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 61002))', [intento.clave]);
  const previo = (await db.query('SELECT * FROM pago_proveedor WHERE clave_idempotencia=$1', [intento.clave])).rows[0];
  if (previo && previo.huella_idempotencia !== intento.huella) {
    throw httpError(409, 'Este intento ya registró otro pago. Actualizá el saldo antes de cambiar los importes.');
  }
  return previo;
}

module.exports = { leerIdempotencia, pagoPrevio };

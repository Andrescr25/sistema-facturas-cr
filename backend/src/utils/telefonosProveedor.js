const { httpError } = require('./validacion');
const { validarTelefonoEscrito } = require('./telefonosCliente');

function validarTelefonoProveedor(v, etiqueta = 'WhatsApp') {
  if (v === null || String(v).trim() === '') return null;
  const escrito = String(v).trim();
  // Extraer candidatos tolera anotaciones en fichas antiguas. Al guardar
  // o confirmar un destino escrito, cada valor debe ser un solo teléfono.
  if (!/^\+?[\d().\- \t]+$/.test(escrito)) {
    throw httpError(400, `${etiqueta}: escribí solo el teléfono, sin nombres ni anotaciones.`);
  }
  const r = validarTelefonoEscrito(escrito);
  if (!r.valido) throw httpError(400, `${etiqueta}: ${r.motivo}`);
  return r.formateado;
}

function validarWhatsappsProveedor(v, etiqueta = 'WhatsApp') {
  if (v === null || String(v).trim() === '') return null;
  const lineas = String(v).trim().split(/\r?\n/);
  if (lineas.length > 10) throw httpError(400, `${etiqueta}: hasta 10 números.`);
  const vistos = new Set();
  return lineas.map((linea, i) => {
    const campo = `${etiqueta}, número ${i + 1}`;
    const telefono = validarTelefonoProveedor(linea, campo);
    if (!telefono) throw httpError(400, `${campo}: completá el número o quitá la línea vacía.`);
    if (vistos.has(telefono)) throw httpError(400, `${campo}: ese número está repetido.`);
    vistos.add(telefono);
    return telefono;
  }).join('\n');
}

module.exports = { validarTelefonoProveedor, validarWhatsappsProveedor };

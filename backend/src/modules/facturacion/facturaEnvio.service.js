/**
 * Mandarle al cliente su factura por WhatsApp, con el PDF propio.
 *
 * Hasta ahora el único PDF que se le podía mandar era el de Alegra. Con el
 * papel propio ya hecho, esto es lo que cierra el círculo: vender, imprimir y
 * entregar sin abrir Alegra.
 *
 * DECISIONES
 *
 * 1. EL ARCHIVO SE ARMA ACÁ, NO SE MANDA UN ENLACE. Un enlace al PDF tendría
 *    que ser público para que el cliente lo abriera, y una factura lleva su
 *    cédula, su dirección y lo que compró. El PDF pesa ~45 KB, muy por debajo
 *    del límite de WhatsApp.
 *
 * 2. LOS TELÉFONOS SE PROPONEN, NO SE ADIVINAN. Las fichas traen cosas como
 *    "89350207 JEISON": de 120 revisadas, 19 no tenían un teléfono usable. Se
 *    devuelven los candidatos y una persona elige, con el número a la vista
 *    antes de mandar. Mandarle la factura de un cliente a un desconocido es
 *    el error que importa acá, y no lo evita ningún código.
 *
 * 3. UNA FACTURA ANULADA NO SE MANDA. Es un documento sin valor; mandarlo
 *    invita a que lo paguen.
 */

const { pool } = require('../../../config/database');
const { httpError } = require('../../utils/validacion');
const { telefonosDe, validarTelefonoEscrito } = require('../../utils/telefonosCliente');
const { enviarYRegistrar } = require('../envios-whatsapp/envios.service');
const { obtenerFactura } = require('./facturaConsulta.service');
const { generarPdfFactura } = require('./factura.pdf');

/** Los datos del emisor, que el papel necesita. */
async function empresaActual() {
  const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  return rows[0] || null;
}

/**
 * Los teléfonos a los que se le puede mandar esta factura.
 *
 * Salen de la ficha del cliente (que es la que se mantiene al día), no de la
 * copia guardada en la factura: para MANDAR algo hoy vale el teléfono de hoy.
 * La copia de la factura es para reimprimir el documento tal como se emitió.
 */
async function telefonosParaFactura(id) {
  const factura = await obtenerFactura(id);

  let ficha = null;
  if (factura.cliente?.id) {
    const { rows } = await pool.query(
      'SELECT telefono, telefono_secundario, celular FROM cliente WHERE id = $1',
      [factura.cliente.id]
    );
    ficha = rows[0] || null;
  }

  // `telefonosDe` sabe leer los campos sucios y ordena los celulares primero,
  // que es a donde llega un WhatsApp.
  const encontrados = telefonosDe({
    phonePrimary: ficha?.telefono || factura.cliente?.telefono || null,
    phoneSecondary: ficha?.telefono_secundario || null,
    mobile: ficha?.celular || null
  });

  return {
    numero: factura.numero,
    cliente: factura.cliente,
    total: factura.total,
    saldo: factura.saldo,
    ...encontrados
  };
}

/**
 * Manda la factura por WhatsApp.
 *
 * @param {number} id
 * @param {string} telefono  el que eligió la persona, no uno adivinado
 * @param {string} mensaje   editable antes de mandar
 */
async function enviarFacturaPorWhatsApp(id, { telefono, mensaje, usuarioId } = {}) {
  const numeroLimpio = validarTelefonoEscrito(telefono);
  if (!numeroLimpio.valido) {
    throw httpError(400, numeroLimpio.motivo || 'Ese número no parece un teléfono de Costa Rica.');
  }
  if (!String(mensaje || '').trim()) {
    throw httpError(400, 'Escribí el mensaje que acompaña la factura.');
  }

  const factura = await obtenerFactura(id);
  if (factura.estado === 'anulada') {
    throw httpError(409, `La factura ${factura.numero} está anulada: no se le manda al cliente.`);
  }

  const pdf = await generarPdfFactura(factura, await empresaActual());

  return enviarYRegistrar({
    tipo: 'factura',
    referencia: factura.numero,
    clienteId: factura.cliente?.id || null,
    telefono: numeroLimpio.numero,
    mensaje: String(mensaje).trim(),
    pdf,
    nombreArchivo: `factura-${factura.numero}.pdf`,
    usuarioId
  });
}

module.exports = { telefonosParaFactura, enviarFacturaPorWhatsApp, empresaActual };

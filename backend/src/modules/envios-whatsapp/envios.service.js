/**
 * Mandar algo por WhatsApp y dejarlo anotado.
 *
 * Está separado del cliente de Evolution (integrations/whatsapp) a propósito:
 * ahí vive la conversación con la API y nada más; acá vive lo que el negocio
 * necesita recordar de esa conversación.
 *
 * SE ANOTA TAMBIÉN LO QUE FALLA
 * Un envío fallido no es ruido. "El número no tiene WhatsApp" repetido sobre
 * el mismo cliente es un teléfono que hay que corregir en Alegra, y sin
 * registro nadie lo nota: el que lo intentó ve el error, cierra el modal y
 * se olvida.
 *
 * EL REGISTRO NO PUEDE TUMBAR EL ENVÍO
 * Si la base falla al anotar, el mensaje ya salió — no tiene sentido
 * devolverle un error a quien lo mandó, porque el cliente ya lo recibió y
 * reintentar lo mandaría dos veces. Se avisa por consola y se sigue.
 */

const { query } = require('../../../config/database');
const whatsapp = require('../../integrations/whatsapp');

const TIPOS = ['cotizacion', 'factura', 'saldo', 'pedido', 'invitacion', 'orden_compra'];

async function anotar({ tipo, referencia, alegraContactId, clienteId, telefono, usuarioId, exito, error }) {
  try {
    await query(`
      INSERT INTO envio_whatsapp
        (tipo, referencia, alegra_contact_id, cliente_id, telefono, enviado_por, exito, error)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `, [
      tipo,
      referencia ? String(referencia).slice(0, 60) : null,
      alegraContactId ? String(alegraContactId) : null,
      // Nuestro id de cliente. Va aparte del de Alegra a propósito: meterlo en
      // esa columna dejaría escrito un número del que nadie sabría el origen.
      clienteId || null,
      String(telefono).slice(0, 20),
      usuarioId || null,
      exito,
      error ? String(error).slice(0, 2000) : null
    ]);
  } catch (e) {
    console.error(`⚠️ No se pudo anotar el envío de WhatsApp (${tipo}/${referencia}):`, e.message);
  }
}

/**
 * Manda un texto o un documento y lo registra pase lo que pase.
 *
 * @param {object} datos
 * @param {string} datos.tipo         uno de TIPOS
 * @param {string} [datos.referencia] número de documento o id, para buscarlo después
 * @param {Buffer} [datos.pdf]        si viene, se manda como documento
 */
async function enviarYRegistrar({
  tipo, referencia, alegraContactId, clienteId, telefono, mensaje,
  pdf, nombreArchivo, usuarioId, sujeto = 'cliente'
}) {
  if (!TIPOS.includes(tipo)) {
    throw Object.assign(new Error(`Tipo de envío desconocido: "${tipo}".`), { status: 400 });
  }

  try {
    const r = pdf
      ? await whatsapp.enviarDocumento({ telefono, mensaje, pdf, nombreArchivo, sujeto })
      : await whatsapp.enviarTexto({ telefono, mensaje, sujeto });

    // Se anota el número YA NORMALIZADO, que es al que de verdad llegó — no
    // el que se escribió en la pantalla.
    await anotar({ tipo, referencia, alegraContactId, clienteId, telefono: r.numero, usuarioId, exito: true });
    return r;
  } catch (e) {
    await anotar({
      tipo, referencia, alegraContactId, clienteId,
      telefono: String(telefono).replace(/\D/g, '').slice(0, 20) || 'sin número',
      usuarioId, exito: false, error: e.message
    });
    throw e;
  }
}

/**
 * Los últimos envíos de un documento, del más nuevo al más viejo.
 *
 * Es lo que responde "¿ya le mandé esto?" antes de mandarlo otra vez.
 */
async function historial({ tipo, referencia, limite = 5 }) {
  const r = await query(`
    SELECT e.tipo, e.referencia, e.telefono, e.exito, e.error, e.creado_en,
           u.nombre AS enviado_por
    FROM envio_whatsapp e
    LEFT JOIN usuario u ON u.id = e.enviado_por
    WHERE e.tipo = $1 AND e.referencia = $2
    ORDER BY e.creado_en DESC
    LIMIT $3;
  `, [tipo, String(referencia), Math.min(Number(limite) || 5, 50)]);

  return r.rows.map(x => ({
    telefono: x.telefono,
    exito: x.exito,
    error: x.error,
    cuando: x.creado_en,
    enviadoPor: x.enviado_por
  }));
}

module.exports = { enviarYRegistrar, historial, TIPOS };

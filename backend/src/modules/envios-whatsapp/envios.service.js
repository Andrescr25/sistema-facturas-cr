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
const { telefonosDe } = require('../../utils/telefonosCliente');

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

/**
 * Los números a los que se le puede escribir a un cliente, leídos de su
 * ficha PROPIA.
 *
 * Existe aparte de `/telefonos/:contactoId` (que le pregunta a Alegra) porque
 * los dos ids NO son intercambiables: el cliente propio 8 es "AB CHANA", y el
 * contacto 8 de Alegra es "EL LLANO". Pasarle un id propio a la ruta de Alegra
 * proponía el celular de otra persona para mandarle la factura — pasó en
 * Cuentas por Cobrar, con 47 de sus 54 deudores.
 */
async function telefonosDeCliente(clienteId) {
  const id = Number(clienteId);
  if (!Number.isInteger(id) || id <= 0) {
    throw Object.assign(new Error('Identificador inválido.'), { status: 400 });
  }
  const r = await query(
    'SELECT nombre, telefono, telefono_secundario, celular FROM cliente WHERE id = $1;',
    [id]
  );
  const ficha = r.rows[0];
  if (!ficha) throw Object.assign(new Error('No se encontró ese cliente.'), { status: 404 });

  const { candidatos, sinReconocer } = telefonosDe({
    phonePrimary: ficha.telefono,
    phoneSecondary: ficha.telefono_secundario,
    mobile: ficha.celular
  });
  return { cliente: ficha.nombre, telefonos: candidatos, telefonosSinReconocer: sinReconocer };
}

module.exports = { enviarYRegistrar, historial, telefonosDeCliente, TIPOS };

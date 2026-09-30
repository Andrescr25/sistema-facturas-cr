/**
 * Aviso a la empresa cuando un cliente hace un pedido en el portal
 * (2026-09-29, pedido del usuario: "actualmente no avisa").
 *
 * Por WhatsApp, por correo o por los dos, a donde se configure en
 * Configuración → Avisos de pedidos. Es un aviso INTERNO (a la empresa), no
 * al cliente: la regla de "nada sale automático" es para los mensajes a
 * clientes.
 *
 * NUNCA FRENA NI TUMBA EL PEDIDO. Se manda después de guardarlo, sin esperar,
 * y si falla (WhatsApp desconectado, correo sin configurar) solo queda en el
 * registro del servidor. El pedido ya está en la lista de pedidos igual.
 *
 * EL NÚMERO NO PUEDE SER EL MISMO QUE TIENE VINCULADO EL SISTEMA: WhatsApp no
 * hace sonar los mensajes que uno se manda a sí mismo. Se avisa al guardar.
 *
 * Los destinos se guardan en la base (`aviso_pedidos`): los datos de la
 * empresa de Configuración viven solo en el navegador, y el servidor no los ve.
 */

const { query } = require('../../../config/database');
const whatsapp = require('../../integrations/whatsapp');
const { enviarCorreo, estaConfigurado: correoConfigurado } = require('../../../services/mailer');
const { validarTelefonoEscrito } = require('../../utils/telefonosCliente');

const SQL_TABLA = `
  CREATE TABLE IF NOT EXISTS aviso_pedidos (
      id SMALLINT PRIMARY KEY,
      whatsapp VARCHAR(30),
      correo VARCHAR(200),
      actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let tablaLista = null;
function asegurarTabla() {
  if (!tablaLista) tablaLista = query(SQL_TABLA).catch((e) => { tablaLista = null; throw e; });
  return tablaLista;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function obtenerDestinos() {
  await asegurarTabla();
  const { rows } = await query(`SELECT whatsapp, correo FROM aviso_pedidos WHERE id = 1`);
  return { whatsapp: rows[0]?.whatsapp || '', correo: rows[0]?.correo || '' };
}

/** Guarda a dónde avisar. Vacío = no avisar por ese medio. */
async function guardarDestinos({ whatsapp: telefono = '', correo = '' } = {}) {
  const tel = String(telefono || '').trim();
  const mail = String(correo || '').trim();
  let numero = '';
  if (tel) {
    const r = validarTelefonoEscrito(tel);
    if (!r.valido) throw httpError(400, r.motivo);
    if (!r.esMovil) throw httpError(400, `${r.formateado} es un teléfono fijo: tiene que ser un celular con WhatsApp.`);
    const conectado = whatsapp.estado();
    if (conectado?.numero && conectado.numero === r.numero) {
      throw httpError(400, `${r.formateado} es el mismo número que tiene vinculado el sistema: WhatsApp no avisa los mensajes que uno se manda a sí mismo. Use otro celular, por ejemplo el personal.`);
    }
    numero = r.numero;
  }
  if (mail && !CORREO_VALIDO.test(mail)) throw httpError(400, `"${mail}" no parece un correo.`);

  await asegurarTabla();
  await query(`
    INSERT INTO aviso_pedidos (id, whatsapp, correo, actualizado_en) VALUES (1, $1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET whatsapp = EXCLUDED.whatsapp, correo = EXCLUDED.correo, actualizado_en = CURRENT_TIMESTAMP
  `, [numero || null, mail || null]);
  return { whatsapp: numero, correo: mail };
}

const colones = (n) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;

function enlacePedidos() {
  const base = (process.env.APP_URL || 'https://sistema-facturas-cr.onrender.com').replace(/\/+$/, '');
  return `${base}/clientes`;
}

/** El texto del aviso. */
function armarMensaje({ cliente, pedidoId, lineas, total, observaciones, prueba = false }) {
  return [
    prueba ? '🧪 Aviso de prueba — así va a llegar cada pedido nuevo del portal.' : '🛒 Pedido nuevo en el portal',
    `Cliente: ${cliente}`,
    `Pedido #${pedidoId} · ${lineas} ${lineas === 1 ? 'producto' : 'productos'} · ${colones(total)}`,
    observaciones ? `Nota del cliente: ${observaciones}` : null,
    `Verlo: ${enlacePedidos()}`
  ].filter(Boolean).join('\n');
}

/**
 * Manda el aviso a los destinos configurados. Nunca tira error: devuelve qué
 * pasó con cada medio ('enviado', 'sin configurar' o el error).
 */
async function avisar(datos) {
  const resultado = { whatsapp: 'sin configurar', correo: 'sin configurar' };
  let destinos;
  try {
    destinos = await obtenerDestinos();
  } catch (e) {
    console.error('⚠️ Aviso de pedido: no se pudieron leer los destinos:', e.message);
    return { whatsapp: `error: ${e.message}`, correo: `error: ${e.message}` };
  }
  const mensaje = armarMensaje(datos);

  const envios = [];
  if (destinos.whatsapp) {
    envios.push(whatsapp.enviarTexto({ telefono: destinos.whatsapp, mensaje, sujeto: 'número de avisos' })
      .then(() => { resultado.whatsapp = 'enviado'; })
      .catch((e) => { resultado.whatsapp = `error: ${e.message}`; }));
  }
  if (destinos.correo) {
    if (!correoConfigurado()) {
      resultado.correo = 'error: el servidor no tiene configurado el envío de correo';
    } else {
      envios.push(enviarCorreo({
        para: destinos.correo,
        asunto: datos.prueba ? 'Aviso de prueba: pedido nuevo del portal' : `Pedido nuevo del portal: ${datos.cliente} (${colones(datos.total)})`,
        texto: mensaje
      })
        .then(() => { resultado.correo = 'enviado'; })
        .catch((e) => { resultado.correo = `error: ${e.message}`; }));
    }
  }
  await Promise.all(envios);
  if (!datos.prueba) console.log(`🛒 Aviso del pedido #${datos.pedidoId} (${datos.cliente}): WhatsApp ${resultado.whatsapp} · correo ${resultado.correo}`);
  return resultado;
}

/** Un aviso de mentira, para probar desde Configuración que llega. */
function avisarPrueba() {
  return avisar({ cliente: 'Cliente de prueba', pedidoId: 0, lineas: 3, total: 12500, observaciones: null, prueba: true });
}

module.exports = { SQL_TABLA, obtenerDestinos, guardarDestinos, avisar, avisarPrueba, armarMensaje };

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { httpError } = require('../src/utils/validacion');
const aislado = require('../config/aislado');

/**
 * La nota de crédito electrónica le llega al cliente por correo.
 *
 * Pedido del usuario (2026-10-11): «en nota de crédito está faltando enviar
 * la nota de crédito por correo al cliente, el pdf con sus xml». Sale sola
 * cuando Hacienda la acepta, igual que la factura, así que NUNCA puede
 * tumbar la aceptación: devuelve qué pasó en vez de lanzar.
 *
 * Se usa el mailer real con el transporte sustituido ANTES de importarlo: ni
 * las pruebas que aceptan ni las que fallan abren SMTP.
 */
const rutas = {
  db: require.resolve('../config/database'),
  consulta: require.resolve('../src/modules/facturacion/notaCreditoConsulta.service'),
  consultaFactura: require.resolve('../src/modules/facturacion/facturaConsulta.service'),
  nodemailer: require.resolve('nodemailer'),
  mailer: require.resolve('../services/mailer'),
  fiscal: require.resolve('../src/integrations/hacienda/emision.service'),
  correoFactura: require.resolve('../src/modules/facturacion/facturaCorreo.service'),
  servicio: require.resolve('../src/modules/facturacion/notaCreditoCorreo.service')
};

const CONSECUTIVO_FACTURA = '00100001010000002481';
const NOTA = {
  id: 90, numero: 'NC-000083', estado: 'emitida', fecha: '2026-10-11',
  electronica: true, haciendaEstado: 'aceptada',
  fiscal: {
    id: 41, consecutivo: '00100001030000000083', clave: '5'.repeat(50), tipo: '03', fecha: '2026-10-11T20:00:00-06:00',
    referencia: { tipo: '01', clave: `506111026${'000123456789'}${CONSECUTIVO_FACTURA}1${'12345678'}` }
  },
  motivo: 'devolucion', motivoTexto: 'Llegó golpeado', motivoAnulacion: null,
  cliente: { id: 7, nombre: 'Cliente de prueba', correo: 'anterior@example.test' },
  moneda: 'CRC', subtotal: 100, descuento: 0, impuesto: 13, total: 113,
  facturas: [{ id: 500, numero: 'PROPIA-500', tipoDocumento: 'factura', electronica: true, claveHacienda: null, monto: 113 }],
  lineas: [{ numeroLinea: 1, nombre: 'Producto de prueba', cantidad: 1, precioUnitario: 100, total: 113, tarifa: 13, impuestoMonto: 13 }]
};
const claves = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD', 'NODE_TEST_CONTEXT', 'PERMITIR_SALIDAS'];
let anteriores;

beforeEach(() => {
  anteriores = Object.fromEntries(claves.map(k => [k, process.env[k]]));
  for (const k of claves.filter(k => k.startsWith('SMTP_'))) delete process.env[k];
  Object.assign(process.env, { IMAP_HOST: 'imap.example.test', IMAP_USER: 'buzon@example.test', IMAP_PASSWORD: 'solo-doble' });
  delete process.env.PERMITIR_SALIDAS;
});
afterEach(() => {
  for (const [k, v] of Object.entries(anteriores)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  for (const ruta of Object.values(rutas)) delete require.cache[ruta];
});

function montar({ nota = NOTA, ficha = { correo: 'actual@example.test' }, resultado, error, noExiste = false } = {}) {
  const enviados = [], transportes = [], consultas = [];
  const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
  doble(rutas.db, { pool: { query: async sql => {
    consultas.push(sql);
    if (sql.includes('FROM cliente')) return { rows: ficha ? [ficha] : [] };
    return { rows: [{ nombre: 'Empresa de prueba' }] };
  } } });
  doble(rutas.consulta, { obtenerNota: async id => {
    consultas.push(['nota', id]);
    if (noExiste) throw httpError(404, 'No existe esa nota de crédito.');
    return structuredClone(nota);
  } });
  doble(rutas.nodemailer, { createTransport: opciones => {
    transportes.push(opciones);
    return { sendMail: async datos => {
      enviados.push(datos);
      if (error) throw error;
      return resultado || { messageId: 'doble', accepted: [datos.to], rejected: [] };
    } };
  } });
  // Los dos XML los entrega el módulo fiscal; acá son de mentira, para no
  // leer el almacén privado.
  doble(rutas.fiscal, { crearServicio: () => ({
    archivo: async (id, respuesta) => (respuesta ? `<MensajeHacienda id="${id}"/>` : `<NotaCreditoElectronica id="${id}"/>`)
  }) });
  for (const r of [rutas.mailer, rutas.consultaFactura, rutas.correoFactura, rutas.servicio]) delete require.cache[r];
  return { servicio: require(rutas.servicio), enviados, transportes, consultas };
}

test('la nota aceptada le llega al cliente con SU PDF y sus dos XML', async () => {
  const { servicio, enviados } = montar();
  const r = await servicio.entregarNotaElectronica(90);
  assert.deepEqual(r, { estado: 'enviado', para: 'actual@example.test' });
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, 'actual@example.test', 'no fue al correo de la ficha del cliente');
  assert.equal(enviados[0].subject, 'Nota de crédito electrónica 00100001030000000083');
  assert.match(enviados[0].text, /nota de crédito electrónica 00100001030000000083/);
  // Lo primero que busca quien la recibe: de qué factura es.
  assert.ok(enviados[0].text.includes(`se aplica a la factura ${CONSECUTIVO_FACTURA}`), enviados[0].text);
  assert.match(enviados[0].text, /aceptada por el Ministerio de Hacienda/);
  assert.deepEqual(enviados[0].attachments.map(a => [a.filename, a.contentType]), [
    ['nota-credito-NC-000083.pdf', 'application/pdf'],
    ['comprobante-00100001030000000083.xml', 'application/xml'],
    ['respuesta-hacienda-00100001030000000083.xml', 'application/xml']
  ]);
  assert.equal(enviados[0].attachments[0].content.subarray(0, 5).toString(), '%PDF-');
  // Los XML son los del comprobante de la NOTA, no los de su factura.
  assert.equal(enviados[0].attachments[1].content.toString(), '<NotaCreditoElectronica id="41"/>');
  assert.equal(enviados[0].attachments[2].content.toString(), '<MensajeHacienda id="41"/>');
});

test('va al correo de la ficha de hoy; si no hay ficha, al que quedó en la factura', async () => {
  const sinFicha = montar({ ficha: null });
  assert.equal((await sinFicha.servicio.entregarNotaElectronica(90)).para, 'anterior@example.test');
  // Un cliente de contado sin ficha: no hay a quién preguntarle.
  const contado = montar({ nota: { ...NOTA, cliente: { id: null, nombre: 'Contado', correo: null } } });
  assert.equal((await contado.servicio.entregarNotaElectronica(90)).estado, 'sin_correo');
  assert.equal(contado.consultas.some(c => typeof c === 'string' && c.includes('FROM cliente')), false);
});

test('si el cliente no tiene correo en su ficha, no se manda y se dice', async () => {
  for (const correo of [null, '', 'no-es-un-correo', 'a@example.test;b@example.test']) {
    const { servicio, enviados } = montar({ ficha: { correo } });
    const r = await servicio.entregarNotaElectronica(90);
    assert.equal(r.estado, 'sin_correo', String(correo));
    assert.match(r.motivo, /no tiene un correo válido/);
    assert.equal(enviados.length, 0);
  }
});

test('sin la aceptación de Hacienda no sale un correo con el PDF solo', async () => {
  const { servicio, enviados } = montar({ nota: { ...NOTA, electronica: false, haciendaEstado: null, fiscal: null } });
  const r = await servicio.entregarNotaElectronica(90);
  assert.equal(r.estado, 'error');
  assert.match(r.motivo, /todavía no está aceptada por Hacienda/);
  assert.equal(enviados.length, 0);
});

test('una nota anulada no se le manda a nadie', async () => {
  const { servicio, enviados } = montar({ nota: { ...NOTA, estado: 'anulada' } });
  const r = await servicio.entregarNotaElectronica(90);
  assert.equal(r.estado, 'error');
  assert.match(r.motivo, /Solo se manda por correo una nota de crédito emitida/);
  assert.equal(enviados.length, 0);
});

test('si el correo falla, la entrega lo cuenta en vez de lanzar, y sin datos del servidor', async () => {
  const { servicio, enviados } = montar({ error: new Error('auth contraseña-de-prueba host-secreto') });
  const r = await servicio.entregarNotaElectronica(90);
  assert.equal(r.estado, 'error');
  assert.equal(r.para, 'actual@example.test');
  assert.doesNotMatch(JSON.stringify(r), /contraseña-de-prueba|host-secreto/);
  assert.equal(enviados.length, 1, 'un envío incierto no se reintenta: serían dos correos');
});

test('si el servidor de correo no acepta al destinatario, queda como error', async () => {
  const { servicio } = montar({ resultado: { accepted: [], rejected: ['actual@example.test'] } });
  const r = await servicio.entregarNotaElectronica(90);
  assert.equal(r.estado, 'error');
  assert.match(r.motivo, /no aceptó al destinatario/);
});

test('sin servidor de correo configurado se dice, y no se arma nada', async () => {
  const { servicio, enviados, consultas } = montar();
  for (const k of ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD']) delete process.env[k];
  const r = await servicio.entregarNotaElectronica(90);
  assert.equal(r.estado, 'error');
  assert.match(r.motivo, /todavía no está configurado/);
  assert.equal(enviados.length, 0);
  assert.equal(consultas.some(c => typeof c === 'string' && c.includes('FROM empresa')), false, 'se armó el PDF sin tener por dónde mandarlo');
});

test('una nota que no existe, o una copia aislada, tampoco lanzan', async () => {
  const falta = montar({ noExiste: true });
  assert.equal((await falta.servicio.entregarNotaElectronica(90)).estado, 'error');
  assert.equal(falta.enviados.length, 0);

  const aislada = montar();
  delete process.env.NODE_TEST_CONTEXT;
  assert.equal(aislado.salidasBloqueadas(), true);
  const r = await aislada.servicio.entregarNotaElectronica(90);
  assert.equal(r.estado, 'error');
  assert.equal(aislada.transportes.length, 0, 'la copia de desarrollo abrió el servidor de correo');
  assert.equal(aislada.consultas.length, 0, 'la copia de desarrollo llegó a consultar la nota');
});

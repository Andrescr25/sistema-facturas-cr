const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { httpError } = require('../src/utils/validacion');
const aislado = require('../config/aislado');

// Se usa el mailer real con transporte sustituido ANTES de importarlo. Ni
// las pruebas que aceptan ni las que fallan abren SMTP o leen el buzón.
const rutas = {
  db: require.resolve('../config/database'),
  consulta: require.resolve('../src/modules/facturacion/facturaConsulta.service'),
  nodemailer: require.resolve('nodemailer'),
  mailer: require.resolve('../services/mailer'),
  fiscal: require.resolve('../src/integrations/hacienda/emision.service'),
  servicio: require.resolve('../src/modules/facturacion/facturaCorreo.service')
};
const FACTURA = {
  id: 500, numero: 'PROPIA-500', estado: 'emitida', fecha: '2026-10-04', moneda: 'CRC',
  cliente: { id: 7, nombre: 'Cliente de prueba', correo: 'anterior@example.test' },
  condicionVenta: 'contado', subtotal: 100, descuento: 0, impuesto: 0, total: 100, saldo: 100,
  lineas: [{ numeroLinea: 1, nombre: 'Producto de prueba', cantidad: 1, precioUnitario: 100, total: 100, tarifa: 0 }]
};
const DATOS = { para: 'cliente@example.test', asunto: 'Factura PROPIA-500', mensaje: 'Gracias por su compra.' };
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

function montar({ factura = FACTURA, ficha = { correo: 'actual@example.test' }, resultado, error, noExiste = false } = {}) {
  const enviados = [], transportes = [], consultas = [];
  const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
  doble(rutas.db, { pool: { query: async sql => {
    consultas.push(sql);
    if (sql.includes('FROM cliente')) return { rows: ficha ? [ficha] : [] };
    return { rows: [{ nombre: 'Empresa de prueba' }] };
  } } });
  doble(rutas.consulta, { obtenerFactura: async id => {
    consultas.push(['factura', id]);
    if (noExiste) throw httpError(404, 'La factura no existe.');
    return structuredClone(factura);
  } });
  doble(rutas.nodemailer, { createTransport: opciones => {
    transportes.push(opciones);
    return { sendMail: async datos => {
      enviados.push(datos);
      if (error) throw error;
      return resultado || { messageId: 'doble', accepted: [datos.to], rejected: [] };
    } };
  } });
  // Los dos XML de una factura aceptada los entrega el módulo fiscal; acá
  // son de mentira, para no leer el almacén privado.
  doble(rutas.fiscal, { crearServicio: () => ({
    archivo: async (id, respuesta) => (respuesta ? `<MensajeHacienda id="${id}"/>` : `<FacturaElectronica id="${id}"/>`)
  }) });
  delete require.cache[rutas.mailer];
  delete require.cache[rutas.servicio];
  return { servicio: require(rutas.servicio), enviados, transportes, consultas };
}

test('propone la ficha actual y muestra el remitente del buzón sin abrir transporte', async () => {
  const { servicio, transportes } = montar();
  const datos = await servicio.datosCorreoFactura(500);
  assert.equal(datos.para, 'actual@example.test');
  assert.equal(datos.remitente, 'buzon@example.test');
  assert.equal(datos.configurado, true);
  assert.equal(transportes.length, 0);
});
test('una ficha sin correo no recupera el correo viejo de la factura', async () => {
  for (const correo of [null, '', 'a@example.test;b@example.test']) {
    const { servicio } = montar({ ficha: { correo } });
    assert.equal((await servicio.datosCorreoFactura(500)).para, '');
  }
});
test('si no existe la ficha, propone la dirección histórica para revisión', async () => {
  const { servicio } = montar({ ficha: null });
  assert.equal((await servicio.datosCorreoFactura(500)).para, 'anterior@example.test');
});
test('adjunta un PDF real propio al destinatario confirmado y usa el buzón como remitente', async () => {
  const { servicio, enviados, transportes } = montar();
  const r = await servicio.enviarFacturaPorCorreo(500, { ...DATOS, para: ' NUEVO@example.test ', from: 'otro@example.test', adjuntos: ['externo'] });
  assert.equal(r.aceptado, true);
  assert.equal(r.para, 'nuevo@example.test');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].from, 'buzon@example.test');
  assert.equal(enviados[0].to, 'nuevo@example.test');
  assert.equal(enviados[0].subject, DATOS.asunto);
  assert.equal(enviados[0].text, DATOS.mensaje);
  assert.equal(enviados[0].attachments.length, 1);
  const archivo = enviados[0].attachments[0];
  assert.equal(archivo.content.subarray(0, 5).toString(), '%PDF-');
  assert.equal(archivo.filename, 'factura-PROPIA-500.pdf');
  assert.equal(archivo.contentType, 'application/pdf');
  assert.equal(transportes[0].host, 'smtp.example.test');
});
test('una dirección vacía, ambigua o con sintaxis de lista no llega al transporte', async () => {
  const { servicio, enviados } = montar();
  for (const para of ['', 'a@example.test,b@example.test', ['a@example.test'], { address: 'a@example.test' }, 'Nombre<a@example.test>', 'a@example.test\r\nBcc:b@example.test', 'x'.repeat(161) + '@example.test']) {
    await assert.rejects(servicio.enviarFacturaPorCorreo(500, { ...DATOS, para }), e => e.status === 400);
  }
  assert.equal(enviados.length, 0);
});
test('asunto y mensaje tienen límites y no permiten encabezados adicionales', async () => {
  const { servicio, enviados } = montar();
  for (const datos of [{ asunto: '' }, { asunto: 'a'.repeat(201) }, { asunto: 'Factura\nBcc: otro@example.test' }, { mensaje: ' ' }, { mensaje: 'a'.repeat(4001) }, { mensaje: {} }]) {
    await assert.rejects(servicio.enviarFacturaPorCorreo(500, { ...DATOS, ...datos }), e => e.status === 400);
  }
  assert.equal(enviados.length, 0);
});
for (const estado of ['borrador', 'anulada']) test(`no propone ni envía una factura ${estado}`, async () => {
  const { servicio, enviados } = montar({ factura: { ...FACTURA, estado } });
  await assert.rejects(servicio.datosCorreoFactura(500), e => e.status === 409);
  await assert.rejects(servicio.enviarFacturaPorCorreo(500, DATOS), e => e.status === 409);
  assert.equal(enviados.length, 0);
});
test('factura inexistente devuelve 404 y no genera un envío', async () => {
  const { servicio, enviados } = montar({ noExiste: true });
  await assert.rejects(servicio.enviarFacturaPorCorreo(500, DATOS), e => e.status === 404);
  assert.equal(enviados.length, 0);
});
test('aislamiento bloquea antes de consultar la factura y de abrir SMTP', async () => {
  const { servicio, transportes, consultas } = montar();
  delete process.env.NODE_TEST_CONTEXT;
  assert.equal(aislado.salidasBloqueadas(), true);
  await assert.rejects(servicio.enviarFacturaPorCorreo(500, DATOS), e => e.status === 423 && e.code === 'SALIDA_BLOQUEADA');
  assert.equal(consultas.length, 0);
  assert.equal(transportes.length, 0);
  assert.equal((await servicio.datosCorreoFactura(500)).bloqueado, true);
});
test('sin credenciales informa 503 sin abrir transporte', async () => {
  const { servicio, transportes } = montar();
  delete process.env.IMAP_PASSWORD;
  assert.equal((await servicio.datosCorreoFactura(500)).configurado, false);
  await assert.rejects(servicio.enviarFacturaPorCorreo(500, DATOS), e => e.status === 503);
  assert.equal(transportes.length, 0);
});
test('un fallo SMTP no expone el error original ni reintenta', async () => {
  const { servicio, enviados } = montar({ error: new Error('auth contraseña-de-prueba host-secreto') });
  await assert.rejects(servicio.enviarFacturaPorCorreo(500, DATOS), e => {
    assert.equal(e.status, 502);
    assert.doesNotMatch(e.message, /contraseña-de-prueba|host-secreto/);
    assert.match(e.message, /antes de reintentar/);
    return true;
  });
  assert.equal(enviados.length, 1);
});
test('rechazo o ausencia de aceptación no se presentan como correo enviado', async () => {
  for (const resultado of [{ accepted: [], rejected: [DATOS.para] }, { accepted: [], rejected: [] }, { accepted: ['otro@example.test'], rejected: [] }]) {
    const { servicio } = montar({ resultado });
    await assert.rejects(servicio.enviarFacturaPorCorreo(500, DATOS), e => e.code === 'CORREO_RECHAZADO');
  }
});

// --- La entrega automática de una factura aceptada por Hacienda ---
// Pedido del usuario (2026-10-11): «esta factura se le tiene que enviar al
// cliente por correo el pdf con los 2 XML». Sale sola al aceptarse, así que
// NUNCA puede tumbar la aceptación: devuelve qué pasó en vez de lanzar.
const ACEPTADA = { ...FACTURA, electronica: true, fiscal: { id: 31, consecutivo: '00100001010000004947', clave: '5'.repeat(50), tipo: '01' } };

test('la factura aceptada le llega al cliente con el PDF y los dos XML', async () => {
  const { servicio, enviados } = montar({ factura: ACEPTADA });
  const r = await servicio.entregarFacturaElectronica(500);
  assert.deepEqual(r, { estado: 'enviado', para: 'actual@example.test' });
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, 'actual@example.test', 'no fue al correo de la ficha del cliente');
  assert.equal(enviados[0].subject, 'Factura electrónica 00100001010000004947');
  assert.match(enviados[0].text, /aceptada por el Ministerio de Hacienda/);
  assert.deepEqual(enviados[0].attachments.map(a => [a.filename, a.contentType]), [
    ['factura-PROPIA-500.pdf', 'application/pdf'],
    ['comprobante-00100001010000004947.xml', 'application/xml'],
    ['respuesta-hacienda-00100001010000004947.xml', 'application/xml']
  ]);
  assert.equal(enviados[0].attachments[0].content.subarray(0, 5).toString(), '%PDF-');
  assert.equal(enviados[0].attachments[1].content.toString(), '<FacturaElectronica id="31"/>');
  assert.equal(enviados[0].attachments[2].content.toString(), '<MensajeHacienda id="31"/>');
});
test('si el cliente no tiene correo en su ficha, no se manda y se dice', async () => {
  for (const correo of [null, '', 'no-es-un-correo', 'a@example.test;b@example.test']) {
    const { servicio, enviados } = montar({ factura: ACEPTADA, ficha: { correo } });
    const r = await servicio.entregarFacturaElectronica(500);
    assert.equal(r.estado, 'sin_correo', String(correo));
    assert.match(r.motivo, /no tiene un correo válido/);
    assert.equal(enviados.length, 0);
  }
});
test('sin la aceptación de Hacienda no sale un correo con el PDF solo', async () => {
  const { servicio, enviados } = montar();   // la factura de siempre, sin datos fiscales
  const r = await servicio.entregarFacturaElectronica(500);
  assert.equal(r.estado, 'error');
  assert.match(r.motivo, /todavía no está aceptada por Hacienda/);
  assert.equal(enviados.length, 0);
});
test('si el correo falla, la entrega lo cuenta en vez de lanzar, y sin datos del servidor', async () => {
  const { servicio, enviados } = montar({ factura: ACEPTADA, error: new Error('auth contraseña-de-prueba host-secreto') });
  const r = await servicio.entregarFacturaElectronica(500);
  assert.equal(r.estado, 'error');
  assert.equal(r.para, 'actual@example.test');
  assert.doesNotMatch(JSON.stringify(r), /contraseña-de-prueba|host-secreto/);
  assert.equal(enviados.length, 1, 'un envío incierto no se reintenta: serían dos correos');
});
test('si el servidor de correo no acepta al destinatario, queda como error', async () => {
  const { servicio } = montar({ factura: ACEPTADA, resultado: { accepted: [], rejected: ['actual@example.test'] } });
  const r = await servicio.entregarFacturaElectronica(500);
  assert.equal(r.estado, 'error');
  assert.match(r.motivo, /no aceptó al destinatario/);
});
test('una factura que no existe, o una copia aislada, tampoco lanzan', async () => {
  const falta = montar({ noExiste: true });
  assert.equal((await falta.servicio.entregarFacturaElectronica(500)).estado, 'error');
  assert.equal(falta.enviados.length, 0);

  const aislada = montar({ factura: ACEPTADA });
  delete process.env.NODE_TEST_CONTEXT;
  assert.equal(aislado.salidasBloqueadas(), true);
  const r = await aislada.servicio.entregarFacturaElectronica(500);
  assert.equal(r.estado, 'error');
  assert.equal(aislada.transportes.length, 0, 'la copia de desarrollo abrió el servidor de correo');
});
test('el botón Correo de siempre sigue mandando una factura sin comprobante', async () => {
  const { servicio, enviados } = montar();
  assert.equal((await servicio.enviarFacturaPorCorreo(500, DATOS)).aceptado, true);
  assert.equal(enviados[0].attachments.length, 1);
});

/**
 * Aviso a la empresa cuando un cliente hace un pedido en el portal (pedido
 * del usuario, 2026-09-29: "actualmente no avisa").
 *
 * LO QUE SE CUIDA
 *  - Avisa por WhatsApp y/o correo, a donde se configuró; vacío = no avisa.
 *  - Nunca tira error: un WhatsApp desconectado no puede deshacer un pedido.
 *  - El pedido no espera al aviso (se manda sin await).
 *  - No se puede avisar al MISMO número que tiene vinculado el sistema:
 *    WhatsApp no hace sonar los mensajes a uno mismo.
 *
 * Todo con dobles: nada sale a WhatsApp, a un correo ni a la base real.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const rutaDb = require.resolve('../config/database');
const rutaWa = require.resolve('../src/integrations/whatsapp');
const rutaMailer = require.resolve('../services/mailer');
const rutaAviso = require.resolve('../src/modules/portal-clientes/avisoPedidoNuevo');

let destinos; let whatsapps; let correos; let numeroVinculado; let falloWa; let correoListo;

function montar() {
  for (const r of [rutaDb, rutaWa, rutaMailer, rutaAviso]) delete require.cache[r];
  whatsapps = []; correos = [];
  const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
  doble(rutaDb, {
    query: async (sql, params = []) => {
      const t = String(sql).replace(/\s+/g, ' ').trim();
      if (/^SELECT whatsapp, correo FROM aviso_pedidos/.test(t)) return { rows: destinos ? [destinos] : [] };
      if (/^INSERT INTO aviso_pedidos/.test(t)) { destinos = { whatsapp: params[0], correo: params[1] }; return { rows: [] }; }
      return { rows: [] };
    }
  });
  doble(rutaWa, {
    estado: () => ({ numero: numeroVinculado }),
    enviarTexto: async (m) => { if (falloWa) throw new Error(falloWa); whatsapps.push(m); return { enviado: true }; }
  });
  doble(rutaMailer, {
    estaConfigurado: () => correoListo,
    enviarCorreo: async (m) => { correos.push(m); return { messageId: 'x' }; }
  });
  return require(rutaAviso);
}

let aviso;
beforeEach(() => {
  destinos = null; numeroVinculado = '50686477036'; falloWa = null; correoListo = true;
  aviso = montar();
});

const PEDIDO = { cliente: 'SUPER EL BARREAL', pedidoId: 42, lineas: 7, total: 35840.5, observaciones: 'Para el viernes' };

describe('a dónde avisar', () => {
  test('guarda un celular y un correo', async () => {
    const r = await aviso.guardarDestinos({ whatsapp: '6298-4143', correo: 'dueno@correo.com' });
    assert.deepEqual(r, { whatsapp: '50662984143', correo: 'dueno@correo.com' });
  });

  test('no acepta el mismo número que tiene vinculado el sistema', async () => {
    await assert.rejects(() => aviso.guardarDestinos({ whatsapp: '8647 7036' }), (e) => e.status === 400 && /sí mismo/.test(e.message));
  });

  test('no acepta un fijo ni un correo mal escrito', async () => {
    await assert.rejects(() => aviso.guardarDestinos({ whatsapp: '2222-1111' }), /fijo/);
    await assert.rejects(() => aviso.guardarDestinos({ correo: 'dueno@' }), /no parece un correo/);
  });

  test('vacío es "no avisar por ahí"', async () => {
    const r = await aviso.guardarDestinos({ whatsapp: '', correo: '' });
    assert.deepEqual(r, { whatsapp: '', correo: '' });
  });
});

describe('el aviso', () => {
  test('sale por WhatsApp y por correo, con cliente, total y el enlace', async () => {
    destinos = { whatsapp: '50662984143', correo: 'dueno@correo.com' };
    const r = await aviso.avisar(PEDIDO);
    assert.deepEqual(r, { whatsapp: 'enviado', correo: 'enviado' });
    assert.equal(whatsapps[0].telefono, '50662984143');
    assert.match(whatsapps[0].mensaje, /Pedido nuevo en el portal/);
    assert.match(whatsapps[0].mensaje, /SUPER EL BARREAL/);
    assert.match(whatsapps[0].mensaje, /Pedido #42 · 7 productos · ₡35[.,\s ]?841/);
    assert.match(whatsapps[0].mensaje, /Para el viernes/);
    assert.match(whatsapps[0].mensaje, /\/clientes$/m);
    assert.match(correos[0].asunto, /SUPER EL BARREAL/);
  });

  test('sin destinos no manda nada', async () => {
    const r = await aviso.avisar(PEDIDO);
    assert.deepEqual(r, { whatsapp: 'sin configurar', correo: 'sin configurar' });
    assert.equal(whatsapps.length + correos.length, 0);
  });

  test('un WhatsApp caído no frena el correo ni tira error', async () => {
    destinos = { whatsapp: '50662984143', correo: 'dueno@correo.com' };
    falloWa = 'WhatsApp se está reconectando';
    const r = await aviso.avisar(PEDIDO);
    assert.match(r.whatsapp, /reconectando/);
    assert.equal(r.correo, 'enviado');
  });

  test('si el servidor no tiene correo configurado, lo dice en vez de fallar', async () => {
    destinos = { whatsapp: null, correo: 'dueno@correo.com' };
    correoListo = false;
    const r = await aviso.avisar(PEDIDO);
    assert.match(r.correo, /no tiene configurado/);
  });
});

describe('el pedido no espera al aviso', () => {
  test('crearPedido lo manda sin await y sin dejar escapar un error', () => {
    const fuente = fs.readFileSync(require.resolve('../src/modules/portal-clientes/portal-clientes.cliente.service'), 'utf8');
    const crear = fuente.slice(fuente.indexOf('async function crearPedido'), fuente.indexOf('return {', fuente.indexOf('async function crearPedido')));
    assert.match(crear, /\n\s+avisoPedidoNuevo\.avisar\(\{[\s\S]*?\}\)\.catch\(\(\) => \{\}\);/);
    assert.doesNotMatch(crear, /await avisoPedidoNuevo/);
    assert.ok(crear.indexOf('avisoPedidoNuevo.avisar') > crear.indexOf('INSERT INTO pedido_cliente_linea'), 'se avisa con el pedido ya guardado');
  });
});

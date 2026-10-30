/**
 * La visita en Preventa (F3 del agente, 2026-10-29): cómo llegar, cómo
 * contactar y «Facturar», que abre Facturación con el cliente ya elegido.
 *
 * El usuario: «que ahí pueda entrar y facturarle … además que en ese módulo de
 * preventa donde entre al cliente, también le salga la información de
 * ubicación».
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));
const util = () => import(path.join(FRONT, 'utils', 'visitaPreventa.js'));

describe('cómo llegar', () => {
  test('las coordenadas se leen de los enlaces de Maps que las traen escritas', async () => {
    const { coordenadasDe } = await util();
    assert.deepEqual(coordenadasDe('https://www.google.com/maps?q=10.0569,-84.4351'), { lat: 10.0569, lng: -84.4351 });
    assert.deepEqual(coordenadasDe('https://www.google.com/maps/place/Palmares/@10.0603,-84.4287,17z'), { lat: 10.0603, lng: -84.4287 });
    assert.deepEqual(coordenadasDe('https://maps.google.com/?ll=9.93,-84.08'), { lat: 9.93, lng: -84.08 });
    assert.deepEqual(coordenadasDe('https://www.google.com/maps/search/?api=1&query=10.06%2C-84.43'), { lat: 10.06, lng: -84.43 });
  });

  test('un enlace corto, uno roto o vacío no inventa coordenadas', async () => {
    const { coordenadasDe } = await util();
    for (const e of ['https://maps.app.goo.gl/AbCdEf123', '', null, undefined, 'https://www.google.com/maps?q=Palmares', 'https://x.com/?q=0,0', 'https://x.com/?q=95,10']) {
      assert.equal(coordenadasDe(e), null, String(e));
    }
  });

  test('Maps abre el enlace de la ficha tal cual; Waze, solo si hay coordenadas', async () => {
    const { enlacesParaLlegar } = await util();
    assert.deepEqual(enlacesParaLlegar('https://www.google.com/maps?q=10.0569,-84.4351'), {
      maps: 'https://www.google.com/maps?q=10.0569,-84.4351',
      waze: 'https://waze.com/ul?ll=10.0569,-84.4351&navigate=yes'
    });
    assert.deepEqual(enlacesParaLlegar('https://maps.app.goo.gl/AbCdEf123'), { maps: 'https://maps.app.goo.gl/AbCdEf123', waze: null });
    assert.deepEqual(enlacesParaLlegar(null), { maps: null, waze: null });
  });
});

describe('cómo contactarlo', () => {
  test('el número sale de lo que traen las fichas, con el 506 adelante', async () => {
    const { numeroDe } = await util();
    assert.equal(numeroDe('89350207 JEISON'), '50689350207');
    assert.equal(numeroDe('8935-0207'), '50689350207');
    assert.equal(numeroDe('+506 8935 0207'), '50689350207');
    assert.equal(numeroDe('2453 1234'), '50624531234');
    for (const malo of ['', null, 'sin teléfono', '1234', '123456789012']) assert.equal(numeroDe(malo), null, String(malo));
  });

  test('sin repetir el mismo número, con su enlace para llamar y para WhatsApp', async () => {
    const { contactosDe } = await util();
    const c = contactosDe({ celular: '89350207 JEISON', telefono: '8935-0207', telefono_secundario: 'oficina' });
    assert.deepEqual(c, [
      { texto: '89350207 JEISON', llamar: 'tel:+50689350207', whatsapp: 'https://wa.me/50689350207' },
      { texto: 'oficina', llamar: null, whatsapp: null }
    ]);
    assert.deepEqual(contactosDe({}), []);
  });
});

describe('la pantalla', () => {
  test('la visita ofrece Facturar (con el cliente y la ruta en la dirección) solo a quien tiene Facturación', () => {
    const d = leer('components', 'preventa', 'DetalleVisita.jsx');
    assert.match(d, /navigate\(`\/facturacion\?cliente=\$\{cliente\.id\}&desde=preventa\$\{ruta\}`\)/);
    assert.match(d, /\{puedeVer\(usuario, '\/facturacion'\) && \(/);
    assert.match(d, /Abrir en Maps/);
    assert.match(d, /\{llegar\.waze && /);
    assert.match(d, /Sin ubicación en la ficha/);
  });

  test('la agenda trae la ubicación de la ficha', () => {
    const s = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'preventa', 'preventa.service.js'), 'utf8');
    assert.match(s, /c\.rotacion_dias, c\.ubicacion_maps,/);
  });

  test('Preventa guarda la ruta en la dirección, para volver donde estaba', () => {
    const h = leer('hooks', 'useAgendaPreventa.js');
    assert.match(h, /useState\(\(\) => parametros\.get\('ruta'\) \|\| ''\)/);
    assert.match(h, /if \(\(parametros\.get\('ruta'\) \|\| ''\) !== rutaId\) setParametros\(rutaId \? \{ ruta: rutaId \} : \{\}, \{ replace: true \}\)/);
  });

  test('Facturación elige el cliente que llega de Preventa, una vez, y ofrece volver', () => {
    const hook = leer('hooks', 'useClienteDesdePreventa.js');
    assert.match(hook, /if \(hecho\.current \|\| !id \|\| clienteSeleccionado \|\| !clientes\?\.length\) return/);
    assert.match(hook, /if \(cliente\) seleccionarCliente\(cliente\)/);
    const pagina = leer('pages', 'Facturacion.jsx');
    assert.match(pagina, /const preventa = useClienteDesdePreventa\(\{ clientes, clienteSeleccionado, seleccionarCliente \}\)/);
    assert.ok(pagina.indexOf('useClienteDesdePreventa({') < pagina.indexOf('if (loading && productos.length === 0)'),
      'el gancho va antes del return de carga');
    assert.match(pagina, /\{preventa\.desdePreventa && <VolverAPreventa /);
  });
});

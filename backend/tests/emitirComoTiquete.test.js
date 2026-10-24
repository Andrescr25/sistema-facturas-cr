/**
 * «Emitir como tiquete» desde Impresión (2026-10-24).
 *
 * El usuario: «los clientes que no tienen correo, salga la opción emitir como
 * tiquete e imprimir». La regla de siempre (cédula → factura, sin cédula →
 * tiquete) no los cubre: 228 de las 268 ventas recientes a clientes sin correo
 * tenían cédula. Así que el tiquete es una ELECCIÓN expresa de quien emite
 * (`tipo: '04'`), nunca el valor por omisión de Facturación.
 *
 * Con una base simulada: lo que se cuida es qué tipo sale en cada caso, y que
 * una factura que ya tiene comprobante no cambie de tipo por tocar el botón.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { crearUnClic, tipoDeFactura, tipoPedido } = require('../src/integrations/hacienda/unClic.service');

const FACTURA = {
  id: 7, numero: '001000015100', estado: 'emitida', electronica: false, alegra_id: null,
  cliente_identificacion: '123456789', hacienda_comprobante_id: null,
  condicion_venta: 'credito', metodo_pago_id: null, estado_bodega: 'procesado',
  cola_impresion: 'pendiente', faltantes_pendientes: false
};

/** El servicio con una base que contesta lo justo; `comprobante` es el que ya tiene la factura. */
function servicio({ factura = FACTURA, comprobante = null } = {}) {
  const preparados = [];
  const pool = {
    query: async (sql) => {
      const t = String(sql).replace(/\s+/g, ' ');
      if (/FROM factura f WHERE f\.id=\$1/.test(t)) return { rows: [factura] };
      if (/FROM hacienda_configuracion/.test(t)) return { rows: [{ ambiente: 'produccion', habilitada: true }] };
      if (/FROM factura_linea/.test(t)) return { rows: [] };
      if (/FROM hacienda_comprobante/.test(t)) return { rows: comprobante ? [comprobante] : [] };
      return { rows: [] };
    }
  };
  const unClic = crearUnClic({
    pool, ganchos: {}, vista: (c) => c || null, id: (v) => Number(v),
    preparar: async (origen, n, datos) => { preparados.push(datos); return { id: 1, estado: 'firmada', ...datos }; }
  });
  return { ...unClic.publico, preparados };
}

describe('qué tipo de comprobante sale', () => {
  test('solo se acepta pedir el tiquete; cualquier otra cosa se ignora', () => {
    assert.equal(tipoPedido('04'), '04');
    for (const raro of ['01', '03', '05', 'tiquete', '', null, undefined, 4, '4', '04 ']) assert.equal(tipoPedido(raro), null, String(raro));
  });

  test('sin pedirlo, manda la regla de siempre: con cédula factura, sin cédula tiquete', async () => {
    assert.equal(tipoDeFactura({ cliente_identificacion: '123456789' }), '01');
    assert.equal((await servicio().estadoDeFactura(7)).tipo, '01');
    assert.equal((await servicio({ factura: { ...FACTURA, cliente_identificacion: '' } }).estadoDeFactura(7)).tipo, '04');
  });

  test('un cliente CON cédula y sin correo sale como tiquete cuando se pide a propósito', async () => {
    const e = await servicio().estadoDeFactura(7, [], { tipo: '04' });
    assert.equal(e.tipo, '04');
    assert.equal(e.motivoNoEmitible, null);
  });

  test('pedir «01» u otra cosa no fuerza nada', async () => {
    assert.equal((await servicio().estadoDeFactura(7, [], { tipo: '01' })).tipo, '01');
    assert.equal((await servicio().estadoDeFactura(7, [], { tipo: '03' })).tipo, '01');
  });

  test('emitir pasa el tiquete a la preparación; sin pedirlo, no', async () => {
    const con = servicio();
    await con.emitirFactura(7, { tipo: '04' }, 1);
    assert.equal(con.preparados[0].tipo, '04');
    assert.equal(con.preparados[0].ambiente, 'produccion');
    const sin = servicio();
    await sin.emitirFactura(7, {}, 1);
    assert.equal(sin.preparados[0].tipo, '01');
  });

  test('una factura con comprobante en curso o aceptado conserva su tipo, aunque se pida otro', async () => {
    const aceptadaComoFactura = { id: 1, tipo: '01', estado: 'aceptada', ambiente: 'produccion' };
    const e = await servicio({ factura: { ...FACTURA, hacienda_comprobante_id: 1 }, comprobante: aceptadaComoFactura })
      .estadoDeFactura(7, [], { tipo: '04' });
    assert.equal(e.tipo, '01', 'no se convierte una factura ya aceptada en tiquete');
    const enCursoComoTiquete = { id: 2, tipo: '04', estado: 'recibida', ambiente: 'produccion' };
    assert.equal((await servicio({ factura: { ...FACTURA, hacienda_comprobante_id: 2 }, comprobante: enCursoComoTiquete }).estadoDeFactura(7)).tipo, '04',
      'ya salió como tiquete: la pantalla de Facturación no lo muestra como factura');
  });

  test('un tiquete rechazado se reintenta como tiquete, aunque se vuelva a intentar desde otra pantalla', async () => {
    const rechazado = { id: 3, tipo: '04', estado: 'rechazada', ambiente: 'produccion' };
    const f = { ...FACTURA, hacienda_comprobante_id: null };
    assert.equal((await servicio({ factura: f, comprobante: rechazado }).estadoDeFactura(7)).tipo, '04');
    // …y si se pide a propósito otro tipo distinto del rechazado, gana lo pedido solo para el tiquete.
    const facturaRechazada = { id: 4, tipo: '01', estado: 'rechazada', ambiente: 'produccion' };
    assert.equal((await servicio({ factura: f, comprobante: facturaRechazada }).estadoDeFactura(7)).tipo, '01');
    assert.equal((await servicio({ factura: f, comprobante: facturaRechazada }).estadoDeFactura(7, [], { tipo: '04' })).tipo, '04');
  });
});

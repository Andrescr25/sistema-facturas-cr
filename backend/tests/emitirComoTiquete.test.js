/**
 * Qué comprobante sale: factura con correo, tiquete sin correo (2026-10-24).
 *
 * El usuario: «los clientes que tengan correo, tengan factura electrónica; los
 * que no, tiquete sin dirigirlo a nadie, solo tiquete». La regla anterior
 * (cédula → factura) falló con el primer tiquete real: la cédula era de
 * relleno («100000000»), que el sistema viejo exigía y los clientes que no
 * quieren factura a su nombre dejaron así, y Hacienda lo rechazó (-38,
 * receptor inválido). 210 de las 273 ventas de los últimos 60 días a clientes
 * sin correo llevaban una cédula así.
 *
 * Con una base simulada: lo que se cuida es qué tipo sale en cada caso, y que
 * una factura que ya tiene comprobante no cambie de tipo por tocar el botón.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { crearUnClic, tipoDeFactura } = require('../src/integrations/hacienda/unClic.service');

const FACTURA = {
  id: 7, numero: '001000015100', estado: 'emitida', electronica: false, alegra_id: null,
  cliente_identificacion: '123456789', cliente_correo: 'zz@ejemplo.com', hacienda_comprobante_id: null,
  condicion_venta: 'credito', metodo_pago_id: null, estado_bodega: 'procesado',
  cola_impresion: 'pendiente', faltantes_pendientes: false
};
const sinCorreo = (extra = {}) => ({ ...FACTURA, cliente_correo: null, ...extra });

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
  test('con correo y cédula, factura; todo lo demás, tiquete', () => {
    assert.equal(tipoDeFactura({ cliente_correo: 'zz@ejemplo.com', cliente_identificacion: '123456789' }), '01');
    assert.equal(tipoDeFactura({ cliente_correo: '  zz@ejemplo.com  ', cliente_identificacion: '123456789' }), '01', 'el correo se recorta');
    // Sin correo manda el tiquete, tenga la cédula que tenga: la de relleno no es de nadie.
    for (const cedula of ['100000000', '123456789', '3101123456', '', null]) {
      assert.equal(tipoDeFactura({ cliente_correo: null, cliente_identificacion: cedula }), '04', `sin correo, cédula ${cedula}`);
    }
    for (const correo of ['', '   ', 'sin arroba', 'a@b', undefined]) {
      assert.equal(tipoDeFactura({ cliente_correo: correo, cliente_identificacion: '123456789' }), '04', `correo ${JSON.stringify(correo)}`);
    }
    // Una factura no se puede dirigir a nadie: con correo pero sin cédula tampoco hay factura.
    assert.equal(tipoDeFactura({ cliente_correo: 'zz@ejemplo.com', cliente_identificacion: '' }), '04');
    assert.equal(tipoDeFactura({ cliente_correo: 'zz@ejemplo.com' }), '04');
    assert.equal(tipoDeFactura({}), '04');
  });

  test('el estado dice lo mismo que la regla, por factura', async () => {
    assert.equal((await servicio().estadoDeFactura(7)).tipo, '01');
    assert.equal((await servicio({ factura: sinCorreo() }).estadoDeFactura(7)).tipo, '04', 'con cédula pero sin correo: tiquete');
    assert.equal((await servicio({ factura: sinCorreo({ cliente_identificacion: '100000000' }) }).estadoDeFactura(7)).tipo, '04', 'la cédula de relleno del caso real');
    assert.equal((await servicio({ factura: sinCorreo({ cliente_identificacion: '' }) }).estadoDeFactura(7)).tipo, '04');
  });

  test('emitir manda la preparación con ese tipo', async () => {
    const tiquete = servicio({ factura: sinCorreo({ cliente_identificacion: '100000000' }) });
    await tiquete.emitirFactura(7, {}, 1);
    assert.equal(tiquete.preparados[0].tipo, '04');
    assert.equal(tiquete.preparados[0].ambiente, 'produccion');
    const factura = servicio();
    await factura.emitirFactura(7, {}, 1);
    assert.equal(factura.preparados[0].tipo, '01');
  });

  test('nadie puede forzar el tipo desde afuera: lo que mande el navegador no cuenta', async () => {
    const e = servicio({ factura: sinCorreo() });
    await e.emitirFactura(7, { tipo: '01' }, 1);
    assert.equal(e.preparados[0].tipo, '04', 'no se emite una factura a un cliente sin correo por pedirla');
    const f = servicio();
    await f.emitirFactura(7, { tipo: '04' }, 1);
    assert.equal(f.preparados[0].tipo, '01');
  });

  test('un comprobante en curso o aceptado conserva su tipo', async () => {
    const aceptadaComoFactura = { id: 1, tipo: '01', estado: 'aceptada', ambiente: 'produccion' };
    assert.equal((await servicio({ factura: sinCorreo({ hacienda_comprobante_id: 1 }), comprobante: aceptadaComoFactura }).estadoDeFactura(7)).tipo, '01',
      'ya salió como factura: quitarle el correo a la ficha no la convierte en tiquete');
    const enCursoComoTiquete = { id: 2, tipo: '04', estado: 'recibida', ambiente: 'produccion' };
    assert.equal((await servicio({ factura: { ...FACTURA, hacienda_comprobante_id: 2 }, comprobante: enCursoComoTiquete }).estadoDeFactura(7)).tipo, '04',
      'ya salió como tiquete: la pantalla de Facturación no lo muestra como factura');
  });

  test('un comprobante rechazado se vuelve a emitir con la regla de hoy', async () => {
    // El caso real: el tiquete 1970, rechazado por la cédula de relleno. «Volver a emitir» sale otra vez tiquete.
    const rechazado = { id: 3, tipo: '04', estado: 'rechazada', ambiente: 'produccion' };
    const f = sinCorreo({ cliente_identificacion: '100000000' });
    assert.equal((await servicio({ factura: f, comprobante: rechazado }).estadoDeFactura(7)).tipo, '04');
    const reintento = servicio({ factura: f, comprobante: rechazado });
    await reintento.emitirFactura(7, { sustituir: true }, 1);
    assert.equal(reintento.preparados[0].tipo, '04');
    assert.equal(reintento.preparados[0].sustituir, true);
  });
});

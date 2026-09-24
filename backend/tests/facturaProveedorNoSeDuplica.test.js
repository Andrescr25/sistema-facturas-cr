/**
 * Una factura de proveedor ya enviada no se vuelve a enviar ni se devuelve.
 *
 * QUÉ SE PODÍA HACER ANTES, Y ES GRAVE
 * Revisión de Precios tiene tres pasos y el tercero es el historial de
 * facturas ya enviadas a Alegra. Tocar una factura de ese historial abría la
 * MISMA pantalla de revisión, con los botones "Devolver a Relacionar" y
 * "Enviar a Alegra" activos y sin decir en ningún lado que ya se había
 * enviado — el estado incluso se mostraba como "Listo".
 *
 * Enviarla otra vez crea una SEGUNDA factura de compra en Alegra por la misma
 * compra al proveedor: el gasto queda contado dos veces. Había 838 facturas
 * en ese estado, así que era cuestión de un clic.
 *
 * `ENVIADA` es prueba de que la factura de compra sí se creó allá: cuando ese
 * paso falla, el estado NO avanza a propósito para poder reintentar (ver el
 * comentario en enviarFacturaAlegra). Por eso la guarda puede ser tajante.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaPrisma = require.resolve('../lib/prisma');
const rutaDb = require.resolve('../config/database');
const rutaAlegra = require.resolve('../src/integrations/alegra');
const rutaServicio = require.resolve('../src/modules/revision-precios/revision-precios.service');

/** Carga el servicio con la factura indicada y sin red ni base real. */
function montar(factura) {
  const registro = { actualizaciones: [], llamadasAlegra: [] };

  require.cache[rutaPrisma] = {
    id: rutaPrisma, filename: rutaPrisma, loaded: true,
    exports: {
      factura: {
        findUnique: async () => factura,
        update: async (args) => { registro.actualizaciones.push(args); return factura; },
        findMany: async () => []
      },
      productoFactura: { findUnique: async () => null, findMany: async () => [] },
      $disconnect: async () => {}
    }
  };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { query: async () => ({ rows: [] }) }
  };
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getProductService: () => ({}),
      getContactService: () => ({}),
      getInvoiceService: () => ({}),
      getClient: () => ({
        request: async (...args) => { registro.llamadasAlegra.push(args); return {}; },
        api: { post: async (...args) => { registro.llamadasAlegra.push(args); return { data: {} }; } }
      })
    }
  };

  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), registro };
}

const facturaEn = (estado) => ({
  id: 'f1',
  numeroConsecutivo: '00100001010000133086',
  estado,
  productos: []
});

beforeEach(() => {
  for (const r of [rutaPrisma, rutaDb, rutaAlegra, rutaServicio]) delete require.cache[r];
});

describe('devolver a relacionar', () => {
  test('una factura ENVIADA no se devuelve', async () => {
    const { servicio, registro } = montar(facturaEn('ENVIADA'));

    await assert.rejects(() => servicio.devolverFactura('f1'), (e) => e.status === 409);
    assert.equal(registro.actualizaciones.length, 0, 'no debió cambiarle el estado');
  });

  test('el mensaje dice qué hace falta, y ya no manda a Alegra', async () => {
    // En esta rama ENVIADA es "ya existe la compra", no "existe en Alegra":
    // mandar a anular allá era mandar al lugar equivocado.
    const { servicio } = montar(facturaEn('ENVIADA'));
    await assert.rejects(() => servicio.devolverFactura('f1'),
      (e) => /registrada como compra/.test(e.message) && /anular la compra/.test(e.message) && !/Alegra/.test(e.message));
  });

  test('una factura que todavía no se envió sí se devuelve', async () => {
    for (const estado of ['RELACIONADA', 'PROCESADA']) {
      const { servicio, registro } = montar(facturaEn(estado));
      const r = await servicio.devolverFactura('f1');
      assert.equal(r.factura.nuevoEstado, 'PROCESADA');
      assert.equal(registro.actualizaciones.length, 1, `debió poder devolverse desde ${estado}`);
    }
  });
});

describe('enviar a Alegra', () => {
  test('una factura ENVIADA no se vuelve a enviar', async () => {
    // Es la guarda que evita la segunda factura de compra.
    const { servicio, registro } = montar(facturaEn('ENVIADA'));

    await assert.rejects(() => servicio.enviarFacturaAlegra('f1'), (e) => e.status === 409);
    assert.equal(registro.llamadasAlegra.length, 0, 'no debió tocar Alegra');
  });

  test('el mensaje nombra el riesgo concreto', async () => {
    const { servicio } = montar(facturaEn('ENVIADA'));
    await assert.rejects(() => servicio.enviarFacturaAlegra('f1'),
      (e) => /segunda factura de compra/.test(e.message));
  });

  test('una línea de regalía (100 % de descuento) NO pisa el costo del producto', () => {
    // "10 pagados + 1 de regalía" del mismo producto: la regalía sale con
    // costo 0 y dejaba el producto en ₡0 (medido: 4 veces en el histórico).
    const { servicio } = montar(facturaEn('RELACIONADA'));
    const regalia = { precioUnitario: 500, cantidad: 1, descuento: 500, impuesto: 0, totalLinea: 0 };

    const r = servicio.actualizacionDeLinea(regalia, undefined);
    assert.equal(r.esRegalia, true);
    assert.equal(r.updateData, null, 'sin precio que cambiar, no hay nada que mandarle a Alegra');
  });

  test('una regalía con precio ajustado manda SOLO el precio', () => {
    const { servicio } = montar(facturaEn('RELACIONADA'));
    const regalia = { precioUnitario: 500, cantidad: 1, descuento: 500, impuesto: 0, totalLinea: 0 };

    const r = servicio.actualizacionDeLinea(regalia, 900);
    assert.deepEqual(r.updateData, { price: 900 });
  });

  test('una línea pagada sí manda el costo, anidado en inventory.unitCost', () => {
    const { servicio } = montar(facturaEn('RELACIONADA'));
    const pagada = { precioUnitario: 500, cantidad: 10, descuento: 0, impuesto: 650, totalLinea: 5650 };

    const r = servicio.actualizacionDeLinea(pagada, undefined);
    assert.equal(r.esRegalia, false);
    assert.equal(r.updateData.inventory.unitCost, '565');
    assert.equal(r.updateData.price, undefined);
  });

  test('la guarda no bloquea a las que todavía no se enviaron', async () => {
    // Si una factura quedó en RELACIONADA porque el envío falló, hay que
    // poder reintentar: ese es el caso que la guarda NO debe tocar.
    const { servicio } = montar(facturaEn('RELACIONADA'));
    await servicio.enviarFacturaAlegra('f1').catch((e) => {
      assert.notEqual(e.status, 409, 'no debió frenarse por la guarda');
    });
  });
});

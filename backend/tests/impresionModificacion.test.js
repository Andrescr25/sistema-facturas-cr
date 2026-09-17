const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Que la modificación llegue al PDF.
 *
 * LO QUE PASABA. `alegraService.procesarFacturaIndividual` estaba DEFINIDA DOS
 * VECES en el mismo objeto del frontend. En JavaScript gana la última, y esa
 * mandaba `{ factura, items_editados }` anidado mientras el servidor lee los
 * campos de la raíz: respondía "alegra_id es requerido" y NINGUNA modificación
 * se aplicaba. El PDF —que lo genera Alegra— salía con la factura sin tocar.
 * Comprobado contra el endpoint real: anidado da 400, plano da 200.
 *
 * LO SEGUNDO. Cuando se editan líneas a mano, esa rama salía derecho a Alegra
 * y se saltaba el refresco de precios. Como la pantalla carga las líneas DESDE
 * LA FACTURA, se reimprimía con el precio con que se emitió aunque el catálogo
 * ya tuviera otro. Pero el precio se puede escribir a mano, así que solo se
 * refresca el de las líneas que nadie tocó.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'invoices', 'invoice.service.js');

/**
 * @param enFactura  precio que cada línea tiene HOY en la factura de Alegra
 * @param enCatalogo precio actual del catálogo
 */
function montar({ enFactura = {}, enCatalogo = {} } = {}) {
  for (const r of [rutaDb, rutaServicio]) delete require.cache[r];

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { query: async () => ({ rows: [] }) }
  };

  const enviado = {};
  const Servicio = require(rutaServicio);
  const servicio = new Servicio();

  servicio.alegraInvoiceService = {
    getInvoiceById: async () => ({
      success: true,
      data: {
        items: Object.entries(enFactura).map(([id, price]) => ({ id: Number(id), price, quantity: 1 }))
      }
    }),
    getUpdatedPriceById: async (id) => (enCatalogo[String(id)] ?? null),
    getUpdatedPrice: async () => null,
    updateInvoice: async (alegraId, cuerpo) => {
      enviado.alegraId = alegraId;
      enviado.items = cuerpo.items;
      return { success: true };
    }
  };

  return { servicio, enviado };
}

const linea = (id, price, quantity = 2) => ({ id, price, quantity, reference: `R${id}`, description: `ITEM ${id}` });

describe('las líneas editadas llegan a Alegra', () => {
  test('se manda la cantidad que puso el empleado', async () => {
    const { servicio, enviado } = montar({ enFactura: { 10: 100 }, enCatalogo: {} });

    await servicio.updateInvoicePricesFromAlegra('5000', [], [linea(10, 100, 3)], false);

    assert.equal(enviado.items.length, 1);
    assert.equal(enviado.items[0].quantity, 3);
  });

  test('una línea en cero se saca de la factura', async () => {
    // Es lo que pasa cuando el producto no llegó del todo.
    const { servicio, enviado } = montar({ enFactura: { 10: 100, 11: 200 } });

    await servicio.updateInvoicePricesFromAlegra('5000', [], [linea(10, 100, 0), linea(11, 200, 2)], false);

    assert.deepEqual(enviado.items.map(i => i.id), [11]);
  });
});

describe('el precio nuevo en la reimpresión', () => {
  test('una línea que nadie tocó sale con el precio del catálogo', async () => {
    // Emitida a 100, el catálogo ya dice 130: se reimprime a 130.
    const { servicio, enviado } = montar({ enFactura: { 10: 100 }, enCatalogo: { 10: 130 } });

    await servicio.updateInvoicePricesFromAlegra('5000', [], [linea(10, 100)], true);

    assert.equal(enviado.items[0].price, 130);
  });

  test('un precio escrito a mano se respeta', async () => {
    // Emitida a 100, el empleado escribió 90, el catálogo dice 130. Manda el 90:
    // pisar lo que alguien tecleó es peor que el problema que se arregla.
    const { servicio, enviado } = montar({ enFactura: { 10: 100 }, enCatalogo: { 10: 130 } });

    await servicio.updateInvoicePricesFromAlegra('5000', [], [linea(10, 90)], true);

    assert.equal(enviado.items[0].price, 90);
  });

  test('con actualizar_precios apagado no se toca ningún precio', async () => {
    const { servicio, enviado } = montar({ enFactura: { 10: 100 }, enCatalogo: { 10: 130 } });

    await servicio.updateInvoicePricesFromAlegra('5000', [], [linea(10, 100)], false);

    assert.equal(enviado.items[0].price, 100);
  });

  test('si el catálogo no tiene precio, queda el de la factura', async () => {
    const { servicio, enviado } = montar({ enFactura: { 10: 100 }, enCatalogo: {} });

    await servicio.updateInvoicePricesFromAlegra('5000', [], [linea(10, 100)], true);

    assert.equal(enviado.items[0].price, 100);
  });

  test('cada línea se resuelve por su cuenta', async () => {
    // Una sin tocar (sube al catálogo) y otra escrita a mano (se respeta).
    const { servicio, enviado } = montar({
      enFactura: { 10: 100, 11: 200 },
      enCatalogo: { 10: 130, 11: 250 }
    });

    await servicio.updateInvoicePricesFromAlegra('5000', [], [linea(10, 100), linea(11, 190)], true);

    const porId = new Map(enviado.items.map(i => [i.id, i.price]));
    assert.equal(porId.get(10), 130, 'la que nadie tocó tenía que tomar el precio del catálogo');
    assert.equal(porId.get(11), 190, 'la escrita a mano tenía que quedarse como la escribieron');
  });
});

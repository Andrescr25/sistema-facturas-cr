const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Destrabar solo un producto que no se deja facturar sin existencias.
 *
 * DE DÓNDE SALE. La casa casi no maneja inventario: quedan artículos de antes
 * de un cambio interno con el permiso apagado, y cuando entran varios pedidos
 * se van a negativo. Alegra rechaza la factura con el cliente enfrente.
 *
 * LO QUE SE CUIDA ACÁ es que esto toque LO MENOS POSIBLE de un producto real
 * de la cuenta de la empresa: solo el que Alegra nombró, solo el permiso, y
 * nunca las existencias ni el costo.
 */

const rutaDb = require.resolve('../config/database');
const rutaCliente = require.resolve('../src/integrations/alegra');
const rutaIdem = require.resolve('../src/modules/facturacion/idempotencia');
const rutaServicio = require.resolve('../src/modules/facturacion/facturacion.service');

const FACTURA = {
  client: 38,
  date: '2026-09-14',
  items: [
    { id: 101, quantity: 3, price: 1000, tax: [{ id: '1' }] },
    { id: 202, quantity: 1, price: 500, tax: [{ id: '1' }] }
  ]
};

const ficha = (id, name, negativeSale) => ({
  id, name,
  inventory: { unit: 'unit', unitCost: 700, availableQuantity: -4, negativeSale }
});

function errorSinStock(nombre) {
  const e = new Error('Request failed with status code 400');
  e.response = {
    status: 400,
    data: { message: `Configuraste el item ${nombre} para no poder facturar si no tiene stock.` }
  };
  return e;
}

/**
 * Monta el servicio con un Alegra de mentira que lleva la cuenta de todo lo
 * que se le pidió.
 *
 * `trabados` son los ids que rechazan la factura hasta que se les prenda el
 * permiso, igual que haría Alegra: nombra UNO por vez.
 */
function montar({ trabados = [], nombres = {}, tocaOtraCosa = false } = {}) {
  for (const r of [rutaDb, rutaCliente, rutaIdem, rutaServicio]) delete require.cache[r];

  const registro = { posts: 0, puts: [], gets: [] };
  const permiso = new Map(FACTURA.items.map(i => [i.id, !trabados.includes(i.id)]));

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { query: async () => ({ rows: [] }) }
  };

  require.cache[rutaCliente] = {
    id: rutaCliente, filename: rutaCliente, loaded: true,
    exports: {
      getClient: () => ({
        request: async (metodo, ruta, cuerpo) => {
          if (metodo === 'POST' && ruta === '/invoices') {
            registro.posts++;
            const trabado = FACTURA.items.map(i => i.id).find(id => permiso.get(id) === false);
            if (trabado) throw errorSinStock(nombres[trabado] || `ITEM ${trabado}`);
            return { id: 9001, numberTemplate: { fullNumber: '001-9001' }, total: 3500 };
          }
          if (metodo === 'GET' && ruta.startsWith('/items/')) {
            const id = Number(ruta.split('/').pop());
            registro.gets.push(id);
            const f = ficha(id, nombres[id] || `ITEM ${id}`, permiso.get(id) === true);
            // Para probar la comprobación posterior: simula un PUT que además
            // movió el costo.
            if (tocaOtraCosa && permiso.get(id) === true) f.inventory.unitCost = 999;
            return f;
          }
          if (metodo === 'PUT' && ruta.startsWith('/items/')) {
            const id = Number(ruta.split('/').pop());
            registro.puts.push({ id, cuerpo });
            permiso.set(id, true);
            return { id };
          }
          throw new Error(`llamada no esperada: ${metodo} ${ruta}`);
        }
      })
    }
  };

  const Servicio = require(rutaServicio);
  return { servicio: new Servicio(), registro };
}

describe('la factura pasa sin que nadie entre a Alegra', () => {
  test('se le prende el permiso al producto trabado y la factura sale', async () => {
    const { servicio, registro } = montar({
      trabados: [101], nombres: { 101: 'PICHEL PLASTICO STAMPO 4 LITROS C/TAPA' }
    });

    const r = await servicio.createInvoice(FACTURA, null);

    assert.equal(r.data.id, 9001, 'la factura tenía que salir');
    assert.equal(registro.puts.length, 1);
    assert.equal(registro.puts[0].id, 101);
    assert.equal(registro.posts, 2, 'un intento que falla y el reenvío');
  });

  test('solo se toca el producto que Alegra nombró', async () => {
    // Prenderle el permiso a otro sería cambiar configuración que nadie pidió.
    const { servicio, registro } = montar({
      trabados: [101], nombres: { 101: 'PICHEL PLASTICO STAMPO', 202: 'JABONERA PLASTICA 1X2' }
    });

    await servicio.createInvoice(FACTURA, null);

    assert.deepEqual(registro.puts.map(p => p.id), [101]);
  });

  test('si hay dos trabados, los destraba de a uno', async () => {
    // Alegra nombra uno por vez: hace falta volver a intentar.
    const { servicio, registro } = montar({
      trabados: [101, 202], nombres: { 101: 'PICHEL PLASTICO STAMPO', 202: 'JABONERA PLASTICA 1X2' }
    });

    const r = await servicio.createInvoice(FACTURA, null);

    assert.equal(r.data.id, 9001);
    assert.deepEqual(registro.puts.map(p => p.id).sort(), [101, 202]);
  });
});

describe('qué se le manda a Alegra al destrabar', () => {
  test('va el permiso con la unidad y el costo que YA tenía', async () => {
    // `unit` y `unitCost` son obligatorios dentro de `inventory`: si no van,
    // se borran. Y son los del artículo, no valores nuevos.
    const { servicio, registro } = montar({ trabados: [101], nombres: { 101: 'PICHEL' } });
    await servicio.createInvoice(FACTURA, null);

    assert.deepEqual(registro.puts[0].cuerpo, {
      inventory: { unit: 'unit', unitCost: 700, negativeSale: true }
    });
  });

  test('NUNCA se mandan las bodegas', async () => {
    // `warehouses` lleva `initialQuantity`: mandarlo podría reescribir las
    // existencias de un producto real.
    const { servicio, registro } = montar({ trabados: [101], nombres: { 101: 'PICHEL' } });
    await servicio.createInvoice(FACTURA, null);

    assert.ok(!('warehouses' in registro.puts[0].cuerpo.inventory));
    assert.ok(!('availableQuantity' in registro.puts[0].cuerpo.inventory));
  });

  test('se vuelve a leer el artículo para comprobar qué quedó', async () => {
    const { servicio, registro } = montar({ trabados: [101], nombres: { 101: 'PICHEL' } });
    await servicio.createInvoice(FACTURA, null);

    assert.ok(registro.gets.filter(id => id === 101).length >= 2, 'una lectura antes y otra después');
  });
});

describe('cuándo NO se toca nada', () => {
  test('si el rechazo no es por stock, el error sube tal cual', async () => {
    const { servicio, registro } = montar();
    // Un rechazo distinto: un descuento sin tipo.
    servicio.client = {
      request: async () => {
        const e = new Error('Request failed with status code 400');
        e.response = { status: 400, data: { message: 'El tipo de descuento es requerido cuando se aplica un descuento' } };
        throw e;
      }
    };

    await assert.rejects(servicio.createInvoice(FACTURA, null), /status code 400/);
    assert.equal(registro.puts.length, 0, 'no se puede tocar un producto por un error que no es de stock');
  });

  test('si el mensaje no nombra ningún producto de la factura, no se adivina', async () => {
    // Alegra puede cambiar el texto. Antes que tocar el producto equivocado,
    // se deja subir el error y que una persona decida.
    const { servicio, registro } = montar();
    servicio.client = {
      request: async (metodo, ruta) => {
        if (metodo === 'POST') throw errorSinStock('UN PRODUCTO QUE NO ESTÁ EN ESTA FACTURA');
        if (metodo === 'GET') return ficha(Number(ruta.split('/').pop()), 'OTRA COSA', false);
        registro.puts.push({ ruta });
        return {};
      }
    };

    await assert.rejects(servicio.createInvoice(FACTURA, null), /status code 400/);
    assert.equal(registro.puts.length, 0);
  });

  test('con FACTURAR_SIN_STOCK=false no se destraba nada', async () => {
    const previo = process.env.FACTURAR_SIN_STOCK;
    process.env.FACTURAR_SIN_STOCK = 'false';
    try {
      const { servicio, registro } = montar({ trabados: [101], nombres: { 101: 'PICHEL' } });
      await assert.rejects(servicio.createInvoice(FACTURA, null), /status code 400/);
      assert.equal(registro.puts.length, 0);
    } finally {
      if (previo === undefined) delete process.env.FACTURAR_SIN_STOCK;
      else process.env.FACTURAR_SIN_STOCK = previo;
    }
  });
});

describe('la comprobación de después', () => {
  test('si el PUT movió el costo, se avisa y no se sigue como si nada', async () => {
    const { servicio } = montar({ trabados: [101], nombres: { 101: 'PICHEL' }, tocaOtraCosa: true });

    // El permiso queda puesto, así que la factura sale; lo que importa es que
    // el cambio inesperado quedó registrado para poder revisarlo.
    const r = await servicio.createInvoice(FACTURA, null);
    assert.equal(r.data.id, 9001);
  });
});

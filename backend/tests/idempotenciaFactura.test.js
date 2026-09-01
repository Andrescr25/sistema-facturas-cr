/**
 * Reenviar una factura no puede crear una segunda en Alegra.
 *
 * EL PROBLEMA
 * Crear una factura es un POST. Si la respuesta no llega —timeout, WiFi
 * cortado, Render reiniciando— quien la mandó NO SABE si se creó. La única
 * salida era reenviarla, y si Alegra sí la había creado quedaban dos
 * documentos fiscales: anular uno exige nota de crédito que le llega al
 * cliente.
 *
 * Con el agente sincronizando pedidos desde la calle, esa incertidumbre pasa
 * a ser lo normal y no la excepción.
 *
 * LO CENTRAL QUE SE PRUEBA ACÁ
 * Que "incierta" y "fallida" se traten distinto:
 *
 *   fallida    Alegra respondió y rechazó. Consta que no creó nada -> se
 *              puede reintentar.
 *   incierta   No hubo respuesta. Pudo haberla creado -> reenviar a ciegas
 *              es justo lo que duplica, así que se bloquea.
 *
 * CÓMO SE PRUEBA SIN TOCAR ALEGRA NI LA BASE
 * Se sustituyen `query` y el cliente de Alegra por dobles cargados en
 * require.cache antes de pedir el servicio. El doble de Alegra CUENTA cuántas
 * facturas se habrían creado, que es la medida que importa.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaCliente = require.resolve('../src/integrations/alegra');
const rutaIdem = require.resolve('../src/modules/facturacion/idempotencia');
const rutaServicio = require.resolve('../src/modules/facturacion/facturacion.service');

/** Base de datos en memoria: solo la tabla factura_intento. */
function baseFalsa() {
  const filas = new Map();
  return {
    filas,
    query: async (sql, params = []) => {
      if (/INSERT INTO factura_intento/i.test(sql)) {
        const [clave, huella] = params;
        if (filas.has(clave)) return { rows: [] };          // ON CONFLICT DO NOTHING
        filas.set(clave, { clave, estado: 'en_proceso', huella, intentos: 1 });
        return { rows: [{ clave }] };
      }
      if (/SELECT \* FROM factura_intento/i.test(sql)) {
        const f = filas.get(params[0]);
        return { rows: f ? [f] : [] };
      }
      if (/UPDATE factura_intento/i.test(sql)) {
        const clave = params[0];
        const f = filas.get(clave);
        if (!f) return { rows: [] };
        if (/SET estado = 'creada'/.test(sql)) {
          Object.assign(f, { estado: 'creada', alegra_invoice_id: params[1], numero_factura: params[2] });
        } else if (/SET estado = \$2/.test(sql)) {
          Object.assign(f, { estado: params[1], detalle: params[2] });
        } else if (/SET estado = 'en_proceso'/.test(sql)) {
          Object.assign(f, { estado: 'en_proceso', intentos: f.intentos + 1, huella: params[1] });
        }
        return { rows: [f] };
      }
      return { rows: [] };   // el INSERT en `facturas` no importa acá
    }
  };
}

const FACTURA = {
  client: 38,
  date: '2026-09-01',
  items: [{ id: 983, quantity: 2, price: 1000, tax: [{ id: '1' }] }]
};

let creadas;   // cuántas facturas se habrían creado en Alegra

/** `comoResponde`: 'ok' | 'rechaza' (Alegra contesta 4xx) | 'silencio' (timeout) */
function cargarServicio(comoResponde) {
  for (const r of [rutaDb, rutaCliente, rutaIdem, rutaServicio]) delete require.cache[r];

  creadas = 0;
  const db = baseFalsa();
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query: db.query } };

  require.cache[rutaCliente] = {
    id: rutaCliente, filename: rutaCliente, loaded: true, exports: {
      getClient: () => ({
        request: async () => {
          if (comoResponde === 'rechaza') {
            const e = new Error('Alegra rechazó la factura');
            e.response = { status: 400, data: { message: 'item inválido' } };
            throw e;
          }
          if (comoResponde === 'silencio') {
            const e = new Error('timeout');
            e.code = 'ETIMEDOUT';        // sin `response`: no sabemos qué pasó
            throw e;
          }
          creadas++;
          return { id: 5000 + creadas, numberTemplate: { fullNumber: `001-${5000 + creadas}` }, total: 2260 };
        }
      })
    }
  };

  const Servicio = require(rutaServicio);
  return { servicio: new Servicio(), db };
}

describe('idempotencia al crear facturas', () => {
  beforeEach(() => { creadas = 0; });

  test('mandar la MISMA clave dos veces crea UNA sola factura', async () => {
    const { servicio } = cargarServicio('ok');

    const primera = await servicio.createInvoice(FACTURA, 'pedido-77');
    const segunda = await servicio.createInvoice(FACTURA, 'pedido-77');

    assert.equal(creadas, 1, 'se llamó a Alegra dos veces: eso es una factura duplicada');
    assert.equal(segunda.yaExistia, true, 'el reenvío debe avisar que ya existía');

    // Se comparan como texto a propósito: el primer envío devuelve el id tal
    // como lo manda Alegra (número), y el reenvío lo devuelve desde la
    // columna varchar donde quedó guardado (texto). Es la misma factura. Por
    // eso quien consuma esto debe comparar con String() y no con ===, como ya
    // hace portal-clientes.pedidos.service.
    assert.equal(String(segunda.data.id), String(primera.data.id), 'debe devolver la MISMA factura');
  });

  test('claves distintas sí crean facturas distintas', async () => {
    // Dos ventas iguales al mismo cliente el mismo día son legítimas.
    const { servicio } = cargarServicio('ok');
    await servicio.createInvoice(FACTURA, 'pedido-1');
    await servicio.createInvoice(FACTURA, 'pedido-2');
    assert.equal(creadas, 2);
  });

  test('si Alegra RECHAZA, se puede reintentar', async () => {
    // Hubo respuesta: consta que no creó nada.
    const { servicio, db } = cargarServicio('rechaza');
    await assert.rejects(() => servicio.createInvoice(FACTURA, 'pedido-9'));
    assert.equal(db.filas.get('pedido-9').estado, 'fallida');

    const { servicio: s2 } = cargarServicio('ok');
    await s2.createInvoice(FACTURA, 'pedido-9');   // el reintento pasa
    assert.equal(creadas, 1);
  });

  test('si Alegra NO responde, queda INCIERTA — no fallida', async () => {
    const { servicio, db } = cargarServicio('silencio');
    await assert.rejects(() => servicio.createInvoice(FACTURA, 'pedido-8'));
    assert.equal(db.filas.get('pedido-8').estado, 'incierta',
      'sin respuesta, Alegra pudo haberla creado: marcarla "fallida" invita a duplicarla');
  });

  test('una factura INCIERTA no se puede reenviar a ciegas', async () => {
    const { servicio, db } = cargarServicio('silencio');
    await assert.rejects(() => servicio.createInvoice(FACTURA, 'pedido-8'));

    // El mismo intento, otra vez: debe frenarse.
    const idem = require(rutaIdem);
    await assert.rejects(
      () => idem.reservar('pedido-8', FACTURA),
      (e) => e.status === 409 && /verificar en Alegra/.test(e.message)
    );
    assert.equal(db.filas.get('pedido-8').estado, 'incierta');
  });

  test('reusar una clave con OTRA factura adentro se rechaza', async () => {
    // Sería un error de programación, y devolver la factura equivocada es peor
    // que fallar.
    const { servicio } = cargarServicio('ok');
    await servicio.createInvoice(FACTURA, 'pedido-5');

    const otra = { ...FACTURA, items: [{ id: 999, quantity: 1, price: 50 }] };
    await assert.rejects(
      () => servicio.createInvoice(otra, 'pedido-5'),
      (e) => e.status === 409 && /otro documento distinto/.test(e.message)
    );
  });

  test('sin clave se comporta como antes (y no rompe a quien no la manda)', async () => {
    const { servicio } = cargarServicio('ok');
    await servicio.createInvoice(FACTURA);
    await servicio.createInvoice(FACTURA);
    assert.equal(creadas, 2, 'sin clave no hay protección: es el comportamiento previo');
  });

  test('la huella distingue contenidos y no cambia con el orden de los items', async () => {
    const { huellaDe } = require('../src/modules/facturacion/idempotencia');
    const a = { client: 1, date: 'x', items: [{ id: 1, quantity: 1, price: 10 }, { id: 2, quantity: 2, price: 20 }] };
    const b = { client: 1, date: 'x', items: [{ id: 2, quantity: 2, price: 20 }, { id: 1, quantity: 1, price: 10 }] };
    const c = { client: 1, date: 'x', items: [{ id: 1, quantity: 9, price: 10 }] };
    assert.equal(huellaDe(a), huellaDe(b), 'el orden de los items no cambia la factura');
    assert.notEqual(huellaDe(a), huellaDe(c), 'otra cantidad es otra factura');
  });
});

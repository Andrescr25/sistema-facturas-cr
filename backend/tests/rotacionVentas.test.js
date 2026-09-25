/**
 * El historial de ventas y la rotación en tiempo real.
 *
 * LO QUE SE CUIDA
 *  - Solo cuenta como venta una factura EMITIDA que sigue en pie. Hasta el
 *    2026-09-25 el historial contaba 24 borradores (₡294,9 millones: cuatro
 *    con 42.057 tomacorrientes cada uno, un error de digitación nunca
 *    facturado) y 132 anuladas: el 60 % de toda la plata del historial.
 *  - Lo que quedó de un borrador o una anulada se BORRA al volver a leerla.
 *  - Una factura recién creada entra al historial en el momento, sin frenar
 *    nunca la venta.
 *  - La rotación es por UNIDADES, de los últimos 3 meses, con el día de
 *    Costa Rica; el motor de precios conserva su ventana de 12 meses.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rutaDb = require.resolve('../config/database');
const rutaAlegra = require.resolve('../src/integrations/alegra');
const rutaServicio = require.resolve('../src/modules/catalogo-agente/catalogo-agente.service');
const rutaRotacion = require.resolve('../src/modules/ventas/rotacion');
const rutaExcesos = require.resolve('../src/utils/descuentosExceso');

// Esta base local ES producción: nada de este archivo llega a la real.
function dobleDeBase(query) {
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query, pool: { query } } };
}

function montar({ facturas = [] } = {}) {
  const log = [];
  const query = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });
    if (/MAX\(fecha_emision\)/.test(texto)) return { rows: [{ ultima: '2026-09-20' }] };
    if (/^DELETE FROM venta_historico/.test(texto)) return { rows: [] };
    return { rows: [] };
  };
  dobleDeBase(query);
  require.cache[rutaExcesos] = { id: rutaExcesos, filename: rutaExcesos, loaded: true, exports: { listarVigentes: async () => [] } };
  const pedidos = [];
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getClient: () => ({
        requestWithRetry: (fn) => fn(),
        api: {
          get: async (_ruta, { params }) => {
            pedidos.push(params);
            return { data: params.start === 0 ? facturas : [] };
          }
        }
      })
    }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log, pedidos };
}

beforeEach(() => { for (const r of [rutaDb, rutaAlegra, rutaServicio, rutaRotacion, rutaExcesos]) delete require.cache[r]; });

const factura = (id, extra = {}) => ({
  id: String(id), status: 'open', date: '2026-09-24', client: { id: '55', name: 'SUPER X' },
  items: [{ id: '688', quantity: '2', price: '1748' }], ...extra
});

describe('qué es una venta', () => {
  test('los borradores y las anuladas no; las emitidas (abiertas o cerradas) sí', () => {
    const { servicio } = montar();
    assert.equal(servicio.esVenta(factura(1, { status: 'draft' })), false);
    assert.equal(servicio.esVenta(factura(1, { status: 'void' })), false);
    assert.equal(servicio.esVenta(factura(1, { isVoidedByCreditNote: true })), false);
    assert.equal(servicio.esVenta(factura(1, { status: 'open' })), true);
    assert.equal(servicio.esVenta(factura(1, { status: 'closed' })), true);
  });

  test('las líneas repetidas del mismo producto se suman antes de guardar', () => {
    const { servicio } = montar();
    const l = servicio.lineasDeFactura(factura(7, { items: [
      { id: '688', quantity: '2', price: '1748' }, { id: '688', quantity: '3', price: '1748' }, { id: '12', quantity: '1', price: '500' }
    ] }));
    assert.deepEqual(l.filas.map((f) => [f[1], f[4]]), [['688', 5], ['12', 1]]);
    assert.deepEqual([...l.productos], ['688', '12']);
  });

  test('un borrador sale SIN líneas: así se borra lo que hubiera quedado de él', () => {
    const { servicio } = montar();
    const l = servicio.lineasDeFactura(factura(1079, { status: 'draft', items: [{ id: '688', quantity: '42057', price: '1748' }] }));
    assert.deepEqual(l, { facturaId: 1079, filas: [], productos: new Set() });
  });
});

describe('la sincronización con Alegra', () => {
  test('borra las líneas de las anuladas y los borradores, y guarda las emitidas', async () => {
    const { servicio, log } = montar({ facturas: [factura(1), factura(2, { status: 'void' }), factura(3, { status: 'draft' })] });
    const r = await servicio.sincronizarHistorialCompras({});
    assert.equal(r.fuera, 2);
    const insert = log.find((l) => /^INSERT INTO venta_historico/.test(l.sql));
    assert.deepEqual(insert.params.slice(0, 2), [1, '688'], 'solo la emitida se inserta');
    const borrado = log.find((l) => /^DELETE FROM venta_historico/.test(l.sql));
    const facturasTocadas = borrado.params[borrado.params.length - 1];
    assert.deepEqual([...facturasTocadas].sort(), [1, 2, 3], 'la anulada y el borrador entran al borrado');
  });

  test('el día es el de Costa Rica, no el de UTC', async () => {
    const { servicio, pedidos } = montar({ facturas: [] });
    await servicio.sincronizarHistorialCompras({});
    const { hoyEnCostaRica } = require('../src/utils/fechaCR');
    assert.equal(pedidos[0].date_before, hoyEnCostaRica());
    assert.equal(pedidos[0].date_after, '2026-09-18', 'dos días antes de la última fecha guardada');
  });
});

describe('la factura recién creada', () => {
  test('entra al historial en el momento', async () => {
    const { servicio, log } = montar();
    const r = await servicio.registrarFacturaEnHistorico(factura(9001));
    assert.equal(r.lineas, 1);
    assert.ok(log.some((l) => /^INSERT INTO venta_historico/.test(l.sql)));
  });

  test('si falla, NO tira error: la factura ya existe y la trae la sincronización', async () => {
    montar();
    require.cache[rutaDb].exports.query = async () => { throw new Error('se cayó la base'); };
    delete require.cache[rutaServicio];
    // Anulada: va directo al borrado, sin los reintentos con espera del INSERT.
    const r = await require(rutaServicio).registrarFacturaEnHistorico(factura(9002, { status: 'void' }));
    assert.equal(r.lineas, 0);
    assert.match(r.error, /se cayó/);
  });

  test('facturación la anota después de que Alegra confirmó la factura', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturacion.service.js'), 'utf8');
    const crear = fuente.slice(fuente.indexOf('async _crearEnAlegraYRegistrar'));
    const iConfirma = crear.indexOf('_mandarFacturaDestrabando');
    const iAnota = crear.indexOf('registrarFacturaEnHistorico(response)');
    assert.ok(iConfirma >= 0 && iAnota > iConfirma, 'la venta tiene que anotarse con la respuesta de Alegra, no antes');
  });
});

describe('la rotación', () => {
  const cargar = () => { dobleDeBase(async () => ({ rows: [] })); return require(rutaRotacion); };
  const { sqlRotacion, SQL_ROTACION, SQL_ROTACION_PRECIOS, VENTANA_MESES } = cargar();

  test('es por UNIDADES de los últimos 3 meses, con el día de Costa Rica', () => {
    assert.equal(VENTANA_MESES, 3);
    assert.match(SQL_ROTACION, /INTERVAL '3 months'/);
    assert.match(SQL_ROTACION, /America\/Costa_Rica/);
    assert.match(SQL_ROTACION, /ORDER BY SUM\(cantidad\) DESC/, 'el Pareto acumula unidades, no plata');
  });

  test('A hasta el 80 %, B hasta el 95 %; el que cruza el corte queda arriba', () => {
    assert.match(SQL_ROTACION, /\(v\.acumulado - v\.unidades\) < 0\.8 \* v\.total THEN 'A'/);
    assert.match(SQL_ROTACION, /\(v\.acumulado - v\.unidades\) < 0\.95 \* v\.total THEN 'B'/);
  });

  test('el motor de precios conserva su ventana de 12 meses', () => {
    assert.match(SQL_ROTACION_PRECIOS, /INTERVAL '12 months'/);
  });

  test('una ventana rara no arma SQL', () => {
    assert.throws(() => sqlRotacion('3; DROP TABLE x'));
    assert.throws(() => sqlRotacion(0));
  });

  test('nadie lee ya la foto vieja de producto_rotacion', () => {
    const buscar = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return buscar(p);
      return p.endsWith('.js') ? [p] : [];
    });
    const culpables = [...buscar(path.join(__dirname, '..', 'src')), ...buscar(path.join(__dirname, '..', 'scripts'))]
      .filter((p) => /(FROM|JOIN)\s+producto_rotacion\b/.test(fs.readFileSync(p, 'utf8')))
      .map((p) => path.relative(path.join(__dirname, '..'), p));
    assert.deepEqual(culpables, []);
  });
});

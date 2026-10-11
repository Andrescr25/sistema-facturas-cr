const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * El cierre de caja.
 *
 * "Cobros del día" responde cuánto entró. Esto responde si la caja CUADRA, que
 * es otra pregunta: la que hace aparecer un faltante el mismo día y no tres
 * semanas después.
 *
 * Lo que se cuida:
 *  - que el día sea el de Costa Rica y no el de UTC: un cobro de las 7 de la
 *    noche no puede caer en el reporte del día siguiente;
 *  - que un faltante no se pueda tapar sin explicarlo;
 *  - que un día no se cierre dos veces ni se reabra sin motivo;
 *  - que el esperado se CONGELE: si se recalculara, la diferencia que alguien
 *    firmó cambiaría sola al anular un cobro viejo.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'cuentas-por-cobrar', 'cierreCaja.service.js');

function montar({ metodos = [], cierrePrevio = null, salidas = [] } = {}) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });
    if (/FROM cierre_caja WHERE fecha/.test(texto)) return { rows: cierrePrevio ? [{ ...cierrePrevio }] : [] };
    if (/FROM pago p LEFT JOIN metodo_pago/.test(texto) && /GROUP BY/.test(texto)) return { rows: metodos };
    if (/FROM movimiento_caja/.test(texto)) return { rows: salidas };
    if (/INSERT INTO cierre_caja/.test(texto)) {
      const columnas = texto.match(/\(([^)]+)\) VALUES/)[1].split(', ').map(c => c.trim());
      return { rows: [{ id: 9, ...Object.fromEntries(columnas.map((c, i) => [c, params[i]])) }] };
    }
    if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
    return { rows: [] };
  };
  const clientePg = { query: ejecutar, release: () => {} };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => clientePg, query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log };
}

const fila = (log, patron) => log.find(l => patron.test(l.sql));
const EFECTIVO_10K = [{ clave: 'efectivo', metodo: 'Efectivo', monto: '10000.00', cantidad: 3 },
                      { clave: 'sinpe_movil', metodo: 'SINPE Móvil', monto: '5000.00', cantidad: 1 }];

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('cerrar el día', () => {
  test('cuando cuadra, no pide explicaciones', async () => {
    const { servicio, log } = montar({ metodos: EFECTIVO_10K });
    await servicio.cerrarCaja({ fecha: '2026-09-12', efectivoContado: 10000 }, 4);
    const ins = fila(log, /INSERT INTO cierre_caja/);
    assert.equal(ins.params[1], 10000, 'esperado');
    assert.equal(ins.params[2], 10000, 'contado');
    assert.equal(ins.params[3], 0, 'diferencia');
  });

  test('un faltante no se puede tapar sin explicarlo', async () => {
    const { servicio, log } = montar({ metodos: EFECTIVO_10K });
    await assert.rejects(
      servicio.cerrarCaja({ fecha: '2026-09-12', efectivoContado: 9000 }, 4),
      e => e.status === 400 && /Faltan ₡1000/.test(e.message));
    assert.equal(fila(log, /INSERT INTO cierre_caja/), undefined, 'no debió cerrar');
  });

  test('un sobrante tampoco', async () => {
    const { servicio } = montar({ metodos: EFECTIVO_10K });
    await assert.rejects(
      servicio.cerrarCaja({ fecha: '2026-09-12', efectivoContado: 10500 }, 4),
      e => e.status === 400 && /Sobran/.test(e.message));
  });

  test('con el motivo escrito, sí cierra y lo guarda', async () => {
    const { servicio, log } = montar({ metodos: EFECTIVO_10K });
    await servicio.cerrarCaja({
      fecha: '2026-09-12', efectivoContado: 9000, motivoDiferencia: 'se pagó un flete de la caja'
    }, 4);
    const ins = fila(log, /INSERT INTO cierre_caja/);
    assert.equal(ins.params[3], -1000);
    assert.match(ins.params[6], /flete/);
  });

  test('solo se compara el EFECTIVO; lo demás se cuadra con el banco', async () => {
    // Hay ₡5.000 de SINPE que no se cuentan en billetes.
    const { servicio, log } = montar({ metodos: EFECTIVO_10K });
    await servicio.cerrarCaja({ fecha: '2026-09-12', efectivoContado: 10000 }, 4);
    const ins = fila(log, /INSERT INTO cierre_caja/);
    assert.equal(ins.params[1], 10000);
    assert.match(ins.params[4], /sinpe_movil/, 'los otros métodos quedan como referencia');
  });

  test('un día no se cierra dos veces', async () => {
    const { servicio } = montar({ metodos: EFECTIVO_10K, cierrePrevio: { id: 9, fecha: '2026-09-12' } });
    await assert.rejects(servicio.cerrarCaja({ fecha: '2026-09-12', efectivoContado: 10000 }, 4),
      e => e.status === 409 && /reabrirlo/.test(e.message));
  });

  test('lo que salió de la caja se resta del esperado, y se guarda aparte', async () => {
    // Se cobraron ₡10.000 en efectivo y se le pagaron ₡3.000 a un proveedor
    // desde la caja: al contar tiene que haber ₡7.000, no un faltante de 3.000.
    const { servicio, log } = montar({
      metodos: EFECTIVO_10K,
      salidas: [{ tipo: 'pago_proveedor', documento_id: 1, contraparte: 'LIBERTY', monto: '3000.00', facturas: 'A, B' }]
    });
    await servicio.cerrarCaja({ fecha: '2026-09-12', efectivoContado: 7000 }, 4);
    const ins = fila(log, /INSERT INTO cierre_caja/);
    assert.equal(ins.params[1], 7000, 'esperado');
    assert.equal(ins.params[3], 0, 'diferencia');
    assert.equal(ins.params[8], 3000, 'salidas_efectivo');
  });

  test('solo resta lo que salió EN EFECTIVO ese día y sin anular: un SINPE no toca la caja física', async () => {
    const { servicio, log } = montar({ metodos: EFECTIVO_10K });
    await servicio.cerrarCaja({ fecha: '2026-09-12', efectivoContado: 10000 }, 4);
    const consulta = fila(log, /FROM movimiento_caja/);
    assert.match(consulta.sql, /sentido = 'salida'/);
    assert.match(consulta.sql, /anulado = FALSE/);
    assert.match(consulta.sql, /metodo_clave = 'efectivo'/);
    assert.deepEqual(consulta.params, ['2026-09-12']);
  });

  test('los cobros ANULADOS no cuentan como efectivo esperado', async () => {
    const { servicio, log } = montar({ metodos: EFECTIVO_10K });
    await servicio.cerrarCaja({ fecha: '2026-09-12', efectivoContado: 10000 }, 4);
    assert.match(fila(log, /GROUP BY/).sql, /p\.anulado = FALSE/);
  });

  test('sin el efectivo contado no se cierra', async () => {
    const { servicio } = montar({ metodos: EFECTIVO_10K });
    for (const contado of [undefined, null, '']) {
      await assert.rejects(servicio.cerrarCaja({ fecha: '2026-09-12', efectivoContado: contado }, 4),
        e => e.status === 400);
    }
  });

  test('una fecha inventada se rechaza', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.cerrarCaja({ fecha: '12/09/2026', efectivoContado: 0 }, 4),
      e => e.status === 400);
  });
});

describe('el día', () => {
  test('es el de Costa Rica, no el de UTC', async () => {
    // El cálculo viejo tomaba `fecha + 'T00:00:00.000Z'`, así que un cobro de
    // las 7 de la noche caía en el día siguiente.
    const { servicio, log } = montar({ metodos: [] });
    await servicio.resumenDelDia('2026-09-12');
    const consulta = fila(log, /FROM pago p/);
    assert.equal(consulta.params[0], '2026-09-12');
    assert.match(consulta.sql, /p\.fecha = \$1::date/);
    assert.equal(/T00:00:00/.test(consulta.sql), false);
  });

  test('sin fecha, se usa hoy en Costa Rica', async () => {
    const { servicio, log } = montar({ metodos: [] });
    const { hoyEnCostaRica } = require('../src/utils/fechaCR');
    await servicio.resumenDelDia();
    assert.equal(fila(log, /FROM pago p/).params[0], hoyEnCostaRica());
  });
});

describe('reabrir', () => {
  test('pide motivo', async () => {
    const { servicio } = montar({ cierrePrevio: { id: 9, fecha: '2026-09-12', efectivo_contado: '10000' } });
    await assert.rejects(servicio.reabrirCaja('2026-09-12', {}), e => e.status === 400);
  });

  test('queda anotado quién y por qué antes de borrar el cierre', async () => {
    const { servicio, log } = montar({
      cierrePrevio: { id: 9, fecha: '2026-09-12', efectivo_contado: '10000', diferencia: '0' }
    });
    await servicio.reabrirCaja('2026-09-12', { motivo: 'apareció un sobre con plata' }, 4);
    const bitacora = log.findIndex(l => /INSERT INTO bitacora_cambio/.test(l.sql));
    const borrado = log.findIndex(l => /DELETE FROM cierre_caja/.test(l.sql));
    assert.ok(bitacora !== -1 && bitacora < borrado, 'el rastro se escribe ANTES de borrar');
  });

  test('un día que no está cerrado no se puede reabrir', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.reabrirCaja('2026-09-12', { motivo: 'x' }), e => e.status === 404);
  });
});

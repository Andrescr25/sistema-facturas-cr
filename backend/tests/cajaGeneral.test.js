const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Caja General (decisión del usuario, 2026-09-23): todo cobro entra, todo
 * pago a proveedor o de gasto sale, y cada movimiento dice qué facturas lo
 * originaron. Se lee de la vista `movimiento_caja`, así que acá se cuida lo
 * que hace el servicio con lo que la vista devuelve: los anulados se muestran
 * pero no suman, y el período por omisión es el mes en curso de Costa Rica.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'cuentas-por-cobrar', 'cajaGeneral.service.js');

function montar(filas = []) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    log.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    return { rows: filas };
  };
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { pool: { query: ejecutar }, query: ejecutar } };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log };
}

const mov = (sentido, monto, extra = {}) => ({
  tipo: sentido === 'entrada' ? 'cobro' : 'pago_proveedor', sentido, documento_id: 1, fecha: '2026-09-10',
  monto: String(monto), contraparte: 'X', metodo: 'Efectivo', metodo_clave: 'efectivo',
  referencia: null, anulado: false, motivo_anulacion: null, facturas: 'A, B', ...extra
});

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('movimientos de Caja General', () => {
  test('entradas menos salidas, y cada movimiento con sus facturas', async () => {
    const { servicio } = montar([mov('entrada', 10000), mov('salida', 3000, { facturas: 'C' })]);
    const r = await servicio.movimientos({ desde: '2026-09-01', hasta: '2026-09-30' });
    assert.deepEqual(r.totales, { entradas: 10000, salidas: 3000, neto: 7000, cantidad: 2, anulados: 0 });
    assert.deepEqual(r.movimientos.map((m) => m.facturas), ['A, B', 'C']);
  });

  test('un anulado se muestra pero no suma', async () => {
    const { servicio } = montar([mov('entrada', 10000), mov('entrada', 5000, { anulado: true })]);
    const r = await servicio.movimientos({ desde: '2026-09-01', hasta: '2026-09-30' });
    assert.equal(r.totales.entradas, 10000);
    assert.equal(r.totales.anulados, 1);
    assert.equal(r.movimientos.length, 2);
  });

  test('sin fechas: del primero del mes a hoy, en Costa Rica', async () => {
    const { servicio, log } = montar([]);
    const { hoyEnCostaRica } = require('../src/utils/fechaCR');
    await servicio.movimientos({});
    const hoy = hoyEnCostaRica();
    assert.deepEqual(log[0].params, [`${hoy.slice(0, 8)}01`, hoy]);
  });

  test('desglose por método, con lo que entró y lo que salió por cada uno', async () => {
    const { servicio } = montar([
      mov('entrada', 10000), mov('salida', 3000),
      mov('entrada', 4000, { metodo: 'SINPE Móvil', metodo_clave: 'sinpe_movil' })
    ]);
    const r = await servicio.movimientos({ desde: '2026-09-01', hasta: '2026-09-30' });
    assert.deepEqual(r.porMetodo.find((m) => m.clave === 'efectivo'), { clave: 'efectivo', metodo: 'Efectivo', entradas: 10000, salidas: 3000 });
  });

  test('fechas al revés o mal escritas no pasan', async () => {
    const { servicio } = montar([]);
    await assert.rejects(servicio.movimientos({ desde: '2026-09-30', hasta: '2026-09-01' }), /posterior/);
    await assert.rejects(servicio.movimientos({ desde: '30/09/2026' }), /AAAA-MM-DD/);
  });
});

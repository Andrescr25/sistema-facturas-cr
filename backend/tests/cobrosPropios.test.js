const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Cobros sobre la base propia.
 *
 * Lo que se cuida acá, que es plata:
 *  - que el saldo se RELEA con bloqueo antes de aplicar: entre que la pantalla
 *    mostró ₡10.000 y alguien apretó "cobrar", otra caja pudo haber cobrado;
 *  - que "saldar total" use el saldo recién leído y no el de la pantalla;
 *  - que no se cobre más que el saldo: un excedente no es un abono;
 *  - que anular no borre, y que el saldo vuelva solo.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'cuentas-por-cobrar', 'cobros.service.js');

const FACTURA = {
  id: 500, numero: '001000014868', estado: 'emitida',
  cliente_id: 7, cliente_nombre: 'PULPERÍA LA ESQUINA',
  total: '10000.00', saldo_real: '10000.00'
};
const EFECTIVO = { id: 1, nombre: 'Efectivo', pide_referencia: false };
const SINPE = { id: 2, nombre: 'SINPE Móvil', pide_referencia: true };

function montar({ factura = FACTURA, metodo = EFECTIVO, pago = null } = {}) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });
    if (/FROM factura f WHERE f\.id = \$1 FOR UPDATE/.test(texto)) {
      return { rows: factura ? [{ ...factura }] : [] };
    }
    if (/FROM metodo_pago WHERE id/.test(texto)) return { rows: metodo ? [{ ...metodo }] : [] };
    if (/FROM pago WHERE id = \$1 FOR UPDATE/.test(texto)) return { rows: pago ? [{ ...pago }] : [] };
    if (/INSERT INTO pago \(/.test(texto)) {
      const columnas = texto.match(/\(([^)]+)\) VALUES/)[1].split(', ');
      return { rows: [{ id: 77, ...Object.fromEntries(columnas.map((c, i) => [c, params[i]])) }] };
    }
    if (/UPDATE pago/.test(texto)) return { rows: [{ id: 77, anulado: true, monto: '3000.00' }] };
    if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
    return { rows: [], rowCount: 1 };
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

// El INSERT de `pago` mezcla parámetros con un subselect (la cuenta de dinero)
// y un literal, así que la posición de la columna NO coincide con la del
// parámetro: hay 11 columnas y 9 parámetros. Se nombran los índices reales.
const PARAM = { fecha: 0, clienteId: 1, clienteNombre: 2, metodoId: 3, metodoTexto: 4,
                referencia: 5, monto: 6, observaciones: 7, usuario: 8 };

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('registrar un abono', () => {
  const BASE = { facturaId: 500, monto: 3000, metodoPagoId: 1 };

  test('el saldo se relee CON BLOQUEO antes de aplicar', async () => {
    // Sin el bloqueo, dos cajas cobrando a la vez pasan cada una su propia
    // validación y entre las dos cobran más que el saldo.
    const { servicio, log } = montar();
    await servicio.registrarAbono(BASE, 4);
    assert.match(fila(log, /FROM factura f WHERE f\.id/).sql, /FOR UPDATE/);
  });

  test('deja el abono y su enlace con la factura', async () => {
    const { servicio, log } = montar();
    const r = await servicio.registrarAbono(BASE, 4);
    assert.equal(fila(log, /INSERT INTO pago \(/).params[PARAM.monto], 3000);
    assert.deepEqual(fila(log, /INSERT INTO pago_factura/).params, [77, 500, 3000]);
    assert.equal(r.saldoAnterior, 10000);
    assert.equal(r.saldoNuevo, 7000);
  });

  test('"saldar total" usa el saldo recién leído, no el de la pantalla', async () => {
    // La pantalla creía que eran 10.000, pero otra caja ya cobró 6.000.
    const { servicio, log } = montar({ factura: { ...FACTURA, saldo_real: '4000.00' } });
    await servicio.registrarAbono({ facturaId: 500, monto: 10000, saldarTotal: true, metodoPagoId: 1 }, 4);
    assert.equal(fila(log, /INSERT INTO pago \(/).params[PARAM.monto], 4000);
  });

  test('no se cobra más que el saldo', async () => {
    // Un excedente no es un abono: es plata que hay que devolver.
    const { servicio, log } = montar();
    await assert.rejects(servicio.registrarAbono({ ...BASE, monto: 15000 }, 4),
      e => e.status === 400 && /supera el saldo/.test(e.message));
    assert.equal(fila(log, /INSERT INTO pago \(/), undefined);
  });

  test('una factura sin saldo no recibe abonos', async () => {
    const { servicio } = montar({ factura: { ...FACTURA, saldo_real: '0' } });
    await assert.rejects(servicio.registrarAbono(BASE, 4), e => e.status === 409);
  });

  test('ni una anulada, ni un borrador', async () => {
    for (const estado of ['anulada', 'borrador']) {
      const { servicio } = montar({ factura: { ...FACTURA, estado } });
      await assert.rejects(servicio.registrarAbono(BASE, 4), e => e.status === 409);
    }
  });

  test('SINPE sin referencia no se registra', async () => {
    // Un SINPE sin número es imposible de cuadrar contra el banco.
    const { servicio, log } = montar({ metodo: SINPE });
    await assert.rejects(servicio.registrarAbono({ ...BASE, metodoPagoId: 2 }, 4),
      e => e.status === 400 && /referencia/.test(e.message));
    assert.equal(fila(log, /INSERT INTO pago \(/), undefined);
  });

  test('un método inactivo tampoco', async () => {
    const { servicio } = montar({ metodo: null });
    await assert.rejects(servicio.registrarAbono(BASE, 4), e => e.status === 400);
  });

  test('sin fecha, se fecha hoy en Costa Rica', async () => {
    // No en UTC: después de las 6 de la tarde eso da mañana.
    const { servicio, log } = montar();
    const { hoyEnCostaRica } = require('../src/utils/fechaCR');
    await servicio.registrarAbono(BASE, 4);
    assert.equal(fila(log, /INSERT INTO pago \(/).params[PARAM.fecha], hoyEnCostaRica());
  });

  test('queda en la bitácora con el saldo antes y después', async () => {
    const { servicio, log } = montar();
    await servicio.registrarAbono(BASE, 4);
    const bitacora = fila(log, /INSERT INTO bitacora_cambio/);
    assert.match(JSON.stringify(bitacora.params), /saldoAntes/);
    assert.match(JSON.stringify(bitacora.params), /001000014868/);
  });
});

describe('anular un abono', () => {
  test('pide el motivo', async () => {
    const { servicio } = montar({ pago: { id: 77, anulado: false } });
    await assert.rejects(servicio.anularAbono(77, {}), e => e.status === 400);
  });

  test('no borra: lo deja anulado con su motivo', async () => {
    const { servicio, log } = montar({ pago: { id: 77, anulado: false, monto: '3000.00' } });
    const r = await servicio.anularAbono(77, { motivo: 'se registró en la factura equivocada' }, 4);
    assert.equal(r.anulado, true);
    assert.equal(fila(log, /DELETE FROM/), undefined, 'no debe borrar nada');
    assert.match(fila(log, /UPDATE pago/).params[1], /factura equivocada/);
  });

  test('anular lo ya anulado no es un error', async () => {
    const { servicio, log } = montar({ pago: { id: 77, anulado: true, monto: '3000.00' } });
    const r = await servicio.anularAbono(77, { motivo: 'otra vez' }, 4);
    assert.equal(r.anulado, true);
    assert.equal(fila(log, /UPDATE pago/), undefined, 'no vuelve a escribir');
  });
});

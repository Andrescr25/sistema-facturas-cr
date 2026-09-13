const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Las facturas pendientes que ve el cliente en el portal.
 *
 * Esta pantalla la abre alguien de afuera, desde su teléfono, y lo que dice se
 * convierte en una conversación en el mostrador. Se cuidan tres cosas:
 *
 * 1. QUE EL SALDO SEA EL DE HOY, no el de la última sincronización. Antes
 *    salía del espejo `cuentas_por_cobrar`, que se copiaba de Alegra cada 30
 *    minutos; al comparar las dos fuentes había dos facturas ya pagadas en
 *    efectivo que el espejo seguía mostrando pendientes.
 * 2. QUE SEAN SUS FACTURAS Y NO LAS DE OTRO. El filtro sale del token y se
 *    hace por id, nunca por nombre.
 * 3. QUE "VENCIDA" SIGNIFIQUE VENCIDA EN COSTA RICA, no en la hora del
 *    servidor, que en Render corre en UTC.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaAuth = path.join(__dirname, '..', 'src', 'modules', 'portal-clientes', 'portal-clientes.auth.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'portal-clientes', 'portal-clientes.saldo.service.js');

/** Carga el servicio con una base falsa que devuelve `filas` y anota la consulta. */
function cargar(filas = []) {
  const visto = { sql: null, params: null };
  const ejecutar = async (sql, params) => {
    visto.sql = sql;
    visto.params = params;
    return { rows: filas };
  };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaAuth];
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), visto };
}

const { hoyEnCostaRica } = require('../src/utils/fechaCR');

/** Una fila como la devuelve Postgres, con el atraso ya restado por la base. */
const fila = (extra = {}) => ({
  numero: '001000014842', fecha: '2026-09-08', fecha_vencimiento: '2026-09-08',
  total: '9232.00', cobrado: '0', acreditado: '0',
  condicion_venta: 'contado', plazo_texto: 'De contado', dias_atraso: 0,
  ...extra
});

describe('de dónde salen los saldos del portal', () => {
  test('lee las facturas propias, no el espejo de Alegra', async () => {
    const { servicio, visto } = cargar();
    await servicio.facturasPendientes('123');

    assert.match(visto.sql, /FROM factura f/);
    assert.doesNotMatch(
      visto.sql, /cuentas_por_cobrar/,
      'volvió al espejo: ahí el saldo tiene hasta media hora de atraso y muestra como deuda lo que el cliente ya pagó'
    );
  });

  test('el saldo se calcula, no se lee de una columna guardada', async () => {
    const { servicio, visto } = cargar();
    await servicio.facturasPendientes('123');

    // Total menos cobros VIGENTES menos notas VIGENTES. Sin el filtro de
    // anulados, un cobro que se revierte dejaría la factura como pagada.
    assert.match(visto.sql, /pago_factura/);
    assert.match(visto.sql, /p\.anulado = FALSE/);
    assert.match(visto.sql, /nota_credito_factura/);
    assert.match(visto.sql, /nc\.estado <> 'anulada'/);
  });

  test('filtra por el id del cliente, nunca por su nombre', async () => {
    const { servicio, visto } = cargar();
    await servicio.facturasPendientes('456');

    assert.match(visto.sql, /c\.alegra_id = \$1/);
    assert.strictEqual(visto.params[0], '456', 'el filtro tiene que salir del token');
    assert.doesNotMatch(
      visto.sql, /cliente_nombre/,
      'calzar por nombre le enseñaría a un cliente las facturas de otro: hay fichas que se llaman casi igual'
    );
  });

  test('solo las emitidas: una anulada no se le cobra a nadie', async () => {
    const { servicio, visto } = cargar();
    await servicio.facturasPendientes('123');
    assert.match(visto.sql, /f\.estado = 'emitida'/);
  });

  test('el día de corte es el de Costa Rica, no el del servidor', async () => {
    const { servicio, visto } = cargar();
    await servicio.facturasPendientes('123');

    // En Render el servidor corre en UTC: después de las 6 de la tarde, CURRENT_DATE
    // ya es mañana y una factura que vence hoy saldría vencida de un día.
    assert.strictEqual(visto.params[1], hoyEnCostaRica());
    assert.doesNotMatch(visto.sql, /CURRENT_DATE/);
  });
});

describe('lo que el cliente lee de cada factura', () => {
  test('una vencida dice cuántos días lleva', async () => {
    const { servicio } = cargar([fila({ dias_atraso: 5 })]);
    const r = await servicio.facturasPendientes('123');

    assert.strictEqual(r.facturas[0].vencida, true);
    assert.strictEqual(r.facturas[0].diasVencida, 5);
  });

  test('una que vence hoy todavía no está vencida', async () => {
    const { servicio } = cargar([fila({ dias_atraso: 0 })]);
    const r = await servicio.facturasPendientes('123');
    assert.strictEqual(r.facturas[0].vencida, false);
  });

  test('una que vence en tres días no aparece con días negativos', async () => {
    const { servicio } = cargar([fila({ dias_atraso: -3 })]);
    const r = await servicio.facturasPendientes('123');

    assert.strictEqual(r.facturas[0].vencida, false);
    assert.strictEqual(r.facturas[0].diasVencida, 0, 'un "-3" en la pantalla no le dice nada a nadie');
  });

  test('una sin fecha de vencimiento no se declara vencida por las dudas', async () => {
    const { servicio } = cargar([fila({ fecha_vencimiento: null, dias_atraso: null })]);
    const r = await servicio.facturasPendientes('123');
    assert.strictEqual(r.facturas[0].vencida, false);
  });

  test('lo acreditado por nota de crédito cuenta como abonado', async () => {
    // Para el cliente "ya no lo debo" es una sola cosa; separar el cobro de la
    // nota acá solo lo haría llamar a preguntar.
    const { servicio } = cargar([fila({ total: '10000', cobrado: '3000', acreditado: '2000' })]);
    const r = await servicio.facturasPendientes('123');

    assert.strictEqual(r.facturas[0].pagado, 5000);
    assert.strictEqual(r.facturas[0].saldo, 5000);
  });
});

describe('los totales de arriba', () => {
  test('suma el saldo de todas y aparte lo vencido', async () => {
    const { servicio } = cargar([
      fila({ numero: 'A', total: '9232', dias_atraso: 5 }),
      fila({ numero: 'B', total: '226402', dias_atraso: -9 })
    ]);
    const r = await servicio.facturasPendientes('123');

    assert.strictEqual(r.cantidad, 2);
    assert.strictEqual(r.total, 235634);
    assert.strictEqual(r.vencido, 9232, 'lo vencido es lo urgente: no puede incluir lo que aún no vence');
  });

  test('un cliente al día ve ceros, no una pantalla rota', async () => {
    const { servicio } = cargar([]);
    const r = await servicio.facturasPendientes('123');

    assert.deepStrictEqual(r, { facturas: [], total: 0, vencido: 0, cantidad: 0 });
  });
});

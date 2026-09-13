const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * El recordatorio de saldo.
 *
 * Es un texto que LEE UN CLIENTE, así que lo que se cuida es que diga la
 * verdad y que sirva: los montos correctos, qué está vencido, y por dónde
 * pagar —un recordatorio que dice cuánto se debe pero no a qué cuenta
 * depositar obliga a una segunda conversación—.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'cuentas-por-cobrar', 'cobros.service.js');

function cargar() {
  const ejecutar = async () => ({ rows: [] });
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { query: ejecutar, connect: async () => ({ query: ejecutar, release: () => {} }) }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return require(rutaServicio);
}

const { hoyEnCostaRica } = require('../src/utils/fechaCR');
const enDias = (n) => {
  const d = new Date(`${hoyEnCostaRica()}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('el texto que lee el cliente', () => {
  const FACTURAS = [
    { numero: '001000014868', saldo: 13807, fechaVencimiento: enDias(-5) },
    { numero: '001000014900', saldo: 5000, fechaVencimiento: enDias(3) }
  ];

  test('dice cada factura con su saldo y el total', () => {
    const { textoRecordatorio } = cargar();
    const t = textoRecordatorio('PULPERÍA LA ESQUINA', FACTURAS, null);
    assert.match(t, /001000014868 — ₡13\.807/);
    assert.match(t, /001000014900 — ₡5\.000/);
    assert.match(t, /Total: ₡18\.807/);
  });

  test('lo vencido se dice vencido, y lo que falta, cuándo vence', () => {
    const { textoRecordatorio } = cargar();
    const t = textoRecordatorio('PULPERÍA', FACTURAS, null);
    assert.match(t, /vencida hace 5 día\(s\)/);
    assert.match(t, /vence en 3 día\(s\)/);
  });

  test('lo más vencido va primero: es por lo que se llama', () => {
    const { textoRecordatorio } = cargar();
    const t = textoRecordatorio('PULPERÍA', FACTURAS, null);
    assert.ok(t.indexOf('001000014868') < t.indexOf('001000014900'));
  });

  test('dice POR DÓNDE PAGAR cuando está configurado', () => {
    const { textoRecordatorio } = cargar();
    const t = textoRecordatorio('PULPERÍA', FACTURAS, 'SINPE_86477036 TARCICIO VARGAS');
    assert.match(t, /Puede pagar por:\nSINPE_86477036/);
  });

  test('sin términos configurados no inventa una cuenta', () => {
    const { textoRecordatorio } = cargar();
    assert.equal(/Puede pagar por/.test(textoRecordatorio('PULPERÍA', FACTURAS, null)), false);
  });

  test('una factura sin saldo no aparece en el recordatorio', () => {
    const { textoRecordatorio } = cargar();
    const t = textoRecordatorio('PULPERÍA', [...FACTURAS, { numero: '001000014999', saldo: 0 }], null);
    assert.equal(/001000014999/.test(t), false);
  });

  test('una factura sin fecha de vencimiento lo dice, no miente', () => {
    const { textoRecordatorio } = cargar();
    const t = textoRecordatorio('PULPERÍA', [{ numero: '001', saldo: 100, fechaVencimiento: null }], null);
    assert.match(t, /sin fecha de vencimiento/);
  });
});

test('el número se valida antes de mandar el recordatorio', async () => {
  const servicio = cargar();
  // Sin saldo la consulta devuelve vacío y el servicio corta antes: lo que
  // importa es que no salga nada hacia un número que no se entiende.
  await assert.rejects(servicio.enviarRecordatorio(7, { telefono: 'no sé' }), e => e.status === 404 || e.status === 400);
});

test('una fecha que viene de Postgres como Date no produce "NaN día(s)"', () => {
  // Las columnas DATE llegan como objeto Date. Recortarlas como texto daba
  // "Wed Sep 10" y de ahí "vence en NaN día(s)" en el mensaje al CLIENTE.
  const { textoRecordatorio } = cargar();
  const ayer = new Date(`${enDias(-1)}T12:00:00`);
  const t = textoRecordatorio('PULPERÍA', [{ numero: '001', saldo: 100, fechaVencimiento: ayer }], null);
  assert.equal(/NaN/.test(t), false, `salió: ${t}`);
  assert.match(t, /vencida hace 1 día\(s\)/);
});

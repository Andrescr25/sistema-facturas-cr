const { test, describe } = require('node:test');
const assert = require('node:assert');
const { tomarConsecutivo, formatearNumero, listarSeries } = require('../src/modules/facturacion/consecutivo');

/**
 * El número de la factura propia.
 *
 * LO QUE CUIDA ESTA PRUEBA
 * Que dos facturas no puedan salir con el mismo número (de ahí el FOR UPDATE),
 * que el número se arme como corresponde a cada serie —la no electrónica pega
 * el consecutivo tal cual y la electrónica lo rellena a 10 dígitos— y que una
 * serie inactiva no emita, porque la electrónica está preparada pero apagada
 * hasta que se decida emitir ante Hacienda.
 */

/** Un cliente de Postgres falso que registra lo que se le pide. */
function clienteFalso(serie) {
  const consultas = [];
  return {
    consultas,
    query: async (sql, params) => {
      const texto = String(sql).replace(/\s+/g, ' ').trim();
      consultas.push({ sql: texto, params });
      if (/FROM serie_consecutivo/.test(texto) && /FOR UPDATE/.test(texto)) {
        return { rows: serie ? [{ ...serie }] : [] };
      }
      return { rows: [], rowCount: 1 };
    }
  };
}

const SERIE_DIARIA = {
  id: 1, serie: '00100001', siguiente: '4869', ancho_consecutivo: 0, electronica: false, activo: true
};
const SERIE_ELECTRONICA = {
  id: 2, serie: '0010000101', siguiente: '2463', ancho_consecutivo: 10, electronica: true, activo: true
};

describe('cómo se arma el número', () => {
  test('la serie del día a día pega el consecutivo tal cual', () => {
    // Así son las 4.837 facturas ya emitidas: 00100001 + 4868.
    assert.equal(formatearNumero('00100001', 4869, 0), '001000014869');
    assert.equal(formatearNumero('00100001', 999, 0), '00100001999');
  });

  test('la electrónica rellena el consecutivo a 10 dígitos', () => {
    assert.equal(formatearNumero('0010000101', 2463, 10), '00100001010000002463');
    assert.equal(formatearNumero('0010000103', 82, 10), '00100001030000000082');
  });
});

describe('tomar el consecutivo', () => {
  test('lo toma con FOR UPDATE: dos cajas a la vez no pueden leer el mismo', async () => {
    // Sin el bloqueo, las dos leerían 4869 y emitirían el mismo número.
    const cliente = clienteFalso(SERIE_DIARIA);
    await tomarConsecutivo(cliente, 'factura');
    assert.match(cliente.consultas[0].sql, /FOR UPDATE/);
  });

  test('devuelve el número armado y deja el siguiente listo', async () => {
    const cliente = clienteFalso(SERIE_DIARIA);
    const r = await tomarConsecutivo(cliente, 'factura');
    assert.equal(r.consecutivo, 4869);
    assert.equal(r.numero, '001000014869');
    assert.equal(r.serie, '00100001');
    assert.equal(r.electronica, false);

    const update = cliente.consultas.find(c => /UPDATE serie_consecutivo/.test(c.sql));
    assert.match(update.sql, /siguiente = siguiente \+ 1/);
    assert.deepEqual(update.params, [1]);
  });

  test('la electrónica sale con su formato, y se pide por separado del tipo', async () => {
    // "Electrónica" no es otro tipo de documento: es la misma factura emitida
    // de otra forma. Por eso viaja aparte y las dos series conviven.
    const cliente = clienteFalso(SERIE_ELECTRONICA);
    const r = await tomarConsecutivo(cliente, 'factura', { electronica: true });
    assert.equal(r.numero, '00100001010000002463');
    assert.equal(r.electronica, true);
    assert.deepEqual(cliente.consultas[0].params, ['factura', true]);
  });

  test('sin decir nada se toma la serie NO electrónica, que es la que se usa hoy', async () => {
    const cliente = clienteFalso(SERIE_DIARIA);
    await tomarConsecutivo(cliente, 'factura');
    assert.deepEqual(cliente.consultas[0].params, ['factura', false]);
  });

  test('una serie inactiva no emite: la electrónica está preparada pero apagada', async () => {
    const cliente = clienteFalso({ ...SERIE_ELECTRONICA, activo: false });
    await assert.rejects(
      tomarConsecutivo(cliente, 'factura', { electronica: true }),
      e => e.status === 400 && /inactiva/.test(e.message)
    );
    // Y no gasta el número.
    assert.equal(cliente.consultas.some(c => /UPDATE serie_consecutivo/.test(c.sql)), false);
  });

  test('sin serie configurada se dice, en vez de emitir un número inventado', async () => {
    const cliente = clienteFalso(null);
    await assert.rejects(
      tomarConsecutivo(cliente, 'factura'),
      e => e.status === 400 && /No hay una serie configurada/.test(e.message)
    );
  });

  test('una serie sin prefijo tampoco emite', async () => {
    const cliente = clienteFalso({ ...SERIE_DIARIA, serie: null });
    await assert.rejects(tomarConsecutivo(cliente, 'factura'), e => e.status === 400 && /prefijo/.test(e.message));
  });
});

describe('las series que se muestran en Configuración', () => {
  test('cada una dice cuál sería su próximo número', async () => {
    const ejecutor = {
      query: async () => ({ rows: [SERIE_DIARIA, SERIE_ELECTRONICA].map(s => ({ ...s, tipo_documento: 'x', descripcion: 'y', sucursal: '001', terminal: '00001' })) })
    };
    const series = await listarSeries(ejecutor);
    assert.equal(series[0].proximoNumero, '001000014869');
    assert.equal(series[1].proximoNumero, '00100001010000002463');
    assert.equal(series[0].siguiente, 4869, 'el BIGINT de pg llega como texto y se entrega como número');
  });
});

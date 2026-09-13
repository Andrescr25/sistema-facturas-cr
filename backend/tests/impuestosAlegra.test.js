/**
 * Tests del helper de impuestos (utils/impuestosAlegra.js)
 *
 * Este helper decide qué tarifa de IVA se envía a Alegra por cada línea
 * de factura, así que un error aquí significa impuestos mal declarados.
 *
 * Ejecutar con: npm test  (usa el test runner nativo de Node)
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  calcularPorcentajeIva,
  normalizarImpuestos,
  obtenerImpuestoAlegra,
  cargarImpuestosAlegra,
  _reiniciarCache
} = require('../utils/impuestosAlegra');

// Lo que devolvió GET /taxes de la cuenta real el 11 de setiembre de 2026.
const { impuestos: TAXES_REALES } = require('./fixtures/impuestosAlegra.json');
const IMPUESTOS = normalizarImpuestos(TAXES_REALES);

describe('calcularPorcentajeIva', () => {
  test('calcula 13% para la tarifa general', () => {
    // subtotal 100, impuesto 13 → total línea 113
    assert.equal(calcularPorcentajeIva({ impuesto: 13, totalLinea: 113 }), 13);
  });

  test('calcula tarifas reducidas de Costa Rica (1%, 2%, 4%, 8%)', () => {
    assert.equal(calcularPorcentajeIva({ impuesto: 1, totalLinea: 101 }), 1);
    assert.equal(calcularPorcentajeIva({ impuesto: 2, totalLinea: 102 }), 2);
    assert.equal(calcularPorcentajeIva({ impuesto: 4, totalLinea: 104 }), 4);
    assert.equal(calcularPorcentajeIva({ impuesto: 8, totalLinea: 108 }), 8);
  });

  test('devuelve 0 para líneas exentas (impuesto 0)', () => {
    assert.equal(calcularPorcentajeIva({ impuesto: 0, totalLinea: 100 }), 0);
  });

  test('maneja montos reales con decimales', () => {
    // subtotal 875.00, IVA 13% = 113.75 → total 988.75
    const pct = calcularPorcentajeIva({ impuesto: 113.75, totalLinea: 988.75 });
    assert.ok(Math.abs(pct - 13) < 0.001, `esperaba ~13, obtuve ${pct}`);
  });

  test('acepta valores como string (vienen así de algunos parsers)', () => {
    assert.equal(calcularPorcentajeIva({ impuesto: '13', totalLinea: '113' }), 13);
  });

  test('devuelve 0 con datos inválidos en vez de NaN o Infinity', () => {
    assert.equal(calcularPorcentajeIva({ impuesto: null, totalLinea: null }), 0);
    assert.equal(calcularPorcentajeIva({ impuesto: undefined, totalLinea: undefined }), 0);
    assert.equal(calcularPorcentajeIva({ impuesto: 'abc', totalLinea: 'xyz' }), 0);
    // impuesto mayor que el total (subtotal negativo) no debe explotar
    assert.equal(calcularPorcentajeIva({ impuesto: 150, totalLinea: 100 }), 0);
    // total 0
    assert.equal(calcularPorcentajeIva({ impuesto: 13, totalLinea: 0 }), 0);
  });
});

describe('normalizarImpuestos — la lista real de la cuenta', () => {
  test('una tarifa por porcentaje, activa y de IVA, con el id que tiene en Alegra', () => {
    assert.deepEqual(
      IMPUESTOS.map(t => [t.porcentaje, t.id]),
      [[0, 2], [0.5, 3], [1, 4], [2, 5], [4, 6], [8, 7], [13, 1]]
    );
  });

  test('los factores de bienes usados (inactivos) no entran', () => {
    for (const p of [4.4, 5, 5.8, 6.5]) {
      assert.equal(IMPUESTOS.some(t => t.porcentaje === p), false, `${p} % no debería estar`);
    }
  });

  test('para 0 % elige "IVA exento", no el del artículo 32 ni el sin derecho a crédito', () => {
    const cero = IMPUESTOS.find(t => t.porcentaje === 0);
    assert.equal(cero.id, 2);
    assert.match(cero.nombre, /exento/i);
  });

  test('los ids salen de los datos: si cambian en Alegra, se sigue eligiendo bien', () => {
    const renumerados = TAXES_REALES.map(t => ({ ...t, id: String(Number(t.id) + 100) }));
    const tax = obtenerImpuestoAlegra({ impuesto: 1, totalLinea: 101 }, normalizarImpuestos(renumerados));
    assert.equal(tax.id, 104);
  });
});

describe('obtenerImpuestoAlegra', () => {
  test('cada tarifa va al id que tiene en esta cuenta, no al del mapeo viejo', () => {
    // El mapeo viejo mandaba 1 % → 6 (que es 4 %), 2 % → 7 (8 %), 0 % → 3 (0,5 %).
    const casos = [
      { impuesto: 13, totalLinea: 113, id: 1 },
      { impuesto: 8, totalLinea: 108, id: 7 },
      { impuesto: 4, totalLinea: 104, id: 6 },
      { impuesto: 2, totalLinea: 102, id: 5 },
      { impuesto: 1, totalLinea: 101, id: 4 },
      { impuesto: 0.5, totalLinea: 100.5, id: 3 }
    ];
    for (const caso of casos) {
      const tax = obtenerImpuestoAlegra(caso, IMPUESTOS);
      assert.ok(tax, `${caso.impuesto} % no fue reconocida`);
      assert.equal(tax.id, caso.id, `${caso.impuesto} %: esperaba id ${caso.id}, obtuve ${tax.id}`);
      assert.equal(Number(tax.porcentaje), Number(TAXES_REALES.find(t => Number(t.id) === tax.id).percentage),
        'el porcentaje del impuesto elegido tiene que ser el de la línea');
    }
  });

  test('una línea sin IVA va al exento (id 2), no al 0,5 %', () => {
    assert.equal(obtenerImpuestoAlegra({ impuesto: 0, totalLinea: 100 }, IMPUESTOS).id, 2);
  });

  test('tolera desviaciones menores a 0.5 % (redondeos del XML)', () => {
    assert.equal(obtenerImpuestoAlegra({ impuesto: 13.4, totalLinea: 113.4 }, IMPUESTOS).id, 1);
  });

  test('elige la tarifa más cercana', () => {
    // 1.3 % está entre 1 % (dif 0.3) y 2 % (dif 0.7) → 1 %
    assert.equal(obtenerImpuestoAlegra({ impuesto: 1.3, totalLinea: 101.3 }, IMPUESTOS).id, 4);
    assert.equal(obtenerImpuestoAlegra({ impuesto: 2.2, totalLinea: 102.2 }, IMPUESTOS).id, 5);
  });

  test('devuelve null para tarifas que no existen en vez de forzar una', () => {
    assert.equal(obtenerImpuestoAlegra({ impuesto: 6.5, totalLinea: 106.5 }, IMPUESTOS), null);
    assert.equal(obtenerImpuestoAlegra({ impuesto: 10, totalLinea: 110 }, IMPUESTOS), null);
  });

  test('en el límite de la tolerancia (exactamente 0.5 %) NO mapea', () => {
    assert.equal(obtenerImpuestoAlegra({ impuesto: 13.5, totalLinea: 113.5 }, IMPUESTOS), null);
  });

  test('sin la lista de impuestos no adivina: lanza', () => {
    assert.throws(() => obtenerImpuestoAlegra({ impuesto: 1, totalLinea: 101 }), /lista de impuestos/);
    assert.throws(() => obtenerImpuestoAlegra({ impuesto: 1, totalLinea: 101 }, []), /lista de impuestos/);
  });

  test('el archivo ya no tiene ids escritos a mano', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'utils', 'impuestosAlegra.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(fuente, /MAPEO_IMPUESTOS_ALEGRA/);
    assert.doesNotMatch(fuente, /\bid:\s*\d+/, 'volvió a aparecer un id de impuesto fijo');
  });
});

describe('cargarImpuestosAlegra', () => {
  beforeEach(() => _reiniciarCache());

  test('lee GET /taxes una vez y la reutiliza mientras está vigente', async () => {
    let llamadas = 0;
    const cliente = { get: async (ruta) => { llamadas++; assert.equal(ruta, '/taxes'); return { success: true, data: TAXES_REALES }; } };
    let reloj = 1000;
    const ahora = () => reloj;

    const lista = await cargarImpuestosAlegra({ cliente, ahora });
    assert.equal(lista.find(t => t.porcentaje === 1).id, 4);
    reloj += 60 * 60 * 1000;
    await cargarImpuestosAlegra({ cliente, ahora });
    assert.equal(llamadas, 1, 'dentro de las 6 horas no vuelve a preguntar');
    reloj += 6 * 60 * 60 * 1000;
    await cargarImpuestosAlegra({ cliente, ahora });
    assert.equal(llamadas, 2, 'vencida, vuelve a leer');
  });

  test('si Alegra no responde, falla con un mensaje en vez de inventar la lista', async () => {
    const caido = { get: async () => ({ success: false, status: 503, error: 'Service Unavailable' }) };
    await assert.rejects(cargarImpuestosAlegra({ cliente: caido }),
      e => e.status === 503 && /No se pudo leer la lista de impuestos/.test(e.message));

    const excepcion = { get: async () => { throw new Error('ECONNRESET'); } };
    await assert.rejects(cargarImpuestosAlegra({ cliente: excepcion }), e => e.status === 503);
  });

  test('una lista vacía o solo con inactivos tampoco se acepta', async () => {
    await assert.rejects(cargarImpuestosAlegra({ cliente: { get: async () => ({ success: true, data: [] }) } }), e => e.status === 503);
    const soloInactivos = TAXES_REALES.map(t => ({ ...t, status: 'inactive' }));
    await assert.rejects(cargarImpuestosAlegra({ cliente: { get: async () => ({ success: true, data: soloInactivos }) } }), e => e.status === 503);
  });
});

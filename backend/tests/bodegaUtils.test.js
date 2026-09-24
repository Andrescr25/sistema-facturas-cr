const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Funciones puras de Facturas en Bodega (frontend/src/utils/facturasBodegaUtils.js).
 * El módulo es ESM sin imports: se lee, se le quitan los `export` y se evalúa.
 */
const FUENTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'facturasBodegaUtils.js'), 'utf8');
const { formatDate, filtrarPendientesPorFecha, horaDespacho, aplicarEstadosGuardados } = new Function(
  `${FUENTE.replace(/^export /gm, '')}
   return { formatDate, filtrarPendientesPorFecha, horaDespacho, aplicarEstadosGuardados };`
)();

describe('fechas de las facturas', () => {
  test('una fecha de calendario se muestra como ESE día, no el anterior', () => {
    // new Date('2026-09-20') es medianoche UTC = 19 de setiembre a las 6 p.m. en Costa Rica.
    assert.match(formatDate('2026-09-20'), /20/);
    assert.doesNotMatch(formatDate('2026-09-20'), /19/);
  });

  test('el filtro "desde" no incluye el día anterior', () => {
    const lista = [{ fecha_emision: '2026-09-19' }, { fecha_emision: '2026-09-20' }, { fecha_emision: '2026-09-21' }];
    const r = filtrarPendientesPorFecha(lista, { fechaInicio: '2026-09-20', mostrarSinFecha: true });
    assert.deepEqual(r.map((f) => f.fecha_emision), ['2026-09-20', '2026-09-21']);
  });
});

describe('cuándo se despachó', () => {
  const ahora = new Date('2026-09-23T20:00:00Z'); // 2 p.m. en Costa Rica

  test('hoy, ayer, o la fecha', () => {
    assert.match(horaDespacho('2026-09-23T15:30:00Z', ahora), /^hoy /);
    assert.match(horaDespacho('2026-09-22T20:00:00Z', ahora), /^ayer /);
    assert.match(horaDespacho('2026-09-15T20:00:00Z', ahora), /15/);
  });

  test('"hoy" es el día de Costa Rica: las 11 p.m. del 22 en CR no son el 23', () => {
    // 2026-09-23T05:00Z = 22 de setiembre, 11 p.m. en Costa Rica.
    assert.match(horaDespacho('2026-09-23T05:00:00Z', ahora), /^ayer /);
    assert.match(horaDespacho('2026-09-23T07:00:00Z', ahora), /^hoy /);
  });

  test('sin hora (despachadas antes de que existiera), null', () => {
    assert.equal(horaDespacho(null, ahora), null);
  });
});

describe('lo ya registrado se pone sobre el borrador', () => {
  const draft = {
    'REF-A': { key: 'REF-A', referenciaReal: 'A', alegra_id: '10', tipo: null, cantidadFaltante: 0, observaciones: '' },
    'REF-B': { key: 'REF-B', referenciaReal: 'B', alegra_id: '11', tipo: null, cantidadFaltante: 0, observaciones: '' },
    'ALG-12': { key: 'ALG-12', referenciaReal: null, alegra_id: '12', tipo: null, cantidadFaltante: 0, observaciones: '' }
  };

  test('por referencia y, si no, por el id de Alegra del producto', () => {
    const r = aplicarEstadosGuardados(draft, [
      { referencia: 'B', tipoFaltante: 'parcial', cantidadFaltante: 2, observaciones: 'roto' },
      { referencia: null, alegraItemId: '12', tipoFaltante: 'total', cantidadFaltante: 5 }
    ]);
    assert.equal(r['REF-B'].tipo, 'parcial');
    assert.equal(r['REF-B'].cantidadFaltante, 2);
    assert.equal(r['REF-B'].observaciones, 'roto');
    assert.equal(r['ALG-12'].tipo, 'total');
    assert.equal(r['REF-A'].tipo, null, 'sin nada registrado queda como vino');
  });

  test("'completo' de la base se vuelve 'ninguno' en la pantalla (si no, al guardar se volvía 'parcial')", () => {
    const r = aplicarEstadosGuardados(draft, [{ referencia: 'A', tipoFaltante: 'completo', cantidadFaltante: 0 }]);
    assert.equal(r['REF-A'].tipo, 'ninguno');
    assert.equal(r['REF-A'].cantidadFaltante, 0);
  });
});

/**
 * Qué muestra "Todos" en Pagos a Proveedores.
 *
 * ANTES TRAÍA TAMBIÉN LAS PAGADAS
 * Y las pagadas son la enorme mayoría del histórico: al hacer este cambio,
 * 244 de 311 cuentas. Así que "Todos" enterraba las 65 que de verdad hay que
 * atender entre facturas ya cerradas, justo en la pantalla que existe para
 * decidir a quién pagarle.
 *
 * Ahora "Todos" quiere decir todo lo que queda por pagar. Las pagadas siguen
 * alcanzables con su propio filtro; lo que deja de pasar es que aparezcan
 * cuando nadie las pidió.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Servicio = require('../services/pagosProveedoresService');
// El servicio se exporta ya instanciado o como clase, según el módulo; se
// toma la instancia de cualquiera de las dos formas.
const servicio = typeof Servicio === 'function' ? new Servicio() : Servicio;

/** Aplana el AND que arma buildWhereFilters para poder revisarlo. */
const condiciones = (filtros) => (servicio.buildWhereFilters(filtros)?.AND) || [];

describe('el filtro de estado', () => {
  test('"todos" deja fuera las pagadas', () => {
    const c = condiciones({ estado: 'todos' });
    assert.deepEqual(c, [{ estado: { not: 'PAGADA' } }]);
  });

  test('sin estado se comporta igual que "todos"', () => {
    // La pantalla no siempre manda el parámetro; el resultado tiene que ser
    // el mismo y no "traeme absolutamente todo".
    assert.deepEqual(condiciones({}), [{ estado: { not: 'PAGADA' } }]);
  });

  test('un estado concreto filtra por ese estado', () => {
    assert.deepEqual(condiciones({ estado: 'vencida' }), [{ estado: 'VENCIDA' }]);
    assert.deepEqual(condiciones({ estado: 'pendiente' }), [{ estado: 'PENDIENTE' }]);
  });

  test('las pagadas siguen siendo alcanzables', () => {
    // Que no salgan en "Todos" no puede significar que no se puedan ver.
    assert.deepEqual(condiciones({ estado: 'pagada' }), [{ estado: 'PAGADA' }]);
  });

  test('una cuenta con abono parcial cae dentro de "todos"', () => {
    // Se quitó el filtro "En seguimiento" (PARCIAL) porque siempre estuvo
    // vacío, pero el estado lo sigue produciendo calcularPayloadPago al
    // registrar un abono. Si apareciera, tiene que verse en algún lado.
    const [regla] = condiciones({ estado: 'todos' });
    assert.notEqual(regla.estado.not, 'PARCIAL');
    assert.equal(regla.estado.not, 'PAGADA');
  });
});

describe('los chips de la pantalla', () => {
  const pagina = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'PagosProveedores.jsx'), 'utf8');

  test('ya no ofrece "En seguimiento"', () => {
    assert.ok(!/value: 'parcial'/.test(pagina),
      'el filtro PARCIAL filtraba a una lista siempre vacía');
  });

  test('quedan los cuatro que sirven', () => {
    for (const valor of ['todos', 'pendiente', 'vencida', 'pagada']) {
      assert.match(pagina, new RegExp(`value: '${valor}'`));
    }
  });
});

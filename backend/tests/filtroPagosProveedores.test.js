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

// El estado se CALCULA desde la migración 025 (vista cuenta_por_pagar_saldo):
// el filtro ya no es una condición de Prisma sobre la columna, es lo que
// `filtroEstado` le pide a la vista.
const filtro = (filtros) => servicio.filtroEstado(filtros);

describe('el filtro de estado', () => {
  test('"todos" deja fuera las pagadas', () => {
    assert.deepEqual(filtro({ estado: 'todos' }), { distinto: 'PAGADA' });
  });

  test('sin estado se comporta igual que "todos"', () => {
    // La pantalla no siempre manda el parámetro; el resultado tiene que ser
    // el mismo y no "traeme absolutamente todo".
    assert.deepEqual(filtro({}), { distinto: 'PAGADA' });
  });

  test('un estado concreto filtra por ese estado', () => {
    assert.deepEqual(filtro({ estado: 'vencida' }), { igual: 'VENCIDA' });
    assert.deepEqual(filtro({ estado: 'pendiente' }), { igual: 'PENDIENTE' });
  });

  test('las pagadas siguen siendo alcanzables', () => {
    // Que no salgan en "Todos" no puede significar que no se puedan ver.
    assert.deepEqual(filtro({ estado: 'pagada' }), { igual: 'PAGADA' });
  });

  test('una cuenta con abono (PARCIAL) cae dentro de "todos"', () => {
    // La vista la marca PARCIAL cuando tiene pagos y todavía saldo; "Todos"
    // solo excluye las pagadas, así que se ve.
    assert.notEqual(filtro({ estado: 'todos' }).distinto, 'PARCIAL');
  });

  test('buildWhereFilters ya no filtra por la columna estado', () => {
    const condiciones = servicio.buildWhereFilters({ estado: 'pagada' })?.AND || [];
    assert.equal(condiciones.some((c) => 'estado' in c), false);
  });
});

describe('los chips de la pantalla', () => {
  const pagina = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'PagosProveedores.jsx'), 'utf8');

  test('ya no ofrece "En seguimiento"', () => {
    assert.ok(!/value: 'parcial'/.test(pagina),
      'el filtro PARCIAL filtraba a una lista siempre vacía');
  });

  test('quedan los que sirven, más "De contado" (migración 028)', () => {
    for (const valor of ['todos', 'pendiente', 'vencida', 'contado', 'pagada']) {
      assert.match(pagina, new RegExp(`value: '${valor}'`));
    }
  });

  test('la pantalla abre en "Todos", no en "Pendientes"', () => {
    // Abriendo en "Pendientes", las vencidas —las urgentes— quedaban fuera
    // de la primera pantalla. Justo al revés de lo que uno viene a ver.
    const hook = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'usePagosProveedores.js'), 'utf8');
    assert.match(hook, /defaultFilters = \{[^}]*estado: 'todos'/s);
  });

  test('el botón de limpiar se mide contra el estado por defecto', () => {
    // Si se compara contra otro valor, "Limpiar" aparece desde que se abre
    // la pantalla sin que nadie haya filtrado nada.
    assert.match(pagina, /filters\.estado !== 'todos'/);
  });
});

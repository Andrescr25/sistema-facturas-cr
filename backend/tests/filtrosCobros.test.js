const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Filtros y resumen de Cuentas por Cobrar (frontend/src/utils/filtrosCobros.js).
 *
 * Al pasar los cobros a la base propia, la pantalla siguió mandando
 * `search`/`estado`/`dias` a un endpoint que solo entiende `buscar`: el
 * buscador y los chips no hacían nada, el resumen no aparecía, y la mitad de
 * los deudores quedaba fuera por el tope de 30. Ahora se trae la cartera
 * entera y se filtra en el navegador con estas funciones.
 *
 * El módulo es ESM y estas pruebas son CommonJS: se lee el archivo, se le
 * quitan los `export` y se evalúa. Por eso ese archivo no puede tener imports.
 */
const FUENTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'filtrosCobros.js'), 'utf8');
const { estadoFactura, filtrarDeudores, resumenDeudores } = new Function(
  `${FUENTE.replace(/^export /gm, '')}
   return { estadoFactura, filtrarDeudores, resumenDeudores };`
)();

const f = (numero, { total = 1000, saldo = 1000, diasRestantes = 10 } = {}) =>
  ({ numeroFactura: numero, total, saldo, diasRestantes });

const CARTERA = [
  { clienteNombre: 'PULPERÍA JOSÉ', identificacion: '111', facturas: [f('A1', { diasRestantes: -3 }), f('A2', { diasRestantes: 5 })] },
  { clienteNombre: 'SUPER EL CRUCE', identificacion: '222', facturas: [f('B1', { saldo: 400, diasRestantes: 20 })] },
  { clienteNombre: 'AB MARIO', identificacion: '333', facturas: [f('C1', { diasRestantes: 40 })] }
];

describe('estadoFactura', () => {
  test('vencida manda sobre "con abono"', () => {
    assert.equal(estadoFactura(f('x', { saldo: 400, diasRestantes: -1 })), 'VENCIDA');
  });
  test('con saldo menor al total y sin vencer: con abono', () => {
    assert.equal(estadoFactura(f('x', { saldo: 400 })), 'PARCIAL');
  });
  test('vence hoy (0 días) no es vencida', () => {
    assert.equal(estadoFactura(f('x', { diasRestantes: 0 })), 'PENDIENTE');
  });
});

describe('filtrarDeudores', () => {
  test('sin filtros devuelve la cartera entera', () => {
    assert.equal(filtrarDeudores(CARTERA, {}).length, 3);
  });

  test('buscar no distingue acentos ni mayúsculas, y busca por identificación', () => {
    assert.deepEqual(filtrarDeudores(CARTERA, { search: 'pulperia jose' }).map((c) => c.identificacion), ['111']);
    assert.deepEqual(filtrarDeudores(CARTERA, { search: '222' }).map((c) => c.identificacion), ['222']);
  });

  test('por estado deja solo las facturas de ese estado, y recalcula el saldo del cliente', () => {
    const vencidas = filtrarDeudores(CARTERA, { estado: 'VENCIDA' });
    assert.equal(vencidas.length, 1);
    assert.deepEqual(vencidas[0].facturas.map((x) => x.numeroFactura), ['A1']);
    assert.equal(vencidas[0].totalSaldo, 1000);
  });

  test('"con abono" encuentra la factura parcial', () => {
    assert.deepEqual(filtrarDeudores(CARTERA, { estado: 'PARCIAL' }).map((c) => c.identificacion), ['222']);
  });

  test('vence en 7 días: de hoy a 7, sin las vencidas', () => {
    const r = filtrarDeudores(CARTERA, { dias: 'vence7' });
    assert.deepEqual(r.flatMap((c) => c.facturas.map((x) => x.numeroFactura)), ['A2']);
  });

  test('"todos" no filtra', () => {
    assert.equal(filtrarDeudores(CARTERA, { estado: 'todos', dias: 'todos', search: '' }).length, 3);
  });
});

describe('resumenDeudores', () => {
  test('suma la cartera entera: total, vencido, próximos 7 días y clientes', () => {
    const r = resumenDeudores(CARTERA);
    assert.equal(r.totalPorCobrar, 3400);
    assert.equal(r.totalVencido, 1000);
    assert.equal(r.totalFacturas, 4);
    assert.equal(r.totalClientes, 3);
    assert.deepEqual(r.proximasAVencer, { monto: 1000, cantidad: 1 });
  });
});

const test = require('node:test');
const assert = require('node:assert');
const {
  empresaDesdeAlegra, impuestoDesdeAlegra, tipoImpuesto, plazoDesdeAlegra, cuentaDesdeAlegra
} = require('../src/modules/configuracion/desdeAlegra');

/**
 * Traducción de la configuración de Alegra a las tablas propias.
 *
 * Los casos son las respuestas reales de Alegra (11 de setiembre de 2026),
 * recortadas. Lo que más importa es el impuesto: la tarifa sale del número,
 * nunca del id. Deducirla del id es el error que registró compras al 1 %
 * como 4 % desde el 10 de julio (el `utils/impuestosAlegra.js` de entonces).
 */

// GET /taxes, tal cual.
const TAXES = [
  { id: '1', name: 'IVA', percentage: '13.00', type: 'IVA', rateType: 'GENERAL', status: 'active' },
  { id: '2', name: 'IVA exento', percentage: '0.00', type: 'IVA', rateType: 'EXEMPT', status: 'active' },
  { id: '3', name: 'IVA reducido', percentage: '0.50', type: 'IVA', rateType: 'REDUCED', status: 'active' },
  { id: '4', name: 'IVA reducido', percentage: '1.00', type: 'IVA', rateType: 'REDUCED', status: 'active' },
  { id: '5', name: 'IVA reducido', percentage: '2.00', type: 'IVA', rateType: 'REDUCED', status: 'active' },
  { id: '6', name: 'IVA reducido', percentage: '4.00', type: 'IVA', rateType: 'REDUCED', status: 'active' },
  { id: '7', name: 'IVA transitorio', percentage: '8.00', type: 'IVA', rateType: 'TRANSIENT', status: 'active' },
  { id: '8', name: 'Factor para artículos electrónicos', percentage: '5.80', type: 'IVA_BIENES_USADOS', status: 'inactive' },
  { id: '12', name: 'Tarifa 0% (Artículo 32, num 1, RLIVA)', percentage: '0.00', type: 'IVA', rateType: 'EXEMPT', status: 'active' },
  { id: '13', name: 'Tarifa 0% sin derecho a crédito', percentage: '0.00', type: 'IVA', status: 'active' }
];

test('la tarifa sale del porcentaje, no del id', () => {
  const porId = Object.fromEntries(TAXES.map(t => [t.id, impuestoDesdeAlegra(t)]));
  // Justo los ids que el mapeo viejo confundía: 6 NO es 1 %, 7 NO es 2 %, 3 NO es exento.
  assert.equal(porId['4'].tarifa, 1);
  assert.equal(porId['5'].tarifa, 2);
  assert.equal(porId['6'].tarifa, 4);
  assert.equal(porId['7'].tarifa, 8);
  assert.equal(porId['3'].tarifa, 0.5);
  assert.equal(porId['2'].tarifa, 0);
  assert.equal(porId['1'].tarifa, 13);
});

test('cada impuesto queda con su tipo', () => {
  const tipos = Object.fromEntries(TAXES.map(t => [t.id, tipoImpuesto(t)]));
  assert.deepEqual(tipos, {
    1: 'general', 2: 'exento', 3: 'reducido', 4: 'reducido', 5: 'reducido', 6: 'reducido',
    7: 'transitorio', 8: 'bienes_usados', 12: 'exento', 13: 'sin_credito'
  });
});

test('los nombres repetidos de Alegra se distinguen por la tarifa', () => {
  const nombres = TAXES.filter(t => t.name === 'IVA reducido').map(t => impuestoDesdeAlegra(t).nombre);
  assert.deepEqual(nombres, ['IVA reducido 0,5 %', 'IVA reducido 1 %', 'IVA reducido 2 %', 'IVA reducido 4 %']);
  // Y un nombre que ya trae su tarifa no se repite.
  assert.equal(impuestoDesdeAlegra(TAXES[8]).nombre, 'Tarifa 0% (Artículo 32, num 1, RLIVA)');
});

test('un impuesto inactivo se carga inactivo, no se descarta', () => {
  const f = impuestoDesdeAlegra(TAXES[7]);
  assert.equal(f.activo, false);
  assert.equal(f.alegra_id, '8');
});

test('sin porcentaje no se inventa una tarifa', () => {
  assert.throws(() => impuestoDesdeAlegra({ id: '99', name: 'Raro' }), /sin porcentaje/);
});

test('empresa: la dirección de Alegra se reparte en provincia, cantón y distrito', () => {
  const e = empresaDesdeAlegra({
    name: 'Distribuidora Tachi', identification: '204050474', identificationObject: { type: 'CF', number: '204050474' },
    regime: 'Régimen tradicional', economicActivity: '523402', phone: '86477036', email: 'x@y.cr',
    address: { department: 'Alajuela', city: 'Palmares', district: 'Zaragoza', neighborhood: 'Rincón de Zaragoza', address: 'Contiguo al mirador' },
    decimalPrecision: 0
  });
  assert.equal(e.tipo_identificacion, 'CF');
  assert.equal(e.identificacion, '204050474');
  assert.deepEqual([e.provincia, e.canton, e.distrito, e.barrio, e.otras_senas],
    ['Alajuela', 'Palmares', 'Zaragoza', 'Rincón de Zaragoza', 'Contiguo al mirador']);
  assert.equal(e.decimales, 0);
});

test('empresa sin tipo de identificación: se deduce del largo', () => {
  assert.equal(empresaDesdeAlegra({ name: 'X', identification: '3-101-123456' }).tipo_identificacion, 'CJ');
  assert.equal(empresaDesdeAlegra({ name: 'X', identification: '2-0405-0474' }).tipo_identificacion, 'CF');
  assert.equal(empresaDesdeAlegra({ name: 'X', identification: '2-0405-0474' }).identificacion, '204050474');
});

test('empresa sin nombre o sin identificación no se carga a medias', () => {
  assert.throws(() => empresaDesdeAlegra({}), /datos de la empresa/);
  assert.throws(() => empresaDesdeAlegra({ name: 'X' }), /identificación/);
});

test('plazos y cuentas', () => {
  assert.deepEqual(plazoDesdeAlegra({ id: 7, name: '22 dias', days: 22 }), { nombre: '22 dias', dias: 22, activo: true, alegra_id: '7' });
  assert.throws(() => plazoDesdeAlegra({ id: 1, name: 'x', days: -3 }), /días inválidos/);
  const tipos = [['cash', 'efectivo'], ['bank', 'banco'], ['credit-card', 'tarjeta_credito']];
  for (const [alegra, propio] of tipos) {
    assert.equal(cuentaDesdeAlegra({ id: 1, name: 'C', type: alegra, status: 'active' }).tipo, propio);
  }
  assert.throws(() => cuentaDesdeAlegra({ id: 9, name: 'Cripto', type: 'crypto' }), /tipo desconocido/);
});

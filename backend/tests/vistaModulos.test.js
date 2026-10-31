const { test } = require('node:test');
const assert = require('node:assert/strict');
const { limpiarModulosOcultos } = require('../src/modules/usuarios/vistaModulos');
const modulos = import('../../frontend/src/utils/modulos.js');

test('solo se ocultan pantallas válidas y se descartan duplicados', () => {
  assert.deepEqual(limpiarModulosOcultos(['ingresos', 'ingresos'], true), ['ingresos']);
  for (const lista of [null, 'ingresos', {}, ['usuarios'], ['precio-factura'], ['inventado'], [null]]) {
    assert.throws(() => limpiarModulosOcultos(lista, true), e => e.status === 400);
  }
  assert.throws(() => limpiarModulosOcultos(['ingresos'], false), e => e.status === 400);
  assert.deepEqual(limpiarModulosOcultos([], false), []);
});

test('el administrador elige cualquier módulo de su vista y conserva sus permisos', async () => {
  const { visibleEnMenu, puedeVer, MODULOS } = await modulos;
  const admin = { esAdmin: true, modulosOcultos: ['ingresos', 'rentabilidad'] };
  for (const m of MODULOS) {
    assert.equal(visibleEnMenu(admin, m.ruta), !admin.modulosOcultos.includes(m.clave), m.clave);
    assert.equal(puedeVer(admin, m.ruta), true, m.clave);
  }
  assert.equal(visibleEnMenu(admin, '/usuarios'), true);
  assert.equal(visibleEnMenu(admin, '/usuarios/bitacora'), true);
});

test('el personal mantiene sus permisos; ocultos no concede ni retira acceso', async () => {
  const { visibleEnMenu } = await modulos;
  assert.equal(visibleEnMenu({ modulos: ['ingresos'], modulosOcultos: ['ingresos'] }, '/ingresos'), true);
  assert.equal(visibleEnMenu({ modulos: ['empleados'] }, '/ingresos'), false);
  assert.equal(visibleEnMenu(null, '/ingresos'), false);
});

test('el inicio evita el Dashboard oculto y siempre deja administrar la vista', async () => {
  const { inicioDe, MODULOS } = await modulos;
  assert.equal(inicioDe({ esAdmin: true }), '/');
  assert.equal(inicioDe({ esAdmin: true, modulosOcultos: ['dashboard'] }), '/facturacion');
  assert.equal(inicioDe({ esAdmin: true, modulosOcultos: MODULOS.map(m => m.clave) }), '/usuarios');
  assert.equal(inicioDe({ modulos: ['ingresos'] }), '/ingresos');
  assert.equal(inicioDe({ modulos: [] }), null);
});

test('las casillas individuales y por grupo no modifican la lista original', async () => {
  const { alternarVistaModulos } = await modulos;
  const ocultos = ['ingresos', 'rentabilidad'];
  assert.deepEqual(alternarVistaModulos(ocultos, ['ingresos']), ['rentabilidad']);
  assert.deepEqual(alternarVistaModulos(ocultos, ['ingresos', 'preventa']), ['rentabilidad']);
  assert.deepEqual(alternarVistaModulos(ocultos, ['preventa']), ['ingresos', 'rentabilidad', 'preventa']);
  assert.deepEqual(ocultos, ['ingresos', 'rentabilidad']);
});

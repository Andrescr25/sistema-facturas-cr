const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulos = import('../../frontend/src/utils/modulos.js');

test('el administrador oculta solo el enlace de Mis ingresos y conserva acceso', async () => {
  const { visibleEnMenu, puedeVer, inicioDe, MODULOS } = await modulos;
  const admin = { esAdmin: true, modulos: [] };
  const preferencia = { ocultarMisIngresos: true };
  assert.equal(visibleEnMenu(admin, '/ingresos'), true);
  assert.equal(visibleEnMenu(admin, '/ingresos', preferencia), false);
  assert.equal(puedeVer(admin, '/ingresos'), true);
  assert.equal(inicioDe(admin), '/');
  for (const m of MODULOS.filter(m => m.clave !== 'ingresos')) {
    assert.equal(visibleEnMenu(admin, m.ruta, preferencia), true, m.clave);
  }
});

test('una preferencia del administrador no oculta los ingresos del empleado', async () => {
  const { visibleEnMenu, inicioDe } = await modulos;
  const empleado = { esAdmin: false, modulos: ['ingresos'] };
  assert.equal(visibleEnMenu(empleado, '/ingresos', { ocultarMisIngresos: true }), true);
  assert.equal(inicioDe(empleado), '/ingresos');
});

test('mostrar el enlace nunca concede permisos a quien no tiene Mis ingresos', async () => {
  const { visibleEnMenu } = await modulos;
  for (const usuario of [null, { modulos: [] }, { modulos: ['empleados'] }]) {
    assert.equal(visibleEnMenu(usuario, '/ingresos'), false);
    assert.equal(visibleEnMenu(usuario, '/ingresos', { ocultarMisIngresos: true }), false);
  }
});

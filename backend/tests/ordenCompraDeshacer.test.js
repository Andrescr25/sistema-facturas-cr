/**
 * Deshacer cambios en una orden de compra.
 *
 * EL BUG
 * La pantalla ya ofrecía deshacer —restaurar un producto quitado, o sacar uno
 * agregado a mano— y llamaba con DELETE. Pero esas rutas NUNCA existieron:
 * solo estaban los POST. Cada intento daba 404.
 *
 * Y el 404 se perdía dentro de un `catch { }` vacío, así que la pantalla
 * mostraba el cambio hecho mientras el servidor seguía guardando lo
 * contrario. Al recargar, el producto volvía a aparecer quitado — o peor, se
 * le mandaba al proveedor una orden que no era la que se veía en pantalla.
 *
 * Apareció recién cuando se quitaron esos catch vacíos: el error llevaba
 * quién sabe cuánto ocurriendo en silencio.
 *
 * LA GUARDA POR `accion`
 * Un producto tiene UNA fila por proveedor, y esa fila puede representar
 * cosas distintas: 'eliminado', 'agregado' o 'modificado'. Borrar sin mirar
 * la acción haría que deshacer una eliminación se llevara también una
 * cantidad modificada, que es otra decisión que alguien tomó.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'src', 'modules', 'orders-whatsapp');
const SERVICIO = fs.readFileSync(path.join(BASE, 'orders-whatsapp.service.js'), 'utf8');
const RUTAS = fs.readFileSync(path.join(BASE, 'orders-whatsapp.routes.js'), 'utf8');
const CONTROLADOR = fs.readFileSync(path.join(BASE, 'orders-whatsapp.controller.js'), 'utf8');
const HOOK = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'useReporteProveedores.js'), 'utf8');

describe('las rutas que el frontend llama existen', () => {
  // Los DELETE que hace la pantalla, tal cual.
  const LLAMADAS = [
    ['producto-eliminado', 'delete'],
    ['producto-agregado', 'delete'],
    ['producto-eliminado', 'post'],
    ['producto-agregado', 'post'],
  ];

  for (const [ruta, metodo] of LLAMADAS) {
    test(`${metodo.toUpperCase()} /${ruta} está definida`, () => {
      const patron = new RegExp(`router\\.${metodo}\\('/${ruta}'`);
      assert.match(RUTAS, patron,
        `la pantalla llama a ${metodo.toUpperCase()} /${ruta}; sin la ruta responde 404`);
    });
  }

  test('cada DELETE que hace el hook tiene su ruta', () => {
    // Esta es la que habría atrapado el bug: compara lo que el frontend
    // llama contra lo que el backend define, en vez de confiar en una lista.
    const llamadas = [...HOOK.matchAll(/api\.delete\('\/alegra\/orden-compra\/([\w-]+)'/g)].map(m => m[1]);
    assert.ok(llamadas.length >= 2, `se esperaban DELETE en el hook, hay ${llamadas.length}`);
    const sinRuta = llamadas.filter(r => !new RegExp(`router\\.delete\\('/${r}'`).test(RUTAS));
    assert.deepEqual(sinRuta, [],
      `el hook llama a estas rutas que el backend no tiene: ${sinRuta.join(', ')}`);
  });
});

describe('borrar el registro correcto y solo ese', () => {
  test('el borrado filtra por accion', () => {
    assert.match(SERVICIO, /DELETE FROM orden_compra_temporal[\s\S]*?AND accion = \$3/,
      'sin filtrar por accion, deshacer una eliminación borraría una cantidad modificada');
  });

  test('restaurar borra solo lo marcado como eliminado', () => {
    assert.match(CONTROLADOR, /eliminarRegistroTemporal\(proveedorNombre, productoCodigo, 'eliminado'\)/);
  });

  test('quitar un agregado borra solo lo marcado como agregado', () => {
    assert.match(CONTROLADOR, /eliminarRegistroTemporal\(proveedorNombre, productoCodigo, 'agregado'\)/);
  });

  test('faltando datos se responde error de validación, no un borrado a ciegas', () => {
    const bloque = CONTROLADOR.slice(CONTROLADOR.indexOf('quitarProductoEliminado'), CONTROLADOR.indexOf('quitarProductoAgregado'));
    assert.match(bloque, /validationError/);
  });
});

describe('el aviso dice lo que de verdad pasó', () => {
  test('restaurar no dice que se quitó', () => {
    // El mensaje original decía "El producto se quitó en pantalla" en la
    // acción que RESTAURA: al fallar, haría creer lo contrario de lo ocurrido.
    const bloque = HOOK.slice(HOOK.indexOf('const restaurarProducto'), HOOK.indexOf('const restaurarProducto') + 900);
    assert.doesNotMatch(bloque, /se quitó en pantalla/,
      'el mensaje de restaurar describía la acción contraria');
    assert.match(bloque, /se restauró en pantalla/);
  });
});

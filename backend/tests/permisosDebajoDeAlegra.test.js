const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Lo que cuelga de `/api/alegra` no pide permiso.
 *
 * `/alegra` es un prefijo COMPARTIDO: el guardián deja pasar a cualquiera con
 * sesión. Eso sirve para lo que leen varias pantallas, y es una trampa para
 * todo lo demás. Dos cosas que estaban ahí hasta el 2026-10-04, las dos sin
 * pantalla que las usara:
 *
 *  · Impresión, montada DOS veces: en `/api/reimpresion`, que pide el módulo,
 *    y en `/api/alegra/reimpresion`, que no. Quien no tenía el módulo recibía
 *    403 en la primera y 200 en la segunda — leer la cola y vaciar el
 *    historial.
 *  · `DELETE /api/alegra/faltantes/proveedor/limpiar`, que borraba TODOS los
 *    faltantes sin filtro. El botón de Configuración llama a otra ruta
 *    (`/reportes/faltantes/proveedor/limpiar`), que borra solo lo procesado.
 */

const RAIZ = path.join(__dirname, '..', '..');
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
/** Sin comentarios: nombrar una ruta retirada en un comentario no es montarla. */
const codigo = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Impresión se alcanza solo por su prefijo, que pide el módulo', () => {
  const adaptador = codigo(leer('backend', 'routes', 'alegra.js'));

  test('el router de /alegra no la monta', () => {
    assert.equal(/router\.use\('\/reimpresion'/.test(adaptador), false);
    assert.equal(/modules\/reprinting/.test(adaptador), false);
  });

  test('sigue montada en /api/reimpresion, y ese prefijo es del módulo', () => {
    const { clasificarRuta } = require('../src/modules/usuarios/modulos');

    assert.match(codigo(leer('backend', 'server.js')), /app\.use\('\/api\/reimpresion'/);
    assert.deepEqual(clasificarRuta('/reimpresion/historial'), { tipo: 'modulo', clave: 'impresion', prefijo: '/reimpresion' });
  });

  test('la pantalla no llama al montaje retirado', () => {
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : recorrer(ruta);
      return /\.(js|jsx)$/.test(e.name) ? [ruta] : [];
    });
    const culpables = recorrer(path.join(RAIZ, 'frontend', 'src'))
      .filter(ruta => /['"`]\/alegra\/reimpresion/.test(codigo(fs.readFileSync(ruta, 'utf8'))))
      .map(ruta => path.relative(RAIZ, ruta));

    assert.deepEqual(culpables, []);
  });
});

describe('no queda un borrado total de faltantes', () => {
  test('`missing-items` no tiene la ruta que los borraba todos', () => {
    const rutas = codigo(leer('backend', 'src', 'modules', 'missing-items', 'missing-items.routes.js'));
    const controlador = leer('backend', 'src', 'modules', 'missing-items', 'missing-items.controller.js');
    const servicio = leer('backend', 'src', 'modules', 'missing-items', 'missing-items.service.js');

    assert.equal(/limpiar/.test(rutas), false);
    assert.equal(/cleanProviderMissingItems/.test(controlador + servicio), false);
    // Express no avisa de un handler `undefined` hasta arrancar: cada ruta
    // que queda apunta a una función que el controlador exporta.
    for (const [, nombre] of rutas.matchAll(/missingItemsController\.(\w+)/g)) {
      assert.match(controlador, new RegExp(`^  ${nombre},?$`, 'm'), `el controlador no exporta ${nombre}`);
    }
  });

  test('ningún módulo ni ruta borra `faltantes` sin filtro', () => {
    // Los faltantes alimentan el Reporte de Clientes, el de Proveedores y la
    // cola de impresión. (La limpieza semanal vive en `services/` y borra por
    // estado; no entra acá.)
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return recorrer(ruta);
      return e.name.endsWith('.js') ? [ruta] : [];
    });
    const culpables = ['src', 'routes'].flatMap(c => recorrer(path.join(RAIZ, 'backend', c)))
      .filter(ruta => /DELETE FROM faltantes\s*['"`;)]/.test(codigo(fs.readFileSync(ruta, 'utf8'))))
      .map(ruta => path.relative(RAIZ, ruta));

    assert.deepEqual(culpables, []);
  });

  test('el botón de Configuración sigue teniendo su ruta, la que borra solo lo procesado', () => {
    const reportes = codigo(leer('backend', 'src', 'modules', 'reports', 'report.routes.js'));
    const pantalla = leer('frontend', 'src', 'services', 'alegraService.js');

    assert.match(reportes, /router\.delete\('\/faltantes\/proveedor\/limpiar', reportController\.clearProcessedSupplierMissingItems\)/);
    assert.match(pantalla, /api\.delete\('\/alegra\/reportes\/faltantes\/proveedor\/limpiar'\)/);
  });
});

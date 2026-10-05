const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Una pantalla que trabaja con los datos de otro módulo.
 *
 * Gestionar Relaciones no tiene API propia: su pantalla usa las relaciones
 * proveedor ↔ producto, que son de Revisión de Precios, y la lista de
 * proveedores. Como cada ruta tiene UN dueño, quien tenía solo ese módulo veía
 * la pantalla en el menú y cada llamada le respondía 403.
 *
 * La salida no es darle dos dueños a la ruta ni volverla compartida: es
 * PRESTARLA (`tambienUsa`), diciendo exactamente qué. Estas pruebas cuidan las
 * dos puntas: que lo prestado alcance para lo que la pantalla llama de verdad,
 * y que no se preste de más.
 */

const { MODULOS, modulosQuePuedenUsar, clasificarRuta, esCompartida } = require('../src/modules/usuarios/modulos');
const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');

describe('prestar una ruta a otro módulo', () => {
  test('la ruta conserva su dueño, que va primero', () => {
    assert.deepEqual(modulosQuePuedenUsar('/productos-revision/relacionados', 'GET'), ['revision-precios', 'gestionar-relaciones']);
    assert.deepEqual(modulosQuePuedenUsar('/proveedores', 'GET'), ['reporte-proveedores', 'gestionar-relaciones']);
  });

  test('`exacta` presta esa dirección y no lo que cuelga de ella; `metodos`, solo esos verbos', () => {
    assert.deepEqual(modulosQuePuedenUsar('/proveedores/3101129878', 'GET'), ['reporte-proveedores']);
    assert.deepEqual(modulosQuePuedenUsar('/proveedores', 'POST'), ['reporte-proveedores']);
    assert.deepEqual(modulosQuePuedenUsar('/proveedores', 'DELETE'), ['reporte-proveedores']);
    // Escrita como la entiende Express.
    assert.deepEqual(modulosQuePuedenUsar('/Proveedores/', 'get'), ['reporte-proveedores', 'gestionar-relaciones']);
  });

  test('lo que no se prestó sigue siendo solo de su dueño', () => {
    assert.deepEqual(modulosQuePuedenUsar('/revision-precios/facturas', 'GET'), ['revision-precios']);
    assert.deepEqual(modulosQuePuedenUsar('/rentabilidad/resumen', 'GET'), ['rentabilidad']);
  });

  test('una ruta compartida o sin dueño no es de ningún módulo: no hay nada que prestar', () => {
    assert.deepEqual(modulosQuePuedenUsar('/auth/yo', 'GET'), []);
    assert.deepEqual(modulosQuePuedenUsar('/no-existe', 'GET'), []);
  });

  test('todo lo prestado es de OTRO módulo: prestar algo compartido o sin dueño no tendría efecto', () => {
    for (const m of MODULOS) {
      for (const p of m.tambienUsa || []) {
        const c = clasificarRuta(p.prefijo);
        assert.equal(c?.tipo, 'modulo', `${m.clave} dice usar "${p.prefijo}", que no es de ningún módulo`);
        assert.notEqual(c.clave, m.clave, `${m.clave} se presta a sí mismo "${p.prefijo}"`);
        assert.equal(p.prefijo, p.prefijo.toLowerCase(), 'los prefijos van en minúsculas');
      }
    }
  });
});

describe('lo prestado alcanza para lo que la pantalla llama', () => {
  test('cada llamada de Gestionar Relaciones se puede hacer con ese módulo solo', () => {
    // Se leen las llamadas del hook de verdad: si la pantalla empieza a usar
    // otra ruta y nadie se la presta, esto falla acá y no en el navegador de
    // quien tiene solo ese módulo.
    const hook = fs.readFileSync(path.join(FRONTEND, 'hooks', 'useGestionarRelaciones.js'), 'utf8');
    const llamadas = [...hook.matchAll(/api\.(get|post|put|patch|delete)\(\s*['`]([^'`]+)['`]/g)]
      .map(m => ({ metodo: m[1].toUpperCase(), ruta: m[2].replace(/\$\{[^}]+\}/g, '9').split('?')[0] }));

    assert.ok(llamadas.length >= 6, `se esperaban las llamadas de la pantalla, se leyeron ${llamadas.length}`);
    for (const { metodo, ruta } of llamadas) {
      const pasa = esCompartida(ruta) || modulosQuePuedenUsar(ruta, metodo).includes('gestionar-relaciones');
      assert.ok(pasa, `${metodo} ${ruta}: quien tiene solo Gestionar Relaciones recibe 403`);
    }
  });
});

describe('limpiar faltantes procesados es de Configuración', () => {
  test('las dos direcciones de la ruta tienen ese dueño, y leer el reporte sigue compartido', () => {
    for (const ruta of ['/reportes/faltantes/proveedor/limpiar', '/alegra/reportes/faltantes/proveedor/limpiar']) {
      assert.deepEqual(clasificarRuta(ruta), { tipo: 'modulo', clave: 'configuracion', prefijo: ruta });
    }
    assert.equal(esCompartida('/reportes/faltantes/proveedor'), true);
    assert.equal(esCompartida('/alegra/reportes/faltantes/proveedor'), true);
  });

  test('el botón está solo en la pantalla de Configuración', () => {
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : recorrer(ruta);
      return /\.(js|jsx)$/.test(e.name) ? [ruta] : [];
    });
    const quienes = recorrer(FRONTEND)
      .filter(ruta => /limpiarFaltantesProveedor\(/.test(fs.readFileSync(ruta, 'utf8')))
      .map(ruta => path.relative(FRONTEND, ruta))
      .filter(ruta => ruta !== path.join('services', 'alegraService.js'));

    assert.deepEqual(quienes, [path.join('pages', 'Configuracion.jsx')]);
  });
});

describe('el WhatsApp guardado del proveedor se lee de donde el servidor lo manda', () => {
  test('`data.telefono`, no `telefono` suelto', () => {
    const servicio = fs.readFileSync(path.join(FRONTEND, 'services', 'alegraService.js'), 'utf8');
    const controlador = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'orders-whatsapp', 'orders-whatsapp.controller.js'), 'utf8');

    // El servidor responde { success, data: { telefono } }…
    assert.match(controlador, /ResponseHelper\.success\(res, \{ telefono \}/);
    // …y la pantalla lo lee ahí.
    assert.match(servicio, /return response\.data\?\.data\?\.telefono \|\| null/);
    assert.equal(/return response\.data\.telefono/.test(servicio), false);
  });
});

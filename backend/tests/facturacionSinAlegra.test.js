const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Facturación ya no tiene un camino hacia Alegra (retirado el 2026-10-04).
 *
 * Hasta ese día convivían dos: la factura propia (`/facturacion/facturas`) y
 * lo de siempre contra Alegra (`/facturacion/invoices`, `/alegra/facturas`,
 * el módulo `invoices`). La pantalla ya usaba solo el primero, pero el segundo
 * seguía montado: un `POST /facturacion/invoices` todavía creaba una factura
 * en Alegra, y `PUT /alegra/facturas/:id` todavía editaba una allá.
 *
 * LO QUE NO SE VE Y ESTO CUIDA. La tablet guarda facturas y ediciones sin
 * señal. Esa copia no se borró al dejar Alegra: puede tener documentos de
 * antes, con el id de ALLÁ. Mientras hubo dos rutas, la marca `esPropia`
 * elegía a cuál mandar. Ahora que hay una, lo que no trae la marca NO SE
 * MANDA: en nuestra ruta ese número es otra factura.
 */

const RAIZ = path.join(__dirname, '..', '..');
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const existe = (...partes) => fs.existsSync(path.join(RAIZ, ...partes));
/** Sin comentarios: nombrar una ruta retirada en un comentario no es llamarla. */
const codigo = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('el servidor ya no factura contra Alegra', () => {
  test('se fueron el servicio, el controlador y el módulo viejo de facturas', () => {
    for (const ruta of [
      ['backend', 'src', 'modules', 'facturacion', 'facturacion.service.js'],
      ['backend', 'src', 'modules', 'facturacion', 'facturacion.controller.js'],
      ['backend', 'src', 'modules', 'invoices'],
      ['backend', 'src', 'integrations', 'alegra', 'ventaSinStock.js']
    ]) {
      assert.equal(existe(...ruta), false, `sigue existiendo ${ruta.join('/')}`);
    }
  });

  test('/api/facturacion solo tiene las rutas de la factura propia', () => {
    const rutas = codigo(leer('backend', 'src', 'modules', 'facturacion', 'facturacion.routes.js'));

    for (const vieja of ['/items', '/contacts', '/invoices', '/taxes', '/payment-methods']) {
      assert.equal(rutas.includes(`'${vieja}`), false, `volvió la ruta ${vieja}`);
    }
    const controladores = [...rutas.matchAll(/router\.\w+\('[^']+',\s*(\w+)\./g)].map(m => m[1]);
    assert.ok(controladores.length > 0, 'no se reconoció ninguna ruta: cambió la forma del archivo');
    assert.deepEqual([...new Set(controladores)].sort(), ['facturaPropia', 'notaCredito']);
  });

  test('cada ruta apunta a una función que existe', () => {
    // Express no avisa: un handler `undefined` revienta recién al arrancar.
    const rutas = codigo(leer('backend', 'src', 'modules', 'facturacion', 'facturacion.routes.js'));
    const controlador = leer('backend', 'src', 'modules', 'facturacion', 'facturaPropia.controller.js');

    for (const [, nombre] of rutas.matchAll(/facturaPropia\.(\w+)\)/g)) {
      assert.match(controlador, new RegExp(`^  ${nombre}: async `, 'm'), `falta facturaPropia.${nombre}`);
    }
  });

  test('ni /api/facturas ni /api/alegra/facturas siguen montadas', () => {
    const servidor = codigo(leer('backend', 'server.js'));
    const adaptador = codigo(leer('backend', 'routes', 'alegra.js'));

    assert.equal(/app\.use\('\/api\/facturas'/.test(servidor), false);
    assert.equal(/modules\/invoices/.test(servidor), false);
    assert.equal(/['"`]\/facturas/.test(adaptador), false, 'el adaptador volvió a tener rutas de /facturas');
    assert.equal(/getInvoiceService/.test(adaptador), false);
  });

  test('"/facturas" dejó de ser un prefijo compartido: ya no hay nada ahí', () => {
    const { COMPARTIDAS } = require('../src/modules/usuarios/modulos');
    assert.equal(COMPARTIDAS.includes('/facturas'), false);
  });
});

describe('la pantalla ya no le habla a Alegra para facturar', () => {
  const servicio = leer('frontend', 'src', 'services', 'facturacionService.js');
  const hook = leer('frontend', 'src', 'hooks', 'useFacturacion.js');

  test('ningún archivo de la pantalla llama a /alegra/facturas, /alegra/productos ni /alegra/contactos', () => {
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : recorrer(ruta);
      return /\.(js|jsx)$/.test(e.name) ? [ruta] : [];
    });

    const culpables = recorrer(path.join(RAIZ, 'frontend', 'src'))
      .filter(ruta => /['"`]\/alegra\/(facturas|productos|contactos|sincronizar|test)\b/.test(codigo(fs.readFileSync(ruta, 'utf8'))))
      .map(ruta => path.relative(RAIZ, ruta));

    assert.deepEqual(culpables, []);
  });

  test('editar una factura sin la marca `esPropia` se rechaza ANTES de tocar la red o la tablet', () => {
    const cuerpo = servicio.slice(servicio.indexOf('async editarFactura('), servicio.indexOf('async actualizarFacturaPendiente('));
    const rechazo = cuerpo.indexOf('if (!esPropia) throw new Error(EDICION_DE_COPIA_VIEJA)');

    assert.ok(rechazo > 0, 'editarFactura ya no rechaza la factura sin marca');
    assert.ok(rechazo < cuerpo.indexOf('api.put('), 'se manda antes de revisar la marca');
    assert.ok(rechazo < cuerpo.indexOf('saveEdicionPendiente'), 'se guarda para después antes de revisar la marca');
    assert.equal((codigo(cuerpo).match(/api\.put\(/g) || []).length, 1, 'tiene que haber una sola ruta de edición');
    assert.match(cuerpo, /api\.put\(`\/facturacion\/facturas\/\$\{facturaId\}`/);
  });

  test('una edición pendiente sin la marca no se manda ni se borra: queda con su motivo', () => {
    const cuerpo = servicio.slice(servicio.indexOf('async sincronizarEdicionesPendientes('), servicio.indexOf('async getEdicionesPendientes('));
    const salto = cuerpo.indexOf('if (!edicion.esPropia) {');
    const bloque = cuerpo.slice(salto, cuerpo.indexOf('continue;', salto));

    assert.ok(salto > 0 && salto < cuerpo.indexOf('api.put('));
    assert.match(bloque, /markEdicionError\(edicion\.localId, EDICION_DE_COPIA_VIEJA\)/);
    assert.equal(/deleteEdicionPendiente/.test(codigo(cuerpo)), false,
      'una edición pendiente volvió a descartarse sola: es el trabajo de alguien');
  });

  test('cuando el servidor rechaza una edición se dice el motivo, no "quedó guardada"', () => {
    // 409 "tiene cobros aplicados": guardarla para después la reintentaba
    // para siempre y a quien editaba se le decía que se iba a sincronizar.
    const cuerpo = servicio.slice(servicio.indexOf('async editarFactura('), servicio.indexOf('async actualizarFacturaPendiente('));

    assert.match(cuerpo, /if \(this\.esRechazo\(error\)\) throw new Error\(motivo\)/);
    assert.ok(cuerpo.indexOf('this.esRechazo(error)') < cuerpo.indexOf('saveEdicionPendiente'));
  });

  test('la copia de la factura en la tablet conserva la marca, para poder editarla dos veces sin señal', () => {
    const cache = servicio.slice(servicio.indexOf('async guardarFacturaLocalEnCache('));

    assert.match(cache, /esPropia: Boolean\(facturaVista\.esPropia\)/);
    assert.match(hook, /esPropia: Boolean\(facturaEditando\?\.esPropia\)/);
  });

  test('el PDF que se abre al terminar es el nuestro', () => {
    assert.match(hook, /await abrirPdfFacturaPropia\(api, resultado\.data\.id\)/);
    assert.equal(/alegraService/.test(hook), false);
  });
});

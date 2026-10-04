const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * `/api/alegra` ya no le habla a Alegra (2026-10-04).
 *
 * El router adaptador nació para que el frontend siguiera llamando a
 * `/api/alegra/...` mientras por detrás se partía un servicio enorme en
 * módulos. Con la migración, casi todo lo que colgaba de ahí pasó a
 * responder con datos propios; quedaban, sin pantalla que las llamara, las
 * rutas que de verdad iban a Alegra (`/categorias`, `/contactos`,
 * `/proveedores`, `/sincronizar/*`) y el módulo viejo de productos, que
 * copiaba el catálogo de Alegra a una tabla `productos` — distinta de
 * `producto`, el maestro— que nadie actualizaba desde el 2026-09-09.
 *
 * Lo que queda montado son módulos propios con el prefijo viejo. Esta prueba
 * cuida que el archivo no vuelva a crecer: una ruta nueva debajo de `/alegra`
 * nace sin permiso, porque ese prefijo es compartido.
 */

const RAIZ = path.join(__dirname, '..', '..');
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const existe = (...partes) => fs.existsSync(path.join(RAIZ, ...partes));
const codigo = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('el router adaptador solo monta módulos propios', () => {
  const adaptador = codigo(leer('backend', 'routes', 'alegra.js'));

  test('monta exactamente Bodega, reportes, faltantes y órdenes de compra', () => {
    const montados = [...adaptador.matchAll(/router\.use\('([^']+)'/g)].map(m => m[1]).sort();
    assert.deepEqual(montados, ['/bodega', '/faltantes', '/orden-compra', '/reportes']);
  });

  test('un módulo con permiso propio no se monta también debajo del prefijo compartido', () => {
    // Impresión estaba en `/api/reimpresion` (pide el módulo) y OTRA VEZ en
    // `/api/alegra/reimpresion`, que es compartido: cualquiera con sesión
    // podía procesar una factura de la cola —que la edita— sin tener el
    // módulo. Lo que el adaptador monta tiene que seguir teniendo dueño.
    const { clasificarRuta, MODULOS } = require('../src/modules/usuarios/modulos');
    const montados = [...adaptador.matchAll(/router\.use\('([^']+)'/g)].map(m => m[1]);

    for (const m of MODULOS) {
      for (const prefijo of m.rutasApi.filter(p => !p.startsWith('/alegra/'))) {
        if (!montados.includes(prefijo)) continue;
        const porAlegra = clasificarRuta(`/alegra${prefijo}/algo`);
        assert.equal(porAlegra?.tipo, 'modulo',
          `${prefijo} es de "${m.clave}" pero por /alegra${prefijo} entra cualquiera con sesión`);
      }
    }
    assert.equal(clasificarRuta('/reimpresion/facturas/9/procesar').clave, 'impresion');
  });

  test('lo que escribe debajo de /alegra tiene dueño; lo que queda compartido son los reportes', () => {
    const { clasificarRuta } = require('../src/modules/usuarios/modulos');

    assert.equal(clasificarRuta('/alegra/bodega/facturas-propias/5/estado').clave, 'facturas-bodega');
    assert.equal(clasificarRuta('/alegra/faltantes/ajustes').clave, 'reporte-clientes');
    assert.equal(clasificarRuta('/alegra/orden-compra/enviar-whatsapp').clave, 'reporte-proveedores');
    // Los dos reportes y la cola de impresión leen de acá: compartido a
    // propósito, igual que `/reportes`.
    assert.equal(clasificarRuta('/alegra/reportes/faltantes/cliente').tipo, 'compartida');
  });

  test('no define rutas sueltas: todo lo que hay es de un módulo', () => {
    assert.equal(/router\.(get|post|put|patch|delete)\(/.test(adaptador), false,
      'volvió una ruta suelta debajo de /alegra: nace compartida, sin permiso');
  });

  test('no importa la integración de Alegra ni la base', () => {
    assert.equal(/integrations\/alegra/.test(adaptador), false);
    assert.equal(/config\/database/.test(adaptador), false);
  });

  test('ninguno de los módulos que monta importa la integración', () => {
    const carpetas = ['warehouse', 'reports', 'missing-items', 'orders-whatsapp'];
    for (const carpeta of carpetas) {
      const dir = path.join(RAIZ, 'backend', 'src', 'modules', carpeta);
      for (const archivo of fs.readdirSync(dir).filter(a => a.endsWith('.js'))) {
        assert.equal(/integrations\/alegra/.test(codigo(fs.readFileSync(path.join(dir, archivo), 'utf8'))), false,
          `${carpeta}/${archivo} le habla a Alegra`);
      }
    }
  });
});

describe('el módulo viejo de productos se fue', () => {
  test('ni el módulo ni su montaje', () => {
    const servidor = codigo(leer('backend', 'server.js'));

    assert.equal(existe('backend', 'src', 'modules', 'products'), false);
    assert.equal(/app\.use\('\/api\/productos'/.test(servidor), false);
    assert.equal(/modules\/products/.test(servidor), false);
  });

  test('la aplicación ya no lee ni escribe la tabla vieja `productos`', () => {
    // `producto` (singular) es el maestro. La plural era la copia local de
    // Alegra; sigue en la base por las llaves que la apuntan, pero sin código.
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return recorrer(ruta);
      return e.name.endsWith('.js') ? [ruta] : [];
    });
    const culpables = ['src', 'routes', 'services'].flatMap(c => recorrer(path.join(RAIZ, 'backend', c)))
      .filter(ruta => /\b(FROM|JOIN|INTO|UPDATE)\s+productos\b/i.test(codigo(fs.readFileSync(ruta, 'utf8'))))
      .map(ruta => path.relative(RAIZ, ruta));

    assert.deepEqual(culpables, []);
  });

  test('la integración no quedó pidiendo un archivo borrado', () => {
    const sync = leer('backend', 'src', 'integrations', 'alegra', 'services', 'alegra-sync.service.js');

    assert.equal(/modules\/products/.test(sync), false);
    assert.equal(/syncProductsAutomatically|syncProductsCache/.test(sync), false);
    // La de cada 6 horas sigue: es la que llena la caché que todavía lee la
    // auditoría de inventario.
    assert.match(sync, /async syncProductsFromAlegra\(/);
  });

  test('"/productos" y "/facturas" ya no son prefijos de nadie; "/productos-revision" sigue con dueño', () => {
    const { clasificarRuta, moduloDeRuta, COMPARTIDAS } = require('../src/modules/usuarios/modulos');

    assert.equal(COMPARTIDAS.includes('/productos'), false);
    assert.equal(clasificarRuta('/productos/12'), null);
    assert.equal(clasificarRuta('/facturas/3'), null);
    assert.equal(moduloDeRuta('/productos-revision/buscar'), 'revision-precios');
  });
});

describe('no queda un borrado total de faltantes sin pantalla', () => {
  test('ningún archivo de la aplicación borra `faltantes` sin filtro', () => {
    // `missing-items` tenía `DELETE FROM faltantes` a secas detrás de
    // `DELETE /faltantes/proveedor/limpiar`: sin pantalla, y alcanzable por
    // cualquiera con sesión en `/alegra/faltantes`. Los faltantes alimentan
    // los dos reportes y la cola de impresión.
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

  test('`missing-items` solo guarda y quita ajustes', () => {
    const rutas = codigo(leer('backend', 'src', 'modules', 'missing-items', 'missing-items.routes.js'));
    assert.deepEqual([...rutas.matchAll(/router\.(\w+)\('([^']+)'/g)].map(m => `${m[1]} ${m[2]}`),
      ['post /ajustes', 'delete /ajustes/:faltanteId']);
  });
});

describe('WhatsApp ya no busca el teléfono en Alegra', () => {
  test('queda una sola ruta de teléfonos, por el id propio del cliente', () => {
    const rutas = codigo(leer('backend', 'src', 'modules', 'envios-whatsapp', 'envios.routes.js'));
    const controlador = codigo(leer('backend', 'src', 'modules', 'envios-whatsapp', 'envios.controller.js'));

    assert.deepEqual([...rutas.matchAll(/router\.get\('([^']+)'/g)].map(m => m[1]),
      ['/telefonos-cliente/:clienteId', '/historial']);
    assert.equal(/integrations\/alegra/.test(controlador), false);
  });

  test('el modal recibe solo `clienteId`, y nadie le pasa otra cosa', () => {
    const modal = codigo(leer('frontend', 'src', 'components', 'whatsapp', 'ModalEnviarWhatsApp.jsx'));
    assert.equal(/contactoId/.test(modal), false);

    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : recorrer(ruta);
      return /\.jsx$/.test(e.name) ? [ruta] : [];
    });
    for (const ruta of recorrer(path.join(RAIZ, 'frontend', 'src'))) {
      const fuente = fs.readFileSync(ruta, 'utf8');
      for (const [uso] of fuente.matchAll(/<ModalEnviarWhatsApp[\s\S]*?\/>/g)) {
        assert.equal(/\bcontactoId=/.test(uso), false, `${path.relative(RAIZ, ruta)} le pasa contactoId al modal`);
      }
    }
  });
});

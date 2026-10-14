const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * `/api/alegra` ya no existe (2026-10-04).
 *
 * Era un router adaptador: nació para que el frontend siguiera llamando a
 * `/api/alegra/...` mientras por detrás se partía un servicio enorme en
 * módulos. Con la migración dejó de hablarle a Alegra, pero seguía juntando
 * media aplicación debajo de UN prefijo, y ese prefijo era compartido: lo
 * que colgaba de ahí pasaba con cualquier sesión. Por ahí quedaron sin
 * permiso, en distintos momentos, la Gestión de Catálogo, Facturación,
 * Bodega, Impresión (montada dos veces), los ajustes de entrega y las
 * órdenes de compra con su envío por WhatsApp.
 *
 * Ahora cada módulo tiene su dirección y su dueño en `usuarios/modulos.js`.
 * Esta prueba cuida las dos formas en que el hueco puede volver: un router
 * montado en dos prefijos, y un prefijo montado que nadie registró.
 */

const RAIZ = path.join(__dirname, '..', '..');
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const existe = (...partes) => fs.existsSync(path.join(RAIZ, ...partes));
// No dos expresiones regulares: ver por qué en dobles/sinComentarios.js.
const { sinComentarios: codigo } = require('./dobles/sinComentarios');

/** Cada `app.use('/api/…', quién)` de server.js. */
function montajes() {
  return [...codigo(leer('backend', 'server.js')).matchAll(/app\.use\('\/api(\/[^']+)',\s*([^)]+)\)/g)]
    .map(m => ({ prefijo: m[1], router: m[2].trim() }));
}

describe('el prefijo /alegra se fue entero', () => {
  test('ni el router adaptador ni su montaje', () => {
    assert.equal(existe('backend', 'routes', 'alegra.js'), false);
    assert.equal(montajes().some(m => m.prefijo.startsWith('/alegra')), false);
    assert.equal(/routes\/alegra/.test(codigo(leer('backend', 'server.js'))), false);
  });

  test('ninguna pantalla llama a /alegra/...', () => {
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : recorrer(ruta);
      return /\.(js|jsx)$/.test(e.name) ? [ruta] : [];
    });
    const culpables = recorrer(path.join(RAIZ, 'frontend', 'src'))
      .filter(ruta => /['"`]\/alegra\//.test(codigo(fs.readFileSync(ruta, 'utf8'))))
      .map(ruta => path.relative(RAIZ, ruta));

    assert.deepEqual(culpables, []);
  });

  test('lo que colgaba de ahí está montado en su dirección, con su dueño', () => {
    const { clasificarRuta } = require('../src/modules/usuarios/modulos');
    const montados = montajes().map(m => m.prefijo);

    for (const [prefijo, dueno] of [
      ['/bodega', 'facturas-bodega'],
      ['/faltantes', 'reporte-clientes'],
      ['/orden-compra', 'reporte-proveedores'],
      ['/reimpresion', 'impresion']
    ]) {
      assert.ok(montados.includes(prefijo), `${prefijo} no está montado en server.js`);
      assert.equal(clasificarRuta(`${prefijo}/algo`)?.clave, dueno, `${prefijo} tendría que ser de ${dueno}`);
    }
    // La lista ahora lleva recorrido/Maps y exige el permiso del reporte,
    // igual que sus selectores y Excel. Impresión usa su consulta propia.
    assert.equal(clasificarRuta('/reportes/faltantes/cliente').clave, 'reporte-clientes');
  });

  test('la pantalla llama a esas mismas direcciones', () => {
    const servicio = leer('frontend', 'src', 'services', 'alegraService.js');
    const bodega = leer('frontend', 'src', 'services', 'bodegaPropiaService.js');
    const proveedores = leer('frontend', 'src', 'hooks', 'useEdicionFaltantesProveedor.js');
    const envio = leer('frontend', 'src', 'hooks', 'useEnvioOrdenProveedor.js');

    assert.match(bodega, /api\.get\('\/bodega\/facturas-propias'/);
    assert.match(servicio, /api\.post\('\/faltantes\/ajustes'/);
    assert.match(servicio, /api\.get\('\/reportes\/faltantes\/cliente'/);
    assert.match(envio, /api\.post\('\/orden-compra\/proveedor\/enviar'/);
    assert.doesNotMatch(servicio, /api\.post\('\/orden-compra\/enviar-whatsapp'/);
    assert.match(proveedores, /api\.post\('\/orden-compra\/producto-agregado'/);
  });
});

describe('cada llamada de la pantalla tiene su ruta en el servidor', () => {
  // Mudar 23 llamadas de prefijo es el tipo de cambio donde una queda mal
  // escrita y responde 404 recién cuando alguien toca ese botón. Se compara
  // lo que el frontend llama contra lo que el backend define.
  const ROUTERS = {
    '/bodega': ['warehouse', 'warehouse.routes.js'],
    '/reportes': ['reports', 'report.routes.js'],
    '/faltantes': ['missing-items', 'missing-items.routes.js'],
    '/orden-compra': ['orders-whatsapp', 'orders-whatsapp.routes.js']
  };
  // Seguir también los subrouters: la orden persistida y la entrada por
  // proveedor tienen rutas propias, todas bajo el permiso de /orden-compra.
  const rutasEn = (archivo, base = '') => {
    const fuente = codigo(fs.readFileSync(archivo, 'utf8'));
    const directas = [...fuente.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map(m => ({
      metodo: m[1],
      patron: new RegExp(`^${(base + m[2]).replace(/:[A-Za-z]+/g, '[^/]+')}$`)
    }));
    const anidadas = [...fuente.matchAll(/router\.use\('([^']+)',\s*require\('([^']+)'\)\)/g)]
      .flatMap(m => rutasEn(require.resolve(path.resolve(path.dirname(archivo), m[2])), base + m[1]));
    return [...directas, ...anidadas];
  };
  const rutasDe = prefijo => rutasEn(path.join(RAIZ, 'backend', 'src', 'modules', ...ROUTERS[prefijo]));

  const llamadas = ['services/alegraService.js', 'services/bodegaPropiaService.js', 'hooks/useReporteProveedores.js',
    'hooks/useEdicionFaltantesProveedor.js', 'hooks/useEnvioOrdenProveedor.js']
    .flatMap((archivo) => {
      const fuente = codigo(leer('frontend', 'src', ...archivo.split('/')));
      const base = fuente.match(/const BASE\s*=\s*'([^']+)'/)?.[1];
      return [...fuente.matchAll(/api\.(get|post|put|patch|delete)\(\s*['`]([^'`]+)['`]/g)].map(m => ({
        archivo, metodo: m[1],
        // `${…}` es un valor en la dirección; lo que va después de `?` no es ruta.
        ruta: m[2].replace(/\$\{BASE\}/g, base || 'x').replace(/\$\{[^}]+\}/g, 'x').split('?')[0]
      }));
    })
    .filter(l => Object.keys(ROUTERS).some(p => l.ruta.startsWith(`${p}/`)));

  test('se reconocen las llamadas de las pantallas y sus hooks separados', () => {
    // El envío directo retiró cinco llamadas del modal de órdenes. Cuidar
    // las entradas concretas evita que el lector deje de reconocer un hook.
    for (const [metodo, ruta] of [
      ['get', '/bodega/facturas-propias'], ['post', '/faltantes/ajustes'],
      ['get', '/reportes/faltantes/cliente'], ['post', '/orden-compra/proveedor/enviar'],
      ['post', '/orden-compra/producto-agregado']
    ]) assert.ok(llamadas.some(l => l.metodo === metodo && l.ruta === ruta), `no se reconoció ${metodo} ${ruta}`);
  });

  for (const { archivo, metodo, ruta } of llamadas) {
    test(`${metodo.toUpperCase()} ${ruta}`, () => {
      const prefijo = Object.keys(ROUTERS).find(p => ruta.startsWith(`${p}/`));
      const resto = ruta.slice(prefijo.length);
      assert.ok(rutasDe(prefijo).some(r => r.metodo === metodo && r.patron.test(resto)),
        `${archivo} llama a ${metodo.toUpperCase()} ${ruta} y el servidor no tiene esa ruta`);
    });
  }
});

describe('las dos formas en que el hueco puede volver', () => {
  test('ningún router está montado en dos prefijos', () => {
    // Así estaba Impresión: en `/api/reimpresion`, que pedía el módulo, y en
    // `/api/alegra/reimpresion`, que no. Con un usuario sin el módulo, 403 en
    // la primera y 200 en la segunda.
    const porRouter = new Map();
    for (const { prefijo, router } of montajes()) {
      porRouter.set(router, [...(porRouter.get(router) || []), prefijo]);
    }
    const repetidos = [...porRouter].filter(([, prefijos]) => prefijos.length > 1)
      .map(([router, prefijos]) => `${router}: ${prefijos.join(' y ')}`);

    assert.deepEqual(repetidos, []);
  });

  test('todo prefijo montado está registrado: de un módulo, compartido, de administrador o público', () => {
    // Una ruta sin clasificar pasa como compartida (permisos.middleware). Un
    // módulo nuevo que se monta y no se registra nace abierto.
    const { clasificarRuta, esRutaAdmin } = require('../src/modules/usuarios/modulos');
    const auth = leer('backend', 'src', 'modules', 'auth', 'auth.middleware.js');

    const sinDueno = montajes().map(m => m.prefijo)
      .filter(p => !clasificarRuta(p) && !clasificarRuta(`${p}/x`) && !esRutaAdmin(p))
      .filter(p => !auth.includes(`'${p}`));   // lo público se lista ahí, con comilla y prefijo

    assert.deepEqual(sinDueno, []);
  });

  test('`missing-items` solo guarda y quita ajustes', () => {
    const rutas = codigo(leer('backend', 'src', 'modules', 'missing-items', 'missing-items.routes.js'));
    assert.deepEqual([...rutas.matchAll(/router\.(\w+)\('([^']+)'/g)].map(m => `${m[1]} ${m[2]}`),
      ['post /ajustes', 'delete /ajustes/:faltanteId']);
  });

  test('ningún archivo de la aplicación borra `faltantes` sin filtro', () => {
    // `DELETE /faltantes/proveedor/limpiar` los borraba todos, sin pantalla.
    // Los faltantes alimentan los dos reportes y la cola de impresión. El
    // camino antiguo de Configuración ahora responde 410 sin consultar.
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return recorrer(ruta);
      return e.name.endsWith('.js') ? [ruta] : [];
    });
    const culpables = recorrer(path.join(RAIZ, 'backend', 'src'))
      .filter(ruta => /DELETE FROM faltantes\s*['"`;)]/.test(codigo(fs.readFileSync(ruta, 'utf8'))))
      .map(ruta => path.relative(RAIZ, ruta));

    assert.deepEqual(culpables, []);
    assert.match(codigo(leer('backend', 'src', 'modules', 'reports', 'report.routes.js')),
      /router\.delete\('\/faltantes\/proveedor\/limpiar', reportController\.clearProcessedSupplierMissingItems\)/);
    assert.doesNotMatch(leer('frontend', 'src', 'services', 'alegraService.js'),
      /api\.delete\('\/reportes\/faltantes\/proveedor\/limpiar'\)/);
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
    const culpables = ['src', 'services'].flatMap(c => recorrer(path.join(RAIZ, 'backend', c)))
      .filter(ruta => /\b(FROM|JOIN|INTO|UPDATE)\s+productos\b/i.test(codigo(fs.readFileSync(ruta, 'utf8'))))
      .map(ruta => path.relative(RAIZ, ruta));

    assert.deepEqual(culpables, []);
  });

  test('la integración antigua ya no existe en la aplicación', () => {
    assert.equal(existe('backend', 'src', 'integrations', 'alegra'), false);
  });

  test('"/productos" y "/facturas" ya no son prefijos de nadie; "/productos-revision" sigue con dueño', () => {
    const { clasificarRuta, moduloDeRuta, COMPARTIDAS } = require('../src/modules/usuarios/modulos');

    assert.equal(COMPARTIDAS.includes('/productos'), false);
    assert.equal(clasificarRuta('/productos/12'), null);
    assert.equal(clasificarRuta('/facturas/3'), null);
    assert.equal(moduloDeRuta('/productos-revision/buscar'), 'revision-precios');
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

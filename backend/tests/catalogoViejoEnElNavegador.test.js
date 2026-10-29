const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

/**
 * El catálogo que el sistema anterior dejó guardado en el navegador.
 *
 * EL ERROR (2026-10-10, producción, el día del corte). Facturación guarda
 * productos y clientes en la IndexedDB del dispositivo para vender sin señal.
 * El sistema anterior guardaba cada fila con el id de ALEGRA en `id`. Al
 * desplegar el sistema propio esas filas siguieron ahí: la pantalla solo
 * descarga el catálogo si lo encuentra vacío. Entonces mandó el id de Alegra
 * como si fuera el propio —son números del mismo rango— y el servidor
 * facturó, sin error, a otro cliente y otro producto: se eligió a un cliente
 * y la factura salió a nombre de PANADERÍA SION; se pidió la referencia 0005
 * (UNIÓN LISA) y salió JARRA VIDRIO MD LABRADA.
 *
 * Tres defensas, y acá se prueban las dos del navegador (la del servidor
 * está en facturaPropia.test.js, "lo que el cajero vio es lo que se factura"):
 *  1. la base local sube de versión y vacía esas dos listas;
 *  2. una fila sin id propio no sale del servicio aunque siga guardada.
 *
 * De paso, las fotos: se guardan como ruta ("/archivos/productos/…") y las
 * sirve el backend, que en Render vive en OTRA dirección que la web. Puestas
 * a secas en un <img> le piden la foto a la web y dan 404.
 *
 * Los archivos del frontend son ESM con imports sin extensión: se les quitan
 * las líneas de módulo y se evalúan, como en las demás pruebas de este tipo.
 */

const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
const leer = (...partes) => fs.readFileSync(path.join(FRONTEND, ...partes), 'utf8');
const sinModulo = (fuente) => fuente.replace(/^import .*$/gm, '').replace(/^export default .*$/gm, '').replace(/^export /gm, '');
const silencio = { log() {}, warn() {}, error() {} };

const COLAS = ['facturas_pendientes', 'ediciones_pendientes', 'pedidos_agente'];
const ALMACENES = ['productos', 'clientes', 'facturas_cache', 'configuracion', ...COLAS];

/** Un navegador que ya tenía la base en `versionGuardada` (0 = nunca la abrió). */
function navegadorCon(versionGuardada) {
  const vaciados = [];
  const existentes = new Set(versionGuardada > 0 ? ALMACENES : []);
  let pedida = null;
  const almacen = (nombre) => ({
    indexNames: [], deleteIndex() {}, createIndex() {}, put() {},
    getAll: () => ({}),
    clear() { vaciados.push(nombre); }
  });
  const db = {
    objectStoreNames: { contains: (n) => existentes.has(n) },
    createObjectStore(n) { existentes.add(n); return almacen(n); },
    close() {}
  };
  const indexedDB = {
    open(_nombre, version) {
      pedida = version;
      const req = { result: db, transaction: { objectStore: almacen } };
      setTimeout(() => {
        if (version > versionGuardada) req.onupgradeneeded({ oldVersion: versionGuardada, newVersion: version, target: req });
        req.onsuccess();
      }, 0);
      return req;
    }
  };
  return { indexedDB, vaciados, versionPedida: () => pedida };
}

function baseLocalSobre(navegador) {
  const Clase = new Function('indexedDB', 'combinarCopiaFactura', 'convertirCopiaV3', 'console',
    `${sinModulo(leer('services', 'indexedDBService.js'))}\nreturn IndexedDBService;`)(
    navegador.indexedDB, (a) => a, (a) => a, silencio);
  return new Clase();
}

describe('la base local vacía el catálogo del sistema anterior', () => {
  // 3 es la versión que dejó el sistema anterior; 4, la de un dispositivo que
  // ya abrió el sistema propio antes de este arreglo (el caso de producción).
  for (const version of [3, 4]) {
    test(`desde la versión ${version}: se vacían productos y clientes, y ninguna cola`, async () => {
      const navegador = navegadorCon(version);
      await baseLocalSobre(navegador).abierta();

      assert.ok(navegador.versionPedida() >= 5, 'la versión no subió: los dispositivos no se enteran');
      assert.ok(navegador.vaciados.includes('productos'), 'quedaron los productos con ids de Alegra');
      assert.ok(navegador.vaciados.includes('clientes'), 'quedaron los clientes con ids de Alegra');
      for (const cola of COLAS) {
        assert.equal(navegador.vaciados.includes(cola), false, `se vació ${cola}: ahí hay ventas sin mandar`);
      }
    });
  }

  test('un dispositivo nuevo no tiene nada que vaciar', async () => {
    const navegador = navegadorCon(0);
    await baseLocalSobre(navegador).abierta();
    assert.deepEqual(navegador.vaciados, []);
  });

  test('ya al día, no se vuelve a vaciar: el catálogo sirve sin señal', async () => {
    const navegador = navegadorCon(5);
    await baseLocalSobre(navegador).abierta();
    assert.deepEqual(navegador.vaciados, []);
  });
});

// Como las dejó el sistema anterior: el id de Alegra en `id`, y nada más.
const UNION_VIEJA = { id: 1084, name: 'UNION LISA 1/2', reference: '0005' };
const TARCICIO_VIEJO = { id: 151, name: 'Tarcicio Gerardo Vargas Chavarria', identification: '203330444' };
// Como las guarda el sistema propio.
const UNION = { id: 7, productoId: 7, alegraId: '1084', name: 'UNION LISA 1/2', reference: '0005' };
const TARCICIO = { id: 237, clienteId: 237, alegraId: '151', name: 'Tarcicio Gerardo Vargas Chavarria', identification: '203330444' };

function facturacionSobre({ productos = [], clientes = [] }) {
  const db = {
    getProductos: async () => productos,
    getProductoByReference: async (codigo) => productos.find(p => p.reference === codigo) || null,
    searchProductosByName: async () => productos,
    getClientes: async () => clientes,
    searchClientesByName: async () => clientes
  };
  const Clase = new Function('navigator', 'window', 'console', 'api', 'indexedDBService',
    'facturaEscrita', 'facturaConsultada', 'combinarCopiaFactura',
    `${sinModulo(leer('services', 'facturacionService.js'))}\nreturn FacturacionService;`)(
    { onLine: true }, { addEventListener() {} }, silencio, {}, db, (a) => a, (a) => a, (a) => a);
  return new Clase();
}

describe('una fila del catálogo viejo no sale del servicio', () => {
  test('con solo filas viejas, el catálogo se ve vacío: es lo que hace que se descargue de nuevo', async () => {
    const servicio = facturacionSobre({ productos: [UNION_VIEJA], clientes: [TARCICIO_VIEJO] });
    assert.deepEqual(await servicio.getProductos(), []);
    assert.deepEqual(await servicio.getClientes(), []);
  });

  test('el código 0005 no devuelve la fila con el id de Alegra', async () => {
    const servicio = facturacionSobre({ productos: [UNION_VIEJA] });
    assert.equal(await servicio.buscarProductoPorCodigo('0005'), null);
  });

  test('buscar por nombre tampoco las ofrece', async () => {
    const servicio = facturacionSobre({ productos: [UNION_VIEJA, UNION], clientes: [TARCICIO_VIEJO, TARCICIO] });
    assert.deepEqual((await servicio.buscarProductosPorNombre('union')).map(p => p.id), [7]);
    assert.deepEqual((await servicio.buscarClientesPorNombre('tarcicio')).map(c => c.id), [237]);
  });

  test('las del sistema propio salen enteras', async () => {
    const servicio = facturacionSobre({ productos: [UNION], clientes: [TARCICIO] });
    assert.deepEqual(await servicio.getProductos(), [UNION]);
    assert.deepEqual(await servicio.buscarProductoPorCodigo('0005'), UNION);
    assert.deepEqual(await servicio.getClientes(), [TARCICIO]);
  });
});

describe('la pantalla le dice al servidor lo que estaba mostrando', () => {
  const hook = sinComentarios(leer('hooks', 'useFacturacion.js'));

  test('manda el id propio del cliente, con su nombre y su cédula', () => {
    assert.match(hook, /clienteId:\s*parseInt\(clienteSeleccionado\.clienteId \?\? clienteSeleccionado\.id\)/);
    assert.match(hook, /clienteNombre:\s*clienteSeleccionado\.name/);
    assert.match(hook, /clienteIdentificacion:\s*clienteSeleccionado\.identification/);
  });

  test('cada línea lleva la referencia y el nombre que se veían', () => {
    const linea = hook.slice(hook.indexOf('items: items.map(item => ({'));
    const cuerpo = linea.slice(0, linea.indexOf('}))'));
    assert.match(cuerpo, /productoId:\s*parseInt\(item\.productoId \?\? item\.id\)/);
    assert.match(cuerpo, /reference:\s*item\.reference/);
    assert.match(cuerpo, /name:\s*item\.name/);
  });
});

describe('las fotos se piden al backend, no a la web', () => {
  const urlArchivoCon = (baseURL) => new Function('api',
    `${sinModulo(leer('utils', 'urlArchivo.js'))}\nreturn urlArchivo;`)({ defaults: { baseURL } });

  test('una ruta propia se completa con la dirección de la API', () => {
    const urlArchivo = urlArchivoCon('https://sistema-facturas-cr-web.onrender.com/api');
    assert.equal(urlArchivo('/archivos/productos/7-1.jpg'),
      'https://sistema-facturas-cr-web.onrender.com/archivos/productos/7-1.jpg');
  });

  test('una dirección completa se deja igual, y sin foto no hay dirección', () => {
    const urlArchivo = urlArchivoCon('https://sistema-facturas-cr-web.onrender.com/api');
    assert.equal(urlArchivo('https://cdn3.alegra.com/foto.jpg?Expires=1'), 'https://cdn3.alegra.com/foto.jpg?Expires=1');
    assert.equal(urlArchivo('blob:http://localhost/abc'), 'blob:http://localhost/abc');
    assert.equal(urlArchivo(null), null);
    assert.equal(urlArchivo(''), null);
  });

  const archivosJsx = (carpeta) => fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) return archivosJsx(ruta);
    return e.name.endsWith('.jsx') ? [ruta] : [];
  });

  test('ningún <img> pone a secas un campo de foto que viene del servidor', () => {
    const sueltas = [];
    for (const ruta of archivosJsx(FRONTEND)) {
      const fuente = sinComentarios(fs.readFileSync(ruta, 'utf8'));
      for (const [, expresion] of fuente.matchAll(/\bsrc=\{([^}]+)\}/g)) {
        if (/^[\w.?]*\.(imagen|imagen_url|image_url)$/.test(expresion.trim())) {
          sueltas.push(`${path.relative(FRONTEND, ruta)}: src={${expresion.trim()}}`);
        }
      }
    }
    assert.deepEqual(sueltas, [], 'estas fotos dan 404 en producción: envolver en urlArchivo()');
  });

  // Estas reciben la ruta en una variable: la expresión del <img> no alcanza
  // para reconocerlas, así que se nombran.
  for (const componente of [
    // La foto de cada sugerencia la dibuja la tarjeta, la misma de la fila y del «Ver más».
    ['components', 'facturacion', 'TarjetaSugerencia.jsx'],
    ['components', 'rentabilidad', 'ListaProductos.jsx'],
    ['components', 'inventario-auditoria', 'SeccionProductosNuevos.jsx'],
    ['components', 'catalogo-agente', 'TarjetaProductoAgente.jsx']
  ]) {
    test(`${componente.at(-1)} pasa su foto por urlArchivo`, () => {
      assert.match(sinComentarios(leer(...componente)), /urlArchivo\(/);
    });
  }
});

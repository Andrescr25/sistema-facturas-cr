/**
 * El portal de clientes, separado del sistema interno.
 *
 * QUÉ PROTEGE. El 2026-10-20 el usuario pidió: «no quiero que los clientes
 * puedan llegar al sistema interno». El portal se arma como otro sitio desde
 * `mainPortal.jsx` (`npm run build:portal`). Si alguien importa ahí, aunque
 * sea de rebote, una pantalla del personal, el sitio de los clientes la
 * llevaría adentro sin que nada falle. Esta prueba recorre los imports desde
 * esa entrada y lo detiene.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FRONT = path.join(__dirname, '..', '..', 'frontend');
const SRC = path.join(FRONT, 'src');
const rel = (ruta) => path.relative(SRC, ruta).split(path.sep).join('/');

/** Resuelve un import relativo como lo hace Vite: con o sin extensión. */
function resolver(desde, especificador) {
  const base = path.resolve(path.dirname(desde), especificador);
  for (const r of [base, `${base}.jsx`, `${base}.js`, path.join(base, 'index.jsx'), path.join(base, 'index.js')]) {
    if (fs.existsSync(r) && fs.statSync(r).isFile()) return r;
  }
  throw new Error(`${rel(desde)} importa ${especificador}, que no existe`);
}

/** Todos los archivos propios que alcanza una entrada, siguiendo sus imports. */
function alcanzables(entrada) {
  const vistos = new Set();
  const pendientes = [entrada];
  while (pendientes.length) {
    const archivo = pendientes.pop();
    if (vistos.has(archivo)) continue;
    vistos.add(archivo);
    if (!/\.jsx?$/.test(archivo)) continue;
    const fuente = fs.readFileSync(archivo, 'utf8');
    for (const [, esp] of fuente.matchAll(/(?:from\s+|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      pendientes.push(resolver(archivo, esp));
    }
  }
  return [...vistos].map(rel);
}

describe('el sitio de los clientes no trae el sistema interno', () => {
  const portal = alcanzables(path.join(SRC, 'mainPortal.jsx'));

  test('solo llegan las páginas del cliente', () => {
    const PAGINAS_DEL_CLIENTE = [
      'pages/CatalogoClientes.jsx', 'pages/CotizacionPublica.jsx',
      'pages/portal/PortalIngresar.jsx', 'pages/portal/PortalActivar.jsx',
      'pages/portal/PortalPedidos.jsx', 'pages/portal/PortalFacturas.jsx'
    ];
    const paginas = portal.filter(r => r.startsWith('pages/'));
    assert.deepEqual(paginas.filter(r => !PAGINAS_DEL_CLIENTE.includes(r)), [],
      'una pantalla del personal quedó al alcance del portal de clientes');
    assert.deepEqual(PAGINAS_DEL_CLIENTE.filter(r => !paginas.includes(r)), [], 'falta una página del cliente en AppPortal');
  });

  test('ni la sesión ni el armazón del personal', () => {
    for (const r of ['App.jsx', 'contexts/AuthContext.jsx', 'components/Layout.jsx', 'components/RequiereSesion.jsx', 'components/RequierePermiso.jsx']) {
      assert.ok(fs.existsSync(path.join(SRC, r)), `${r} ya no existe: actualizá esta prueba`);
      assert.ok(!portal.includes(r), `${r} quedó al alcance del portal de clientes`);
    }
  });

  test('el sistema interno sigue arrancando por main.jsx, con su sesión', () => {
    const interno = alcanzables(path.join(SRC, 'main.jsx'));
    assert.ok(interno.includes('App.jsx') && interno.includes('contexts/AuthContext.jsx'));
    assert.ok(!interno.includes('AppPortal.jsx'), 'el sistema interno no necesita la aplicación del portal');
  });

  test('el index.html tiene lo que el armado del portal reemplaza', () => {
    // htmlDelPortal (vite.config.js) cambia estas dos cosas; si faltaran,
    // el portal saldría con la entrada del sistema interno.
    const html = fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8');
    assert.match(html, /src="\/src\/main\.jsx"/);
    assert.match(html, /href="\/manifest\.json"/);
  });

  test('el manifiesto del portal no trae atajos al sistema interno', () => {
    const m = JSON.parse(fs.readFileSync(path.join(FRONT, 'public', 'manifest-portal.json'), 'utf8'));
    assert.equal(m.start_url, '/catalogo');
    assert.equal(m.shortcuts, undefined);
    assert.doesNotMatch(JSON.stringify(m), /facturaci|revision-precios|Sistema de/i);
  });
});

describe('los enlaces que se le mandan al cliente', () => {
  test('van al portal cuando está configurado y, si no, al sitio abierto', async () => {
    const { basePortal, urlPortal } = await import('../../frontend/src/utils/urlPortal.js');
    assert.equal(basePortal('https://clientes.ejemplo/', 'https://interno.ejemplo'), 'https://clientes.ejemplo');
    assert.equal(basePortal(undefined, 'https://interno.ejemplo'), 'https://interno.ejemplo');
    assert.equal(urlPortal('/portal/activar/abc', 'https://clientes.ejemplo/'), 'https://clientes.ejemplo/portal/activar/abc');
    assert.equal(urlPortal('portal/pedidos', 'https://clientes.ejemplo'), 'https://clientes.ejemplo/portal/pedidos');
  });

  test('el sistema interno solo redirige si el portal vive en otro sitio', async () => {
    const { portalEnOtroSitio } = await import('../../frontend/src/utils/urlPortal.js');
    assert.equal(portalEnOtroSitio(undefined, 'https://interno.ejemplo'), false, 'sin configurar, todo sigue como antes');
    assert.equal(portalEnOtroSitio('', 'https://interno.ejemplo'), false);
    assert.equal(portalEnOtroSitio('https://clientes.ejemplo/', 'https://clientes.ejemplo'), false, 'abierto en el mismo portal no hay a dónde ir');
    assert.equal(portalEnOtroSitio('https://clientes.ejemplo', 'https://interno.ejemplo'), true);
  });

  test('las fechas de sus compras y facturas no se corren al día anterior', async () => {
    // El servidor manda `factura.fecha` como medianoche UTC; en Costa Rica
    // (UTC−6) `new Date(f).toLocaleDateString()` decía el 9 para una compra
    // del 10. Se vio en el portal el 2026-10-20.
    const { fechaEnPalabras } = await import('../../frontend/src/utils/fechaCR.js');
    assert.equal(fechaEnPalabras('2026-10-10T00:00:00.000Z'), fechaEnPalabras('2026-10-10'));
    assert.match(fechaEnPalabras('2026-10-10T00:00:00.000Z'), /^10 de octubre de 2026$/);
    assert.match(fechaEnPalabras('2026-01-01', { day: 'numeric', month: 'short', year: 'numeric' }), /^1 ene/);
    assert.equal(fechaEnPalabras(null), '—');
    for (const r of ['components/catalogo-clientes/VolverAPedir.jsx', 'components/catalogo-clientes/ModalCompraAnterior.jsx', 'pages/portal/PortalFacturas.jsx']) {
      assert.doesNotMatch(fs.readFileSync(path.join(SRC, r), 'utf8'), /new Date\([^)]*fecha\)\.toLocaleDateString/, `${r} volvió a pasar la fecha por Date`);
    }
  });

  test('ningún enlace al cliente se arma con la dirección del sistema interno', () => {
    // El origen abierto es el del personal: un enlace hecho con él lleva al
    // cliente al sitio interno. Se arman con urlPortal().
    const fuentes = ['hooks/useClientesPortal.js', 'pages/Clientes.jsx'];
    for (const r of fuentes) {
      const fuente = fs.readFileSync(path.join(SRC, r), 'utf8');
      assert.doesNotMatch(fuente, /location\.origin\}\/(portal|catalogo|cotizacion)/, `${r} arma un enlace al cliente con el origen interno`);
    }
  });
});

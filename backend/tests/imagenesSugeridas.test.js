const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Fotos sugeridas: la búsqueda y la miniatura.
 *
 * Vivían en la Gestión de Catálogo vieja, bajo `/alegra/catalog/`, sin tener
 * nada que ver con Alegra. Se mudaron a `productos/imagenesSugeridas.js` y a
 * `/catalogos/` el 2026-10-04.
 *
 * LO QUE HAY QUE CUIDAR ES LA MINIATURA: su ruta es PÚBLICA (una etiqueta
 * <img> no manda la sesión) y hace que el servidor descargue una dirección.
 * Sin límites sería un proxy abierto.
 */

const imagenes = require('../src/modules/productos/imagenesSugeridas');
const { requireAuth, PUBLICAS, PUBLICAS_EXACTAS } = require('../src/modules/auth/auth.middleware');

/** Un "sitio" de mentira para la descarga: una IP pública y una imagen. */
const sitio = (respuesta = { status: 200, data: Buffer.from('zz'), headers: { 'content-type': 'image/webp' } }) => {
  const pedidas = [];
  return {
    pedidas,
    dependencias: {
      lookup: async () => [{ address: '93.184.216.34' }],
      cliente: { get: async (url) => { pedidas.push(url); return respuesta; } }
    }
  };
};

describe('la miniatura de una foto sugerida', () => {
  test('solo se descarga del CDN de Brave, y solo por https', () => {
    assert.equal(imagenes.hostPermitido('https://imgs.search.brave.com/abc/foto.jpg'), true);
    assert.equal(imagenes.hostPermitido('https://cdn.search.brave.com/x'), true);
    for (const no of [
      'http://imgs.search.brave.com/abc.jpg',                 // sin cifrar
      'https://imgs.search.brave.com.evil.example/abc.jpg',   // un dominio que solo EMPIEZA igual
      'https://evil.example/?u=imgs.search.brave.com',
      'https://169.254.169.254/latest/meta-data/',            // la red interna
      'https://localhost:3002/api/usuarios',
      'file:///etc/passwd', 'no es una dirección', '', null
    ]) assert.equal(imagenes.hostPermitido(no), false, String(no));
  });

  test('un origen que no está en la lista se rechaza SIN descargar nada', async () => {
    const { pedidas, dependencias } = sitio();
    await assert.rejects(imagenes.miniatura('https://evil.example/foto.jpg', dependencias), { status: 403 });
    await assert.rejects(imagenes.miniatura('https://169.254.169.254/x', dependencias), { status: 403 });
    await assert.rejects(imagenes.miniatura('ftp://imgs.search.brave.com/x', dependencias), { status: 400 });
    await assert.rejects(imagenes.miniatura(undefined, dependencias), { status: 400 });
    assert.deepEqual(pedidas, []);
  });

  test('una del CDN de Brave se entrega con su tipo', async () => {
    const { pedidas, dependencias } = sitio();
    const r = await imagenes.miniatura('https://imgs.search.brave.com/abc/foto.webp', dependencias);
    assert.deepEqual([r.buffer.toString(), r.contentType], ['zz', 'image/webp']);
    assert.deepEqual(pedidas, ['https://imgs.search.brave.com/abc/foto.webp']);
  });

  test('si el CDN redirige hacia la red interna, no se sigue', async () => {
    // Antes se descargaba con axios a secas, que sigue cualquier redirección.
    const dependencias = {
      lookup: async (host) => [{ address: host === 'imgs.search.brave.com' ? '93.184.216.34' : '10.0.0.5' }],
      cliente: { get: async () => ({ status: 302, data: Buffer.alloc(0), headers: { location: 'http://interno.example/secreto' } }) }
    };
    await assert.rejects(imagenes.miniatura('https://imgs.search.brave.com/abc', dependencias),
      { status: 400, message: /red interna/ });
  });
});

describe('qué queda abierto sin sesión', () => {
  const pasa = (ruta) => {
    let codigo = 200;
    const res = { status(c) { codigo = c; return this; }, json() { return this; } };
    let siguio = false;
    requireAuth({ method: 'GET', path: ruta, headers: {} }, res, () => { siguio = true; });
    return siguio ? 'pasa' : codigo;
  };

  test('la miniatura, exacta; nada más de /catalogos y nada de la ruta vieja', () => {
    assert.equal(pasa('/catalogos/imagen-proxy'), 'pasa');
    // Exacta: lo que cuelgue de ella no se abre, ni el resto del prefijo.
    assert.equal(pasa('/catalogos/imagen-proxy/otra'), 401);
    assert.equal(pasa('/catalogos/imagenes-sugeridas'), 401);       // buscar gasta la cuota de Brave: pide sesión
    assert.equal(pasa('/catalogos/imagenes-por-referencia'), 401);
    assert.equal(pasa('/catalogos/productos'), 401);
    // La dirección vieja dejó de ser pública junto con el módulo.
    assert.equal(pasa('/alegra/catalog/image-proxy'), 401);

    assert.ok(PUBLICAS_EXACTAS.includes('/catalogos/imagen-proxy'));
    assert.ok(![...PUBLICAS, ...PUBLICAS_EXACTAS].some(r => r.includes('/alegra/')), 'queda una ruta pública bajo /alegra');
  });
});

describe('las pantallas piden las fotos al lugar nuevo', () => {
  const frontend = (...partes) => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', ...partes), 'utf8');

  test('la ficha de producto, el producto nuevo y las miniaturas', () => {
    assert.match(frontend('hooks', 'useFichaProducto.js'), /api\.get\('\/catalogos\/imagenes-sugeridas'/);
    assert.match(frontend('hooks', 'useRelacionarProductos.js'), /api\.get\('\/catalogos\/imagenes-sugeridas'/);
    assert.match(frontend('utils', 'imagenSugeridaUtils.js'), /\/catalogos\/imagen-proxy\?url=/);
    for (const archivo of [['hooks', 'useFichaProducto.js'], ['hooks', 'useRelacionarProductos.js'], ['utils', 'imagenSugeridaUtils.js']]) {
      assert.doesNotMatch(frontend(...archivo), /\/alegra\/catalog\//, `${archivo[1]} todavía llama a /alegra/catalog`);
    }
  });

  test('sin la llave de Brave, buscar lo dice en vez de reventar', async () => {
    const antes = process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;
    try {
      await assert.rejects(imagenes.buscarImagenes('tornillo'), { status: 500, message: /BRAVE_SEARCH_API_KEY/ });
    } finally {
      if (antes !== undefined) process.env.BRAVE_SEARCH_API_KEY = antes;
    }
  });
});

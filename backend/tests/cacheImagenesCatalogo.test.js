/**
 * Las fotos del catálogo del agente en la tablet, y la actualización que
 * mandaba al ingreso a la mitad (2026-09-27, reproducido).
 *
 * LO QUE SE CUIDA
 *  - Una foto se reconoce por su ruta, no por la firma de Alegra, que cambia
 *    en cada pedido: si no, cada actualización la baja de nuevo.
 *  - Una firma vencida no se guarda: su error es opaco y dejaría la foto rota
 *    para siempre bajo la llave estable.
 *  - La caché queda con las fotos del catálogo actual y nada más, y se deja
 *    de guardar antes de llenar la cuota (Chrome cobra ~14,7 MB por foto
 *    opaca, y sin cuota tampoco se guarda el catálogo).
 *  - El service worker solo sirve: no guarda lo que se mira.
 *  - En el catálogo del agente un 401 no manda al ingreso.
 *  - LAS FOTOS PROPIAS (2026-10-11). Desde el corte la foto es una ruta
 *    ("/archivos/productos/…") que sirve el backend, en otro dominio que la
 *    web. Se descartaba por no ser una dirección completa y el worker solo
 *    servía las de Alegra: el catálogo sin señal quedó sin fotos. La ruta se
 *    completa con la misma función que la tarjeta, se pide legible (pesa lo
 *    que pesa) y un 404 no se guarda como si fuera la foto.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FRONT = path.join(__dirname, '..', '..', 'frontend');
const FUENTE = fs.readFileSync(path.join(FRONT, 'src', 'utils', 'cacheImagenesCatalogo.js'), 'utf8');

function cargar({ caches, navigator, fetch, location = { origin: 'https://web.ejemplo' } }) {
  return new Function('caches', 'navigator', 'fetch', 'location', `${FUENTE.replace(/^export /gm, '')}
    return { llaveImagen, firmaVigente, fotoDe, fotosEnOrden, esDeAlegra, guardarFotosDelCatalogo, CACHE_IMAGENES };`
  )(caches, navigator, fetch, location);
}

const AHORA = Date.now();
const CDN = 'https://cdn3.alegra.com';
const firmada = (ruta, venceEnSeg = 8 * 86400, firma = 'abc') =>
  `${CDN}/${ruta}?Expires=${Math.floor(AHORA / 1000) + venceEnSeg}&Signature=${firma}&Key-Pair-Id=K1`;

/** Una Cache API en memoria, con las llaves como URL completas. */
function cacheFalsa(iniciales = {}) {
  const datos = new Map(Object.entries(iniciales));
  const cache = {
    datos,
    keys: async () => [...datos.keys()].map((url) => ({ url })),
    match: async (req) => datos.get(typeof req === 'string' ? req : req.url),
    put: async (req, resp) => { datos.set(typeof req === 'string' ? req : req.url, resp); },
    delete: async (req) => datos.delete(typeof req === 'string' ? req : req.url)
  };
  return { cache, caches: { open: async () => cache } };
}

const { llaveImagen, firmaVigente, fotoDe, fotosEnOrden } = cargar({});

describe('qué es "la misma foto"', () => {
  test('la llave es la ruta: dos firmas distintas son la misma foto', () => {
    assert.equal(llaveImagen(firmada('h1-foto.jpg', 100, 'x')), llaveImagen(firmada('h1-foto.jpg', 900, 'y')));
    assert.equal(llaveImagen(firmada('h1-foto.jpg')), `${CDN}/h1-foto.jpg`);
  });

  test('una firma vencida (o a punto) no sirve; sin firma, sí', () => {
    assert.equal(firmaVigente(firmada('a.jpg', 3600), AHORA), true);
    assert.equal(firmaVigente(firmada('a.jpg', -10), AHORA), false);
    assert.equal(firmaVigente(firmada('a.jpg', 30), AHORA), false, 'menos de un minuto: ya no');
    assert.equal(firmaVigente(`${CDN}/a.jpg`, AHORA), true);
  });

  test('la foto de la tarjeta es la favorita, o la primera', () => {
    assert.equal(fotoDe({ images: [{ url: 'u1' }, { url: 'u2', favorite: true }] }), 'u2');
    assert.equal(fotoDe({ images: [{ url: 'u1' }] }), 'u1');
    assert.equal(fotoDe({}), null);
  });

  test('en el orden dado, sin repetir la misma foto', () => {
    const p = (id, ruta, firma) => ({ id, images: [{ url: firmada(ruta, 3600, firma) }] });
    const porLlave = fotosEnOrden([p(1, 'b.jpg', 'x'), p(2, 'a.jpg'), p(3, 'b.jpg', 'y'), { id: 4 }]);
    assert.deepEqual([...porLlave.keys()], [`${CDN}/b.jpg`, `${CDN}/a.jpg`]);
  });
});

describe('guardar las fotos del catálogo', () => {
  const navegador = (usoPorFoto = 0, cuota = 1e12, cache) => ({
    storage: {
      persist: async () => true,
      estimate: async () => ({ usage: (cache ? cache.datos.size : 0) * usoPorFoto, quota: cuota })
    }
  });

  test('lo guardado con firma pasa a su llave; lo vencido y lo que ya no está en el catálogo se borra', async () => {
    const { cache, caches } = cacheFalsa({
      [firmada('vigente.jpg', 3600, 'vieja')]: 'foto-vigente',
      [firmada('vencida.jpg', -3600, 'vieja')]: 'foto-vencida',
      [firmada('borrado.jpg', 3600)]: 'foto-de-un-producto-que-ya-no-esta',
      [`${CDN}/ya-bien.jpg`]: 'foto-ya-con-llave'
    });
    const bajadas = [];
    const m = cargar({ caches, navigator: navegador(), fetch: async (url) => { bajadas.push(url); return `red:${url}`; } });
    const porLlave = new Map([
      [`${CDN}/vigente.jpg`, firmada('vigente.jpg', 7200, 'nueva')],
      [`${CDN}/vencida.jpg`, firmada('vencida.jpg', 7200, 'nueva')],
      [`${CDN}/ya-bien.jpg`, firmada('ya-bien.jpg', 7200, 'nueva')]
    ]);
    const r = await m.guardarFotosDelCatalogo(porLlave);

    assert.deepEqual([...cache.datos.keys()].sort(), [`${CDN}/vencida.jpg`, `${CDN}/vigente.jpg`, `${CDN}/ya-bien.jpg`]);
    assert.equal(cache.datos.get(`${CDN}/vigente.jpg`), 'foto-vigente', 'no se volvió a bajar');
    assert.deepEqual(bajadas, [firmada('vencida.jpg', 7200, 'nueva')], 'solo se baja la que no servía');
    assert.deepEqual(r, { yaEstaban: 2, nuevas: 1, sinLugar: 0, fallidas: 0, borradas: 3 });
  });

  test('una segunda actualización no baja nada', async () => {
    const { caches } = cacheFalsa({ [`${CDN}/a.jpg`]: 'a', [`${CDN}/b.jpg`]: 'b' });
    let bajadas = 0;
    const m = cargar({ caches, navigator: navegador(), fetch: async () => { bajadas++; return 'x'; } });
    const r = await m.guardarFotosDelCatalogo(new Map([[`${CDN}/a.jpg`, firmada('a.jpg')], [`${CDN}/b.jpg`, firmada('b.jpg')]]));
    assert.equal(bajadas, 0);
    assert.equal(r.yaEstaban, 2);
  });

  test('para antes de llenar la cuota y dice cuántas quedaron afuera', async () => {
    const { cache, caches } = cacheFalsa();
    // 14,7 MB por foto opaca, 400 MB de cuota: con 20 % de reserva caben ~22.
    const m = cargar({ caches, navigator: navegador(14.7e6, 400e6, cache), fetch: async () => 'opaca' });
    const porLlave = new Map(Array.from({ length: 100 }, (_, i) => [`${CDN}/f${i}.jpg`, firmada(`f${i}.jpg`)]));
    const r = await m.guardarFotosDelCatalogo(porLlave);
    assert.ok(cache.datos.size * 14.7e6 <= 400e6 * 0.8 + 8 * 14.7e6, `se pasó: ${cache.datos.size} fotos`);
    assert.ok(cache.datos.has(`${CDN}/f0.jpg`), 'las de arriba del catálogo quedan');
    assert.equal(r.sinLugar, 100 - r.nuevas);
    assert.ok(r.sinLugar > 0);
  });

  test('si el navegador dice que no hay lugar, deja de intentar', async () => {
    const { caches } = cacheFalsa();
    let intentos = 0;
    const m = cargar({
      caches,
      navigator: navegador(),
      fetch: async () => { intentos++; const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; }
    });
    const porLlave = new Map(Array.from({ length: 50 }, (_, i) => [`${CDN}/f${i}.jpg`, firmada(`f${i}.jpg`)]));
    const r = await m.guardarFotosDelCatalogo(porLlave);
    assert.ok(intentos <= 8, `siguió intentando: ${intentos}`);
    assert.equal(r.sinLugar, 50);
  });
});

describe('las fotos propias, después del corte', () => {
  const API = 'https://api.ejemplo';
  // Lo mismo que hace frontend/src/utils/urlArchivo.js con el origen de la API.
  const urlArchivo = (ruta) => (!ruta ? null : /^https?:/.test(ruta) ? ruta : `${API}${ruta}`);
  const propio = (id, ruta) => ({ id, images: [{ url: ruta, favorite: true }] });
  const navegador = { storage: { persist: async () => true, estimate: async () => ({ usage: 0, quota: 1e12 }) } };
  const respuesta = (ok = true) => ({ ok, status: ok ? 200 : 404 });

  test('una ruta propia se completa con la dirección de la API: es la que pide la tarjeta', () => {
    const { fotosEnOrden } = cargar({});
    const porLlave = fotosEnOrden([propio(7, '/archivos/productos/7-1.jpg'), { id: 8 }], urlArchivo);
    assert.deepEqual([...porLlave], [[`${API}/archivos/productos/7-1.jpg`, `${API}/archivos/productos/7-1.jpg`]]);
  });

  test('antes se descartaba: sin completar, la ruta igual queda como dirección de la página', () => {
    // La web y la API en el mismo dominio: urlArchivo devuelve la ruta tal cual.
    const { fotosEnOrden } = cargar({});
    const porLlave = fotosEnOrden([propio(7, '/archivos/productos/7-1.jpg')], (ruta) => ruta);
    assert.deepEqual([...porLlave.keys()], ['https://web.ejemplo/archivos/productos/7-1.jpg']);
  });

  test('las de Alegra que queden siguen igual, mezcladas con las propias', () => {
    const { fotosEnOrden, esDeAlegra } = cargar({});
    const porLlave = fotosEnOrden([
      propio(1, '/archivos/productos/1-1.jpg'),
      { id: 2, images: [{ url: firmada('h2-foto.jpg') }] }
    ], urlArchivo);
    assert.deepEqual([...porLlave.keys()], [`${API}/archivos/productos/1-1.jpg`, `${CDN}/h2-foto.jpg`]);
    assert.equal(esDeAlegra(`${CDN}/h2-foto.jpg`), true);
    assert.equal(esDeAlegra(`${API}/archivos/productos/1-1.jpg`), false);
    assert.equal(esDeAlegra('/archivos/productos/1-1.jpg'), false);
  });

  test('la propia se pide legible; la de Alegra, a ciegas', async () => {
    const { cache, caches } = cacheFalsa();
    const pedidos = [];
    const m = cargar({ caches, navigator: navegador, fetch: async (url, opciones) => { pedidos.push([url, opciones.mode]); return respuesta(); } });
    await m.guardarFotosDelCatalogo(new Map([
      [`${API}/archivos/productos/1-1.jpg`, `${API}/archivos/productos/1-1.jpg`],
      [`${CDN}/h2-foto.jpg`, firmada('h2-foto.jpg')]
    ]));
    assert.deepEqual(pedidos.map(([url, modo]) => [new URL(url).hostname, modo]).sort(),
      [['api.ejemplo', 'cors'], ['cdn3.alegra.com', 'no-cors']]);
    // Opaca, cada foto le cuesta a Chrome ~14,7 MB de cuota: no entrarían.
    assert.ok(cache.datos.has(`${API}/archivos/productos/1-1.jpg`), 'la propia no quedó guardada');
  });

  test('un 404 no se guarda como si fuera la foto, y se cuenta aparte de la falta de lugar', async () => {
    const { cache, caches } = cacheFalsa();
    const m = cargar({ caches, navigator: navegador, fetch: async (url) => respuesta(!url.includes('perdida')) });
    const r = await m.guardarFotosDelCatalogo(new Map([
      [`${API}/archivos/productos/1-1.jpg`, `${API}/archivos/productos/1-1.jpg`],
      [`${API}/archivos/productos/perdida.jpg`, `${API}/archivos/productos/perdida.jpg`]
    ]));
    assert.deepEqual([...cache.datos.keys()], [`${API}/archivos/productos/1-1.jpg`]);
    assert.deepEqual(r, { yaEstaban: 0, nuevas: 1, sinLugar: 0, fallidas: 1, borradas: 0 });
  });

  test('si se corta la señal a la mitad, son fallidas: no "no cupieron"', async () => {
    const { caches } = cacheFalsa();
    let n = 0;
    const m = cargar({ caches, navigator: navegador, fetch: async () => { if (++n > 3) throw new TypeError('Failed to fetch'); return respuesta(); } });
    const porLlave = new Map(Array.from({ length: 10 }, (_, i) => [`${API}/archivos/productos/f${i}.jpg`, `${API}/archivos/productos/f${i}.jpg`]));
    const r = await m.guardarFotosDelCatalogo(porLlave);
    assert.deepEqual({ nuevas: r.nuevas, fallidas: r.fallidas, sinLugar: r.sinLugar }, { nuevas: 3, fallidas: 7, sinLugar: 0 });
  });

  test('una firma de Alegra ya vencida no se cuenta como "no cupo"', async () => {
    // Visto en el navegador el 2026-10-11: 13 productos de la copia local
    // seguían con dirección de Alegra vencida y la pantalla decía "No
    // cupieron 13 fotos en esta tablet", con 10 GB libres.
    const { caches } = cacheFalsa();
    const m = cargar({ caches, navigator: navegador, fetch: async () => respuesta() });
    const r = await m.guardarFotosDelCatalogo(new Map([
      [`${API}/archivos/productos/1-1.jpg`, `${API}/archivos/productos/1-1.jpg`],
      [`${CDN}/vencida.jpg`, firmada('vencida.jpg', -3600)]
    ]));
    assert.deepEqual({ nuevas: r.nuevas, fallidas: r.fallidas, sinLugar: r.sinLugar }, { nuevas: 1, fallidas: 1, sinLugar: 0 });
  });

  test('al actualizar después del corte, las de Alegra que ya no están en el catálogo se borran', async () => {
    // Cada una ocupaba ~14,7 MB de cuota: borrarlas es lo que le hace lugar a las propias.
    const { cache, caches } = cacheFalsa({ [`${CDN}/vieja-1.jpg`]: 'opaca', [`${CDN}/vieja-2.jpg`]: 'opaca' });
    const m = cargar({ caches, navigator: navegador, fetch: async () => respuesta() });
    const r = await m.guardarFotosDelCatalogo(new Map([[`${API}/archivos/productos/1-1.jpg`, `${API}/archivos/productos/1-1.jpg`]]));
    assert.deepEqual([...cache.datos.keys()], [`${API}/archivos/productos/1-1.jpg`]);
    assert.equal(r.borradas, 2);
  });

  test('la tarjeta y el guardado arman la dirección con la misma función', () => {
    const { sinComentarios } = require('./dobles/sinComentarios');
    const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, 'src', ...p), 'utf8'));
    assert.match(leer('hooks', 'useCatalogoAgente.js'), /fotosEnOrden\(enOrden, urlArchivo\)/);
    assert.match(leer('components', 'catalogo-agente', 'TarjetaProductoAgente.jsx'), /urlArchivo\(favorita\?\.url\)/);
  });
});

describe('el service worker y la API', () => {
  const sw = fs.readFileSync(path.join(FRONT, 'public', 'sw.js'), 'utf8');
  const ramaImagenes = sw.slice(sw.indexOf("url.hostname.endsWith('.alegra.com')"), sw.indexOf("if (url.origin !== location.origin)"));

  test('el worker busca la foto por su ruta y no guarda lo que se mira', () => {
    assert.match(ramaImagenes, /cache\.match\(url\.origin \+ url\.pathname, \{ ignoreVary: true \}\)/);
    assert.doesNotMatch(ramaImagenes, /cache\.put/);
  });

  test('el worker también sirve las fotos propias, y lo decide ANTES de descartar otros dominios', () => {
    // El backend es otro dominio que la web: después de ese descarte, la
    // foto propia nunca llegaría a buscarse en lo guardado.
    assert.match(ramaImagenes, /esFotoPropia = url\.pathname\.startsWith\('\/archivos\/'\)/);
    assert.match(ramaImagenes, /if \(esFotoDeAlegra \|\| esFotoPropia\)/);
  });

  test('worker y sincronización usan la misma caché', () => {
    const { CACHE_IMAGENES } = cargar({});
    assert.match(sw, new RegExp(`CATALOGO_IMAGENES_CACHE = '${CACHE_IMAGENES}'`));
  });

  test('en el catálogo del agente un 401 no manda al ingreso', () => {
    const api = fs.readFileSync(path.join(FRONT, 'src', 'services', 'api.js'), 'utf8');
    assert.match(api, /pantallaSinSesion = window\.location\.pathname\.startsWith\('\/catalogo-agente'\)/);
    assert.match(api, /if \(!pantallaSinSesion && !window\.location\.pathname\.startsWith\('\/ingresar'\)\)/);
  });
});

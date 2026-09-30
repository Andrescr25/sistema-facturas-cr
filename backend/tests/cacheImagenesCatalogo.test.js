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
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FRONT = path.join(__dirname, '..', '..', 'frontend');
const FUENTE = fs.readFileSync(path.join(FRONT, 'src', 'utils', 'cacheImagenesCatalogo.js'), 'utf8');

function cargar({ caches, navigator, fetch }) {
  return new Function('caches', 'navigator', 'fetch', `${FUENTE.replace(/^export /gm, '')}
    return { llaveImagen, firmaVigente, fotoDe, fotosEnOrden, guardarFotosDelCatalogo, CACHE_IMAGENES };`
  )(caches, navigator, fetch);
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
    assert.deepEqual(r, { yaEstaban: 2, nuevas: 1, sinLugar: 0, borradas: 3 });
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

describe('el service worker y la API', () => {
  const sw = fs.readFileSync(path.join(FRONT, 'public', 'sw.js'), 'utf8');
  const ramaImagenes = sw.slice(sw.indexOf("url.hostname.endsWith('.alegra.com')"), sw.indexOf("if (url.origin !== location.origin)"));

  test('el worker busca la foto por su ruta y no guarda lo que se mira', () => {
    assert.match(ramaImagenes, /cache\.match\(url\.origin \+ url\.pathname\)/);
    assert.doesNotMatch(ramaImagenes, /cache\.put/);
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

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Fotos de productos en almacenamiento propio: solo imágenes de verdad, sin
 * salir de la carpeta, sin descargar desde la red interna, y sin dejar
 * archivos huérfanos si la base falla.
 */

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-prueba-'));
process.env.ALMACENAMIENTO_DIR = DIR;
const almacenamiento = require('../src/integrations/almacenamiento/local');
const { descargarImagen, ipInterna } = require('../src/utils/descargarImagen');

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

after(() => fs.rmSync(DIR, { recursive: true, force: true }));

describe('almacenamiento local', () => {
  test('reconoce la imagen por sus bytes, no por lo que dice ser', () => {
    assert.equal(almacenamiento.tipoDeImagen(JPG), 'jpg');
    assert.equal(almacenamiento.tipoDeImagen(PNG), 'png');
    assert.equal(almacenamiento.tipoDeImagen(HTML), null);
  });

  test('guarda una imagen y devuelve su ruta pública', async () => {
    const r = await almacenamiento.guardarImagen({ carpeta: 'productos', prefijo: '7', buffer: JPG });
    assert.match(r.ruta, /^\/archivos\/productos\/7-\d+-[0-9a-f]{8}\.jpg$/);
    assert.ok(fs.existsSync(path.join(DIR, r.ruta.replace('/archivos/', ''))));
  });

  test('un HTML disfrazado de imagen no se guarda', async () => {
    await assert.rejects(almacenamiento.guardarImagen({ carpeta: 'productos', prefijo: '7', buffer: HTML }), e => e.status === 400);
  });

  test('más de 2 MB no se guarda', async () => {
    const grande = Buffer.concat([JPG, Buffer.alloc(2 * 1024 * 1024)]);
    await assert.rejects(almacenamiento.guardarImagen({ carpeta: 'productos', prefijo: '7', buffer: grande }), /2 MB/);
  });

  test('carpeta o prefijo con ../ no pasan', async () => {
    await assert.rejects(almacenamiento.guardarImagen({ carpeta: '../../etc', prefijo: '7', buffer: JPG }), /inválidos/);
    await assert.rejects(almacenamiento.guardarImagen({ carpeta: 'productos', prefijo: '../x', buffer: JPG }), /inválidos/);
  });

  test('borrar nunca sale de la carpeta ni toca lo que no es nuestro', async () => {
    const afuera = path.join(path.dirname(DIR), `no-borrar-${Date.now()}.txt`);
    fs.writeFileSync(afuera, 'x');
    try {
      assert.equal(await almacenamiento.borrar(`/archivos/../${path.basename(afuera)}`), false);
      assert.equal(await almacenamiento.borrar(`/archivos/productos/../../${path.basename(afuera)}`), false);
      assert.equal(await almacenamiento.borrar('https://cdn3.alegra.com/foto.jpg'), false);
      assert.ok(fs.existsSync(afuera));
    } finally {
      fs.rmSync(afuera, { force: true });
    }
    assert.equal(await almacenamiento.borrar('/archivos/productos/no-existe.jpg'), false);
  });
});

describe('descarga de imágenes', () => {
  const publica = async () => [{ address: '93.184.216.34' }];

  test('reconoce direcciones internas', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.20.0.5', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      assert.equal(ipInterna(ip), true, ip);
    }
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::6810:84e5']) assert.equal(ipInterna(ip), false, ip);
  });

  test('no descarga desde la red interna ni con otro protocolo', async () => {
    const cliente = { get: async () => { throw new Error('no debería llamarse'); } };
    await assert.rejects(descargarImagen('http://169.254.169.254/latest/meta-data', { cliente, lookup: publica }), /red interna/);
    await assert.rejects(descargarImagen('http://intranet.local/foto.jpg', { cliente, lookup: async () => [{ address: '10.0.0.9' }] }), /red interna/);
    await assert.rejects(descargarImagen('file:///etc/passwd', { cliente, lookup: publica }), /http o https/);
  });

  test('una redirección hacia la red interna también se corta', async () => {
    const pedidas = [];
    const cliente = {
      get: async (url) => {
        pedidas.push(url);
        return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' }, data: Buffer.alloc(0) };
      }
    };
    await assert.rejects(descargarImagen('https://imagenes.ejemplo.com/a.jpg', { cliente, lookup: publica }), /red interna/);
    assert.deepEqual(pedidas, ['https://imagenes.ejemplo.com/a.jpg'], 'no se llegó a pedir la dirección interna');
  });

  test('un error del sitio no sale con su código ni con el mensaje de axios', async () => {
    const falla = (status) => ({ get: async () => { const e = new Error(`Request failed with status code ${status}`); e.response = { status }; e.status = status; throw e; } });
    for (const status of [400, 403, 500, 503]) {
      await assert.rejects(descargarImagen('https://imagenes.ejemplo.com/a.jpg', { cliente: falla(status), lookup: publica }),
        e => e.status === 400 && e.message.includes(`respondió ${status}`) && !/Request failed/.test(e.message), `remoto ${status}`);
    }
    const lento = { get: async () => { const e = new Error('timeout of 15000ms exceeded'); e.code = 'ECONNABORTED'; throw e; } };
    await assert.rejects(descargarImagen('https://imagenes.ejemplo.com/a.jpg', { cliente: lento, lookup: publica }), /tardó demasiado/);
  });

  test('sigue una redirección pública y devuelve los bytes', async () => {
    const cliente = {
      get: async (url) => url.endsWith('/a.jpg')
        ? { status: 301, headers: { location: '/b.jpg' }, data: Buffer.alloc(0) }
        : { status: 200, headers: { 'content-type': 'image/jpeg' }, data: JPG }
    };
    const r = await descargarImagen('https://imagenes.ejemplo.com/a.jpg', { cliente, lookup: publica });
    assert.ok(r.buffer.equals(JPG));
  });
});

describe('asignar la foto a un producto', () => {
  const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
  const rutaAlm = path.join(__dirname, '..', 'src', 'integrations', 'almacenamiento', 'index.js');
  const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'productos', 'productos.imagenes.js');

  function montar({ existe = true, anterior = null, fallaUpdate = false } = {}) {
    const log = [];
    const borrados = [];
    const ejecutar = async (sql, params) => {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      log.push(s);
      if (/^SELECT id FROM producto/.test(s)) return { rows: existe ? [{ id: params[0] }] : [] };
      if (/FOR UPDATE/.test(s)) return { rows: existe ? [{ id: params[0], imagen_url: anterior }] : [] };
      if (/^UPDATE producto SET imagen_url/.test(s) && fallaUpdate) throw new Error('la base se cayó');
      if (/bitacora_cambio/.test(s)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    };
    const cliente = { query: ejecutar, release: () => {} };
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { pool: { connect: async () => cliente, query: ejecutar } } };
    require.cache[rutaAlm] = {
      id: rutaAlm, filename: rutaAlm, loaded: true,
      exports: {
        PREFIJO_PUBLICO: '/archivos',
        guardarImagen: async () => ({ ruta: '/archivos/productos/7-nueva.jpg' }),
        borrar: async (r) => { borrados.push(r); return true; }
      }
    };
    delete require.cache[rutaServicio];
    return { servicio: require(rutaServicio), log, borrados };
  }

  beforeEach(() => { for (const r of [rutaDb, rutaAlm, rutaServicio]) delete require.cache[r]; });

  test('producto inexistente: 404 y no se guarda ningún archivo', async () => {
    const { servicio, borrados } = montar({ existe: false });
    await assert.rejects(servicio.asignarImagenDesdeArchivo(7, { buffer: JPG }, 4), e => e.status === 404);
    assert.deepEqual(borrados, []);
  });

  test('si la base falla, el archivo recién guardado se borra', async () => {
    const { servicio, borrados, log } = montar({ fallaUpdate: true });
    await assert.rejects(servicio.asignarImagenDesdeArchivo(7, { buffer: JPG }, 4), /la base se cayó/);
    assert.deepEqual(borrados, ['/archivos/productos/7-nueva.jpg']);
    assert.ok(log.includes('ROLLBACK'));
  });

  test('la foto anterior se borra después del COMMIT, y una de Alegra no se toca', async () => {
    const propio = montar({ anterior: '/archivos/productos/7-vieja.jpg' });
    const r = await propio.servicio.asignarImagenDesdeArchivo(7, { buffer: JPG }, 4);
    assert.equal(r.imagen_url, '/archivos/productos/7-nueva.jpg');
    assert.deepEqual(propio.borrados, ['/archivos/productos/7-vieja.jpg']);

    const deAlegra = montar({ anterior: 'https://cdn3.alegra.com/foto.jpg?firma=x' });
    await deAlegra.servicio.asignarImagenDesdeArchivo(7, { buffer: JPG }, 4);
    // borrar() recibe la URL de Alegra pero el almacenamiento real la ignora (probado arriba).
    assert.deepEqual(deAlegra.borrados, ['https://cdn3.alegra.com/foto.jpg?firma=x']);
  });

  test('un error que no es nuestro nunca llega con su status a quien llama', async () => {
    const { servicio } = montar();
    const descargar = async () => { const e = new Error('Request failed with status code 500'); e.status = 500; throw e; };
    await assert.rejects(servicio.asignarImagenDesdeUrl(7, { url: 'x' }, 4, { descargarImagen: descargar }),
      e => e.status === 400 && !/Request failed/.test(e.message));
  });

  test('si la dirección principal falla, usa la de respaldo', async () => {
    const { servicio } = montar();
    const pedidas = [];
    const descargar = async (u) => { pedidas.push(u); if (u === 'principal') throw new Error('403'); return { buffer: JPG }; };
    await servicio.asignarImagenDesdeUrl(7, { url: 'principal', urlRespaldo: 'miniatura' }, 4, { descargarImagen: descargar });
    assert.deepEqual(pedidas, ['principal', 'miniatura']);
  });
});

describe('el servidor sirve las fotos', () => {
  test('/archivos se monta siempre, no solo en desarrollo local', () => {
    // Quedó dentro de `if (isLocalDevelopment)` y cada foto subida daba 404.
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const montaje = fuente.indexOf("app.use('/archivos'");
    const bloqueLocal = fuente.indexOf('if (isLocalDevelopment)');
    assert.ok(montaje > -1, 'no se monta /archivos');
    assert.ok(bloqueLocal > -1 && montaje < bloqueLocal, '/archivos quedó dentro del bloque de desarrollo local');
  });
});

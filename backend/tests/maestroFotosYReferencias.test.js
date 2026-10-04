const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

/**
 * Dos lecturas que seguían yendo a la caché de Alegra y pasaron al maestro
 * propio (2026-10-04):
 *
 *  · la foto de cada línea en Facturas en Bodega. Las 1.995 fotos de la caché
 *    son direcciones firmadas de Alegra, que vencen a los 7 días: en esta rama
 *    se veían rotas, con 2.022 fotos buenas guardadas en el maestro;
 *  · el código que se propone al agregar una marca. La caché no se entera de
 *    los productos creados acá: después de agregar una marca volvía a proponer
 *    el mismo código y el guardado lo rechazaba por repetido.
 *
 * Contra PostgreSQL local, en una transacción que se deshace.
 */

const rutaDb = require.resolve('../config/database');
const rutaServicio = require.resolve('../src/modules/productos/productos.service');

describe('fotos por referencia y siguiente código de marca — contra PostgreSQL local', () => {
  let pool, conexion, servicio;

  const producto = (nombre, referencia, { foto = null, activo = true } = {}) => conexion.query(
    'INSERT INTO producto (nombre, referencia, imagen_url, activo, precio_sin_iva) VALUES ($1, $2, $3, $4, 100) RETURNING id',
    [nombre, referencia, foto, activo]).then(r => r.rows[0].id);

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'maestro') };
    delete require.cache[rutaServicio];
    servicio = require(rutaServicio);

    await producto('zz-con foto', 'zz-FOTO-1', { foto: '/archivos/productos/zz-1.jpg' });
    await producto('zz-sin foto', 'zz-FOTO-2');
    // La misma referencia en dos productos: uno dado de baja con su foto vieja.
    await producto('zz-repetido viejo', 'zz-FOTO-3', { foto: '/archivos/productos/zz-3-viejo.jpg', activo: false });
    await producto('zz-repetido vigente', 'zz-FOTO-3', { foto: '/archivos/productos/zz-3.jpg' });
    // Una serie de marcas con huecos, y una creada acá que la caché de Alegra no conoce.
    for (const sufijo of ['001', '002', '14', 'A']) await producto(`zz-marca ${sufijo}`, `zz305-${sufijo}`);
    await producto('zz-marca inactiva', 'zz305-003', { activo: false });
    await producto('zz-con comodín', 'zz50%-001');
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('la foto sale del maestro propio, con la referencia tal como se pidió', async () => {
    const fotos = await servicio.imagenesPorReferencia(['zz-FOTO-1', 'ZZ-foto-3', 'zz-FOTO-2', 'zz-NO-EXISTE', 'zz-FOTO-1', '', null]);
    assert.deepEqual(fotos, [
      { referencia: 'zz-FOTO-1', imageUrl: '/archivos/productos/zz-1.jpg' },
      // Sin distinguir mayúsculas, y de los dos productos gana el vigente.
      { referencia: 'ZZ-foto-3', imageUrl: '/archivos/productos/zz-3.jpg' }
    ]);
    assert.deepEqual(await servicio.imagenesPorReferencia([]), []);
    assert.deepEqual(await servicio.imagenesPorReferencia(undefined), []);
  });

  test('ninguna foto que entregue es una dirección de Alegra que vence', async () => {
    const { rows } = await conexion.query(`
      SELECT referencia FROM producto WHERE activo AND imagen_url LIKE '/archivos/%' AND referencia IS NOT NULL LIMIT 40`);
    const fotos = await servicio.imagenesPorReferencia(rows.map(r => r.referencia));
    assert.ok(fotos.length > 0);
    assert.ok(fotos.every(f => typeof f.imageUrl === 'string' && f.imageUrl.length > 0));
  });

  test('el código de la marca que sigue es el menor número libre, contado en el maestro', async () => {
    const r = await servicio.siguienteReferenciaDeMarca('zz305');
    // 001, 002 y 003 (inactivo) están tomados; 14 también; 'A' no es de la serie.
    assert.deepEqual(r, { base: 'zz305', referencia: 'zz305-004', usados: [1, 2, 3, 14] });

    // Desde una variante, la base es el producto original: una marca hermana.
    assert.equal((await servicio.siguienteReferenciaDeMarca('zz305-14')).referencia, 'zz305-004');
    assert.equal((await servicio.siguienteReferenciaDeMarca('zz305-14')).base, 'zz305');
    // Sin ninguna marca todavía, empieza en 001.
    assert.equal((await servicio.siguienteReferenciaDeMarca('zz-NUEVA')).referencia, 'zz-NUEVA-001');
  });

  test('después de agregar una marca, la siguiente ya no repite el código', async () => {
    // Era el defecto: la caché de Alegra no se enteraba de lo creado acá.
    await producto('zz-marca recién agregada', 'zz305-004');
    assert.equal((await servicio.siguienteReferenciaDeMarca('zz305')).referencia, 'zz305-005');
  });

  test('una referencia con % o _ se toma al pie de la letra, y sin base es un 400', async () => {
    assert.deepEqual((await servicio.siguienteReferenciaDeMarca('zz50%')).usados, [1]);
    // `zz5_%` con LIKE calzaría con media tabla; acá no calza con nada.
    assert.equal((await servicio.siguienteReferenciaDeMarca('zz5_%')).referencia, 'zz5_%-001');
    await assert.rejects(servicio.siguienteReferenciaDeMarca('  '), { status: 400 });
  });
});

describe('las dos pantallas ya no le preguntan a la caché de Alegra', () => {
  const leer = (...partes) => fs.readFileSync(path.join(__dirname, '..', '..', ...partes), 'utf8');

  test('Bodega pide las fotos a /catalogos y la ficha pide el código a /maestro', () => {
    assert.match(leer('frontend', 'src', 'services', 'alegraService.js'), /api\.get\('\/catalogos\/imagenes-por-referencia'/);
    assert.match(leer('frontend', 'src', 'hooks', 'useFichaProducto.js'), /api\.get\('\/maestro\/productos\/siguiente-referencia'/);
  });

  test('las rutas viejas se quitaron, y la nueva del maestro va antes de /productos/:id', () => {
    const viejas = leer('backend', 'src', 'modules', 'catalogo', 'catalogo.routes.js');
    assert.doesNotMatch(viejas, /imagenes-por-referencia|siguiente-referencia/);
    const maestro = leer('backend', 'src', 'modules', 'productos', 'productos.routes.js');
    const nueva = maestro.indexOf("routes.get('/productos/siguiente-referencia'");
    assert.ok(nueva > 0);
    assert.ok(nueva < maestro.indexOf("routes.get('/productos/:id'"),
      'con /productos/:id antes, "siguiente-referencia" se tomaría por un id');
    assert.match(maestro, /rutasCompartidas\.get\('\/imagenes-por-referencia'/);
  });
});

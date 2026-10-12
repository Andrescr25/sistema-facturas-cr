const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const sharp = require('sharp');
const { optimizarImagen } = require('../src/modules/productos/categorias.imagen.optimizar');

describe('fotos de categoría nítidas para pantalla completa', () => {
  test('una foto grande cubre escritorio y teléfono 2x sin ampliar una miniatura', async () => {
    const foto = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#dc8a50' } }).png().toBuffer();
    const r = await optimizarImagen(foto);
    assert.equal(r.grande.info.width, 1920);
    assert.equal(r.grande.info.height, 1080);
    assert.equal(r.movil.info.width, 960);
    assert.equal(r.movil.info.height, 1280);
    for (const k of ['grande', 'movil']) {
      const meta = await sharp(r[k].data).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.pages || 1, 1);
      assert.equal(meta.exif, undefined);
    }
  });

  test('mucho detalle conserva resolución suficiente y límites de descarga', async () => {
    const foto = await sharp(randomBytes(2400 * 1600 * 3), { raw: { width: 2400, height: 1600, channels: 3 } })
      .jpeg({ quality: 90 }).toBuffer();
    const r = await optimizarImagen(foto);
    assert.ok(r.grande.info.width >= 1440);
    assert.ok(r.movil.info.width >= 720);
    assert.ok(r.grande.data.length <= 800 * 1024);
    assert.ok(r.movil.data.length <= 400 * 1024);
  });

  test('el recorte móvil conserva el motivo central y aprovecha una fuente vertical', async () => {
    const foto = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#207060' } })
      .composite([{ input: await sharp({ create: { width: 400, height: 400, channels: 3, background: '#f23020' } }).png().toBuffer() }])
      .jpeg({ quality: 95 }).toBuffer();
    const r = await optimizarImagen(foto);
    assert.equal(r.movil.info.width, 960);
    assert.equal(r.movil.info.height, 1280);
    const centro = await sharp(r.movil.data).extract({ left: 480, top: 640, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(centro[0] > 225 && centro[1] < 65 && centro[2] < 60);
  });

  test('corrige la orientación del teléfono y elimina EXIF', async () => {
    const foto = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#dc8a50' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const r = await optimizarImagen(foto);
    const meta = await sharp(r.movil.data).metadata();
    assert.equal(meta.width, 960);
    assert.equal(meta.height, 1280);
    assert.equal(meta.orientation, undefined);
    assert.equal(meta.exif, undefined);
  });

  test('no inventa detalle ampliando una foto pequeña', async () => {
    const foto = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#e9501c' } })
      .withMetadata().jpeg().toBuffer();
    const r = await optimizarImagen(foto);
    assert.equal(r.grande.info.width, 320);
    assert.equal(r.grande.info.height, 180);
    assert.ok(r.movil.info.width <= 320 && r.movil.info.height <= 180);
  });

  for (const [etiqueta, buffer] of [['vacía', Buffer.alloc(0)], ['HTML', Buffer.from('<html>no es foto</html>')],
    ['PNG corrupto', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], ['mayor a 8 MB', Buffer.alloc(8 * 1024 * 1024 + 1)]]) {
    test(`rechaza imagen ${etiqueta}`, async () => {
      await assert.rejects(optimizarImagen(buffer), e => e.status === 400);
    });
  }

  test('mantiene la protección contra fotos de demasiados píxeles', async () => {
    const foto = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: '#fff' } }).png().toBuffer();
    await assert.rejects(optimizarImagen(foto), e => e.status === 400);
  });
});

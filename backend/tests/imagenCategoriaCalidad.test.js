const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const sharp = require('sharp');
const { optimizarImagen } = require('../src/modules/productos/categorias.imagen.optimizar');

describe('fotos de categoría nítidas y SIN recortar', () => {
  test('una foto grande se reduce a escritorio y teléfono 2x, con su proporción, sin ampliar una miniatura', async () => {
    const foto = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#dc8a50' } }).png().toBuffer();
    const r = await optimizarImagen(foto);
    // 3:2 cabe en 1920 × 1080 por el alto; el teléfono, en 960 × 720 por el ancho.
    assert.equal(r.grande.info.width, 1620);
    assert.equal(r.grande.info.height, 1080);
    assert.equal(r.movil.info.width, 960);
    assert.equal(r.movil.info.height, 640);
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
    // La nitidez se mide en píxeles: el recuadro de 1440 × 810 es el mínimo que se acepta.
    assert.ok(r.grande.info.width * r.grande.info.height >= 1440 * 810 * 0.95);
    assert.ok(r.movil.info.width >= 720 || r.movil.info.height >= 540);
    assert.ok(r.grande.data.length <= 800 * 1024);
    assert.ok(r.movil.data.length <= 400 * 1024);
  });

  test('no recorta: las dos variantes conservan la proporción y lo que hay en los bordes', async () => {
    // Panorámica 2,5:1 con el motivo pegado al borde derecho, como el bombillo de Línea Eléctrica.
    const motivo = await sharp({ create: { width: 200, height: 800, channels: 3, background: '#f23020' } }).png().toBuffer();
    const foto = await sharp({ create: { width: 2000, height: 800, channels: 3, background: '#207060' } })
      .composite([{ input: motivo, left: 1800, top: 0 }]).jpeg({ quality: 95 }).toBuffer();
    const r = await optimizarImagen(foto);
    for (const k of ['grande', 'movil']) {
      const { width, height } = r[k].info;
      assert.ok(Math.abs(width / height - 2.5) < 0.02, `${k}: ${width}×${height} ya no es 2,5:1`);
      const borde = await sharp(r[k].data).extract({ left: width - 4, top: Math.floor(height / 2), width: 1, height: 1 }).raw().toBuffer();
      assert.ok(borde[0] > 200 && borde[1] < 90 && borde[2] < 90, `${k}: el borde derecho se recortó`);
    }
    assert.equal(r.grande.info.width, 1920);
    assert.equal(r.movil.info.width, 960);
  });

  test('una foto vertical tampoco se recorta: se reduce entera', async () => {
    const foto = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#207060' } }).jpeg().toBuffer();
    const r = await optimizarImagen(foto);
    assert.equal(r.grande.info.width / r.grande.info.height, 0.75);
    assert.equal(r.movil.info.width / r.movil.info.height, 0.75);
  });

  test('corrige la orientación del teléfono y elimina EXIF', async () => {
    const foto = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#dc8a50' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const r = await optimizarImagen(foto);
    const meta = await sharp(r.movil.data).metadata();
    // Girada queda vertical (1200 × 1600): entera dentro de 960 × 720 son 540 × 720.
    assert.equal(meta.width, 540);
    assert.equal(meta.height, 720);
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

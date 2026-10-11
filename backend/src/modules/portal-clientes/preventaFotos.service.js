const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { RAIZ, RAIZ_PRIVADA } = require('../../integrations/almacenamiento');
const { descargarImagen } = require('../../utils/descargarImagen');
const { salidasBloqueadas } = require('../../../config/aislado');
const CACHE = path.join(RAIZ_PRIVADA, 'catalogo-miniaturas');
const MAX_BYTES = 8 * 1024 * 1024;

/** Solo la foto del maestro: ni archivos arbitrarios ni URLs del navegador.
 * Una miniatura ahorra tamaño del PDF y memoria; el original queda intacto. */
async function miniatura(imagen) {
  if (typeof imagen !== 'string' || !imagen) return null;
  try {
    let buffer, clave;
    if (imagen.startsWith('/archivos/')) {
      const raiz = await fs.realpath(RAIZ);
      const archivo = await fs.realpath(path.resolve(RAIZ, imagen.slice('/archivos/'.length)));
      if (!archivo.startsWith(raiz + path.sep)) return null;
      const estado = await fs.stat(archivo);
      if (!estado.isFile() || estado.size > MAX_BYTES) return null;
      clave = `catalogo-v2-480x360-q72:${archivo}:${estado.mtimeMs}:${estado.size}`;
      const destino = path.join(CACHE, createHash('sha256').update(clave).digest('hex')+'.jpg');
      const previa = await fs.readFile(destino).catch(() => null);
      if (previa) return previa;
      buffer = await fs.readFile(archivo);
    } else {
      // Esta rama no accede a Alegra ni renueva sus firmas. El aislamiento
      // tampoco permite descargas externas durante pruebas o preparación.
      if (salidasBloqueadas() || process.env.NODE_TEST_CONTEXT) return null;
      const url = new URL(imagen);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      clave = 'catalogo-v2-480x360-q72:' + imagen;
      const destino = path.join(CACHE, createHash('sha256').update(clave).digest('hex')+'.jpg');
      const previa = await fs.readFile(destino).catch(() => null);
      if (previa) return previa;
      buffer = (await descargarImagen(imagen, { maximoBytes: MAX_BYTES })).buffer;
    }
    const jpg = await sharp(buffer, { limitInputPixels: 24_000_000 }).rotate()
      .resize({ width: 480, height: 360, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    await fs.mkdir(CACHE, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(CACHE, createHash('sha256').update(clave).digest('hex')+'.jpg'), jpg, { mode: 0o600 });
    return jpg;
  } catch {
    // No registrar la URL firmada ni el error del transporte. El PDF marca
    // "Sin imagen" y el modal informa la cantidad antes de enviar.
    return null;
  }
}
async function incorporarFotos(modelo) {
  const productos = modelo.secciones.flatMap(s => s.productos);
  let siguiente = 0, incluidas = 0;
  const obrero = async () => {
    while (siguiente < productos.length) {
      const p = productos[siguiente++];
      p.foto = await miniatura(p.imagen);
      if (p.foto) incluidas++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, productos.length) }, obrero));
  return { incluidas, faltantes: productos.length - incluidas };
}
module.exports = { miniatura, incorporarFotos };

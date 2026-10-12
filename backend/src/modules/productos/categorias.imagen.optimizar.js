/** Variantes preparadas al subir; el scroll no procesa imágenes. */
const sharp = require('sharp');
const almacenamiento = require('../../integrations/almacenamiento');
const { httpError } = require('../../utils/validacion');

const MAXIMO_BYTES = 8 * 1024 * 1024;
const MAXIMO_PIXELES = 24 * 1024 * 1024;

async function variante(buffer, anchos, proporcion, maximoBytes) {
  // La transición ocupa casi toda la pantalla. Primero ajustamos compresión;
  // nunca bajamos hasta una miniatura para cumplir el presupuesto de descarga.
  for (const ancho of anchos) {
    for (const calidad of [84, 80, 76]) {
      const resultado = await sharp(buffer, { limitInputPixels: MAXIMO_PIXELES, animated: false })
        .rotate().resize({ width: ancho, height: Math.round(ancho * proporcion), fit: 'cover', withoutEnlargement: true })
        .webp({ quality: calidad, effort: 4 }).toBuffer({ resolveWithObject: true });
      if (resultado.data.length <= maximoBytes) return resultado;
    }
  }
  throw httpError(400, 'Esta foto tiene demasiado detalle para el catálogo. Elegí otra foto para conservar la nitidez.');
}

async function optimizarImagen(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw httpError(400, 'Elegí una imagen.');
  if (buffer.length > MAXIMO_BYTES) throw httpError(400, 'La imagen pesa más de 8 MB.');
  if (!['jpg', 'png', 'webp'].includes(almacenamiento.tipoDeImagen(buffer))) {
    throw httpError(400, 'Elegí una imagen JPG, PNG o WebP.');
  }
  try {
    const grande = await variante(buffer, [1920, 1600, 1440], 9 / 16, 800 * 1024);
    // En móvil la escena es vertical: recortar al subir evita ampliar una
    // franja de una miniatura horizontal, incluso en pantallas de densidad 2x.
    const movil = await variante(buffer, [960, 800, 720], 4 / 3, 400 * 1024);
    return { grande, movil };
  } catch (error) {
    if (error.status) throw error;
    throw httpError(400, 'No se pudo leer la imagen. Elegí otra foto de hasta 24 megapíxeles.');
  }
}

module.exports = { optimizarImagen, MAXIMO_BYTES };

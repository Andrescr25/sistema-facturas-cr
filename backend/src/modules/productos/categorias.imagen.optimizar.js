/** Variantes preparadas al subir; el scroll no procesa imágenes. */
const sharp = require('sharp');
const almacenamiento = require('../../integrations/almacenamiento');
const { httpError } = require('../../utils/validacion');

const MAXIMO_BYTES = 8 * 1024 * 1024;
const MAXIMO_PIXELES = 24 * 1024 * 1024;

async function variante(buffer, anchos, proporcion, maximoBytes) {
  // LA FOTO NO SE RECORTA (2026-10-25, el usuario: «ahora está recortando mucho
  // la imagen que pongo»). Antes se forzaba a 16:9 en escritorio y a una
  // columna vertical 3:4 en el teléfono, con `fit: 'cover'`: la de Línea
  // Eléctrica, con el bombillo a la derecha, llegaba al teléfono con el
  // bombillo partido a la mitad. Ahora `inside` solo la REDUCE para que quepa
  // en el recuadro: conserva su proporción y las dos variantes son la misma
  // foto en dos tamaños. El encuadre lo decide la pantalla, sobre la foto entera.
  //
  // La compresión se ajusta primero; nunca se baja hasta una miniatura para
  // cumplir el presupuesto de descarga.
  for (const ancho of anchos) {
    for (const calidad of [84, 80, 76]) {
      const resultado = await sharp(buffer, { limitInputPixels: MAXIMO_PIXELES, animated: false })
        .rotate().resize({ width: ancho, height: Math.round(ancho * proporcion), fit: 'inside', withoutEnlargement: true })
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
    // Recuadros que limitan el tamaño, no la forma: una foto horizontal llega a
    // 1920 de ancho; una más cuadrada o vertical, a 1080 de alto como máximo.
    const grande = await variante(buffer, [1920, 1600, 1440], 9 / 16, 800 * 1024);
    // Para el teléfono basta una copia más liviana (pantallas 2x de ~480 px de
    // ancho): misma foto y misma proporción, hasta 960 × 720.
    const movil = await variante(buffer, [960, 800, 720], 3 / 4, 400 * 1024);
    return { grande, movil };
  } catch (error) {
    if (error.status) throw error;
    throw httpError(400, 'No se pudo leer la imagen. Elegí otra foto de hasta 24 megapíxeles.');
  }
}

module.exports = { optimizarImagen, MAXIMO_BYTES };

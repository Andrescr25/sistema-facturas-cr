/**
 * Almacenamiento de archivos en el disco del servidor.
 *
 * Es el de la rama independencia-alegra. En producción se cambia por uno en
 * la nube con la misma interfaz (guardarImagen, borrar): nada fuera de esta
 * carpeta sabe dónde vive un archivo, solo conoce su ruta pública.
 *
 * Una imagen se acepta por lo que ES, no por lo que dice ser: se miran los
 * primeros bytes. El tipo que manda un sitio al descargar (o el navegador al
 * subir) se puede equivocar o mentir, y un HTML con extensión .jpg servido
 * desde nuestro dominio es un problema.
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(process.env.ALMACENAMIENTO_DIR || path.join(__dirname, '..', '..', '..', 'almacenamiento'));
const PREFIJO_PUBLICO = '/archivos';
const MAXIMO_BYTES = 2 * 1024 * 1024;
const NOMBRE_SEGURO = /^[a-z0-9-]+$/;

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** jpg, png, webp o gif según sus bytes; null si no es ninguna. */
function tipoDeImagen(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return null;
}

async function guardarImagen({ carpeta, prefijo, buffer }) {
  if (!NOMBRE_SEGURO.test(String(carpeta || '')) || !NOMBRE_SEGURO.test(String(prefijo || ''))) {
    throw new Error('almacenamiento: carpeta o prefijo inválidos');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw httpError(400, 'La imagen está vacía.');
  if (buffer.length > MAXIMO_BYTES) throw httpError(400, `La imagen pesa más de ${MAXIMO_BYTES / 1024 / 1024} MB.`);
  const extension = tipoDeImagen(buffer);
  if (!extension) throw httpError(400, 'El archivo no es una imagen JPG, PNG, WEBP ni GIF.');

  const nombre = `${prefijo}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
  const directorio = path.join(RAIZ, carpeta);
  await fs.mkdir(directorio, { recursive: true });
  await fs.writeFile(path.join(directorio, nombre), buffer, { flag: 'wx' });
  return { ruta: `${PREFIJO_PUBLICO}/${carpeta}/${nombre}`, bytes: buffer.length, extension };
}

/**
 * Borra un archivo por su ruta pública. Nunca sale de la raíz, y lo que no
 * es nuestro (una URL de Alegra, por ejemplo) no se toca. No lanza si ya no
 * existe.
 */
async function borrar(ruta) {
  if (typeof ruta !== 'string' || !ruta.startsWith(`${PREFIJO_PUBLICO}/`)) return false;
  const destino = path.resolve(RAIZ, ruta.slice(PREFIJO_PUBLICO.length + 1));
  if (!destino.startsWith(RAIZ + path.sep)) return false;
  try {
    await fs.unlink(destino);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = { guardarImagen, borrar, tipoDeImagen, RAIZ, PREFIJO_PUBLICO, MAXIMO_BYTES };

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
const MAXIMO_ABSOLUTO = 8 * 1024 * 1024;
const NOMBRE_SEGURO = /^[a-z0-9-]+$/;

// Una raíz APARTE para lo que no se sirve por HTTP: un comprobante fiscal no
// puede quedar accesible sin sesión, y `RAIZ` sí lo está —`server.js` la
// monta con `express.static`, a propósito, porque de ahí salen las fotos de
// los catálogos públicos—. Que las dos rutas empiecen distinto
// (`/archivos/...` contra un texto que nunca arranca con `/`) es la defensa
// contra montar esta por error el día de mañana.
const RAIZ_PRIVADA = path.resolve(process.env.ALMACENAMIENTO_PRIVADO_DIR || path.join(__dirname, '..', '..', '..', 'almacenamiento-privado'));
const EXTENSION_SEGURA = /^[a-z0-9]{1,10}$/;

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

/**
 * `maximoBytes` sirve para traer fotos que ya son de la empresa y pesan más
 * de lo que se le permite subir a una persona (las de Alegra, al pasarlas a
 * almacenamiento propio). Aun así hay un techo: nadie puede pedir lo que
 * quiera.
 */
async function guardarImagen({ carpeta, prefijo, buffer, maximoBytes = MAXIMO_BYTES }) {
  if (!NOMBRE_SEGURO.test(String(carpeta || '')) || !NOMBRE_SEGURO.test(String(prefijo || ''))) {
    throw new Error('almacenamiento: carpeta o prefijo inválidos');
  }
  const tope = Math.min(Number(maximoBytes) > 0 ? Number(maximoBytes) : MAXIMO_BYTES, MAXIMO_ABSOLUTO);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw httpError(400, 'La imagen está vacía.');
  if (buffer.length > tope) throw httpError(400, `La imagen pesa más de ${(tope / 1024 / 1024).toFixed(0)} MB.`);
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

/**
 * Guarda un archivo que NO se sirve por HTTP: comprobantes fiscales, no
 * imágenes. Se acepta por la extensión que se le declara, no por sus bytes
 * —un XML no tiene una firma binaria como una foto—, así que quien llama
 * decide qué es.
 *
 * La ruta que devuelve es RELATIVA a `RAIZ_PRIVADA` y nunca empieza con `/`:
 * eso es lo que la distingue de una ruta pública a simple vista.
 */
async function guardarArchivo({ carpeta, prefijo, buffer, extension, maximoBytes = MAXIMO_BYTES }) {
  if (!NOMBRE_SEGURO.test(String(carpeta || '')) || !NOMBRE_SEGURO.test(String(prefijo || ''))) {
    throw new Error('almacenamiento: carpeta o prefijo inválidos');
  }
  if (!EXTENSION_SEGURA.test(String(extension || ''))) {
    throw new Error('almacenamiento: extensión inválida');
  }
  const tope = Math.min(Number(maximoBytes) > 0 ? Number(maximoBytes) : MAXIMO_BYTES, MAXIMO_ABSOLUTO);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw httpError(400, 'El archivo está vacío.');
  if (buffer.length > tope) throw httpError(400, `El archivo pesa más de ${(tope / 1024 / 1024).toFixed(0)} MB.`);

  const nombre = `${prefijo}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
  const directorio = path.join(RAIZ_PRIVADA, carpeta);
  await fs.mkdir(directorio, { recursive: true });
  await fs.writeFile(path.join(directorio, nombre), buffer, { flag: 'wx' });
  return { ruta: `${carpeta}/${nombre}`, bytes: buffer.length };
}

/**
 * Lee de vuelta un archivo privado, por la ruta relativa que devolvió
 * `guardarArchivo`. Nunca sale de `RAIZ_PRIVADA`. `null` si no existe.
 */
async function leerArchivoPrivado(ruta) {
  if (typeof ruta !== 'string' || ruta.startsWith('/') || ruta.includes('..')) return null;
  const destino = path.resolve(RAIZ_PRIVADA, ruta);
  if (!destino.startsWith(RAIZ_PRIVADA + path.sep)) return null;
  try {
    return await fs.readFile(destino);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** El equivalente privado de `borrar`, por ruta relativa a `RAIZ_PRIVADA`. */
async function borrarPrivado(ruta) {
  if (typeof ruta !== 'string' || ruta.startsWith('/') || ruta.includes('..')) return false;
  const destino = path.resolve(RAIZ_PRIVADA, ruta);
  if (!destino.startsWith(RAIZ_PRIVADA + path.sep)) return false;
  try {
    await fs.unlink(destino);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = {
  guardarImagen, borrar, tipoDeImagen, RAIZ, PREFIJO_PUBLICO, MAXIMO_BYTES,
  guardarArchivo, leerArchivoPrivado, borrarPrivado, RAIZ_PRIVADA
};

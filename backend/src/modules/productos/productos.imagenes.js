/**
 * Fotos de productos en almacenamiento propio.
 *
 * Antes cada foto se subía a Alegra, que la devuelve con una URL firmada que
 * vence a los 7 días. Ahora el archivo queda en nuestro almacenamiento y el
 * producto guarda su ruta.
 *
 * Orden: primero se guarda el archivo, después se actualiza el producto. Si
 * la base falla, se borra el archivo recién guardado (no quedan huérfanos).
 * La foto anterior se borra solo después del COMMIT, y solo si es nuestra.
 */

const { pool } = require('../../../config/database');
const almacenamiento = require('../../integrations/almacenamiento');
const { descargarImagen } = require('../../utils/descargarImagen');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion } = require('../../utils/transaccion');

async function guardarYAsignar(id, buffer, usuarioId) {
  const { rows } = await pool.query('SELECT id FROM producto WHERE id = $1', [id]);
  if (!rows[0]) throw httpError(404, 'No existe ese producto.');

  const guardada = await almacenamiento.guardarImagen({ carpeta: 'productos', prefijo: String(id), buffer });
  let anterior;
  try {
    anterior = await enTransaccion(pool, async (cliente) => {
      const { rows: previas } = await cliente.query('SELECT id, imagen_url FROM producto WHERE id = $1 FOR UPDATE', [id]);
      if (!previas[0]) throw httpError(404, 'No existe ese producto.');
      await cliente.query('UPDATE producto SET imagen_url = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2', [guardada.ruta, id]);
      await registrarCambio(cliente, {
        entidad: 'producto', entidadId: id, accion: 'editar',
        antes: { imagen_url: previas[0].imagen_url }, despues: { imagen_url: guardada.ruta },
        usuarioId, motivo: 'foto'
      });
      return previas[0].imagen_url;
    });
  } catch (error) {
    await almacenamiento.borrar(guardada.ruta).catch(() => {});
    throw error;
  }
  await almacenamiento.borrar(anterior).catch(() => {});
  return { imagen_url: guardada.ruta };
}

/** Desde una dirección (buscador de fotos). Si falla la principal, prueba la de respaldo. */
async function asignarImagenDesdeUrl(id, { url, urlRespaldo } = {}, usuarioId, dependencias = {}) {
  const n = idValido(id);
  if (!url) throw httpError(400, 'Falta la dirección de la imagen.');
  const descargar = dependencias.descargarImagen || descargarImagen;
  // Solo pasan los mensajes nuestros (expuesto); cualquier otra cosa se dice en limpio.
  const propio = (error, porDefecto) => (error.expuesto ? error : httpError(400, porDefecto));
  let descarga;
  try {
    descarga = await descargar(url);
  } catch (error) {
    if (!urlRespaldo || urlRespaldo === url) throw propio(error, 'No se pudo descargar la imagen de esa dirección.');
    try {
      descarga = await descargar(urlRespaldo);
    } catch (errorRespaldo) {
      throw propio(errorRespaldo, 'No se pudo descargar la imagen ni su respaldo.');
    }
  }
  return guardarYAsignar(n, descarga.buffer, usuarioId);
}

/** Desde un archivo subido (multer, en memoria). */
async function asignarImagenDesdeArchivo(id, archivo, usuarioId) {
  const n = idValido(id);
  if (!archivo?.buffer) throw httpError(400, 'No vino ningún archivo.');
  return guardarYAsignar(n, archivo.buffer, usuarioId);
}

module.exports = { asignarImagenDesdeUrl, asignarImagenDesdeArchivo };

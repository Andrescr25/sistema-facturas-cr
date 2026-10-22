/** Foto representativa independiente de las imágenes de cada presentación. */
const sharp = require('sharp');
const { pool } = require('../../../config/database');
const almacenamiento = require('../../integrations/almacenamiento');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError, idValido } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');

async function optimizar(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw httpError(400, 'Elegí una imagen.');
  if (buffer.length > 8 * 1024 * 1024) throw httpError(400, 'La imagen pesa más de 8 MB.');
  if (!['jpg','png','webp'].includes(almacenamiento.tipoDeImagen(buffer))) throw httpError(400, 'Elegí una imagen JPG, PNG o WebP.');
  try {
    // Contain/inside conserva el candado entero: no se recorta ni agranda.
    for (const calidad of [86, 80, 74]) {
      const resultado = await sharp(buffer, { limitInputPixels:24 * 1024 * 1024,animated:false })
        .rotate().resize({ width:1000,height:1000,fit:'inside',withoutEnlargement:true })
        .webp({ quality:calidad,effort:4 }).toBuffer({ resolveWithObject:true });
      if (resultado.data.length <= 300 * 1024) return resultado;
    }
    throw httpError(400, 'Elegí una foto con menos detalle para conservar la nitidez.');
  } catch (error) {
    if (error.status) throw error;
    throw httpError(400, 'No se pudo leer la imagen. Elegí otra de hasta 24 megapíxeles.');
  }
}

async function borrarPropia(id, imagen) {
  if (imagen?.url?.startsWith(`/archivos/marcas/${id}-`)) await almacenamiento.borrar(imagen.url).catch(() => {});
}

async function guardar(id, imagen, usuarioId) {
  return enTransaccion(pool, async c => {
    const { rows: [marca] } = await c.query('SELECT imagen FROM marca_catalogo WHERE id=$1 FOR UPDATE', [id]);
    if (!marca) throw httpError(404, 'No existe esa marca.');
    await c.query('UPDATE marca_catalogo SET imagen=$2::jsonb,actualizado_en=CURRENT_TIMESTAMP WHERE id=$1', [id, imagen ? JSON.stringify(imagen) : null]);
    await registrarCambio(c, { entidad:'marca_catalogo',entidadId:id,accion:'editar',usuarioId,
      antes:{ imagen:marca.imagen },despues:{ imagen },motivo:'foto de marca para el catálogo' });
    return marca.imagen;
  });
}

async function asignar(idCrudo, archivo, usuarioId) {
  const id = idValido(idCrudo);
  const { rowCount } = await pool.query('SELECT id FROM marca_catalogo WHERE id=$1', [id]);
  if (!rowCount) throw httpError(404, 'No existe esa marca.');
  const resultado = await optimizar(archivo?.buffer);
  const nueva = await almacenamiento.guardarImagen({ carpeta:'marcas',prefijo:String(id),buffer:resultado.data });
  const imagen = { url:nueva.ruta,ancho:resultado.info.width,alto:resultado.info.height };
  let anterior;
  try { anterior = await guardar(id, imagen, usuarioId); }
  catch (error) { await almacenamiento.borrar(nueva.ruta).catch(() => {}); throw error; }
  await borrarPropia(id, anterior);
  return { id,imagen };
}

async function quitar(idCrudo, usuarioId) {
  const id = idValido(idCrudo);
  const anterior = await guardar(id, null, usuarioId);
  await borrarPropia(id, anterior);
  return { id,imagen:null };
}

module.exports = { asignar, quitar, borrarPropia, optimizar };

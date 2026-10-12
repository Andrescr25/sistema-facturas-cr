/**
 * La cabecera del agente necesita una foto liviana, no el archivo original
 * del teléfono. Se generan dos WebP estáticos al subirla, nunca al navegar.
 * El bloqueo de categoría coordina la foto con renombrar la categoría real.
 */
const sharp = require('sharp');
const { pool } = require('../../../config/database');
const almacenamiento = require('../../integrations/almacenamiento');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError, idValido } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');

const MAXIMO_BYTES = 8 * 1024 * 1024;
const MAXIMO_PIXELES = 24 * 1024 * 1024;

async function variante(buffer, ancho, maximoBytes) {
  // Fotos con mucho detalle también tienen un techo de descarga. Reducir
  // resolución es preferible a guardar una imagen enorme para cada sección.
  let resultado;
  do {
    resultado = await sharp(buffer, { limitInputPixels: MAXIMO_PIXELES, animated: false })
      .rotate().resize({ width: ancho, height: Math.round(ancho * 9 / 16), fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 72, effort: 4 }).toBuffer({ resolveWithObject: true });
    ancho = Math.floor(ancho * 0.75);
  } while (resultado.data.length > maximoBytes && ancho >= 240);
  if (resultado.data.length > maximoBytes) throw httpError(400, 'No se pudo optimizar esta imagen. Elegí otra foto.');
  return resultado;
}

async function optimizarImagen(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw httpError(400, 'Elegí una imagen.');
  if (buffer.length > MAXIMO_BYTES) throw httpError(400, 'La imagen pesa más de 8 MB.');
  if (!['jpg', 'png', 'webp'].includes(almacenamiento.tipoDeImagen(buffer))) {
    throw httpError(400, 'Elegí una imagen JPG, PNG o WebP.');
  }
  try {
    const grande = await variante(buffer, 960, 180 * 1024);
    const movil = await variante(buffer, 480, 60 * 1024);
    return { grande, movil };
  } catch (error) {
    if (error.status) throw error;
    throw httpError(400, 'No se pudo leer la imagen. Elegí otra foto de hasta 24 megapíxeles.');
  }
}

async function borrarImagen(id, imagen) {
  // Solo archivos de ESTA categoría. Nunca borrar una foto de producto que
  // se use de respaldo visual, ni archivos de otra categoría.
  const rutas = [...new Set([imagen?.url, imagen?.urlMovil])]
    .filter(r => typeof r === 'string' && r.startsWith(`/archivos/categorias/${id}-`));
  await Promise.all(rutas.map(r => almacenamiento.borrar(r).catch(() => {})));
}

async function guardarMetadatos(id, imagen, usuarioId) {
  try {
    return await enTransaccion(pool, async c => {
      const { rows: [categoria] } = await c.query('SELECT id,nombre FROM categoria_producto WHERE id=$1 FOR UPDATE', [id]);
      if (!categoria) throw httpError(404, 'No existe esa categoría.');
      const { rows: [config] } = await c.query('SELECT imagen FROM categoria_config WHERE categoria=$1 FOR UPDATE', [categoria.nombre]);
      await c.query(`INSERT INTO categoria_config(categoria,imagen) VALUES($1,$2::jsonb)
        ON CONFLICT(categoria) DO UPDATE SET imagen=EXCLUDED.imagen,actualizado_en=CURRENT_TIMESTAMP`,
      [categoria.nombre, imagen ? JSON.stringify(imagen) : null]);
      await registrarCambio(c, { entidad:'categoria_producto',entidadId:id,accion:'editar',usuarioId,
        antes:{ imagen:config?.imagen || null },despues:{ imagen },motivo:'imagen de categoría para el catálogo' });
      return config?.imagen;
    });
  } catch (error) {
    if (error.code === '42703') throw httpError(503, 'La imagen de categorías todavía no está habilitada en el servidor.');
    throw error;
  }
}

async function asignarDesdeArchivo(idCrudo, archivo, usuarioId) {
  const id = idValido(idCrudo);
  const { rowCount } = await pool.query('SELECT id FROM categoria_producto WHERE id=$1', [id]);
  if (!rowCount) throw httpError(404, 'No existe esa categoría.');
  const { grande, movil } = await optimizarImagen(archivo?.buffer);
  const nuevas = [];
  let anterior, imagen;
  try {
    for (const [sufijo, resultado] of [['grande', grande], ['movil', movil]]) {
      nuevas.push(await almacenamiento.guardarImagen({ carpeta:'categorias',prefijo:`${id}-${sufijo}`,buffer:resultado.data }));
    }
    imagen = { url:nuevas[0].ruta,urlMovil:nuevas[1].ruta,ancho:grande.info.width,alto:grande.info.height,
      anchoMovil:movil.info.width,altoMovil:movil.info.height };
    anterior = await guardarMetadatos(id, imagen, usuarioId);
  } catch (error) {
    await Promise.all(nuevas.map(f => almacenamiento.borrar(f.ruta).catch(() => {})));
    throw error;
  }
  await borrarImagen(id, anterior);
  return { categoriaId:id,imagen };
}

async function quitarImagen(idCrudo, usuarioId) {
  const id = idValido(idCrudo);
  const anterior = await guardarMetadatos(id, null, usuarioId);
  await borrarImagen(id, anterior);
  return { categoriaId:id,imagen:null };
}

module.exports = { asignarDesdeArchivo, quitarImagen, optimizarImagen, MAXIMO_BYTES };

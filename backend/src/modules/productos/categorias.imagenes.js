/**
 * La transición del agente necesita una foto nítida, no el archivo original
 * del teléfono. Se generan dos WebP estáticos al subirla, nunca al navegar.
 * El bloqueo de categoría coordina la foto con renombrar la categoría real.
 */
const { pool } = require('../../../config/database');
const almacenamiento = require('../../integrations/almacenamiento');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError, idValido } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');
const { optimizarImagen, MAXIMO_BYTES } = require('./categorias.imagen.optimizar');

const noHabilitada = () => httpError(503, 'Las imágenes de categorías todavía no están habilitadas en el servidor. Avisá al administrador para activarlas.');

async function comprobarHabilitada() {
  const { rows: [estado] } = await pool.query(`SELECT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid='categoria_config'::regclass
      AND attname='imagen' AND NOT attisdropped
  ) AS habilitada`);
  // La migración es un paso de despliegue explícito. No hacemos DDL dentro
  // de una petición ni procesamos/guardamos fotos si todavía falta ese paso.
  if (!estado.habilitada) throw noHabilitada();
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
    if (error.code === '42703') throw noHabilitada();
    throw error;
  }
}

async function asignarDesdeArchivo(idCrudo, archivo, usuarioId) {
  const id = idValido(idCrudo);
  const { rowCount } = await pool.query('SELECT id FROM categoria_producto WHERE id=$1', [id]);
  if (!rowCount) throw httpError(404, 'No existe esa categoría.');
  await comprobarHabilitada();
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

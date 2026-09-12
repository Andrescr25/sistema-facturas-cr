/**
 * Pasa las fotos de los productos a nuestro almacenamiento.
 *
 * Alegra entrega cada foto con una dirección firmada que vence. Mientras la
 * foto viva solo ahí, el catálogo se queda en blanco el día que caduque la
 * firma, y las pantallas de esta rama ya no le preguntan nada a Alegra. Acá se
 * baja el archivo una vez, se guarda con nuestro nombre y el producto pasa a
 * apuntar a `/archivos/...`, que no vence.
 *
 * Se puede correr las veces que haga falta: lo que ya es nuestro se salta. Si
 * la dirección guardada venció, se le vuelve a preguntar a Alegra por ese
 * producto —solo GET— para que entregue una firma nueva.
 *
 * Nunca quedan archivos huérfanos ni productos apuntando a un archivo que no
 * existe: primero se guarda el archivo, y si el producto cambió mientras
 * tanto, el archivo recién guardado se borra y el producto se deja como está.
 */

const PREFIJO_PROPIO = '/archivos/';
// Estas fotos ya son de la empresa: están en su cuenta de Alegra desde hace
// años y varias pasan de 2 MB, que es el límite para lo que sube una persona.
// Se traen tal cual antes que perderlas; achicarlas es otra tarea.
const MAXIMO_FOTO = 8 * 1024 * 1024;

/** ¿Esta foto ya es nuestra? */
function esFotoPropia(url) {
  return typeof url === 'string' && url.startsWith(PREFIJO_PROPIO);
}

/** La foto que Alegra tiene hoy para ese producto, con firma nueva. */
async function urlFrescaDeAlegra(alegraId, alegra) {
  if (!alegraId || !alegra) return null;
  const r = await alegra.get(`/items/${alegraId}`).catch(() => null);
  if (!r || r.success === false) return null;
  const item = r.data ?? r;
  const foto = item?.images?.find(i => i.favorite === true) || item?.images?.[0];
  return foto?.url || null;
}

/**
 * Migra la foto de un producto. No lanza: devuelve en qué terminó, porque el
 * trabajo es de miles de productos y una foto que falla no puede parar el
 * resto.
 *
 * `actualizar(id, ruta, anterior)` devuelve cuántas filas cambió: 0 significa
 * que alguien tocó esa foto mientras se bajaba.
 */
async function migrarFotoDeProducto(producto, { descargar, guardarImagen, actualizar, borrar, alegra }) {
  if (!producto.imagen_url) return { id: producto.id, estado: 'sin_foto' };
  if (esFotoPropia(producto.imagen_url)) return { id: producto.id, estado: 'ya_propia' };

  let descarga;
  try {
    descarga = await descargar(producto.imagen_url, { maximoBytes: MAXIMO_FOTO });
  } catch (error) {
    // Lo más probable es que la firma venciera. Se pide una nueva y se
    // reintenta una sola vez: si tampoco sirve, es un fallo de verdad.
    const fresca = await urlFrescaDeAlegra(producto.alegra_id, alegra);
    if (!fresca || fresca === producto.imagen_url) {
      return { id: producto.id, estado: 'fallo', motivo: error.message };
    }
    try {
      descarga = await descargar(fresca, { maximoBytes: MAXIMO_FOTO });
    } catch (segundo) {
      return { id: producto.id, estado: 'fallo', motivo: segundo.message };
    }
  }

  let guardada;
  try {
    guardada = await guardarImagen({ carpeta: 'productos', prefijo: String(producto.id), buffer: descarga.buffer, maximoBytes: MAXIMO_FOTO });
  } catch (error) {
    return { id: producto.id, estado: 'fallo', motivo: error.message };
  }

  let cambiadas;
  try {
    cambiadas = await actualizar(producto.id, guardada.ruta, producto.imagen_url);
  } catch (error) {
    await borrar(guardada.ruta).catch(() => {});
    return { id: producto.id, estado: 'fallo', motivo: error.message };
  }
  if (!cambiadas) {
    await borrar(guardada.ruta).catch(() => {});
    return { id: producto.id, estado: 'cambio_mientras_tanto' };
  }
  return { id: producto.id, estado: 'migrada', ruta: guardada.ruta, bytes: descarga.buffer.length };
}

/** Reparte los productos entre varias descargas a la vez, en orden de llegada. */
async function enParalelo(lista, cuantos, trabajo) {
  const resultados = [];
  let siguiente = 0;
  const obrero = async () => {
    while (siguiente < lista.length) {
      const indice = siguiente++;
      resultados[indice] = await trabajo(lista[indice], indice);
    }
  };
  await Promise.all(Array.from({ length: Math.min(cuantos, lista.length) }, obrero));
  return resultados;
}

/**
 * Migra todas las fotos que todavía son de Alegra.
 * Devuelve el conteo por estado y la lista de las que fallaron.
 */
async function migrarFotos({ pool, alegra, concurrencia = 5, limite = null, avisar = () => {} }, dependencias = {}) {
  const descargar = dependencias.descargar || require('../../utils/descargarImagen').descargarImagen;
  const almacenamiento = dependencias.almacenamiento || require('../../integrations/almacenamiento');
  const actualizar = dependencias.actualizar || (async (id, ruta, anterior) => {
    const r = await pool.query(
      `UPDATE producto SET imagen_url = $1, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $2 AND imagen_url = $3`,
      [ruta, id, anterior]
    );
    return r.rowCount;
  });

  const { rows } = await pool.query(
    `SELECT id, alegra_id, imagen_url FROM producto
     WHERE imagen_url IS NOT NULL AND imagen_url NOT LIKE '/archivos/%'
     ORDER BY id${limite ? ' LIMIT ' + Number(limite) : ''}`
  );

  const conteo = { total: rows.length, migrada: 0, ya_propia: 0, sin_foto: 0, cambio_mientras_tanto: 0, fallo: 0 };
  const fallos = [];
  let bytes = 0;
  let hechas = 0;

  await enParalelo(rows, concurrencia, async (producto) => {
    const r = await migrarFotoDeProducto(producto, {
      descargar,
      guardarImagen: almacenamiento.guardarImagen,
      borrar: almacenamiento.borrar,
      actualizar,
      alegra
    });
    conteo[r.estado] = (conteo[r.estado] || 0) + 1;
    if (r.estado === 'fallo') fallos.push({ id: r.id, motivo: r.motivo });
    if (r.estado === 'migrada') bytes += r.bytes || 0;
    if (++hechas % 50 === 0) avisar(`  ${hechas}/${rows.length}…`);
    return r;
  });

  return { ...conteo, bytes, fallos };
}

module.exports = { migrarFotos, migrarFotoDeProducto, esFotoPropia, urlFrescaDeAlegra, enParalelo };

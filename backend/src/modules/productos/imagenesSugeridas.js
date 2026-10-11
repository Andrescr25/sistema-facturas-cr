/**
 * Fotos sugeridas para un producto: buscarlas y mostrar sus miniaturas.
 *
 * Lo usan la ficha de producto de Gestión de Catálogo y el formulario de
 * producto nuevo de Relacionar Productos (el mismo `ModalSugerirImagen`). La
 * foto elegida se guarda después por `productos.imagenes.js`, en
 * almacenamiento propio.
 *
 * VINO DE LA GESTIÓN DE CATÁLOGO VIEJA (`catalogo/`, 2026-10-04), donde vivía
 * bajo `/alegra/catalog/` sin tener nada que ver con Alegra: la búsqueda es de
 * Brave y las miniaturas, de su CDN.
 */

const axios = require('axios');
const { httpError } = require('../../utils/validacion');
const { descargarImagen } = require('../../utils/descargarImagen');

function normalizarTexto(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function contarCoincidencias(palabras, texto) {
  const normalizado = normalizarTexto(texto);
  return palabras.filter((p) => normalizado.includes(p)).length;
}

/**
 * @param {string} consulta  normalmente el nombre del producto
 * @returns {Promise<{url: string, thumbnail: string}[]>} de la más parecida al nombre a la menos
 */
async function buscarImagenes(consulta) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw httpError(500, 'Búsqueda de imágenes no configurada: falta la variable de entorno BRAVE_SEARCH_API_KEY');
  }

  try {
    const response = await axios.get('https://api.search.brave.com/res/v1/images/search', {
      params: {
        q: consulta,
        // Un lote grande cuesta lo mismo que uno chico (la consulta es una
        // sola) y deja margen después de descartar las que no van a cargar.
        count: 100,
        safesearch: 'strict'
      },
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      timeout: 15000
    });

    const resultados = response.data.results || [];
    const palabras = normalizarTexto(consulta).split(/\W+/).filter((w) => w.length > 2);

    return resultados
      // Sin miniatura propia de Brave, la miniatura cae al enlace crudo del
      // sitio de origen, que casi siempre bloquea la carga desde otro dominio:
      // ni la miniatura ni la imagen final cargarían.
      .filter((item) => item.thumbnail?.src)
      .map((item) => ({
        url: item.properties?.url || item.url,
        thumbnail: item.thumbnail.src,
        _coincidencias: contarCoincidencias(palabras, item.title)
      }))
      // Fuera las que no comparten ni una palabra significativa con el nombre.
      .filter((img) => palabras.length === 0 || img._coincidencias > 0)
      .sort((a, b) => b._coincidencias - a._coincidencias)
      .map(({ _coincidencias, ...img }) => img);
  } catch (error) {
    if (error.status) throw error;
    if (error.response?.status === 429) {
      console.warn(`⚠️ Límite de Brave Search alcanzado buscando "${consulta}"`);
      return [];
    }
    console.error('❌ Error en Brave Search:', error.response?.data || error.message);
    throw httpError(500, 'Error buscando imágenes sugeridas');
  }
}

// LA RUTA DE LAS MINIATURAS ES PÚBLICA POR NECESIDAD: se pintan con <img src>,
// y una etiqueta <img> no manda la cabecera Authorization, así que detrás del
// login devolvía 401 y no cargaba ninguna sugerencia.
//
// Pública SIN esta lista sería un proxy abierto: cualquiera podría hacer que
// el servidor descargue una dirección arbitraria, ocultando su origen o
// alcanzando direcciones internas de la red. Con la lista, lo único que puede
// pedir es una imagen del CDN de Brave, que es de donde salen todas las
// miniaturas (ver arriba: se descartan los resultados sin miniatura de Brave).
const HOSTS_PERMITIDOS = ['imgs.search.brave.com', 'cdn.search.brave.com'];

function hostPermitido(url) {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === 'https:' && HOSTS_PERMITIDOS.includes(hostname);
  } catch {
    return false;
  }
}

/**
 * La miniatura, descargada por el servidor. Además de la lista de hosts, pasa
 * por `descargarImagen`, que no sigue una redirección hacia una dirección
 * interna y corta lo que pese demasiado.
 *
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function miniatura(url, dependencias) {
  if (!url || !/^https?:\/\//i.test(String(url))) throw httpError(400, 'URL de imagen inválida');
  if (!hostPermitido(url)) throw httpError(403, 'Ese origen de imagen no está permitido.');
  const { buffer, contentType } = await descargarImagen(url, dependencias);
  return { buffer, contentType: contentType || 'image/jpeg' };
}

module.exports = { buscarImagenes, miniatura, hostPermitido, HOSTS_PERMITIDOS };

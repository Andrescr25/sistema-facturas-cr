/**
 * Catalogo Module - Service
 * Lógica de negocio para la gestión de catálogo de productos (caché local +
 * operaciones directas sobre Alegra: duplicar marca, editar, eliminar).
 */

const axios = require('axios');
const prisma = require('../../../lib/prisma');
const { getProductService, getClient } = require('../../integrations/alegra');

const productService = getProductService();
const client = getClient();

// Varios sitios de origen (y algunos CDNs) rechazan descargas server-side que
// no parezcan venir de un navegador real. No evita bloqueos serios (WAFs tipo
// Cloudflare bot-fight), pero sí algunos filtros simples por User-Agent.
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function normalizarTexto(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Cuenta cuántas palabras significativas (>2 letras) del nombre del producto
// aparecen en el título del resultado de imagen. Mismo enfoque que
// calculateSimilarityScore en alegra-product.service.js (usado para
// relacionar productos de proveedor), adaptado acá para ORDENAR resultados de
// búsqueda de imágenes de más a menos parecido al nombre del producto, en vez
// de un porcentaje: nombres largos casi nunca coinciden al 100% en la web
// (unidades, medidas, abreviaturas locales), así que exigir un % alto dejaría
// la búsqueda vacía casi siempre — confirmado probando con nombres reales del
// catálogo.
function contarCoincidencias(queryWords, texto) {
  const textoNorm = normalizarTexto(texto);
  return queryWords.reduce((total, palabra) => total + (textoNorm.includes(palabra) ? 1 : 0), 0);
}

/**
 * Error con código de estado HTTP para que el controller responda con el status correcto.
 */
function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

/**
 * Listar productos paginados de la caché local con filtros
 */
async function listarProductos({ search = '', missingImageOnly = 'false', page = '1', limit = '30' }) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 30;
  const skip = (pageNum - 1) * limitNum;

  const isMissingImageOnly = missingImageOnly === 'true';

  const whereClause = {
    status: 'active',
    hiddenLocally: false
  };

  if (search.trim()) {
    whereClause.searchText = {
      contains: search.trim().toLowerCase()
    };
  }

  if (isMissingImageOnly) {
    whereClause.OR = [
      { imageUrl: null },
      { imageUrl: '' }
    ];
  }

  const [productos, total] = await Promise.all([
    prisma.alegraProduct.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      skip: skip,
      take: limitNum
    }),
    prisma.alegraProduct.count({
      where: whereClause
    })
  ]);

  return {
    data: productos,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  };
}

/**
 * Buscar sugerencias de imágenes usando la API oficial de Brave Search.
 * Segundo reemplazo del scraping de Bing (2026-07): primero se intentó
 * Google Custom Search JSON API, pero Google cerró esa API a cuentas/
 * proyectos nuevos desde 2026 (confirmado con múltiples proyectos de
 * prueba, todos con el mismo error de acceso denegado sin importar la
 * configuración). Brave Search sí da resultados reales y relevantes.
 */
async function buscarImagenes(queryStr) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    throw httpError(500, 'Búsqueda de imágenes no configurada: falta la variable de entorno BRAVE_SEARCH_API_KEY');
  }

  console.log(`🔍 Buscando imágenes sugeridas en Brave Search para: "${queryStr}"...`);

  try {
    const response = await axios.get('https://api.search.brave.com/res/v1/images/search', {
      params: {
        q: queryStr,
        // Pedimos un lote grande (mismo costo de 1 sola consulta a la API,
        // el conteo de resultados no afecta el consumo de créditos) para
        // tener margen después de filtrar las que no van a cargar bien.
        count: 100,
        safesearch: 'strict'
      },
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      },
      timeout: 15000
    });

    const results = response.data.results || [];
    const queryWords = normalizarTexto(queryStr).split(/\W+/).filter(w => w.length > 2);

    const images = results
      // Sin thumbnail.src propio de Brave, la miniatura cae al link crudo del
      // sitio de origen — el mismo que casi siempre bloquea hotlinking/scraping
      // (403, WAF, etc.), así que ni la miniatura ni la imagen final cargan.
      // Se descartan para no mostrar sugerencias que probablemente fallen.
      .filter(item => item.thumbnail?.src)
      .map(item => ({
        url: item.properties?.url || item.url,
        thumbnail: item.thumbnail.src,
        _coincidencias: contarCoincidencias(queryWords, item.title)
      }))
      // Fuera las que no comparten ni una sola palabra significativa con el
      // nombre del producto — el ruido real (fotos sin relación alguna).
      .filter(img => queryWords.length === 0 || img._coincidencias > 0)
      // Las más parecidas al nombre del producto van primero.
      .sort((a, b) => b._coincidencias - a._coincidencias)
      .map(({ _coincidencias, ...img }) => img);

    console.log(`✅ Búsqueda finalizada: se encontraron ${images.length} imágenes confiables y relevantes para "${queryStr}" (de ${results.length} resultados de Brave)`);
    return images;
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn(`⚠️ Límite de Brave Search alcanzado buscando "${queryStr}"`);
      return [];
    }

    console.error('❌ Error en Brave Search:', error.response?.data || error.message);
    throw httpError(500, 'Error buscando imágenes sugeridas');
  }
}

/**
 * Descargar una imagen desde una URL externa (server-side) para servirla al
 * frontend, evitando el bloqueo de hotlinking que aplican varios CDNs/sitios
 * de origen cuando el navegador intenta cargarlas directamente.
 */
async function descargarImagen(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'User-Agent': BROWSER_USER_AGENT }
  });

  return {
    buffer: Buffer.from(response.data, 'binary'),
    contentType: response.headers['content-type'] || 'image/jpeg'
  };
}

/**
 * Asignar imagen a un producto descargándola de una URL
 */
async function asignarImagenDesdeUrl(alegraId, imageUrl, fallbackImageUrl) {
  console.log(`🖼️ Asignando imagen a producto ${alegraId} desde URL...`);
  let result = await productService.downloadAndUploadProductImage(alegraId, imageUrl);
  let finalImageUrl = imageUrl;

  // La URL principal es la imagen de tamaño completo del sitio de origen, que
  // a veces bloquea la descarga (hotlinking/WAF). Si falla, se reintenta con
  // la miniatura ya redimensionada por Brave (menor calidad, pero mucho más
  // confiable) en vez de dejar al usuario sin poder asignar ninguna imagen.
  if (!result.success && fallbackImageUrl && fallbackImageUrl !== imageUrl) {
    console.log(`↩️ Falló la imagen original para el producto ${alegraId}, reintentando con la miniatura de respaldo...`);
    result = await productService.downloadAndUploadProductImage(alegraId, fallbackImageUrl);
    finalImageUrl = fallbackImageUrl;
  }

  if (!result.success) {
    throw httpError(400, result.error || 'No se pudo subir la imagen a Alegra');
  }

  await prisma.alegraProduct.update({
    where: { alegraId: String(alegraId) },
    data: {
      imageUrl: finalImageUrl,
      updatedAt: new Date()
    }
  });

  return finalImageUrl;
}

/**
 * Duplicar un producto agregándole una nueva marca (crea un producto nuevo en
 * Alegra con la misma info base, pero código/precio/costo/imagen propios)
 */
async function duplicarConMarca({ originalProductId, brandName, newCode, newPrice, newCost, imageUrl }) {
  console.log(`📋 Duplicando producto ${originalProductId} para marca "${brandName}"...`);

  // 1. Obtener detalles del producto original de Alegra
  const originalProduct = await client.api.get(`/items/${originalProductId}`)
    .then(res => res.data)
    .catch(err => {
      console.error(`❌ Error obteniendo producto original ${originalProductId} de Alegra:`, err.message);
      throw new Error('No se pudo encontrar el producto original en Alegra');
    });

  // 2. Construir los datos del nuevo producto duplicado
  const newPriceVal = parseFloat(newPrice);
  const newCostVal = parseFloat(newCost) || 0;

  // Alegra usa array para precios: [{ idPriceList: "1", price: "..." }]
  const priceList = originalProduct.price || [];
  const newPriceArray = priceList.map(pl => {
    if (pl.main === true) {
      return { ...pl, price: newPriceVal.toString() };
    }
    return pl;
  });

  if (newPriceArray.length === 0) {
    newPriceArray.push({ price: newPriceVal.toString(), main: true });
  }

  const newProductData = {
    name: `${originalProduct.name} - ${brandName}`,
    reference: newCode.trim(),
    description: originalProduct.description || '',
    itemCategory: originalProduct.itemCategory ? { id: originalProduct.itemCategory.id } : undefined,
    price: newPriceArray,
    tax: originalProduct.tax || [],
    unit: originalProduct.unit || 'unit',
    inventory: {
      unitCost: newCostVal.toString(),
      initialQuantity: '0' // Iniciamos en 0 unidades
    },
    status: 'active',
    type: originalProduct.type || 'product'
  };

  // 3. Crear el nuevo producto en Alegra
  console.log('➕ Creando producto duplicado en Alegra...');
  const createResponse = await client.api.post('/items', newProductData);
  const newProductAlegra = createResponse.data;

  console.log(`✅ Producto creado exitosamente en Alegra con ID: ${newProductAlegra.id}`);

  // 4. Si hay imagen, descargarla e introducirla
  let finalImageUrl = '';
  if (imageUrl) {
    try {
      console.log(`🖼️ Subiendo imagen a producto duplicado ${newProductAlegra.id}...`);
      const imgResult = await productService.downloadAndUploadProductImage(newProductAlegra.id, imageUrl);
      if (imgResult.success) {
        finalImageUrl = imageUrl;
      }
    } catch (err) {
      console.error('⚠️ Error subiendo imagen (continuando):', err.message);
    }
  }

  // 5. Guardar en base de datos local (Prisma caché)
  const categoryName = newProductAlegra.itemCategory?.name || '';
  const cachedProduct = await prisma.alegraProduct.create({
    data: {
      alegraId: String(newProductAlegra.id),
      name: newProductAlegra.name,
      reference: newProductAlegra.reference || '',
      description: newProductAlegra.description || '',
      category: categoryName,
      price: newPriceVal,
      cost: newCostVal,
      status: 'active',
      type: newProductAlegra.type || 'product',
      imageUrl: finalImageUrl,
      searchText: `${newProductAlegra.name} ${newProductAlegra.reference || ''} ${newProductAlegra.description || ''}`.toLowerCase()
    }
  });

  return cachedProduct;
}

/**
 * Editar datos básicos de un producto en Alegra y en la caché local
 */
async function editarProducto(id, { name, reference, price, cost }) {
  console.log(`📝 Editando producto ${id} en Alegra...`);

  // Cargar producto original de Alegra para obtener la estructura de precios actual
  const originalProduct = await client.api.get(`/items/${id}`).then(res => res.data);
  const priceList = originalProduct.price || [];
  const newPriceVal = parseFloat(price);
  const newCostVal = parseFloat(cost) || 0;

  const newPriceArray = priceList.map(pl => {
    if (pl.main === true) {
      return { ...pl, price: newPriceVal.toString() };
    }
    return pl;
  });
  if (newPriceArray.length === 0) {
    newPriceArray.push({ price: newPriceVal.toString(), main: true });
  }

  // Alegra espera que la referencia sea un objeto en solicitudes PUT
  const originalRefType = originalProduct.reference?.type || 'CODE_OF_INTERNAL_USE';
  const referenceObject = {
    type: originalRefType,
    reference: reference.trim()
  };

  const updateData = {
    name: name.trim(),
    reference: referenceObject,
    price: newPriceArray,
    inventory: {
      unitCost: newCostVal.toString()
    }
  };

  // Actualizar en Alegra
  const updateResponse = await client.api.put(`/items/${id}`, updateData);
  const updatedAlegra = updateResponse.data;

  // Actualizar en caché local
  const cachedProduct = await prisma.alegraProduct.update({
    where: { alegraId: String(id) },
    data: {
      name: updatedAlegra.name,
      reference: updatedAlegra.reference?.reference || updatedAlegra.reference || '',
      price: newPriceVal,
      cost: newCostVal,
      searchText: `${updatedAlegra.name} ${updatedAlegra.reference?.reference || updatedAlegra.reference || ''} ${updatedAlegra.description || ''}`.toLowerCase(),
      updatedAt: new Date()
    }
  });

  return cachedProduct;
}

/**
 * Eliminar un producto en Alegra y en la caché local. Si Alegra rechaza el
 * borrado porque el producto tiene documentos asociados (code 1015), se
 * oculta localmente en vez de fallar.
 */
async function eliminarProducto(id) {
  console.log(`🗑️ Eliminando producto ${id} en Alegra...`);

  try {
    // 1. Eliminar en Alegra
    await client.api.delete(`/items/${id}`);

    // 2. Eliminar en la caché local (Prisma)
    await prisma.alegraProduct.delete({
      where: { alegraId: String(id) }
    });

    console.log(`✅ Producto ${id} eliminado correctamente`);
    return { hidden: false };
  } catch (error) {
    const alegraCode = error.response?.data?.code;
    const alegraMsg = error.response?.data?.message;

    // Alegra no permite eliminar ítems con documentos asociados (code 1015).
    // En ese caso lo ocultamos localmente en vez de fallar.
    if (alegraCode === 1015) {
      console.warn(`⚠️ Producto ${id} tiene documentos asociados en Alegra, ocultando localmente en vez de eliminar`);
      await prisma.alegraProduct.update({
        where: { alegraId: String(id) },
        data: { hiddenLocally: true }
      });
      return {
        hidden: true,
        message: 'El producto tiene facturas asociadas en Alegra y no puede eliminarse, así que se ocultó del catálogo local'
      };
    }

    console.error(`❌ Error eliminando producto ${id}:`, error.message);
    throw httpError(error.response?.status || 500, alegraMsg || error.message, {
      hint: alegraMsg
        ? 'El producto puede tener facturas o movimientos asociados en Alegra y no puede eliminarse'
        : undefined
    });
  }
}

module.exports = {
  listarProductos,
  buscarImagenes,
  descargarImagen,
  asignarImagenDesdeUrl,
  duplicarConMarca,
  editarProducto,
  eliminarProducto
};

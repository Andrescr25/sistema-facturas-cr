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

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'para', 'con', 'por', 'en', 'del', 'al',
  'y', 'o', 'the', 'and', 'for', 'with', 'of', 'a', 'an', 'to', 'in', 'on'
]);

function normalizarTexto(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenizar(str) {
  return normalizarTexto(str)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

// Compara por raíz compartida (primeros hasta 5 caracteres) en vez de
// igualdad exacta, para que singular/plural y variaciones simples del
// español ("cadena"/"cadenas", "aceite"/"aceitera") sigan contando como
// la misma palabra. Palabras muy cortas (<4) sí requieren igualdad exacta.
function compartenRaiz(a, b) {
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return a === b;
  const raizLen = Math.min(5, minLen);
  return a.slice(0, raizLen) === b.slice(0, raizLen);
}

// Bing, cuando detecta trafico automatizado (como el de un servidor en la
// nube pegandole a bing.com/images/search sin sesion de navegador real), no
// devuelve un error: sirve en su lugar un carrusel generico de imagenes
// "trending" con la misma forma que un resultado real, pero sin relacion
// alguna con la consulta. Como filtro de defensa, solo se aceptan imagenes
// cuyo titulo comparta al menos una palabra significativa con la consulta.
function esRelevante(queryTokens, tituloImagen) {
  if (queryTokens.length === 0) return true;
  const tituloTokens = tokenizar(tituloImagen);
  return queryTokens.some(qt => tituloTokens.some(tt => compartenRaiz(qt, tt)));
}

/**
 * Buscar sugerencias de imágenes en la web utilizando Bing Images Scraping
 */
async function buscarImagenes(queryStr) {
  console.log(`🔍 Buscando imágenes sugeridas en Bing para: "${queryStr}"...`);

  // adlt=strict fuerza SafeSearch: sin este parámetro Bing sirve resultados sin
  // filtrar a tráfico anónimo/sin sesión, incluyendo contenido explícito o de
  // baja relevancia cuando la consulta no tiene una coincidencia clara.
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(queryStr)}&adlt=strict`;

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    },
    timeout: 15000
  });

  const html = response.data;
  const images = [];
  const queryTokens = tokenizar(queryStr);
  let descartadasPorIrrelevantes = 0;

  // Intentar extraer metadatos JSON del atributo m de la clase iusc de Bing (Método moderno)
  const mRegex = /m=\"(\{[^\"]+\})\"/g;
  let match;

  while ((match = mRegex.exec(html)) !== null && images.length < 40) {
    try {
      const cleanJson = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');

      const m = JSON.parse(cleanJson);
      if (m.murl && m.turl) {
        const titulo = m.t || m.desc || '';
        if (!esRelevante(queryTokens, titulo)) {
          descartadasPorIrrelevantes++;
          continue;
        }
        images.push({
          url: m.murl,
          thumbnail: m.turl
        });
      }
    } catch (e) { /* ignore */ }
  }

  if (descartadasPorIrrelevantes > 0) {
    console.warn(`⚠️ ${descartadasPorIrrelevantes} imagen(es) descartadas por no compartir ninguna palabra con "${queryStr}" (probable carrusel "trending" de Bing por tráfico automatizado, no resultados reales)`);
  }

  // Fallback: Si no se encontró ninguna imagen con el método moderno, usar el método regex tradicional
  if (images.length === 0) {
    const mediaUrlRegex = /mediaurl=([^&"'\s>]+)/g;
    const cdnUrlRegex = /cdnurl=([^&"'\s>]+)/g;
    const originalUrls = [];
    const thumbUrls = [];

    let matchFallback;
    while ((matchFallback = mediaUrlRegex.exec(html)) !== null && originalUrls.length < 40) {
      try {
        const decoded = decodeURIComponent(matchFallback[1]);
        if (!originalUrls.includes(decoded) && decoded.startsWith('http')) {
          originalUrls.push(decoded);
        }
      } catch (e) { /* ignore */ }
    }

    while ((matchFallback = cdnUrlRegex.exec(html)) !== null && thumbUrls.length < 40) {
      try {
        const decoded = decodeURIComponent(matchFallback[1]);
        if (!thumbUrls.includes(decoded) && decoded.startsWith('http')) {
          thumbUrls.push(decoded);
        }
      } catch (e) { /* ignore */ }
    }

    const limitCount = Math.min(originalUrls.length, thumbUrls.length);
    for (let i = 0; i < limitCount; i++) {
      images.push({
        url: originalUrls[i],
        thumbnail: thumbUrls[i]
      });
    }

    if (images.length === 0 && originalUrls.length > 0) {
      originalUrls.forEach(url => {
        images.push({
          url: url,
          thumbnail: url
        });
      });
    }
  }

  console.log(`✅ Búsqueda finalizada: se encontraron ${images.length} imágenes para "${queryStr}"`);

  return images;
}

/**
 * Asignar imagen a un producto descargándola de una URL
 */
async function asignarImagenDesdeUrl(alegraId, imageUrl) {
  console.log(`🖼️ Asignando imagen a producto ${alegraId} desde URL...`);
  const result = await productService.downloadAndUploadProductImage(alegraId, imageUrl);

  if (!result.success) {
    throw httpError(400, 'No se pudo subir la imagen a Alegra');
  }

  await prisma.alegraProduct.update({
    where: { alegraId: String(alegraId) },
    data: {
      imageUrl: imageUrl,
      updatedAt: new Date()
    }
  });

  return imageUrl;
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
  asignarImagenDesdeUrl,
  duplicarConMarca,
  editarProducto,
  eliminarProducto
};

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
        count: 10,
        safesearch: 'strict'
      },
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      },
      timeout: 15000
    });

    const results = response.data.results || [];
    const images = results.map(item => ({
      url: item.properties?.url || item.url,
      thumbnail: item.thumbnail?.src || item.properties?.url || item.url
    }));

    console.log(`✅ Búsqueda finalizada: se encontraron ${images.length} imágenes para "${queryStr}"`);
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

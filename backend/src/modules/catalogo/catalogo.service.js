/**
 * Catalogo Module - Service
 * Lógica de negocio para la gestión de catálogo de productos (caché local +
 * operaciones directas sobre Alegra: duplicar marca, editar, eliminar).
 */

const axios = require('axios');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { clasificarProducto } = require('../precios/auditoria');
const categoriasService = require('./categorias.service');
const subcategoriasService = require('./subcategorias.service');
const prisma = require('../../../lib/prisma');
const { query } = require('../../../config/database');
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

// Valor del filtro para "productos que no se le han relacionado a ningún
// proveedor". No choca con una cédula real: esas son solo dígitos.
const SIN_PROVEEDOR = 'sin-proveedor';

/**
 * Proveedores que tienen productos en el catálogo, para el filtro.
 *
 * No se reutiliza GET /proveedores: esa lista sale de TODAS las facturas
 * recibidas, incluidas las de gastos (luz, alquiler) que no tienen ningún
 * producto. Elegir uno de esos dejaba la grilla vacía sin explicación.
 *
 * Se agrupa por cédula y se muestra el nombre usado más recientemente: hay
 * cédulas con dos grafías del mismo proveedor. El conteo es de productos
 * VISIBLES —activos y no ocultos—, el mismo criterio de listarProductos, para
 * que el número del filtro coincida con lo que aparece al elegirlo.
 */
async function listarProveedoresDelCatalogo() {
  // Las dos van juntas: cada viaje al pooler de Supabase cuesta ~500 ms
  // aunque la consulta en sí sea instantánea (medido contra un SELECT 1).
  const [filas, sinProveedor] = await Promise.all([prisma.$queryRawUnsafe(`
    SELECT m.supplier_cedula AS cedula,
           (array_agg(m.supplier_name ORDER BY m.last_used_date DESC NULLS LAST))[1] AS nombre,
           COUNT(DISTINCT c.alegra_id)::int AS productos
    FROM supplier_product_mapping m
    JOIN alegra_products_cache c
      ON c.alegra_id = m.alegra_item_id
     AND c.status = 'active'
     AND c.hidden_locally = false
    WHERE m.supplier_cedula IS NOT NULL AND m.supplier_cedula <> ''
    GROUP BY m.supplier_cedula
    ORDER BY nombre ASC
  `), prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS productos
    FROM alegra_products_cache c
    WHERE c.status = 'active' AND c.hidden_locally = false
      AND NOT EXISTS (
        SELECT 1 FROM supplier_product_mapping m WHERE m.alegra_item_id = c.alegra_id
      )
  `)]);

  return {
    proveedores: filas.map(f => ({ cedula: f.cedula, nombre: f.nombre, productos: f.productos })),
    sinProveedor: { valor: SIN_PROVEEDOR, productos: sinProveedor[0]?.productos || 0 }
  };
}

/**
 * Listar productos paginados de la caché local con filtros
 */
async function listarProductos({ search = '', missingImageOnly = 'false', proveedor = '', subcategoria = '', page = '1', limit = '30' }) {
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

  // Filtro por proveedor. La caché de productos no sabe quién vende qué: eso
  // vive en supplier_product_mapping, que se llena al relacionar facturas de
  // proveedor. Se filtra por CÉDULA y no por nombre porque el mismo proveedor
  // aparece escrito de dos formas ("F & G Ferreteros Sociedad Anonima" y
  // "F Y G FERRETEROS SOCIEDAD ANONIMA"); por nombre se perdía la mitad.
  //
  // Un producto puede tener varios proveedores (242 del catálogo): aparece
  // bajo cada uno de ellos, que es lo que se espera al preguntar "¿qué le
  // compro a este?".
  const proveedorLimpio = String(proveedor || '').trim();
  if (proveedorLimpio) {
    // alegra_item_id es NOT NULL en la tabla (y String obligatorio en
    // Prisma, que rechaza `{ not: null }`), así que no se filtra en la
    // consulta; se descartan acá los vacíos por si alguna fila vieja quedó así.
    const mapeados = await prisma.supplierProductMapping.findMany({
      where: proveedorLimpio === SIN_PROVEEDOR ? {} : { supplierCedula: proveedorLimpio },
      select: { alegraItemId: true },
      distinct: ['alegraItemId']
    });
    const ids = mapeados.map(m => m.alegraItemId).filter(Boolean);
    whereClause.alegraId = proveedorLimpio === SIN_PROVEEDOR ? { notIn: ids } : { in: ids };
  }

  // Filtro por subcategoría. Se resuelven los ids aparte, igual que el filtro
  // por proveedor de arriba: la subcategoría es NUESTRA y no está en el
  // esquema de Prisma, así que no se puede poner en el `where`.
  //
  // `sin` son los productos de esa categoría a los que todavía nadie les puso
  // subcategoría: es justo la lista que hay que ir vaciando al ordenar.
  const subFiltro = String(subcategoria || '').trim();
  if (subFiltro) {
    const esSin = subFiltro.startsWith('sin:');
    const { rows } = esSin
      ? await query(
        `SELECT alegra_id FROM alegra_products_cache
          WHERE subcategoria_id IS NULL AND category = $1 AND status = 'active'`,
        [subFiltro.slice(4)])
      : await query(
        `SELECT alegra_id FROM alegra_products_cache WHERE subcategoria_id = $1`,
        [Number(subFiltro)]);

    const ids = rows.map(r => r.alegra_id);
    whereClause.alegraId = whereClause.alegraId
      ? { in: ids.filter(id => (whereClause.alegraId.in || []).includes(id)) }
      : { in: ids };
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

  // El precio de venta CON impuesto va calculado desde acá y no en la
  // pantalla, con la misma función que usa el catálogo del cliente: si cada
  // pantalla lo multiplicara por su cuenta, basta con que una redondee
  // distinto para que el mismo producto valga ₡6.356 en una y ₡6.356,25 en
  // otra.
  //
  // Hace falta porque en Alegra `price` va SIN impuesto y `cost` CON él: la
  // pantalla mostraba los dos lado a lado sin decirlo, y de ahí salía un
  // margen aparente de 15% donde el real es 25%.
  //
  // taxPercentage NULL es "todavía no se sincronizó", no "exento": ahí se
  // devuelve null en vez de repetir el precio sin impuesto como si lo
  // llevara.
  // La subcategoría va en una consulta aparte y no en el findMany porque no
  // está en el esquema de Prisma (ver el filtro de arriba). Son los productos
  // de ESTA página, así que es una consulta chica.
  const subPorProducto = new Map();
  if (productos.length > 0) {
    const { rows } = await query(`
      SELECT p.alegra_id, s.id, s.nombre
        FROM alegra_products_cache p
        JOIN subcategoria s ON s.id = p.subcategoria_id
       WHERE p.alegra_id = ANY($1::varchar[])
    `, [productos.map(p => p.alegraId)]);
    rows.forEach(r => subPorProducto.set(r.alegra_id, { id: r.id, nombre: r.nombre }));
  }

  const data = productos.map((p) => ({
    ...p,
    subcategoria: subPorProducto.get(p.alegraId) || null,
    precioConIva: p.taxPercentage === null || p.taxPercentage === undefined
      ? null
      : precioConImpuesto(p.price, p.taxPercentage)
  }));

  return {
    data,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  };
}

/**
 * El árbol de categorías y subcategorías con sus conteos, en el orden
 * canónico (`categoria_config.orden` / `subcategoria.orden` — el mismo que
 * arma el catálogo del agente en `catalogoAgentePersonalizacion.js`). Es lo
 * que pinta el riel de Gestión de Catálogo.
 *
 * Los conteos usan el MISMO criterio de "visible" que `listarProductos`
 * (`status='active' AND hidden_locally=false`): si no coincidieran, el riel
 * diría "Sin clasificar (37)" y la lista de al lado mostraría 35 filas.
 */
async function arbolCatalogo() {
  const [categoriasCfg, subcategoriasList, conteos] = await Promise.all([
    categoriasService.listar(),
    subcategoriasService.listar({ incluirInactivas: false }),
    query(`
      SELECT category, subcategoria_id, COUNT(*)::int AS n
        FROM alegra_products_cache
       WHERE status = 'active' AND hidden_locally = false
       GROUP BY category, subcategoria_id
    `)
  ]);

  const subsPorCategoria = new Map();
  for (const s of subcategoriasList) {
    if (!subsPorCategoria.has(s.categoria)) subsPorCategoria.set(s.categoria, []);
    subsPorCategoria.get(s.categoria).push({ id: s.id, nombre: s.nombre, orden: s.orden, activo: s.activo, productos: s.productos });
  }

  const totalPorCategoria = new Map();
  const sinClasificarPorCategoria = new Map();
  for (const fila of conteos.rows) {
    totalPorCategoria.set(fila.category, (totalPorCategoria.get(fila.category) || 0) + fila.n);
    if (fila.subcategoria_id === null) {
      sinClasificarPorCategoria.set(fila.category, (sinClasificarPorCategoria.get(fila.category) || 0) + fila.n);
    }
  }

  return {
    categorias: categoriasCfg.map((c) => ({
      // El id de Alegra viaja acá porque el riel es también de dónde sale el
      // selector de "a qué categoría muevo esto" (la ficha del producto y el
      // cambio en lote): ambos le mandan a Alegra ese id, nunca el nombre.
      id: c.id,
      name: c.name,
      nombreVisible: c.nombreVisible,
      orden: c.orden,
      total: totalPorCategoria.get(c.name) || 0,
      sinClasificar: sinClasificarPorCategoria.get(c.name) || 0,
      subcategorias: subsPorCategoria.get(c.name) || []
    }))
  };
}

/**
 * TODOS los productos de una categoría (sin paginar — la más grande,
 * Ferretería, son 439: entran cómodos en una sola respuesta), enriquecidos
 * con subcategoría, rotación y proveedor principal en un solo viaje (sin
 * N+1). Para el panel derecho del riel.
 *
 * El margen NO se inventa acá: sale de `clasificarProducto` (motor de
 * precios), la misma fórmula que usa el resto del sistema — sin eso, el
 * mismo producto podría mostrar un margen distinto en dos pantallas.
 */
async function productosDeCategoria(categoria) {
  const cat = String(categoria || '').trim();
  if (!cat) throw httpError(400, 'Falta la categoría.');

  const { rows } = await query(`
    SELECT p.alegra_id, p.name, p.reference, p.price, p.cost, p.tax_percentage,
           p.image_url, p.category,
           s.id AS sub_id, s.nombre AS sub_nombre,
           r.unidades_mes,
           prov.supplier_name, prov.supplier_cedula
      FROM alegra_products_cache p
      LEFT JOIN subcategoria s ON s.id = p.subcategoria_id
      LEFT JOIN producto_rotacion r ON r.alegra_item_id = p.alegra_id
      LEFT JOIN LATERAL (
             SELECT supplier_name, supplier_cedula
               FROM supplier_product_mapping m
              WHERE m.alegra_item_id = p.alegra_id
              ORDER BY m.times_used DESC, m.last_used_date DESC
              LIMIT 1
           ) prov ON true
     WHERE p.category = $1 AND p.status = 'active' AND p.hidden_locally = false
     ORDER BY p.name ASC
  `, [cat]);

  return rows.map((r) => {
    const { margenReal } = clasificarProducto({ price: r.price, cost: r.cost, costoDerivado: null, historialInestable: false });
    return {
      alegraId: r.alegra_id,
      name: r.name,
      reference: r.reference,
      price: Number(r.price),
      cost: Number(r.cost),
      taxPercentage: r.tax_percentage,
      imageUrl: r.image_url,
      category: r.category,
      subcategoria: r.sub_id ? { id: r.sub_id, nombre: r.sub_nombre } : null,
      unidadesMes: r.unidades_mes !== null ? Number(r.unidades_mes) : null,
      proveedor: r.supplier_name ? { nombre: r.supplier_name, cedula: r.supplier_cedula } : null,
      precioConIva: r.tax_percentage === null || r.tax_percentage === undefined
        ? null
        : precioConImpuesto(r.price, r.tax_percentage),
      margenReal
    };
  });
}

/**
 * Busca en la caché local (alegra_products_cache) la foto ya asignada de
 * cada referencia, en un solo query — usado por pantallas que no tienen la
 * imagen embebida en sus propios datos (ej. líneas de una factura de
 * Alegra, que no traen fotos), a diferencia de Auditoría/Excesos donde
 * cada ítem ya guarda su propio image_url desde que se creó.
 */
async function buscarImagenesPorReferencia(referencias) {
  if (!Array.isArray(referencias) || referencias.length === 0) return [];

  const productos = await prisma.alegraProduct.findMany({
    where: { reference: { in: referencias } },
    select: { reference: true, imageUrl: true }
  });

  return productos.map((p) => ({ referencia: p.reference, imageUrl: p.imageUrl }));
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
 * Alegra NO reemplaza la imagen de un producto al subir una nueva — la
 * agrega como adjunto adicional, dejando la anterior marcada como
 * "favorite" (la que Alegra y cualquier integración externa muestran como
 * LA foto del producto). Tampoco existe ningún endpoint para cambiar cuál
 * imagen es la favorita (confirmado contra la documentación y probando en
 * vivo). La única forma de que la imagen nueva quede como la definitiva es
 * borrar las anteriores después de subirla, para que no quede ninguna otra
 * compitiendo. Nunca lanza: si la limpieza falla, la imagen nueva ya quedó
 * subida correctamente, así que no vale la pena reventar la operación por
 * esto — solo se registra el error.
 */
async function limpiarImagenesAnteriores(alegraId, idImagenNueva) {
  try {
    const itemRes = await client.api.get(`/items/${alegraId}`);
    const imagenes = itemRes.data.images || [];
    const idsAntiguos = imagenes
      .map(img => img.id)
      .filter(id => String(id) !== String(idImagenNueva));

    for (const idAntiguo of idsAntiguos) {
      await client.api.delete(`/items/attachment/${idAntiguo}`).catch(err => {
        console.error(`⚠️ No se pudo borrar la imagen antigua ${idAntiguo} del producto ${alegraId}:`, err.response?.data || err.message);
      });
    }
  } catch (error) {
    console.error(`⚠️ No se pudieron limpiar las imágenes antiguas del producto ${alegraId}:`, error.response?.data || error.message);
  }
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

  await limpiarImagenesAnteriores(alegraId, result.data?.id);

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
 * Asignar imagen a un producto subiendo un archivo elegido manualmente por el
 * usuario (en vez de una sugerencia buscada) — mismo endpoint de Alegra
 * (/items/:id/attachment) que ya usa downloadAndUploadProductImage, sin el
 * paso de descarga porque ya se tienen los bytes del archivo.
 */
async function subirImagenDesdeArchivo(alegraId, file) {
  console.log(`🖼️ Subiendo imagen manual a producto ${alegraId}...`);

  const FormData = require('form-data');
  const formData = new FormData();
  formData.append('image', file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype
  });

  let result;
  try {
    result = await productService.uploadProductImage(alegraId, formData);
  } catch (error) {
    throw httpError(400, error.message || 'No se pudo subir la imagen a Alegra');
  }

  if (!result.success) {
    throw httpError(400, result.error || 'No se pudo subir la imagen a Alegra');
  }

  const finalImageUrl = result.url || '';

  await limpiarImagenesAnteriores(alegraId, result.data?.id);

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
async function duplicarConMarca({ originalProductId, name, newCode, newPrice, newCost, imageUrl }) {
  console.log(`📋 Duplicando producto ${originalProductId} como "${name}"...`);

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

  // Alegra espera que la referencia sea un objeto en POST /items, igual que en
  // el PUT de editarProducto — mandarla como string plano hace que Alegra
  // rechace la creación.
  const originalRefType = originalProduct.reference?.type || 'CODE_OF_INTERNAL_USE';
  // La unidad de medida vive en inventory.unit en la respuesta de Alegra, no
  // en un campo `unit` de nivel superior (ese siempre viene undefined). Se
  // manda en ambos lugares en el payload, igual que el flujo de creación
  // "oficial" en alegra-product.service.js — Alegra la exige dentro de
  // inventory para ítems inventariables.
  const unitMedida = originalProduct.inventory?.unit || 'unit';

  const newProductData = {
    name: name.trim(),
    reference: { type: originalRefType, reference: newCode.trim() },
    description: originalProduct.description || '',
    itemCategory: originalProduct.itemCategory ? { id: originalProduct.itemCategory.id } : undefined,
    price: newPriceArray,
    tax: originalProduct.tax || [],
    unit: unitMedida,
    inventory: {
      unit: unitMedida,
      unitCost: newCostVal.toString(),
      initialQuantity: '0' // Iniciamos en 0 unidades
    },
    status: 'active',
    type: originalProduct.type || 'product'
  };

  // Resto de campos que se heredan tal cual del producto original (todo
  // menos imagen/nombre/referencia/cantidad, que son distintos a propósito
  // en cada duplicado). Se agregan solo si el original los trae, para no
  // mandarle a Alegra un campo vacío que no espera.

  // Código CABYS (productKey): esta cuenta de Alegra lo exige por la
  // facturación electrónica de Costa Rica (error 1093 "clave de producto
  // requerida" si falta).
  if (originalProduct.productKey) {
    newProductData.productKey = originalProduct.productKey;
  }

  // Clave adicional (poco usada en esta cuenta, pero es el mismo tipo de
  // dato que productKey — si el original la tiene, se hereda igual).
  if (originalProduct.extraProductKey) {
    newProductData.extraProductKey = originalProduct.extraProductKey;
  }

  // Escala de cálculo (decimales de precisión) — varía por producto según
  // muestreo real (5 o 6), no es un valor fijo de cuenta.
  if (originalProduct.calculationScale !== undefined && originalProduct.calculationScale !== null) {
    newProductData.calculationScale = originalProduct.calculationScale;
  }

  // Campos personalizados configurados en Alegra para este ítem.
  if (Array.isArray(originalProduct.customFields) && originalProduct.customFields.length > 0) {
    newProductData.customFields = originalProduct.customFields;
  }

  // 3. Crear el nuevo producto en Alegra
  console.log('➕ Creando producto duplicado en Alegra...');
  let newProductAlegra;
  try {
    const createResponse = await client.api.post('/items', newProductData);
    newProductAlegra = createResponse.data;
  } catch (error) {
    // Ej: referencia duplicada — se propaga el mensaje real de Alegra en vez
    // de un 500 genérico, mismo patrón que editarProducto.
    const alegraMsg = error.response?.data?.message;
    console.error('❌ Error creando producto duplicado en Alegra:', error.response?.data || error.message);
    throw httpError(error.response?.status || 500, alegraMsg || 'No se pudo crear el producto duplicado en Alegra');
  }

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
      reference: newProductAlegra.reference?.reference || newProductAlegra.reference || '',
      description: newProductAlegra.description || '',
      category: categoryName,
      price: newPriceVal,
      cost: newCostVal,
      status: 'active',
      type: newProductAlegra.type || 'product',
      imageUrl: finalImageUrl,
      searchText: `${newProductAlegra.name} ${newProductAlegra.reference?.reference || newProductAlegra.reference || ''} ${newProductAlegra.description || ''}`.toLowerCase()
    }
  });

  return cachedProduct;
}

/**
 * Editar datos básicos de un producto en Alegra y en la caché local
 */
async function editarProducto(id, { name, reference, price, cost, category }) {
  console.log(`📝 Editando producto ${id} en Alegra...`);

  // Categoría ANTES de tocar nada: si el pedido la cambia, hay que saber si
  // de verdad cambió para limpiar la subcategoría (es DE la categoría vieja,
  // y sin esto quedaba apuntando a una subcategoría ajena — bug arrastrado
  // desde que existe esta pantalla).
  const antes = category
    ? await prisma.alegraProduct.findUnique({ where: { alegraId: String(id) }, select: { category: true } })
    : null;

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

  // Categoría opcional: si no se manda, Alegra conserva la categoría actual
  // del producto (el PUT es un merge parcial, no reemplaza lo que no se envía).
  if (category) {
    updateData.itemCategory = { id: parseInt(category, 10) };
  }

  // Actualizar en Alegra
  let updateResponse;
  try {
    updateResponse = await client.api.put(`/items/${id}`, updateData);
  } catch (error) {
    // Ej: code 1009 "La referencia ya ha sido asignada a otro ítem" cuando
    // hay un producto duplicado con la misma referencia — se propaga el
    // mensaje real de Alegra en vez de un 500 genérico.
    const alegraMsg = error.response?.data?.message;
    console.error(`❌ Error editando producto ${id} en Alegra:`, error.response?.data || error.message);
    throw httpError(error.response?.status || 500, alegraMsg || 'No se pudo actualizar el producto en Alegra');
  }
  const updatedAlegra = updateResponse.data;

  // Actualizar en caché local
  const nuevaCategoria = updatedAlegra.itemCategory?.name || updatedAlegra.category?.name || '';
  const cachedProduct = await prisma.alegraProduct.update({
    where: { alegraId: String(id) },
    data: {
      name: updatedAlegra.name,
      reference: updatedAlegra.reference?.reference || updatedAlegra.reference || '',
      price: newPriceVal,
      cost: newCostVal,
      category: nuevaCategoria,
      searchText: `${updatedAlegra.name} ${updatedAlegra.reference?.reference || updatedAlegra.reference || ''} ${updatedAlegra.description || ''}`.toLowerCase(),
      updatedAt: new Date()
    }
  });

  // subcategoria_id no está en el esquema de Prisma (ver subcategorias.service.js:
  // la caché la guarda, pero Prisma no la conoce), así que se limpia aparte.
  if (antes && antes.category !== nuevaCategoria) {
    await query(`UPDATE alegra_products_cache SET subcategoria_id = NULL WHERE alegra_id = $1`, [String(id)]);
  }

  return cachedProduct;
}

/**
 * Eliminar un producto en Alegra y en la caché local. Si Alegra rechaza el
 * borrado porque el producto tiene documentos asociados (code 1015), se
 * desactiva de verdad en Alegra (PUT /items/:id con status:"inactive" — no
 * hay un endpoint de "desactivar" separado, Alegra lo maneja con el mismo
 * PUT de edición) y además se oculta localmente.
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
    // En ese caso se desactiva en Alegra en vez de solo ocultarlo localmente
    // (antes se ocultaba solo acá, pero el producto seguía activo en Alegra).
    if (alegraCode === 1015) {
      console.warn(`⚠️ Producto ${id} tiene documentos asociados en Alegra, desactivando en Alegra en vez de eliminar`);

      try {
        // PUT es de reemplazo completo en Alegra: se trae el ítem actual y se
        // reenvía tal cual, solo agregando status:"inactive", para no perder
        // ningún otro campo (precio, categoría, inventario, etc.).
        const original = await client.api.get(`/items/${id}`).then(res => res.data);
        await client.api.put(`/items/${id}`, { ...original, status: 'inactive' });
        console.log(`✅ Producto ${id} desactivado en Alegra`);
      } catch (deactivateError) {
        console.error(`❌ Error desactivando producto ${id} en Alegra:`, deactivateError.response?.data || deactivateError.message);
        throw httpError(500, 'El producto tiene facturas asociadas y no se pudo desactivar en Alegra. Intenta de nuevo.');
      }

      await prisma.alegraProduct.update({
        where: { alegraId: String(id) },
        data: { hiddenLocally: true, status: 'inactive' }
      });

      return {
        hidden: true,
        message: 'El producto tiene facturas asociadas en Alegra: se desactivó en Alegra y se ocultó del catálogo local'
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

/**
 * Trabajos de cambio de categoría en lote, en memoria — vive mientras el
 * proceso esté arriba, que es suficiente: es solo para que el navegador
 * sondee un progreso que ya terminó o está por terminar (nunca minutos como
 * la sincronización), no un historial permanente. Se borra solo 30 min
 * después de terminar para no crecer sin límite en un servidor de larga vida.
 */
const trabajosCategoriaLote = new Map();

function nuevoIdTrabajo() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Cambia la categoría de varios productos a la vez. Cada uno escribe en
 * Alegra (~3 s: `editarProducto` hace un GET + un PUT), así que esto NO
 * espera a que termine — crea el trabajo, lo arranca en segundo plano, y
 * devuelve el jobId al toque para que la pantalla no se congele 3 minutos.
 * Procesa de a 3 en paralelo. `GET /trabajos/:jobId` sondea el avance.
 */
async function cambiarCategoriaLote(alegraIds, categoriaId) {
  const ids = Array.isArray(alegraIds) ? alegraIds.map((id) => String(id).trim()).filter(Boolean) : [];
  if (ids.length === 0) throw httpError(400, 'Falta la lista de productos.');
  if (!categoriaId) throw httpError(400, 'Falta la categoría destino.');

  const productos = await prisma.alegraProduct.findMany({
    where: { alegraId: { in: ids } },
    select: { alegraId: true, name: true, reference: true, price: true, cost: true }
  });

  const jobId = nuevoIdTrabajo();
  const estado = { total: productos.length, hechos: 0, errores: [], terminado: false };
  trabajosCategoriaLote.set(jobId, estado);

  procesarCategoriaLote(productos, categoriaId, estado, jobId).catch((error) => {
    console.error('❌ Error inesperado procesando el lote de categoría:', error);
    estado.terminado = true;
  });

  return { jobId, total: estado.total };
}

async function procesarCategoriaLote(productos, categoriaId, estado, jobId) {
  const TAMANO_TANDA = 3;
  for (let i = 0; i < productos.length; i += TAMANO_TANDA) {
    const tanda = productos.slice(i, i + TAMANO_TANDA);
    await Promise.all(tanda.map(async (p) => {
      try {
        await editarProducto(p.alegraId, {
          name: p.name,
          // Producto sin referencia (Alegra la exige en el PUT): se usa el
          // propio alegraId como respaldo — mismo criterio ya usado a mano
          // en reclasificaciones anteriores.
          reference: p.reference || p.alegraId,
          price: p.price,
          cost: p.cost,
          category: categoriaId
        });
      } catch (error) {
        estado.errores.push({ alegraId: p.alegraId, nombre: p.name, mensaje: error.message });
      } finally {
        estado.hechos++;
      }
    }));
  }
  estado.terminado = true;
  setTimeout(() => trabajosCategoriaLote.delete(jobId), 30 * 60 * 1000).unref();
}

/** El avance de un trabajo de cambio de categoría en lote. */
function estadoTrabajo(jobId) {
  const estado = trabajosCategoriaLote.get(jobId);
  if (!estado) throw httpError(404, 'Ese trabajo no existe, ya terminó hace rato, o el servidor se reinició.');
  return estado;
}

/**
 * Siguiente código libre para duplicar un producto por marca.
 *
 * El modal proponía `CODIGO-` y había que inventar el sufijo a mano, lo que
 * produjo códigos sin orden ninguno (305-14, 305-908, 305-1453, 305-8567...).
 * Acá se devuelve el menor número LIBRE empezando en 1, con tres dígitos, así
 * las marcas nuevas quedan numeradas de corrido aunque las viejas no lo estén.
 *
 * Si el producto que se duplica ya es una variante (`305-14`), la base es
 * `305`: una marca hermana, no un código anidado tipo `305-14-001`.
 */
async function siguienteReferenciaMarca(referenciaBase) {
  const base = String(referenciaBase || '').trim().replace(/-\d+$/, '');
  if (!base) throw httpError(400, 'Hace falta la referencia base.');

  const filas = await prisma.alegraProduct.findMany({
    where: { reference: { startsWith: `${base}-` } },
    select: { reference: true }
  });

  const usados = new Set();
  for (const fila of filas) {
    const sufijo = String(fila.reference).slice(base.length + 1);
    // Solo cuentan los sufijos puramente numéricos: '305-A' no ocupa un
    // número de la serie.
    if (/^\d+$/.test(sufijo)) usados.add(parseInt(sufijo, 10));
  }

  let siguiente = 1;
  while (usados.has(siguiente)) siguiente++;

  return {
    base,
    referencia: `${base}-${String(siguiente).padStart(3, '0')}`,
    usados: [...usados].sort((a, b) => a - b)
  };
}

module.exports = {
  listarProductos,
  listarProveedoresDelCatalogo,
  SIN_PROVEEDOR,
  arbolCatalogo,
  productosDeCategoria,
  buscarImagenesPorReferencia,
  buscarImagenes,
  descargarImagen,
  asignarImagenDesdeUrl,
  subirImagenDesdeArchivo,
  duplicarConMarca,
  siguienteReferenciaMarca,
  editarProducto,
  eliminarProducto,
  cambiarCategoriaLote,
  estadoTrabajo
};

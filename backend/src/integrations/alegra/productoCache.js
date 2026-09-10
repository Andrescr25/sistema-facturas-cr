/**
 * Cómo se ve un producto de Alegra cuando se guarda en la caché local
 * (alegra_products_cache).
 *
 * Esto vivía suelto dentro del bucle del sincronizador, así que el único que
 * sabía armar una fila completa era él. Cuando alguien crea un producto desde
 * Revisión de Precios se guardaba una fila con cinco campos —id, nombre,
 * referencia, precio y texto de búsqueda— y nada más: sin categoría, sin
 * foto, sin costo, sin impuesto. Gestión de Catálogo lee de esta tabla, así
 * que el producto recién creado aparecía ahí pelado hasta que corriera la
 * sincronización completa.
 *
 * Con el mapeo en un solo lugar, los dos caminos guardan lo mismo.
 */

/**
 * Traduce un producto tal como lo devuelve Alegra a la fila de la caché.
 * @param {object} product respuesta de /items/:id o del listado
 */
function filaDeCache(product) {
  const mainPrice = product.price?.find(p => p.main === true) || product.price?.[0];
  const price = mainPrice ? parseFloat(mainPrice.price) : 0;
  const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;
  const reference = product.reference?.reference || product.reference || '';
  const category = product.itemCategory?.name || product.category?.name || '';

  // La foto marcada como favorita, y si no hay favorita la primera.
  const favorita = product.images?.find(img => img.favorite === true) || product.images?.[0];
  const imageUrl = favorita ? favorita.url : '';

  // Se suman las tasas porque un producto puede traer más de un impuesto. Sin
  // impuestos queda en 0, que es distinto de NULL ("nunca se sincronizó") —
  // ver add_tax_percentage_products_cache.sql.
  const taxPercentage = (product.tax || []).reduce(
    (suma, t) => suma + (parseFloat(t.percentage) || 0),
    0
  );

  return {
    alegraId: String(product.id),
    name: product.name,
    reference,
    description: product.description || '',
    category,
    price,
    cost,
    taxPercentage,
    status: product.status || 'active',
    type: product.type || 'product',
    imageUrl,
    searchText: `${product.name} ${reference} ${product.description || ''}`.toLowerCase()
  };
}

module.exports = { filaDeCache };

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f0f0f0"/><path d="M70,90 l20,20 l40,-40" stroke="%23cccccc" stroke-width="8" fill="none"/></svg>'

export default function ProductCard({ product, stats, cantidad = 0, onCambiar }) {
  const descuentoPorcentaje = product.descuentoPorcentaje > 0 ? product.descuentoPorcentaje : 0
  const esHabitual = stats?.esHabitual
  const esPerdido = stats?.esPerdido
  let imageUrl = PLACEHOLDER_IMG
  if (product.images && product.images.length > 0) {
    const favoriteImage = product.images.find((img) => img.favorite === true) || product.images[0]
    if (favoriteImage && favoriteImage.url) {
      imageUrl = favoriteImage.url
    }
  }

  const priceList = product.price && product.price.length > 0 ? product.price[0] : null
  let priceAmount = 0
  const currency = '₡'

  if (priceList && priceList.price) {
    priceAmount = typeof priceList.price === 'string' ? parseFloat(priceList.price.replace(/,/g, '')) : parseFloat(priceList.price)
  }

  const taxes = product.tax || []
  let totalTaxPercentage = 0
  taxes.forEach((tax) => {
    if (tax.percentage) totalTaxPercentage += parseFloat(tax.percentage)
  })

  const taxAmount = priceAmount * (totalTaxPercentage / 100)
  const finalPrice = priceAmount + taxAmount
  const discountedPrice = descuentoPorcentaje > 0 ? finalPrice * (1 - descuentoPorcentaje / 100) : finalPrice

  const inventory = product.inventory || {}
  let availableQuantity = 0
  if (inventory.warehouses && inventory.warehouses.length > 0) {
    inventory.warehouses.forEach((w) => {
      if (w.availableQuantity) availableQuantity += parseFloat(w.availableQuantity)
    })
  }

  let stockClass = 'stock-in'
  let stockText = `${availableQuantity} disp.`

  if (availableQuantity <= 0) {
    stockClass = 'stock-out'
    stockText = 'Agotado'
  } else if (availableQuantity <= 5) {
    stockClass = 'stock-low'
    stockText = `¡Solo ${availableQuantity}!`
  }

  const claseCliente = esPerdido ? 'product-card-perdido' : esHabitual ? 'product-card-habitual' : ''

  return (
    <div className={`product-card ${descuentoPorcentaje > 0 ? 'product-card-oferta' : ''} ${claseCliente}`}>
      {descuentoPorcentaje > 0 && <div className="discount-badge">-{descuentoPorcentaje}%</div>}
      {!esPerdido && esHabitual && <div className="cliente-badge cliente-badge-habitual">{stats.veces}x</div>}
      <div className="product-image-container">
        <img
          src={imageUrl}
          alt={product.name}
          className="product-image"
          loading="lazy"
          onError={(e) => {
            e.target.onerror = null
            e.target.src = PLACEHOLDER_IMG
          }}
        />
      </div>

      <div className="product-info">
        <div>
          <div className="product-name" title={product.name}>
            {product.name}
          </div>
          <div className="product-reference">Ref: {product.reference?.reference || 'N/A'}</div>
        </div>

        <div className="product-footer">
          {descuentoPorcentaje > 0 ? (
            <div className="product-price-oferta">
              <span className="product-price-original">
                {currency}
                {finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="product-price product-price-descuento">
                {currency}
                {discountedPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          ) : (
            <div className="product-price">
              {currency}
              {finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
          {totalTaxPercentage > 0 && <div className="product-tax">Incluye {totalTaxPercentage}% IVA</div>}
          <div className={`product-stock ${stockClass}`}>{stockText}</div>

          {/* Sin `onCambiar` la tarjeta queda de solo mirar: es lo que pasa
              cuando todavía no se eligió el cliente. Un botón que no lleva a
              ningún lado confunde más que no tenerlo. */}
          {typeof onCambiar === 'function' && (
            cantidad > 0 ? (
              <div className="pedido-stepper">
                <button type="button" aria-label={`Quitar uno de ${product.name}`}
                  onClick={() => onCambiar(product, cantidad - 1)}>−</button>
                <input type="number" min="0" inputMode="numeric"
                  aria-label={`Cantidad de ${product.name}`}
                  value={cantidad}
                  onChange={(e) => onCambiar(product, e.target.value)}
                  onFocus={(e) => e.target.select()} />
                <button type="button" aria-label={`Agregar uno de ${product.name}`}
                  onClick={() => onCambiar(product, cantidad + 1)}>+</button>
              </div>
            ) : (
              <button type="button" className="pedido-agregar"
                onClick={() => onCambiar(product, 1)}>Agregar</button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

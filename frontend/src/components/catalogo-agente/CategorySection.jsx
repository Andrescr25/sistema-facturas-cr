import ProductCard from './ProductCard'

export default function CategorySection({ title, products, statsPorProducto }) {
  if (!products || products.length === 0) return null

  return (
    <div className="category-section">
      <div className="category-header">
        <h2 className="category-title">{title}</h2>
        <span className="category-count">{products.length} productos</span>
      </div>
      <div className="products-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} stats={statsPorProducto?.get(String(product.id))} />
        ))}
      </div>
    </div>
  )
}

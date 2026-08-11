import { useEffect, useState } from 'react'
import { Flame, Star, RotateCcw } from 'lucide-react'
import { useCatalogoPublico } from '../hooks/useCatalogoPublico'
import { applyCatalogoPublicoGuards } from '../utils/catalogoPublicoSecurity'
import HeaderCatalogo from '../components/catalogo-publico/HeaderCatalogo'
import CategorySection from '../components/catalogo-publico/CategorySection'
import ProductCard from '../components/catalogo-publico/ProductCard'
import SyncOverlay from '../components/catalogo-publico/SyncOverlay'
import SelectorCliente from '../components/catalogo-publico/SelectorCliente'
import ClienteActivoBanner from '../components/catalogo-publico/ClienteActivoBanner'
import '../components/catalogo-publico/catalogoPublico.css'

export default function CatalogoPublico() {
  const {
    isLoading,
    isOnline,
    isSyncing,
    syncProgress,
    lastSync,
    searchQuery,
    setSearchQuery,
    filteredData,
    featuredProducts,
    synchronize,
    clientes,
    clienteActivo,
    statsPorProducto,
    seleccionarCliente,
    salirDeCliente,
    productosHabitualesDelCliente,
    productosPerdidosDelCliente
  } = useCatalogoPublico()

  const [selectorAbierto, setSelectorAbierto] = useState(false)

  useEffect(() => {
    const removeGuards = applyCatalogoPublicoGuards()
    return removeGuards
  }, [])

  if (isLoading) {
    return (
      <div className="catalogo-publico-root">
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
          <div className="sync-spinner"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="catalogo-publico-root">
      <div className="app-container">
        <HeaderCatalogo
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isSyncing={isSyncing}
          lastSync={lastSync}
          isOnline={isOnline}
          synchronize={synchronize}
          onAbrirSelectorCliente={() => setSelectorAbierto(true)}
        />

        <ClienteActivoBanner clienteActivo={clienteActivo} onSalir={salirDeCliente} />

        <main className="content">
          {!searchQuery && featuredProducts.length > 0 && (
            <div className="featured-section">
              <div className="featured-header">
                <Flame size={22} color="#f97316" />
                <span className="featured-title">En Oferta</span>
              </div>
              <div className="products-grid">
                {featuredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          )}

          {!searchQuery && productosHabitualesDelCliente.length > 0 && (
            <div className="featured-section featured-section-habitual">
              <div className="featured-header">
                <Star size={22} color="#15803d" />
                <span className="featured-title featured-title-habitual">Lo que más compra</span>
              </div>
              <div className="products-grid">
                {productosHabitualesDelCliente.map((product) => (
                  <ProductCard key={product.id} product={product} stats={product._stats} />
                ))}
              </div>
            </div>
          )}

          {!searchQuery && productosPerdidosDelCliente.length > 0 && (
            <div className="featured-section featured-section-perdido">
              <div className="featured-header">
                <RotateCcw size={22} color="#b45309" />
                <span className="featured-title featured-title-perdido">Dejó de comprar</span>
              </div>
              <div className="products-grid">
                {productosPerdidosDelCliente.map((product) => (
                  <ProductCard key={product.id} product={product} stats={product._stats} />
                ))}
              </div>
            </div>
          )}

          {filteredData.flat.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <h3>Catálogo Vacío</h3>
              <p>No hay productos disponibles actualmente.</p>
              <p style={{ fontSize: '0.9rem', color: '#888', marginTop: '10px' }}>
                Conéctate a internet y mantén presionado "Actualizar Catálogo"
              </p>
            </div>
          ) : (
            filteredData.sortedKeys.map((category) => (
              <CategorySection
                key={category}
                title={category}
                products={filteredData.grouped[category]}
                statsPorProducto={statsPorProducto}
              />
            ))
          )}
        </main>

        <SyncOverlay isSyncing={isSyncing} syncProgress={syncProgress} />

        <SelectorCliente
          isOpen={selectorAbierto}
          onClose={() => setSelectorAbierto(false)}
          clientes={clientes}
          clienteActivoId={clienteActivo?.id}
          onSeleccionar={seleccionarCliente}
        />
      </div>
    </div>
  )
}

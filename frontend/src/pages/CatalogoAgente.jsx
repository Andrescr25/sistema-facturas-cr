import { useEffect, useState } from 'react'
import { Flame, Star, RotateCcw, ShoppingCart } from 'lucide-react'
import { useCatalogoAgente } from '../hooks/useCatalogoAgente'
import { applyCatalogoAgenteGuards } from '../utils/catalogoAgenteSecurity'
import HeaderCatalogo from '../components/catalogo-agente/HeaderCatalogo'
import CategorySection from '../components/catalogo-agente/CategorySection'
import ProductCard from '../components/catalogo-agente/ProductCard'
import SyncOverlay from '../components/catalogo-agente/SyncOverlay'
import SelectorCliente from '../components/catalogo-agente/SelectorCliente'
import ClienteActivoBanner from '../components/catalogo-agente/ClienteActivoBanner'
import PanelPedidoAgente from '../components/catalogo-agente/PanelPedidoAgente'
import { usePedidoAgente } from '../hooks/usePedidoAgente'
import '../components/catalogo-agente/catalogoAgente.css'

export default function CatalogoAgente() {
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
  } = useCatalogoAgente()

  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [pedidoAbierto, setPedidoAbierto] = useState(false)

  const pedido = usePedidoAgente(clienteActivo)

  // Sin cliente elegido no se pasa `onCambiar`, así que las tarjetas quedan de
  // solo mirar: un pedido sin cliente no se puede guardar, y descubrirlo
  // recién al querer enviarlo sería perder el trabajo de armarlo.
  const cambiar = clienteActivo ? pedido.cambiarCantidad : undefined

  useEffect(() => {
    const removeGuards = applyCatalogoAgenteGuards()
    return removeGuards
  }, [])

  if (isLoading) {
    return (
      <div className="catalogo-agente-root">
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
          <div className="sync-spinner"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="catalogo-agente-root">
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
                  <ProductCard key={product.id} product={product}
                    cantidad={pedido.porId[String(product.id)]?.cantidad || 0} onCambiar={cambiar} />
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
                  <ProductCard key={product.id} product={product} stats={product._stats}
                    cantidad={pedido.porId[String(product.id)]?.cantidad || 0} onCambiar={cambiar} />
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
                  <ProductCard key={product.id} product={product} stats={product._stats}
                    cantidad={pedido.porId[String(product.id)]?.cantidad || 0} onCambiar={cambiar} />
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
                porId={pedido.porId}
                onCambiar={cambiar}
              />
            ))
          )}
        </main>

        {/* La barra aparece con productos en el pedido O con pedidos sin
            enviar: lo segundo importa tanto como lo primero, porque el agente
            no puede irse del local sin saber que algo quedó sin llegar. */}
        {(pedido.unidades > 0 || pedido.sinEnviar > 0) && (
          <button type="button" className="pedido-barra" onClick={() => setPedidoAbierto(true)}>
            <span className="pedido-barra-izq">
              <ShoppingCart size={18} />
              {pedido.unidades > 0
                ? `${pedido.unidades} producto${pedido.unidades === 1 ? '' : 's'}`
                : 'Ver pedidos'}
            </span>
            <span className="pedido-barra-der">
              {pedido.sinEnviar > 0 && (
                <span className="pedido-barra-pendientes">{pedido.sinEnviar} sin enviar</span>
              )}
              {pedido.unidades > 0 && (
                <strong>₡{Math.round(pedido.totalReferencia).toLocaleString('es-CR').replace(/\u00A0/g, '.')}</strong>
              )}
            </span>
          </button>
        )}

        <PanelPedidoAgente
          abierto={pedidoAbierto}
          onCerrar={() => setPedidoAbierto(false)}
          lineas={pedido.lineas}
          totalReferencia={pedido.totalReferencia}
          onCambiar={pedido.cambiarCantidad}
          onVaciar={pedido.vaciarCarrito}
          cola={pedido.cola}
          onEnviar={pedido.enviarPedido}
          onSincronizar={pedido.sincronizar}
          onArchivar={pedido.archivar}
          enviando={pedido.enviando}
          clienteActivo={clienteActivo}
          hayInternet={isOnline}
        />

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

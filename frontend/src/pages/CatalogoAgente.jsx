import { useEffect, useMemo, useState } from 'react'
import {
  Flame, TrendingDown, Star, RotateCcw, ShoppingCart, PackageOpen,
  LayoutGrid, Tag, UserCheck, Loader2, ChevronRight
} from 'lucide-react'
import { useCatalogoAgente } from '../hooks/useCatalogoAgente'
import { usePedidoAgente } from '../hooks/usePedidoAgente'
import { applyCatalogoAgenteGuards } from '../utils/catalogoAgenteSecurity'
import BarraSuperior from '../components/catalogo-agente/BarraSuperior'
import BarraCategorias from '../components/catalogo-agente/BarraCategorias'
import TarjetaProductoAgente from '../components/catalogo-agente/TarjetaProductoAgente'
import SyncOverlay from '../components/catalogo-agente/SyncOverlay'
import SelectorCliente from '../components/catalogo-agente/SelectorCliente'
import PanelPedidoAgente from '../components/catalogo-agente/PanelPedidoAgente'
import { colones } from '../utils/colones'

/**
 * El catálogo que el agente lleva en la tablet.
 *
 * EL REDISEÑO, Y QUÉ PROBLEMA RESOLVÍA
 * La versión anterior gastaba 330 de los 768 píxeles de alto de la tablet en
 * logo, botón de sincronizar y estado de conexión antes del primer producto;
 * y el catálogo entero medía trece mil píxeles sin ninguna forma de saltar de
 * "Ferretería" a "Limpieza" que no fuera scrollear todo el medio.
 *
 * Ahora la barra de arriba es una sola fila fija con el buscador al centro, y
 * debajo una fila de categorías que también queda fija — el problema de
 * navegación aparece justamente cuando uno ya bajó.
 *
 * Se pensó para 1024×768 (tablet de 9"), que es donde se usa, y baja a dos
 * columnas en teléfono sin cambiar de estructura.
 */

/** Una cuadrícula de productos. Las columnas siguen el ancho, no el aparato. */
function Cuadricula({ productos, statsPorProducto, porId, onCambiar }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {productos.map((p) => (
        <TarjetaProductoAgente
          key={p.id}
          product={p}
          stats={p._stats || statsPorProducto?.get(String(p.id))}
          cantidad={porId?.[String(p.id)]?.cantidad || 0}
          onCambiar={onCambiar}
        />
      ))}
    </div>
  )
}

/** Un bloque con título. El color del icono es lo único que los distingue. */
function Seccion({ titulo, descripcion, icono: Icono, color, children }) {
  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icono size={15} />
        </span>
        <h2 className="text-sm font-extrabold text-neutro-900">{titulo}</h2>
        {descripcion && (
          <p className="hidden truncate text-xs text-neutro-400 sm:block">{descripcion}</p>
        )}
      </div>
      {children}
    </section>
  )
}

export default function CatalogoAgente() {
  const {
    isLoading, isOnline, isSyncing, syncProgress, lastSync,
    searchQuery, setSearchQuery, filteredData,
    featuredProducts, productosRebajados, synchronize,
    clientes, clienteActivo, statsPorProducto,
    seleccionarCliente, salirDeCliente,
    productosHabitualesDelCliente, productosPerdidosDelCliente
  } = useCatalogoAgente()

  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [pedidoAbierto, setPedidoAbierto] = useState(false)
  const [categoria, setCategoria] = useState('todo')

  const pedido = usePedidoAgente(clienteActivo)

  // Sin cliente elegido no se pasa `onCambiar`, así que las tarjetas quedan de
  // solo mirar: un pedido sin cliente no se puede guardar, y descubrirlo
  // recién al querer enviarlo sería perder el trabajo de armarlo.
  const cambiar = clienteActivo ? pedido.cambiarCantidad : undefined

  useEffect(() => {
    const quitarGuardas = applyCatalogoAgenteGuards()
    return quitarGuardas
  }, [])

  const ofertas = useMemo(
    () => [...productosRebajados, ...featuredProducts],
    [productosRebajados, featuredProducts]
  )

  const categorias = useMemo(() => {
    const lista = [{ clave: 'todo', texto: 'Todo', icono: LayoutGrid, contador: filteredData.flat.length }]
    if (ofertas.length > 0) lista.push({ clave: '__ofertas', texto: 'Ofertas', icono: Tag, contador: ofertas.length })
    if (clienteActivo && productosHabitualesDelCliente.length > 0) {
      lista.push({ clave: '__cliente', texto: 'De este cliente', icono: UserCheck, contador: productosHabitualesDelCliente.length })
    }
    filteredData.sortedKeys.forEach((k) => {
      lista.push({ clave: k, texto: k, contador: filteredData.grouped[k]?.length || 0 })
    })
    return lista
  }, [filteredData, ofertas, clienteActivo, productosHabitualesDelCliente])

  // Una categoría que ya no existe (cambió el catálogo, o se está buscando)
  // dejaría la pantalla en blanco sin explicación.
  useEffect(() => {
    if (categoria !== 'todo' && !categorias.some((c) => c.clave === categoria)) setCategoria('todo')
  }, [categorias, categoria])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutro-50">
        <Loader2 size={30} className="animate-spin text-acento-500" />
      </div>
    )
  }

  const buscando = Boolean(searchQuery.trim())
  const vacio = filteredData.flat.length === 0
  const enTodo = categoria === 'todo'

  return (
    <div className="min-h-screen bg-neutro-50 pb-24">
      <BarraSuperior
        busqueda={searchQuery}
        onBuscar={setSearchQuery}
        sincronizando={isSyncing}
        ultimaSync={lastSync}
        enLinea={isOnline}
        onSincronizar={synchronize}
        clienteActivo={clienteActivo}
        onElegirCliente={() => setSelectorAbierto(true)}
        onSalirDeCliente={salirDeCliente}
      />

      {!buscando && !vacio && (
        <BarraCategorias categorias={categorias} activa={categoria} onElegir={setCategoria} />
      )}

      <main className="px-3 py-4">
        {vacio ? (
          <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-white p-8 text-center ring-1 ring-neutro-200">
            <PackageOpen size={36} className="mx-auto text-neutro-200" />
            <h3 className="mt-3 text-sm font-bold text-neutro-900">
              {buscando ? 'Ningún producto con esa búsqueda' : 'Todavía no hay catálogo en esta tablet'}
            </h3>
            <p className="mt-1 text-xs text-neutro-400">
              {buscando
                ? 'Probá con la referencia, o con una palabra menos.'
                : 'Conectate a internet y tocá el botón de actualizar, arriba a la derecha.'}
            </p>
          </div>
        ) : buscando ? (
          /* Buscando se muestra UNA lista ordenada por parecido. Agrupar por
             categoría acá tiraría a la basura ese orden: el producto más
             parecido quedaría donde le tocara alfabéticamente. */
          <Seccion titulo="Resultados" descripcion={`${filteredData.flat.length} productos`}
            icono={ChevronRight} color="bg-neutro-100 text-neutro-500">
            <Cuadricula productos={filteredData.flat} statsPorProducto={statsPorProducto}
              porId={pedido.porId} onCambiar={cambiar} />
          </Seccion>
        ) : (
          <>
            {(enTodo || categoria === '__ofertas') && productosRebajados.length > 0 && (
              <Seccion titulo="Bajamos el precio" descripcion="Ahora cuestan menos que antes"
                icono={TrendingDown} color="bg-acento-50 text-acento-600">
                <Cuadricula productos={productosRebajados} porId={pedido.porId} onCambiar={cambiar} />
              </Seccion>
            )}

            {/* Sección aparte de "Bajamos el precio" a propósito: esta son
                excesos de inventario y aquella una baja de precio decidida.
                El argumento de venta es distinto. */}
            {(enTodo || categoria === '__ofertas') && featuredProducts.length > 0 && (
              <Seccion titulo="Liquidación" descripcion="Mientras dure la existencia"
                icono={Flame} color="bg-nota-50 text-nota-600">
                <Cuadricula productos={featuredProducts} porId={pedido.porId} onCambiar={cambiar} />
              </Seccion>
            )}

            {(enTodo || categoria === '__cliente') && productosHabitualesDelCliente.length > 0 && (
              <Seccion titulo="Lo que más compra" descripcion="Sus productos de siempre"
                icono={Star} color="bg-exito-50 text-exito-600">
                <Cuadricula productos={productosHabitualesDelCliente} porId={pedido.porId} onCambiar={cambiar} />
              </Seccion>
            )}

            {(enTodo || categoria === '__cliente') && productosPerdidosDelCliente.length > 0 && (
              <Seccion titulo="Dejó de comprar" descripcion="Hace rato que no los lleva"
                icono={RotateCcw} color="bg-alerta-50 text-alerta-600">
                <Cuadricula productos={productosPerdidosDelCliente} porId={pedido.porId} onCambiar={cambiar} />
              </Seccion>
            )}

            {filteredData.sortedKeys
              .filter((k) => enTodo || categoria === k)
              .map((k) => (
                <Seccion key={k} titulo={k} descripcion={`${filteredData.grouped[k].length} productos`}
                  icono={ChevronRight} color="bg-neutro-100 text-neutro-500">
                  <Cuadricula productos={filteredData.grouped[k]} statsPorProducto={statsPorProducto}
                    porId={pedido.porId} onCambiar={cambiar} />
                </Seccion>
              ))}
          </>
        )}
      </main>

      {/* La barra aparece con productos en el pedido O con pedidos sin enviar:
          lo segundo importa tanto como lo primero, porque el agente no puede
          irse del local sin saber que algo quedó sin llegar. */}
      {(pedido.unidades > 0 || pedido.sinEnviar > 0) && (
        <button type="button" onClick={() => setPedidoAbierto(true)}
          className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl bg-primario-800 px-4 py-3 text-white shadow-lg shadow-primario-900/20 active:scale-[0.99]">
          <span className="flex items-center gap-2 text-sm font-bold">
            <ShoppingCart size={17} />
            {pedido.unidades > 0
              ? `${pedido.unidades} producto${pedido.unidades === 1 ? '' : 's'}`
              : 'Ver pedidos'}
          </span>
          <span className="flex items-center gap-2.5">
            {pedido.sinEnviar > 0 && (
              <span className="rounded-lg bg-alerta-400 px-2 py-0.5 text-[11px] font-extrabold text-alerta-950">
                {pedido.sinEnviar} sin enviar
              </span>
            )}
            {pedido.unidades > 0 && (
              <strong className="text-base font-extrabold">{colones(pedido.totalReferencia)}</strong>
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
  )
}

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, ShoppingCart, Loader2, AlertCircle, User, Repeat, Clock, Tag, X, Receipt, Info, LogOut } from 'lucide-react'
import { useCatalogoClientes } from '../hooks/useCatalogoClientes'
import { useCarritoCliente } from '../hooks/useCarritoCliente'
import { useScrollInfinito } from '../hooks/useScrollInfinito'
import { usePortalCliente } from '../contexts/PortalClienteContext'
import { formatearColones } from '../utils/catalogoClientesUtils'
import { notaHabitual, notaPerdido } from '../utils/notasCatalogo'
import ModalPedido from '../components/catalogo-clientes/ModalPedido'
import FichaProducto from '../components/catalogo-clientes/FichaProducto'
import TarjetaProducto from '../components/catalogo-clientes/TarjetaProducto'
import SeccionProductos from '../components/catalogo-clientes/SeccionProductos'
import VolverAPedir from '../components/catalogo-clientes/VolverAPedir'
import ModalCompraAnterior from '../components/catalogo-clientes/ModalCompraAnterior'

export default function CatalogoClientes() {
  const {
    productos, categorias, config,
    habituales, perdidos, ofertas, mostrandoPortada, cargarPortada, limpiarPortada,
    busqueda, setBusqueda, categoria, setCategoria,
    total, hayMas, cargando, cargandoMas, error, verMas
  } = useCatalogoClientes()

  const { cliente, salir } = usePortalCliente()

  // El carrito vive en el servidor, atado a la cuenta.
  const {
    porId, resumen, cambiarCantidad, vaciar, recargar: recargarCarrito
  } = useCarritoCliente(cliente)

  const centinela = useScrollInfinito({ hayMas, cargando: cargandoMas, cargarMas: verMas })

  const [pedidoAbierto, setPedidoAbierto] = useState(false)
  // Solo con sesión: sin cuenta no hay historial que mostrar en la ficha.
  const [fichaAbierta, setFichaAbierta] = useState(null)

  useEffect(() => {
    if (cliente) cargarPortada()
    else limpiarPortada()
  }, [cliente, cargarPortada, limpiarPortada])

  // Compra anterior abierta para revisarla antes de repetirla.
  const [compraAbierta, setCompraAbierta] = useState(null)

  const abrirFicha = cliente ? setFichaAbierta : undefined
  // Sin cuenta el catálogo es de consulta: se ven productos y precios, pero
  // no hay forma de armar un pedido. No se pasa onCambiar hacia abajo, así
  // que ninguna ficha dibuja controles que no llevarían a ningún lado.
  const cambiar = cliente ? cambiarCantidad : undefined
  const filtrando = Boolean(busqueda.trim() || categoria)

  // Agrupa la lista ya ordenada por categoría desde el servidor. Se hace
  // sobre el arreglo tal cual llega —sin reordenar— para que el scroll
  // infinito siga sumando al final del último grupo en vez de reacomodar
  // todo cada vez que entra una página.
  const agrupados = useMemo(() => {
    const grupos = []
    for (const p of productos) {
      const nombre = p.categoria || 'Otros'
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.categoria === nombre) ultimo.items.push(p)
      else grupos.push({ categoria: nombre, items: [p] })
    }
    return grupos
  }, [productos])

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="bg-white border-b border-slate-150 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 pt-3 pb-2.5 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <img src="/tachi-logo.png" alt={config.negocio || 'Catálogo'} className="h-7 w-auto shrink-0" />
            {cliente ? (
              <div className="flex items-center gap-3 shrink-0">
                <Link to="/portal/facturas" className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-emerald-700">
                  <Receipt size={14} />
                  Mis facturas
                </Link>
                <Link to="/portal/pedidos" className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-emerald-700">
                  <User size={14} />
                  Mis pedidos
                </Link>
                {/* Sin esto, el cliente que entra desde un teléfono prestado
                    —o el agente que le muestra el catálogo a varios— no tenía
                    forma de salirse: la sesión dura 30 días. */}
                <button
                  type="button"
                  onClick={salir}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-red-600"
                >
                  <LogOut size={14} />
                  Salir
                </button>
              </div>
            ) : (
              <Link to="/portal/ingresar" className="text-[12px] font-bold text-emerald-700 hover:underline shrink-0">
                Entrar
              </Link>
            )}
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-9 py-2.5 bg-slate-100 focus:bg-white border border-transparent focus:border-emerald-500 rounded-xl text-[13px] font-medium focus:outline-none transition-colors"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Las categorías se desbordan a la derecha; el degradado avisa que
              hay más en vez de dejar una fila cortada en seco. */}
          <div className="relative -mx-4">
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => setCategoria('')}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  categoria === '' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todo
              </button>
              {categorias.map((c) => (
                <button
                  key={c.nombre}
                  type="button"
                  onClick={() => setCategoria(c.nombre)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors ${
                    categoria === c.nombre ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4">
        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-150 rounded-xl px-3 py-2.5 mb-4">
            <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
            <p className="text-[12px] text-rose-700 font-semibold">{error}</p>
          </div>
        )}

        {!cliente && (
          <div className="bg-white border border-slate-150 rounded-2xl px-4 py-3 mb-4 flex items-start gap-2.5">
            <Info size={15} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-slate-500">
              Está viendo el catálogo como visitante.{' '}
              <Link to="/portal/ingresar" className="font-bold text-emerald-700 hover:underline">Ingrese</Link>
              {' '}para hacer pedidos y ver sus facturas. ¿No tiene cuenta? Pídanos el enlace.
            </p>
          </div>
        )}

        {mostrandoPortada && (
          <div className="space-y-6 mb-6">
            {cliente && <VolverAPedir onAbrir={setCompraAbierta} />}

            <SeccionProductos
              titulo="Los productos que más compra"
              descripcion="Sus productos de siempre, a mano"
              icono={Repeat}
              color="bg-emerald-50 text-emerald-600"
              productos={habituales}
              carrito={porId}
              onCambiar={cambiar}
              nota={notaHabitual}
              onAbrir={abrirFicha}
            />

            <SeccionProductos
              titulo="Hace tiempo que no los lleva"
              descripcion="Los compraba seguido y no aparecen en sus últimos pedidos"
              icono={Clock}
              color="bg-amber-50 text-amber-600"
              productos={perdidos}
              carrito={porId}
              onCambiar={cambiar}
              nota={notaPerdido}
              onAbrir={abrirFicha}
            />

            <SeccionProductos
              titulo="En oferta"
              descripcion="Precios rebajados mientras dure la existencia"
              icono={Tag}
              color="bg-rose-50 text-rose-600"
              productos={ofertas}
              carrito={porId}
              onCambiar={cambiar}
              onAbrir={abrirFicha}
              variante="ofertas"
            />
          </div>
        )}

        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="font-bold text-slate-900 text-[13px]">
            {filtrando ? 'Resultados' : 'Todo el catálogo'}
          </h2>
          {!cargando && <span className="text-[11px] font-semibold text-slate-300">{total}</span>}
        </div>

        {cargando ? (
          <div className="py-16 flex justify-center">
            <Loader2 size={24} className="animate-spin text-emerald-600" />
          </div>
        ) : productos.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-slate-400">
            No hay productos que coincidan con la búsqueda.
          </p>
        ) : (
          <>
            {agrupados.map(({ categoria: nombre, items }) => (
              <div key={nombre} className="mb-5">
                {/* El encabezado solo aparece en "Todo": con una categoría
                    ya elegida sería repetir el filtro en cada bloque. */}
                {!filtrando && (
                  <h3 className="text-[12px] font-bold text-slate-500 uppercase tracking-wide mb-2 pt-1">
                    {nombre}
                  </h3>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {items.map((p) => (
                    <TarjetaProducto
                      key={p.id}
                      producto={p}
                      cantidad={porId[p.id]?.cantidad || 0}
                      onCambiar={cambiar}
                      onAbrir={abrirFicha ? () => abrirFicha(p.id) : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Carga automática al acercarse al final. El centinela va aquí
                y no dentro de la lista para que no se lo lleve un re-render
                de las filas. */}
            <div ref={centinela} className="h-8 flex items-center justify-center mt-3">
              {cargandoMas && <Loader2 size={18} className="animate-spin text-slate-300" />}
              {!hayMas && productos.length > 0 && (
                <span className="text-[11px] text-slate-300">No hay más productos</span>
              )}
            </div>
          </>
        )}
      </main>

      {cliente && resumen.unidades > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-6">
          <button
            type="button"
            onClick={() => setPedidoAbierto(true)}
            className="max-w-5xl mx-auto w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg flex items-center justify-between gap-3 transition-colors"
          >
            <span className="flex items-center gap-2 text-[13px]">
              <ShoppingCart size={17} />
              {resumen.unidades} {resumen.unidades === 1 ? 'producto' : 'productos'}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[15px] font-extrabold">{formatearColones(resumen.total)}</span>
              <span className="text-[12px] font-semibold text-emerald-300">Ver pedido</span>
            </span>
          </button>
        </div>
      )}

      {/* La condición NO mira las unidades del carrito, a propósito. Al
          enviar, el pedido vacía el carrito; con `resumen.unidades > 0` acá,
          React desmontaba el modal en el mismo ciclo en que iba a mostrar la
          confirmación — el cliente tocaba "Enviar" y la pantalla simplemente
          desaparecía, sin saber si se había enviado. Cerrarlo es cosa de
          onCerrar y de onVaciar; el carrito vaciándose ya no lo destruye. */}
      {cliente && pedidoAbierto && (
        <ModalPedido
          resumen={resumen}
          carrito={porId}
          onCambiar={cambiar}
          onAgregar={cliente ? cambiarCantidad : undefined}
          onVaciar={() => { vaciar(); setPedidoAbierto(false) }}
          onCerrar={() => setPedidoAbierto(false)}
          onEnviado={vaciar}
          habituales={habituales}
          perdidos={perdidos}
        />
      )}

      {compraAbierta && (
        <ModalCompraAnterior
          facturaId={compraAbierta}
          onCerrar={() => setCompraAbierta(null)}
          // Al agregar se relee el carrito y se abre el pedido, para que el
          // cliente vea de una qué quedó armado.
          onAgregado={() => { recargarCarrito(); setPedidoAbierto(true) }}
        />
      )}

      {fichaAbierta && (
        <FichaProducto
          itemId={fichaAbierta}
          cantidadEnCarrito={porId[fichaAbierta]?.cantidad || 0}
          onCambiar={cambiar}
          onCerrar={() => setFichaAbierta(null)}
        />
      )}
    </div>
  )
}

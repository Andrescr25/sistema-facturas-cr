import { useEffect, useMemo, useState } from 'react'
import {
  Flame, TrendingDown, Star, RotateCcw, PackageOpen,
  LayoutGrid, Tag, UserCheck, Loader2, ChevronRight
} from 'lucide-react'
import { useCatalogoAgente } from '../hooks/useCatalogoAgente'
import { applyCatalogoAgenteGuards } from '../utils/catalogoAgenteSecurity'
import BarraSuperior from '../components/catalogo-agente/BarraSuperior'
import BarraCategorias from '../components/catalogo-agente/BarraCategorias'
import TarjetaProductoAgente from '../components/catalogo-agente/TarjetaProductoAgente'
import SyncOverlay from '../components/catalogo-agente/SyncOverlay'
import SelectorCliente from '../components/catalogo-agente/SelectorCliente'

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
 * Se pensó para la tablet de 9", que es donde se usa. Ojo con el ancho: la
 * tablet reporta entre 640 y 767px, no 1024 — probarlo solo en 1024 esconde
 * lo que de verdad ve el agente.
 *
 * ACÁ NO SE ARMA EL PEDIDO, Y ES A PROPÓSITO
 * Se podía, y no se usó nunca: cero pedidos con origen 'agente' en toda la
 * base. El pedido se toma en Facturación. Esta pantalla es para MOSTRARLE el
 * producto al cliente —la foto, el precio, la liquidación— y para que el
 * agente vea lo que ese cliente suele llevar. Sacar los controles de cantidad
 * también aliviana la cuadrícula, que es lo que se pinta cientos de veces.
 */

/**
 * Una cuadrícula de productos. Las columnas siguen el ancho, no el aparato.
 *
 * DOS POR FILA, NO SEIS
 * El primer intento llenaba la tablet con doce productos a la vez y nadie los
 * miraba: el cliente que ve la pantalla desde el otro lado del mostrador se
 * queda con el conjunto, no con ninguno. Con dos por fila la foto se ve de
 * verdad y entran tres filas de alto, que es lo que una persona alcanza a
 * recorrer sin perderse.
 *
 * La tablet reporta entre 640 y 767px, así que las dos columnas tienen que
 * aguantar hasta `lg`. Recién en una pantalla de escritorio se agregan más.
 */
function Cuadricula({ productos, statsPorProducto, dentroDeSuFamilia = false }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {productos.map((p) => (
        <TarjetaProductoAgente
          key={p.id}
          product={p}
          stats={p._stats || statsPorProducto?.get(String(p.id))}
          mostrarSubcategoria={!dentroDeSuFamilia}
        />
      ))}
    </div>
  )
}

/**
 * Una familia dentro de una categoría: "PVC 1/2" dentro de "Productos de PVC".
 *
 * "Productos de PVC" son 118 piezas revueltas —el de 1/2 al lado del de 3/4 y
 * del sanitario— y así no se le encuentra nada a un cliente parado en el
 * mostrador. Partido en familias, se le enseña "PVC 1/2" y ahí está todo lo
 * de 1/2 junto.
 *
 * El encabezado es deliberadamente más chico que el de la categoría y va
 * indentado con una raya: tiene que leerse como algo DENTRO de ella, no como
 * otra categoría más. "Otros" —lo que todavía no se clasificó— va en gris,
 * apagado, porque no es una familia sino la lista pendiente.
 */
function Subgrupo({ nombre, cantidad, sinClasificar, children }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className={`mb-2 flex items-baseline gap-2 border-l-2 pl-2 ${
        sinClasificar ? 'border-neutro-200' : 'border-primario-300'
      }`}>
        <h3 className={`text-[13px] font-bold ${sinClasificar ? 'text-neutro-400' : 'text-primario-700'}`}>
          {nombre}
        </h3>
        <span className="text-[11px] font-semibold text-neutro-400">{cantidad}</span>
      </div>
      {children}
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
    searchQuery, setSearchQuery, busquedaAplicada, filteredData,
    featuredProducts, productosRebajados, synchronize,
    clientes, clienteActivo, statsPorProducto,
    seleccionarCliente, salirDeCliente,
    productosHabitualesDelCliente, productosPerdidosDelCliente
  } = useCatalogoAgente()

  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [categoria, setCategoria] = useState('todo')



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

  // Sigue a lo YA filtrado, no a lo tipeado: si siguiera al input, entre la
  // tecla y el filtro se vería "Resultados · 0 productos" por un instante.
  const buscando = Boolean(busquedaAplicada.trim())
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
          <Seccion
            titulo="Resultados"
            descripcion={filteredData.recortado
              ? `los ${filteredData.flat.length} más parecidos de ${filteredData.totalCoincidencias}`
              : `${filteredData.flat.length} productos`}
            icono={ChevronRight} color="bg-neutro-100 text-neutro-500">
            <Cuadricula productos={filteredData.flat} statsPorProducto={statsPorProducto}
              />
          </Seccion>
        ) : (
          <>
            {(enTodo || categoria === '__ofertas') && productosRebajados.length > 0 && (
              <Seccion titulo="Bajamos el precio" descripcion="Ahora cuestan menos que antes"
                icono={TrendingDown} color="bg-acento-50 text-acento-600">
                <Cuadricula productos={productosRebajados} />
              </Seccion>
            )}

            {/* Sección aparte de "Bajamos el precio" a propósito: esta son
                excesos de inventario y aquella una baja de precio decidida.
                El argumento de venta es distinto. */}
            {(enTodo || categoria === '__ofertas') && featuredProducts.length > 0 && (
              <Seccion titulo="Liquidación" descripcion="Mientras dure la existencia"
                icono={Flame} color="bg-nota-50 text-nota-600">
                <Cuadricula productos={featuredProducts} />
              </Seccion>
            )}

            {(enTodo || categoria === '__cliente') && productosHabitualesDelCliente.length > 0 && (
              <Seccion titulo="Lo que más compra" descripcion="Sus productos de siempre"
                icono={Star} color="bg-exito-50 text-exito-600">
                <Cuadricula productos={productosHabitualesDelCliente} />
              </Seccion>
            )}

            {(enTodo || categoria === '__cliente') && productosPerdidosDelCliente.length > 0 && (
              <Seccion titulo="Dejó de comprar" descripcion="Hace rato que no los lleva"
                icono={RotateCcw} color="bg-alerta-50 text-alerta-600">
                <Cuadricula productos={productosPerdidosDelCliente} />
              </Seccion>
            )}

            {filteredData.sortedKeys
              .filter((k) => enTodo || categoria === k)
              .map((k) => {
                // Solo la categoría que tiene subcategorías se parte. El
                // resto se dibuja de una tirada, como siempre: llenarlas de
                // encabezados que dicen "Otros" no ayudaría a nadie.
                const familias = filteredData.subgrupos?.[k]
                return (
                  <Seccion key={k} titulo={k} descripcion={`${filteredData.grouped[k].length} productos`}
                    icono={ChevronRight} color="bg-neutro-100 text-neutro-500">
                    {familias
                      ? familias.map((f) => (
                          <Subgrupo key={f.nombre} nombre={f.nombre} cantidad={f.productos.length}
                            sinClasificar={f.sinClasificar}>
                            <Cuadricula productos={f.productos} statsPorProducto={statsPorProducto}
                              dentroDeSuFamilia={!f.sinClasificar} />
                          </Subgrupo>
                        ))
                      : <Cuadricula productos={filteredData.grouped[k]} statsPorProducto={statsPorProducto} />}
                  </Seccion>
                )
              })}
          </>
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
  )
}

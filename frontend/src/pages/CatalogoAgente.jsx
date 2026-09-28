import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Flame, TrendingDown, Star, RotateCcw, PackageOpen,
  LayoutGrid, Tag, UserCheck, Loader2, ChevronRight, Award, ThumbsUp, Sparkles, KeyRound
} from 'lucide-react'
import { useCatalogoAgente } from '../hooks/useCatalogoAgente'
import { enOrdenDelCatalogo, nombreVisibleDeCategoria } from '../utils/catalogoAgentePersonalizacion'
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
function Cuadricula({ productos, statsPorProducto, dentroDeSuFamilia = false, comoOferta = false }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {productos.map((p) => (
        <TarjetaProductoAgente
          key={p.id}
          product={p}
          stats={p._stats || statsPorProducto?.get(String(p.id))}
          mostrarSubcategoria={!dentroDeSuFamilia}
          comoOferta={comoOferta}
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

/**
 * Las categorías DENTRO de una sección (el catálogo de "Cliente nuevo"): cada
 * una con su nombre y, adentro, sus familias con el mismo encabezado que en
 * el catálogo completo. Va entre la sección y la familia en tamaño: se tiene
 * que leer como parte de "Lo más vendido", no como otra sección.
 */
function BloquesPorCategoria({ bloques, comoOferta = false }) {
  return bloques.map((b) => (
    <div key={b.clave} className="mb-6 last:mb-0">
      <div className="mb-3 flex items-baseline gap-2 border-b border-neutro-200 pb-1.5">
        <h3 className={`text-[15px] font-extrabold ${b.clave === 'Otros' ? 'text-neutro-400' : 'text-neutro-800'}`}>{b.nombre}</h3>
        <span className="text-xs font-semibold text-neutro-400">{b.productos.length}</span>
      </div>
      {b.familias
        ? b.familias.map((f) => (
            <Subgrupo key={f.nombre} nombre={f.nombre} cantidad={f.productos.length} sinClasificar={f.sinClasificar}>
              <Cuadricula productos={f.productos} dentroDeSuFamilia={!f.sinClasificar} comoOferta={comoOferta} />
            </Subgrupo>
          ))
        : <Cuadricula productos={b.productos} comoOferta={comoOferta} />}
    </div>
  ))
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
    featuredProducts, productosRebajados, productosNuevos, synchronize,
    clientes, clienteActivo, statsPorProducto,
    seleccionarCliente, salirDeCliente,
    productosHabitualesDelCliente, productosPerdidosDelCliente,
    configCatalogo, clienteNuevo, sinSesionEnSync, fotosSinLugar
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

  // "Bajamos el precio" en el orden del catálogo: por categoría y, dentro,
  // por subcategoría. Revueltas por porcentaje, el agente no encontraba nada.
  const rebajasPorCategoria = useMemo(
    () => enOrdenDelCatalogo(productosRebajados, configCatalogo),
    [productosRebajados, configCatalogo]
  )

  // "Productos nuevos" (lista manual de Auditoría de Inventario), igual que
  // las rebajas: por categoría y, dentro, por subcategoría.
  const nuevosPorCategoria = useMemo(
    () => enOrdenDelCatalogo(productosNuevos, configCatalogo),
    [productosNuevos, configCatalogo]
  )

  const categorias = useMemo(() => {
    // "Cliente nuevo": la barra salta entre sus cuatro partes, no entre las
    // categorías del catálogo completo (que en este modo no se muestra).
    if (clienteNuevo) {
      const { totales } = clienteNuevo
      const lista = [{ clave: 'todo', texto: 'Todo', icono: LayoutGrid, contador: totales.oferta + totales.liquidacion + totales.A + totales.B }]
      if (totales.oferta > 0) lista.push({ clave: '__oferta', texto: 'Oferta', icono: Tag, contador: totales.oferta })
      if (totales.liquidacion > 0) lista.push({ clave: '__liquidacion', texto: 'Liquidación', icono: Flame, contador: totales.liquidacion })
      if (totales.A > 0) lista.push({ clave: '__rotA', texto: 'Lo más vendido', icono: Award, contador: totales.A })
      if (totales.B > 0) lista.push({ clave: '__rotB', texto: 'También se vende bien', icono: ThumbsUp, contador: totales.B })
      return lista
    }
    const lista = [{ clave: 'todo', texto: 'Todo', icono: LayoutGrid, contador: filteredData.flat.length }]
    if (ofertas.length > 0) lista.push({ clave: '__ofertas', texto: 'Ofertas', icono: Tag, contador: ofertas.length })
    if (productosNuevos.length > 0) lista.push({ clave: '__nuevos', texto: 'Nuevos', icono: Sparkles, contador: productosNuevos.length })
    if (clienteActivo && productosHabitualesDelCliente.length > 0) {
      lista.push({ clave: '__cliente', texto: 'De este cliente', icono: UserCheck, contador: productosHabitualesDelCliente.length })
    }
    filteredData.sortedKeys.forEach((k) => {
      lista.push({ clave: k, texto: nombreVisibleDeCategoria(k, configCatalogo), contador: filteredData.grouped[k]?.length || 0 })
    })
    return lista
  }, [filteredData, ofertas, productosNuevos, clienteActivo, productosHabitualesDelCliente, configCatalogo, clienteNuevo])

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
        {/* La actualización terminó, pero sin sesión el orden y la rotación
            no se pueden traer: se quedó lo que ya estaba guardado. */}
        {sinSesionEnSync.length > 0 && !isSyncing && (
          <div className="mb-4 flex flex-col gap-2 rounded-2xl bg-alerta-50 px-4 py-3 text-sm text-alerta-800 ring-1 ring-alerta-200 sm:flex-row sm:items-center">
            <KeyRound size={18} className="shrink-0" />
            <p className="flex-1">
              Se actualizaron los productos y las fotos, pero no {sinSesionEnSync.join(' ni ')}: la sesión venció.
              Iniciá sesión y volvé a actualizar.
            </p>
            <Link to="/ingresar" state={{ destino: '/catalogo-agente' }}
              className="shrink-0 rounded-xl bg-alerta-600 px-4 py-2 text-center font-semibold text-white">
              Iniciar sesión
            </Link>
          </div>
        )}
        {/* Chrome cobra ~14,7 MB por foto guardada (ver cacheImagenesCatalogo.js):
            las del fondo del catálogo pueden no caber. */}
        {fotosSinLugar > 0 && !isSyncing && (
          <p className="mb-4 rounded-2xl bg-neutro-100 px-4 py-3 text-xs text-neutro-600">
            No cupieron {fotosSinLugar} fotos en esta tablet: esas se ven solo con internet. Las de arriba del catálogo sí quedaron guardadas.
          </p>
        )}
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
        ) : clienteNuevo ? (
          /* "Cliente nuevo": en vez del catálogo completo, lo más fácil de
             vender — la oferta, la liquidación, y después la rotación A y la
             B, cada una por categoría y subcategoría. Lo demás sigue a mano
             en el buscador. */
          <>
            {(enTodo || categoria === '__oferta') && clienteNuevo.totales.oferta > 0 && (
              <Seccion titulo="Oferta" descripcion="Precios especiales"
                icono={Tag} color="bg-acento-50 text-acento-600">
                <BloquesPorCategoria bloques={clienteNuevo.oferta} comoOferta />
              </Seccion>
            )}
            {(enTodo || categoria === '__liquidacion') && clienteNuevo.totales.liquidacion > 0 && (
              <Seccion titulo="Liquidación" descripcion="Mientras dure la existencia"
                icono={Flame} color="bg-nota-50 text-nota-600">
                <BloquesPorCategoria bloques={clienteNuevo.liquidacion} />
              </Seccion>
            )}
            {(enTodo || categoria === '__rotA') && clienteNuevo.totales.A > 0 && (
              <Seccion titulo="Lo más vendido" descripcion="Rotación A"
                icono={Award} color="bg-exito-50 text-exito-600">
                <BloquesPorCategoria bloques={clienteNuevo.A} />
              </Seccion>
            )}
            {(enTodo || categoria === '__rotB') && clienteNuevo.totales.B > 0 && (
              <Seccion titulo="También se vende bien" descripcion="Rotación B"
                icono={ThumbsUp} color="bg-primario-50 text-primario-600">
                <BloquesPorCategoria bloques={clienteNuevo.B} />
              </Seccion>
            )}
            {clienteNuevo.totales.A + clienteNuevo.totales.B === 0 && (
              <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-white p-6 text-center ring-1 ring-neutro-200">
                <p className="text-sm font-bold text-neutro-900">Falta la lista de lo más vendido</p>
                <p className="mt-1 text-xs text-neutro-400">
                  Conectate a internet y tocá el botón de actualizar, arriba a la derecha.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {(enTodo || categoria === '__ofertas') && productosRebajados.length > 0 && (
              <Seccion titulo="Bajamos el precio" descripcion="Ahora cuestan menos que antes"
                icono={TrendingDown} color="bg-acento-50 text-acento-600">
                {/* Un bloque por categoría; cada tarjeta dice su subcategoría. */}
                {rebajasPorCategoria.map((b) => (
                  <Subgrupo key={b.clave} nombre={b.nombre} cantidad={b.productos.length}
                    sinClasificar={b.clave === 'Otros'}>
                    <Cuadricula productos={b.productos} />
                  </Subgrupo>
                ))}
              </Seccion>
            )}

            {/* Lista manual de Auditoría de Inventario, justo después de las
                rebajas (decisión del usuario, 2026-09-27). */}
            {(enTodo || categoria === '__nuevos') && productosNuevos.length > 0 && (
              <Seccion titulo="Productos nuevos" descripcion="Recién llegados al catálogo"
                icono={Sparkles} color="bg-primario-50 text-primario-600">
                {nuevosPorCategoria.map((b) => (
                  <Subgrupo key={b.clave} nombre={b.nombre} cantidad={b.productos.length}
                    sinClasificar={b.clave === 'Otros'}>
                    <Cuadricula productos={b.productos} />
                  </Subgrupo>
                ))}
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
                  <Seccion key={k} titulo={nombreVisibleDeCategoria(k, configCatalogo)} descripcion={`${filteredData.grouped[k].length} productos`}
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

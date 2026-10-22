import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Flame, Star, RotateCcw, PackageOpen,
  LayoutGrid, Tag, UserCheck, Loader2, ChevronRight, Award, ThumbsUp, Sparkles, KeyRound
} from 'lucide-react'
import { useCatalogoAgente } from '../hooks/useCatalogoAgente'
import { enOrdenDelCatalogo, nombreVisibleDeCategoria } from '../utils/catalogoAgentePersonalizacion'
import { applyCatalogoAgenteGuards } from '../utils/catalogoAgenteSecurity'
import BarraSuperior from '../components/catalogo-agente/BarraSuperior'
import BarraCategorias from '../components/catalogo-agente/BarraCategorias'
import Cuadricula from '../components/catalogo-agente/Cuadricula'
import SyncOverlay from '../components/catalogo-agente/SyncOverlay'
import SelectorCliente from '../components/catalogo-agente/SelectorCliente'
import IntroduccionCategoria from '../components/catalogo-agente/IntroduccionCategoria'
import { imagenDeCategoria } from '../utils/imagenesCategoriaCatalogo'

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
 * Categorías dentro de ofertas, nuevos y las secciones de "Cliente nuevo".
 * Cada una tiene su encabezado y una cuadrícula continua; las subcategorías
 * tienen navegación y títulos, conservando completas las filas compartidas.
 */
function BloquesPorCategoria({ bloques, configCatalogo, nivel = 3 }) {
  return bloques.map((b, i) => (
    <div key={b.clave} className="mb-6 last:mb-0">
      <IntroduccionCategoria nombre={b.nombre} cantidad={b.productos.length} nivel={nivel}
        imagen={imagenDeCategoria(b.clave, configCatalogo, b.productos)} numero={i + 1} total={bloques.length} />
      <Cuadricula productos={b.productos} familias={b.familias} nivel={nivel + 1} />
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
    configCatalogo, clienteNuevo, sinSesionEnSync, fotosSinLugar, fotosFallidas, requiereActualizar, errorCatalogo
  } = useCatalogoAgente()

  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [categoria, setCategoria] = useState('todo')



  useEffect(() => {
    const quitarGuardas = applyCatalogoAgenteGuards()
    return quitarGuardas
  }, [])

  const ofertas = useMemo(
    // Una ficha con ambas promociones se muestra al precio de liquidación.
    () => [...new Map([...productosRebajados, ...featuredProducts].map((p) => [String(p.id), p])).values()],
    [productosRebajados, featuredProducts]
  )

  // Solo se usa al elegir el filtro Ofertas. En Todo, cada promoción está
  // en su familia; no hay otra copia de la ficha arriba del catálogo.
  const ofertasPorCategoria = useMemo(
    () => enOrdenDelCatalogo(ofertas, configCatalogo),
    [ofertas, configCatalogo]
  )

  // "Productos nuevos" (lista manual de Auditoría de Inventario), igual que
  // las rebajas: por categoría y, dentro, por subcategoría.
  const nuevosPorCategoria = useMemo(
    () => enOrdenDelCatalogo(productosNuevos, configCatalogo),
    [productosNuevos, configCatalogo]
  )

  const categorias = useMemo(() => {
    // "Cliente nuevo": filtros de las cuatro selecciones; Todo reúne sus
    // productos por familia en lugar de separar las ofertas arriba.
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
        <BarraCategorias categorias={categorias} activa={categoria} onElegir={clave => {
          setCategoria(clave)
          // El filtro abre otra colección: arriba se ven su presentación y
          // sus primeros productos, sin pantallas fijas ni esperas.
          window.scrollTo({ top: 0, behavior: 'auto' })
        }} />
      )}

      <main className="px-3 py-4">
        {requiereActualizar && !isSyncing && (
          <p className="mb-4 rounded-2xl bg-alerta-50 px-4 py-3 text-sm text-alerta-800 ring-1 ring-alerta-200">
            El catálogo cambió. Actualícelo con internet antes de salir a la calle.
          </p>
        )}
        {errorCatalogo && !isSyncing && (
          <p role="alert" className="mb-4 rounded-2xl bg-peligro-50 px-4 py-3 text-sm text-peligro-700 ring-1 ring-peligro-200">
            {errorCatalogo}
          </p>
        )}
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
        {/* Las fotos propias pesan lo que pesan y entran todas; esto queda
            para una tablet con el disco de verdad lleno. */}
        {fotosSinLugar > 0 && !isSyncing && (
          <p className="mb-4 rounded-2xl bg-neutro-100 px-4 py-3 text-xs text-neutro-600">
            No cupieron {fotosSinLugar} fotos en esta tablet: esas se ven solo con internet. Las de arriba del catálogo sí quedaron guardadas.
          </p>
        )}
        {/* No es falta de lugar: se cortó la señal a la mitad o el archivo no
            está. Decirlo aparte, porque se arregla distinto. */}
        {fotosFallidas > 0 && !isSyncing && (
          <p className="mb-4 rounded-2xl bg-alerta-50 px-4 py-3 text-sm text-alerta-800 ring-1 ring-alerta-200">
            {fotosFallidas === 1 ? 'Una foto no se pudo bajar' : `${fotosFallidas} fotos no se pudieron bajar`}: sin internet no se van a ver. Tocá Actualizar de nuevo con buena señal.
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
            <Cuadricula productos={filteredData.flat} statsPorProducto={statsPorProducto} animar={false} agruparMarcas={false}
              />
          </Seccion>
        ) : clienteNuevo ? (
          /* Misma selección de recomendaciones, ordenada por familia.
             La barra filtra promociones/rotación sin separarlas en Todo. */
          <>
            <BloquesPorCategoria configCatalogo={configCatalogo} nivel={2} bloques={enTodo
              ? clienteNuevo.todos
              : clienteNuevo[{ __oferta: 'oferta', __liquidacion: 'liquidacion', __rotA: 'A', __rotB: 'B' }[categoria]] || []} />
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
            {categoria === '__ofertas' && ofertas.length > 0 && (
              <Seccion titulo="Ofertas y liquidación" descripcion="Filtradas por categoría y familia"
                icono={Tag} color="bg-acento-50 text-acento-600">
                <BloquesPorCategoria bloques={ofertasPorCategoria} configCatalogo={configCatalogo} />
              </Seccion>
            )}

            {/* Lista manual de Auditoría de Inventario: conserva su sección
                propia (decisión del usuario, 2026-09-27). */}
            {(enTodo || categoria === '__nuevos') && productosNuevos.length > 0 && (
              <Seccion titulo="Productos nuevos" descripcion="Recién llegados al catálogo"
                icono={Sparkles} color="bg-primario-50 text-primario-600">
                <BloquesPorCategoria bloques={nuevosPorCategoria} configCatalogo={configCatalogo} />
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
              .map((k, i, claves) => {
                // Las familias siguen juntas, pero comparten las filas de
                // su categoría. No se reordena por tamaño para llenar huecos.
                const familias = filteredData.subgrupos?.[k]
                return (
                  <section key={k} className="mb-8">
                    <IntroduccionCategoria nombre={nombreVisibleDeCategoria(k, configCatalogo)} cantidad={filteredData.grouped[k].length}
                      imagen={imagenDeCategoria(k, configCatalogo, filteredData.grouped[k])} numero={i + 1} total={claves.length} />
                    <Cuadricula productos={filteredData.grouped[k]} familias={familias}
                      statsPorProducto={statsPorProducto} />
                  </section>
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

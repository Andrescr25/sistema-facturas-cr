import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, ImageOff, Layers, Link as LinkIcon, Package, Plus, RefreshCw, Search, Tags, Truck, X } from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { useDialog } from '../hooks/useDialog'
import { useTaxonomiaCatalogo } from '../hooks/useTaxonomiaCatalogo'
import { useListaCatalogo } from '../hooks/useListaCatalogo'
import { useSeleccionLote } from '../hooks/useSeleccionLote'
import { useFichaProducto } from '../hooks/useFichaProducto'
import { useAccionesLote } from '../hooks/useAccionesLote'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import Boton from '../components/ui/Boton'
import Pestanas from '../components/ui/Pestanas'
import TarjetasResumen from '../components/pagos/TarjetasResumen'
import SkeletonContraparte from '../components/pagos/SkeletonContraparte'
import CuadriculaCategorias from '../components/gestion-catalogo/CuadriculaCategorias'
import DetalleCategoria from '../components/gestion-catalogo/DetalleCategoria'
import ResultadosBusqueda from '../components/gestion-catalogo/ResultadosBusqueda'
import BarraLote from '../components/gestion-catalogo/BarraLote'
import ModalProducto from '../components/gestion-catalogo/ModalProducto'
import ModalSugerirImagen from '../components/ModalSugerirImagen'
import TablaCatalogo from '../components/configuracion/TablaCatalogo'
import ModalElementoCatalogo from '../components/configuracion/ModalElementoCatalogo'
import { urlArchivo } from '../utils/urlArchivo'

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

/**
 * La pestaña de categorías usa la misma tabla y el mismo formulario que los
 * catálogos de Configuración. Es donde se cambia el nombre DE VERDAD de una
 * categoría y donde se desactiva; el nombre que se ve en los catálogos se
 * cambia en la tarjeta de la categoría.
 */
const CATEGORIAS = {
  clave: 'categorias',
  texto: 'Categorías',
  singular: 'categoría',
  uno: 'una categoría',
  icono: Tags,
  descripcion: 'Agrupan los productos en los catálogos y en los reportes. Una inactiva no se ofrece para productos nuevos, pero los que ya la tienen la conservan.',
  columnas: [
    { campo: 'nombre', titulo: 'Nombre', principal: true },
    { campo: 'productos', titulo: 'Productos activos' }
  ],
  campos: [{ campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 80 }],
  nuevo: { nombre: '' }
}

const ESTADOS = [
  { valor: 'activos', texto: 'A la venta' },
  { valor: 'ocultos', texto: 'Ocultos de los catálogos' },
  { valor: 'inactivos', texto: 'Dados de baja' }
]

/**
 * Gestión de Catálogo, con la forma del resto del sistema: título, tarjetas
 * de resumen que sirven de filtro, una tarjeta grande por categoría —con sus
 * subcategorías adentro— y, al entrar a una, sus subcategorías como
 * secciones con sus productos.
 *
 * ES EL REDISEÑO DE `main`, SOBRE EL MAESTRO PROPIO. Allá lee la caché de
 * Alegra y cambiar de categoría le escribe a Alegra; acá todo va contra
 * `producto` y es inmediato. La ficha es la de esta rama (CABYS, impuesto,
 * unidad, medicamento, ocultar y dar de baja), y los ocultos y dados de baja
 * se encuentran con el filtro de estado del buscador.
 *
 * TODO EN EL ORDEN DEL AGENTE: las categorías como vienen de GET
 * /maestro/arbol (categoria_config.orden) y las subcategorías con
 * compararSubcategorias, la misma función que usa el catálogo del agente.
 */
export default function GestionCatalogo() {
  const { toasts, showToast, removeToast } = useToast()
  const { confirm, dialogProps } = useDialog()
  const mostrarToast = useCallback((type, message) => showToast(message, type), [showToast])
  const [pestana, setPestana] = useState('catalogo')
  const [edicionCategoria, setEdicionCategoria] = useState(null)
  // Mismo formato que usan las tarjetas de Cuentas por Cobrar: `estado` es el
  // atajo elegido (todos | sinClasificar | sinFoto).
  const [vista, setVista] = useState({ estado: 'todos', dias: 'todos' })

  const taxonomia = useTaxonomiaCatalogo()
  const { arbol, loadingArbol, categoriaActiva, subFoco, errorArbol } = taxonomia

  const lista = useListaCatalogo({ arbol, categoriaActiva, subFoco })
  const seleccion = useSeleccionLote()

  const nombreProveedor = useMemo(() => {
    if (!lista.proveedor) return ''
    if (lista.proveedor === lista.proveedores.sinProveedor?.valor) return 'sin proveedor relacionado'
    return lista.proveedores.proveedores.find((p) => p.cedula === lista.proveedor)?.nombre || ''
  }, [lista.proveedor, lista.proveedores])

  // Lo seleccionado es de lo que se estaba mirando: al cambiar de lugar se suelta.
  useEffect(() => {
    seleccion.limpiar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaActiva, subFoco, lista.busquedaActiva])

  // En la cuadrícula, "Sin foto" también filtra los resultados de búsqueda.
  useEffect(() => {
    if (!categoriaActiva) lista.setSoloSinImagen(vista.estado === 'sinFoto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.estado, categoriaActiva])

  const ficha = useFichaProducto({
    mostrarToast,
    alCambiar: () => { lista.recargar(); taxonomia.recargarArbol() },
    alPonerFoto: (id, imagenUrl) => {
      lista.patchProducto(id, { imageUrl: urlArchivo(imagenUrl) })
      taxonomia.recargarArbol()
    }
  })

  const acciones = useAccionesLote({
    arbol,
    patchProducto: lista.patchProducto,
    quitarProductos: lista.quitarProductos,
    recargarArbol: taxonomia.recargarArbol,
    recargarLista: lista.recargar,
    mostrarToast
  })

  const totales = useMemo(() => arbol.reduce((t, c) => ({
    productos: t.productos + c.total,
    sinClasificar: t.sinClasificar + c.sinClasificar,
    sinImagen: t.sinImagen + (c.sinImagen || 0),
    subcategorias: t.subcategorias + c.subcategorias.length
  }), { productos: 0, sinClasificar: 0, sinImagen: 0, subcategorias: 0 }), [arbol])

  const tarjetas = arbol.length ? [
    { clave: 'productos', titulo: 'Productos', icono: Package, tono: 'neutro', valor: totales.productos, pie: `en ${plural(arbol.length, 'categoría', 'categorías')}` },
    { clave: 'sinClasificar', titulo: 'Sin clasificar', icono: AlertTriangle, tono: 'alerta', valor: totales.sinClasificar, filtro: { estado: 'sinClasificar' } },
    { clave: 'sinFoto', titulo: 'Sin foto', icono: ImageOff, tono: 'peligro', valor: totales.sinImagen, filtro: { estado: 'sinFoto' } },
    { clave: 'subcategorias', titulo: 'Subcategorías', icono: Layers, tono: 'exito', valor: totales.subcategorias }
  ] : []

  const filtrada = vista.estado !== 'todos'
  const categoriasVisibles = vista.estado === 'sinClasificar'
    ? arbol.filter((c) => c.sinClasificar > 0)
    : vista.estado === 'sinFoto'
      ? arbol.filter((c) => c.sinImagen > 0)
      : arbol
  const otrasCategorias = arbol.filter((c) => c.name !== categoriaActiva)

  const entrar = (nombre, foco) => {
    // Con un atajo de arriba elegido, se entra directo a lo pendiente.
    const focoFinal = foco !== undefined ? foco : (vista.estado === 'sinClasificar' ? 'sin' : null)
    lista.setSoloSinImagen(vista.estado === 'sinFoto')
    taxonomia.seleccionarCategoria(nombre, focoFinal)
    window.scrollTo({ top: 0 })
  }

  const volver = () => {
    taxonomia.volverALista()
    window.scrollTo({ top: 0 })
  }

  const moverSubcategoria = async (sub, destino) => {
    const origen = sub.categoriaVisible || sub.categoria
    const ok = await confirm(
      `"${sub.nombre}" pasa completa de ${origen} a ${destino.nombreVisible}, con ${plural(sub.productos, 'producto', 'productos')}. ` +
      'Siguen agrupados en la misma subcategoría.',
      { title: 'Mover subcategoría', confirmLabel: 'Mover' }
    )
    if (!ok) return
    if (subFoco === sub.id) taxonomia.enfocar(null)
    acciones.moverSubcategoria(sub, destino)
  }

  const moverSeleccionASubcategoria = async (subcategoriaId) => {
    const ok = await acciones.moverASubcategoria([...seleccion.seleccionados], subcategoriaId)
    if (ok) seleccion.limpiar()
  }

  const cambiarCategoriaDeSeleccion = async (destino) => {
    const ids = [...seleccion.seleccionados]
    const ok = await confirm(
      `${plural(ids.length, 'producto pasa', 'productos pasan')} a ${destino.nombreVisible}, y allá quedan en "Sin clasificar".`,
      { title: 'Cambiar de categoría', confirmLabel: 'Cambiar' }
    )
    if (!ok) return
    if (await acciones.cambiarCategoria(ids, destino)) seleccion.limpiar()
  }

  const eliminarSubcategoria = (id) =>
    taxonomia.eliminarSubcategoria(categoriaActiva, id).catch((e) => {
      mostrarToast('error', e?.response?.data?.message || 'No se pudo borrar la subcategoría.')
    })

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/catalogo-agente`)
      mostrarToast('success', 'Link del catálogo copiado.')
    } catch {
      mostrarToast('error', 'No se pudo copiar el link.')
    }
  }

  const accionesFila = {
    onEditar: ficha.abrirEditar,
    onSugerirFoto: ficha.openImageSuggestions,
    onDuplicar: ficha.abrirOtraMarca
  }

  const pestanas = [
    { clave: 'catalogo', texto: 'Catálogo', icono: Package, contador: totales.productos },
    { clave: 'categorias', texto: 'Categorías', icono: Tags, contador: ficha.categorias.filter((c) => c.activo).length }
  ]

  const hayFiltroBusqueda = lista.estado !== 'activos'

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-48">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ConfirmModal {...dialogProps} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutro-900">Gestión de Catálogo</h1>
          <p className="mt-1 text-neutro-600">Categorías, subcategorías y fotos — en el mismo orden en que las ve el agente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" icono={ExternalLink} onClick={() => window.open('/catalogo-agente', '_blank', 'noopener')}>
            Ver catálogo
          </Boton>
          <Boton variante="secundario" icono={LinkIcon} onClick={copiarLink}>Copiar link</Boton>
          <Boton icono={Plus} onClick={ficha.abrirNuevo}>Nuevo producto</Boton>
        </div>
      </div>

      <Pestanas activa={pestana} onCambiar={setPestana} pestanas={pestanas} />

      {pestana === 'categorias' ? (
        <TablaCatalogo
          definicion={CATEGORIAS}
          filas={ficha.categorias}
          trabajando={false}
          onAgregar={() => setEdicionCategoria({ fila: null })}
          onEditar={(fila) => setEdicionCategoria({ fila })}
          onCambiarActivo={ficha.cambiarActivoCategoria}
        />
      ) : !categoriaActiva ? (
        <>
          <TarjetasResumen tarjetas={tarjetas} filtros={vista} setFiltros={setVista} />

          <div className="flex flex-col gap-3 rounded-xl border border-neutro-100 bg-white p-4 shadow-sm md:flex-row md:flex-wrap md:items-center">
            <div className="relative min-w-0 flex-1 md:min-w-[280px]">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
              <input
                value={lista.busqueda}
                onChange={(e) => lista.setBusqueda(e.target.value)}
                placeholder="Buscar un producto en todo el catálogo, por nombre o referencia…"
                className="w-full rounded-xl border border-neutro-200 bg-neutro-50 py-3 pl-10 pr-10 text-base text-neutro-900 focus:border-primario-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primario-500/30"
              />
              {lista.busqueda && (
                <button type="button" onClick={() => lista.setBusqueda('')} title="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutro-400 hover:bg-neutro-100 hover:text-neutro-700">
                  <X size={18} />
                </button>
              )}
            </div>
            {/* Proveedor, por cédula. Si la lista no cargó, el filtro no se muestra. */}
            {lista.proveedores.proveedores.length > 0 && (
              <div className="relative shrink-0 md:w-72">
                <Truck size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
                <select
                  value={lista.proveedor}
                  onChange={(e) => lista.setProveedor(e.target.value)}
                  aria-label="Filtrar por proveedor"
                  className={`w-full truncate rounded-xl border py-3 pl-10 pr-8 text-base focus:outline-none focus:ring-2 focus:ring-primario-500/30 ${
                    lista.proveedor ? 'border-primario-300 bg-primario-50 font-semibold text-primario-800' : 'border-neutro-200 bg-neutro-50 text-neutro-900'
                  }`}
                >
                  <option value="">Todos los proveedores</option>
                  {lista.proveedores.proveedores.map((p) => (
                    <option key={p.cedula} value={p.cedula}>{p.nombre} ({p.productos})</option>
                  ))}
                  {lista.proveedores.sinProveedor?.productos > 0 && (
                    <option value={lista.proveedores.sinProveedor.valor}>Sin proveedor relacionado ({lista.proveedores.sinProveedor.productos})</option>
                  )}
                </select>
              </div>
            )}
            {/* Los ocultos y los dados de baja no cuentan en las categorías
                (tampoco los ve el agente): se encuentran acá, para volverlos
                a la venta desde su ficha. */}
            <select
              value={lista.estado}
              onChange={(e) => lista.setEstado(e.target.value)}
              aria-label="Estado de los productos"
              className={`shrink-0 rounded-xl border px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primario-500/30 md:w-60 ${
                hayFiltroBusqueda ? 'border-primario-300 bg-primario-50 font-semibold text-primario-800' : 'border-neutro-200 bg-neutro-50 text-neutro-900'
              }`}
            >
              {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
            </select>
            {filtrada && (
              <button type="button" onClick={() => setVista({ estado: 'todos', dias: 'todos' })}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primario-50 px-4 py-3 text-sm font-semibold text-primario-700 ring-1 ring-primario-200 hover:bg-primario-100">
                Solo {vista.estado === 'sinClasificar' ? 'sin clasificar' : 'sin foto'} <X size={16} />
              </button>
            )}
          </div>

          {lista.busquedaActiva ? (
            <ResultadosBusqueda
              busqueda={lista.busqueda || ESTADOS.find((e) => e.valor === lista.estado)?.texto}
              proveedorNombre={nombreProveedor}
              resultados={lista.resultados}
              loading={lista.loading}
              alternar={seleccion.alternar}
              estaSeleccionado={seleccion.estaSeleccionado}
              {...accionesFila}
            />
          ) : loadingArbol && arbol.length === 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              <SkeletonContraparte /><SkeletonContraparte /><SkeletonContraparte />
            </div>
          ) : errorArbol && arbol.length === 0 ? (
            <div className="rounded-xl border border-peligro-200 bg-white py-14 text-center shadow-sm">
              <AlertTriangle size={48} className="mx-auto mb-3 text-peligro-400" />
              <p className="mb-1 text-lg font-bold text-neutro-900">No se pudieron cargar las categorías</p>
              <p className="mb-5 text-neutro-500">{errorArbol}</p>
              <Boton icono={RefreshCw} onClick={() => taxonomia.recargarArbol()}>Reintentar</Boton>
            </div>
          ) : (
            <CuadriculaCategorias
              categorias={categoriasVisibles}
              filtrada={filtrada}
              puedeCrear
              onEntrar={entrar}
              onReordenar={taxonomia.reordenarCategorias}
              onSoltarSubcategoria={moverSubcategoria}
              onCrearCategoria={taxonomia.crearCategoria}
            />
          )}
        </>
      ) : lista.categoria ? (
        <DetalleCategoria
          key={categoriaActiva}
          categoria={lista.categoria}
          subsOrdenadas={lista.subsOrdenadas}
          secciones={lista.secciones}
          loading={lista.loading}
          subFoco={subFoco}
          filtroTexto={lista.filtroTexto}
          setFiltroTexto={lista.setFiltroTexto}
          soloSinImagen={lista.soloSinImagen}
          setSoloSinImagen={lista.setSoloSinImagen}
          hayFiltro={lista.hayFiltro}
          otrasCategorias={otrasCategorias}
          alternar={seleccion.alternar}
          estaSeleccionado={seleccion.estaSeleccionado}
          seleccionarTodos={seleccion.seleccionarTodos}
          deseleccionarTodos={seleccion.deseleccionarTodos}
          onVolver={volver}
          onEnfocar={taxonomia.enfocar}
          onRenombrarCategoria={(nombreVisible) => taxonomia.renombrarCategoria(categoriaActiva, nombreVisible)}
          onGuardarImagen={archivo => taxonomia.guardarImagenCategoria(categoriaActiva, archivo)}
          onQuitarImagen={() => taxonomia.quitarImagenCategoria(categoriaActiva)}
          onImagenGuardada={mensaje => showToast(mensaje, 'success')}
          onCrearSub={(nombre) => taxonomia.crearSubcategoria(categoriaActiva, nombre)}
          onRenombrarSub={(id, nombre) => taxonomia.renombrarSubcategoria(categoriaActiva, id, nombre)}
          onReordenarSub={(ids) => taxonomia.reordenarSubcategorias(categoriaActiva, ids)}
          onEliminarSub={eliminarSubcategoria}
          onMoverSub={(sub, destino) => moverSubcategoria(
            { ...sub, categoria: categoriaActiva, categoriaVisible: lista.categoria.nombreVisible }, destino
          )}
          {...accionesFila}
        />
      ) : (
        // La categoría abierta ya no está en el árbol (se recargó mientras
        // tanto): siempre hay por dónde volver, nunca una pantalla en blanco.
        <div className="rounded-xl border border-neutro-100 bg-white py-16 text-center shadow-sm">
          <Package size={48} className="mx-auto mb-3 text-neutro-300" />
          <p className="mb-4 font-semibold text-neutro-700">Esa categoría ya no está en el catálogo.</p>
          <Boton onClick={volver}>Volver a categorías</Boton>
        </div>
      )}

      {pestana === 'catalogo' && (
        <BarraLote
          cantidad={seleccion.cantidad}
          enBusqueda={!categoriaActiva}
          subsDeLaCategoria={lista.subsOrdenadas}
          otrasCategorias={otrasCategorias}
          moviendo={acciones.moviendo}
          trabajo={acciones.trabajo}
          onMoverASubcategoria={moverSeleccionASubcategoria}
          onCambiarCategoria={cambiarCategoriaDeSeleccion}
          onCerrarTrabajo={acciones.cerrarTrabajo}
          onLimpiar={seleccion.limpiar}
        />
      )}

      {ficha.isImageModalOpen && ficha.selectedProduct && (
        <ModalSugerirImagen
          producto={{
            ...ficha.selectedProduct,
            name: ficha.selectedProduct.nombre,
            reference: ficha.selectedProduct.referencia,
            imageUrl: ficha.selectedProduct.imagen_url ? urlArchivo(ficha.selectedProduct.imagen_url) : null
          }}
          customSearchQuery={ficha.customSearchQuery}
          setCustomSearchQuery={ficha.setCustomSearchQuery}
          imageSuggestions={ficha.imageSuggestions}
          loadingSuggestions={ficha.loadingSuggestions}
          assigningImage={ficha.assigningImage}
          onBuscar={ficha.fetchImageSuggestions}
          onAsignar={ficha.handleAssignImage}
          onSubirArchivo={ficha.handleSubirArchivoImagen}
          onCerrar={() => ficha.setIsImageModalOpen(false)}
        />
      )}

      {ficha.edicion && (
        <ModalProducto
          key={ficha.edicion.producto?.id ?? (ficha.edicion.plantilla ? `marca-${ficha.edicion.plantilla.id}` : 'nuevo')}
          producto={ficha.edicion.producto}
          plantilla={ficha.edicion.plantilla}
          categorias={ficha.categorias}
          impuestos={ficha.impuestos}
          guardando={ficha.guardando}
          onGuardar={ficha.guardarProducto}
          onCambiarEstado={ficha.cambiarEstadoProducto}
          onCerrar={ficha.cerrarEdicion}
        />
      )}

      {edicionCategoria && (
        <ModalElementoCatalogo
          key={edicionCategoria.fila?.id ?? 'nueva'}
          definicion={CATEGORIAS}
          fila={edicionCategoria.fila}
          guardando={false}
          onGuardar={(valores) => ficha.guardarCategoria(edicionCategoria.fila?.id, valores)}
          onCerrar={() => setEdicionCategoria(null)}
        />
      )}
    </div>
  )
}

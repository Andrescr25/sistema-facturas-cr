import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import {
  categoriaPareceMedicamento as categoriaPareceMedicamentoUtil,
  pareceMedicamento,
  cabysPareceMedicamento,
  detectarFormaSugerida,
  calcularFactorConversion,
  inferirCantidadesDesdeFactor,
  calcularStatsProductos,
  filtrarProductosPorEstado
} from '../utils/relacionarProductosUtils'
import { conMiniaturasProxeadas } from '../utils/imagenSugeridaUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'

/**
 * Estado y lógica de negocio de la relación de productos de una factura:
 * carga de la factura + productos, búsqueda y relación con el producto propio, creación
 * de producto nuevo (con detección de medicamento/CABYS/forma farmacéutica),
 * y el factor de conversión de cantidades. Extraído de RelacionarProductos.jsx.
 *
 * Incluye confirm() (useDialog) y showToast() (useToast) en vez de
 * window.confirm/alert. La página debe renderizar <ConfirmModal {...dialogProps} />
 * y <ToastContainer toasts={toasts} onRemove={removeToast} />.
 */
export function useRelacionarProductos(facturaId) {
  const { confirm, dialogProps } = useDialog()
  const { toasts, showToast, removeToast } = useToast()

  const [factura, setFactura] = useState(null)
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todos')

  // Modal de búsqueda
  const [modalBusqueda, setModalBusqueda] = useState(false)
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState([])
  const [buscando, setBuscando] = useState(false)

  // Modal crear producto
  const [modalCrear, setModalCrear] = useState(false)
  const [categorias, setCategorias] = useState([])
  const [imagenPreview, setImagenPreview] = useState(null)

  // Sugerencia automática de imagen (mismo modal que Gestión de Catálogo). El
  // producto todavía no existe en Alegra en este punto, así que la sugerencia
  // elegida solo se guarda como pendiente: se sube recién al crear el
  // producto (ver crearProducto), no al seleccionarla.
  const [imagenModalOpen, setImagenModalOpen] = useState(false)
  const [imagenBusqueda, setImagenBusqueda] = useState('')
  const [imagenSugerencias, setImagenSugerencias] = useState([])
  const [cargandoImagenSugerencias, setCargandoImagenSugerencias] = useState(false)
  const [imagenSugeridaUrl, setImagenSugeridaUrl] = useState(null)
  const [imagenSugeridaFallbackUrl, setImagenSugeridaFallbackUrl] = useState(null)
  // Archivo elegido manualmente (desde el input externo del formulario, o
  // desde "Subir de mi PC" dentro del modal de sugerencias) — se guarda acá
  // en vez de depender solo del <input type="file"> nativo, porque el
  // archivo elegido dentro del modal no pasa por ese input.
  const [archivoImagenSeleccionado, setArchivoImagenSeleccionado] = useState(null)

  // Modal ajuste de conversión
  const [modalConversion, setModalConversion] = useState(false)
  const [productoRelacionado, setProductoRelacionado] = useState(null)
  const [cantidadProveedor, setCantidadProveedor] = useState(1)
  const [cantidadMia, setCantidadMia] = useState(1)

  // El producto PROPIO con el que está relacionada cada línea, por id de línea.
  const [productoInfoPorLinea, setProductoInfoPorLinea] = useState({})

  // Estado para forma farmacéutica (solo productos farmacéuticos)
  const [formaFarmaceutica, setFormaFarmaceutica] = useState('')
  const [esMedicamento, setEsMedicamento] = useState(false)
  // Recuerda con qué CABYS/categoría se aplicó la última sugerencia. Sin
  // esto, el efecto volvería a marcar la casilla en cada render y el usuario
  // no podría desmarcarla nunca — que es justo el problema que tenía.
  const sugerenciaAplicada = useRef('')
  const [registroSanitario, setRegistroSanitario] = useState('')
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('')

  // Estado para CABYS editable
  const [codigoCabys, setCodigoCabys] = useState('')

  const loadFactura = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await api.get(`/productos-revision/factura/${facturaId}`)

      if (response.data.success) {
        setFactura(response.data.data)
        const prods = response.data.data.productos || []
        setProductos(prods)

        // El producto propio de cada línea ya viene en la respuesta del backend
        const infoPorLinea = {}
        prods.forEach(prod => {
          if (prod.productoInfo) {
            infoPorLinea[prod.id] = {
              ...prod.productoInfo,
              factorConversion: prod.mapeo?.factorConversion || 1
            }
          }
        })
        setProductoInfoPorLinea(infoPorLinea)
      }
    } catch (err) {
      setError(err.message || 'Error cargando factura')
      console.error('Error completo:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (facturaId) {
      loadFactura()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturaId])

  const buscarProductos = async (query) => {
    if (!query || query.length < 2) {
      setResultadosBusqueda([])
      return
    }

    try {
      setBuscando(true)
      const response = await api.get(`/productos-revision/buscar?q=${encodeURIComponent(query)}`)

      if (response.data.success) {
        setResultadosBusqueda(response.data.productos || [])
      }
    } catch (err) {
      console.error('Error buscando productos:', err)
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      buscarProductos(busqueda)
    }, 300)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  const abrirModalBusqueda = (producto) => {
    setProductoSeleccionado(producto)
    setModalBusqueda(true)
    setBusqueda('')
    setResultadosBusqueda([])
  }

  const cerrarModalBusqueda = () => {
    setModalBusqueda(false)
    setProductoSeleccionado(null)
    setBusqueda('')
    setResultadosBusqueda([])
  }

  // `productoElegido` viene del buscador del maestro: su `id` es `producto.id`.
  const relacionarProducto = async (productoElegido) => {
    if (!productoSeleccionado) return

    try {
      const response = await api.post('/productos-revision/relacion', {
        productoProveedorId: productoSeleccionado.id,
        productoPropioId: productoElegido.id,
        facturaId: facturaId
      })

      if (response.data.success) {
        // Actualizar producto en la lista
        setProductos(prev => prev.map(p =>
          p.id === productoSeleccionado.id
            ? { ...p, estadoRelacionado: 'RELACIONADO', productoPropioId: productoElegido.id }
            : p
        ))
        setProductoInfoPorLinea(prev => ({
          ...prev,
          [productoSeleccionado.id]: { id: productoElegido.id, name: productoElegido.name, reference: productoElegido.reference, price: productoElegido.price }
        }))
        cerrarModalBusqueda()

        // Abrir modal de conversión
        setProductoRelacionado({
          ...productoSeleccionado,
          productoElegido: productoElegido,
          mapeoId: response.data.mapeo.id
        })
        setCantidadProveedor(1)
        setCantidadMia(1)
        setModalConversion(true)
      }
    } catch (err) {
      showToast('Error relacionando producto: ' + err.message, 'error')
    }
  }

  const loadCategorias = async () => {
    if (categorias.length > 0) return
    try {
      const response = await api.get('/alegra/categorias')
      if (response.data.success) {
        const cats = response.data.categorias || []
        setCategorias(cats)

        if (cats.length === 0) {
          console.warn('⚠️ No hay categorías de productos en Alegra. El usuario deberá crearlas primero.')
        }
      }
    } catch (err) {
      console.error('Error cargando categorías:', err)
      showToast('Error cargando categorías de Alegra. Verifica tu conexión e inténtalo de nuevo.', 'error')
      setCategorias([])
    }
  }

  // Funciones para crear producto
  const abrirModalCrear = (producto) => {
    setProductoSeleccionado(producto)
    setModalCrear(true)
    setImagenPreview(null)
    setImagenSugeridaUrl(null)
    setImagenSugeridaFallbackUrl(null)
    setArchivoImagenSeleccionado(null)
    setImagenSugerencias([])
    setImagenBusqueda('')
    loadCategorias()

    // Inicializar CABYS editable
    const cabysInicial = producto.codigoCabys || ''
    setCodigoCabys(cabysInicial)

    // Sugerencia por CABYS. El grupo de medicamentos es 352; comparar contra
    // '35' arrastraba pinturas, jabones, cosméticos y aceites — 276 productos
    // de este catálogo, ninguno un medicamento.
    const cabysEsMedicamento = cabysPareceMedicamento(cabysInicial)
    setEsMedicamento(cabysEsMedicamento)

    if (cabysEsMedicamento) {
      const formaSugerida = detectarFormaSugerida(producto.descripcion)
      setFormaFarmaceutica(formaSugerida)
      setRegistroSanitario('')
    } else {
      setFormaFarmaceutica('')
      setRegistroSanitario('')
    }

    setCategoriaSeleccionada('')
  }

  // Función para actualizar CABYS
  const handleCabysChange = (e) => {
    const nuevoCabys = e.target.value
    setCodigoCabys(nuevoCabys)

    // Igual que arriba: solo el grupo 352 sugiere medicamento.
    if (cabysPareceMedicamento(nuevoCabys)) {
      setEsMedicamento(true)
      if (!formaFarmaceutica && productoSeleccionado) {
        setFormaFarmaceutica(detectarFormaSugerida(productoSeleccionado.descripcion))
      }
    }
  }

  // Función para manejar el cambio del checkbox de medicamento
  const handleEsMedicamentoChange = (e) => {
    const checked = e.target.checked
    setEsMedicamento(checked)

    // Si se marca como medicamento, sugerir forma automáticamente basada en descripción
    if (checked && productoSeleccionado) {
      const formaSugerida = detectarFormaSugerida(productoSeleccionado.descripcion)
      setFormaFarmaceutica(formaSugerida)
    } else {
      // Si se desmarca, limpiar campos farmacéuticos
      setFormaFarmaceutica('')
      setRegistroSanitario('')
    }
  }

  const categoriaPareceMedicamento = (categoriaId) => categoriaPareceMedicamentoUtil(categoriaId, categorias)

  const handleCategoriaChange = (e) => {
    const nuevaCategoria = e.target.value
    setCategoriaSeleccionada(nuevaCategoria)

    if (categoriaPareceMedicamento(nuevaCategoria)) {
      setEsMedicamento(true)

      if (!formaFarmaceutica && productoSeleccionado) {
        setFormaFarmaceutica(detectarFormaSugerida(productoSeleccionado.descripcion))
      }
    }
  }

  // Valida y guarda un archivo elegido manualmente (desde el input externo o
  // desde "Subir de mi PC" en el modal de sugerencias) — misma validación,
  // mismo resultado (preview + reemplaza cualquier sugerencia ya elegida)
  // sin importar de dónde vino el archivo.
  const procesarArchivoImagen = (file) => {
    if (file.size > 2 * 1024 * 1024) {
      showToast('La imagen debe ser menor a 2MB', 'warning')
      return
    }
    if (!file.type.startsWith('image/')) {
      showToast('Solo se permiten archivos de imagen', 'warning')
      return
    }

    // Un archivo manual reemplaza cualquier sugerencia ya elegida: solo una
    // fuente de imagen va en el formulario.
    setImagenSugeridaUrl(null)
    setImagenSugeridaFallbackUrl(null)
    setArchivoImagenSeleccionado(file)

    const reader = new FileReader()
    reader.onload = (event) => {
      setImagenPreview(event.target.result)
    }
    reader.readAsDataURL(file)
  }

  const handleImagenChange = (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) {
      setImagenPreview(null)
      setArchivoImagenSeleccionado(null)
      return
    }
    procesarArchivoImagen(file)
  }

  // Subir imagen manualmente desde el modal de sugerencias (en vez de elegir
  // una sugerencia buscada). El modal ya se encarga de cerrarse solo.
  const handleSubirArchivoDesdeModal = (file) => {
    procesarArchivoImagen(file)
    setImagenModalOpen(false)
  }

  const removerImagen = () => {
    setImagenPreview(null)
    setImagenSugeridaUrl(null)
    setImagenSugeridaFallbackUrl(null)
    setArchivoImagenSeleccionado(null)
    const input = document.getElementById('imagenProducto')
    if (input) input.value = ''
  }

  const buscarSugerenciasImagen = async (query) => {
    setCargandoImagenSugerencias(true)
    setImagenSugerencias([])
    try {
      const response = await api.get('/alegra/catalog/search-images', { params: { q: query } })
      if (response.data?.success) {
        setImagenSugerencias(conMiniaturasProxeadas(response.data.images))
      }
    } catch (err) {
      console.error('Error buscando sugerencias de imagen:', err)
      showToast('No se pudieron buscar sugerencias de imágenes', 'error')
    } finally {
      setCargandoImagenSugerencias(false)
    }
  }

  const abrirBuscadorImagen = () => {
    const queryInicial = productoSeleccionado?.descripcion || ''
    setImagenBusqueda(queryInicial)
    setImagenModalOpen(true)
    buscarSugerenciasImagen(queryInicial)
  }

  const cerrarBuscadorImagen = () => {
    setImagenModalOpen(false)
  }

  const seleccionarImagenSugerida = (img) => {
    // Una sugerencia reemplaza cualquier archivo elegido manualmente.
    const inputArchivo = document.getElementById('imagenProducto')
    if (inputArchivo) inputArchivo.value = ''

    setImagenSugeridaUrl(img.url)
    setImagenSugeridaFallbackUrl(img.thumbnailOriginal)
    setImagenPreview(img.thumbnail)
    setImagenModalOpen(false)
  }

  const crearProducto = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const categoriaActual = categorias.find(cat => String(cat.id) === String(categoriaSeleccionada))
    // Manda la casilla, no la detección. Antes esto era un OR con las
    // reglas automáticas, así que desmarcarla no servía de nada: el producto
    // se enviaba como medicamento igual.
    const productoEsMedicamento = esMedicamento

    if (categoriaActual) {
      formData.set('categoriaNombre', categoriaActual.name || '')
    }

    formData.set('esMedicamento', productoEsMedicamento ? 'true' : 'false')

    // Si el archivo se eligió desde el modal de sugerencias (no desde el
    // input nativo del formulario), FormData(e.target) no lo tiene — se
    // agrega acá explícitamente. Si vino del input nativo, esto solo
    // reemplaza el mismo archivo que FormData ya había tomado.
    if (archivoImagenSeleccionado) {
      formData.set('imagen', archivoImagenSeleccionado)
    }

    // Si se eligió una sugerencia de imagen (en vez de subir un archivo), se
    // manda la URL para que el backend la descargue y suba después de crear
    // el producto en Alegra (recién ahí existe el alegraId).
    if (imagenSugeridaUrl) {
      formData.set('imageUrl', imagenSugeridaUrl)
      if (imagenSugeridaFallbackUrl) {
        formData.set('fallbackImageUrl', imagenSugeridaFallbackUrl)
      }
    }

    try {
      const response = await api.post('/productos-revision/crear', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      if (response.data.success) {
        const warnings = response.data.warnings || []
        const warningText = warnings.length > 0
          ? `\n\n⚠️ ${warnings.join('\n')}`
          : ''

        showToast(`Producto creado y relacionado exitosamente${warningText}`, 'success')
        setModalCrear(false)
        removerImagen()
        setFormaFarmaceutica('')
        setEsMedicamento(false)
        setRegistroSanitario('')
        setCodigoCabys('')
        // Recargar factura
        loadFactura()
      }
    } catch (err) {
      const apiError = err.response?.data?.error || err.response?.data?.message || err.message
      showToast('Error: ' + apiError, 'error')
    }
  }

  const guardarFactorConversion = async () => {
    if (!productoRelacionado) return

    const cantProv = parseFloat(cantidadProveedor)
    const cantMia = parseFloat(cantidadMia)

    if (cantProv <= 0 || cantMia <= 0) {
      showToast('Las cantidades deben ser mayores a 0', 'warning')
      return
    }

    // Calcular factor con máxima precisión: cantidadMia / cantidadProveedor
    // Ejemplos:
    // - Proveedor: 24, Mío: 12 → factor = 12/24 = 0.5
    // - Proveedor: 1, Mío: 100 → factor = 100/1 = 100
    // - Proveedor: 50, Mío: 1 → factor = 1/50 = 0.02
    const factor = calcularFactorConversion(cantProv, cantMia)

    // Validar que el factor sea un número válido
    if (!isFinite(factor) || isNaN(factor)) {
      showToast('Error calculando el factor. Verifica las cantidades.', 'error')
      return
    }

    try {
      await api.post('/productos-revision/factor-conversion', {
        mapeoId: productoRelacionado.mapeoId,
        factorConversion: factor
      })

      // El factor SIEMPRE se aplica
      const ejemplo1 = cantProv * 2
      const ejemplo1Resultado = (ejemplo1 * factor).toFixed(2)

      showToast(
        `Factor guardado correctamente\n\n` +
        `Configuración:\n` +
        `• Proveedor factura: ${cantProv} = Tú registras: ${cantMia}\n` +
        `• Factor: ${factor.toFixed(6)}\n\n` +
        `Ejemplos:\n` +
        `• Si proveedor factura ${ejemplo1} → Tú verás ${ejemplo1Resultado}\n` +
        `• Si proveedor factura ${cantProv} → Tú verás ${cantMia}\n\n` +
        `Este factor se aplicará automáticamente en futuras facturas de este proveedor.`,
        'success',
        10000
      )

      setModalConversion(false)
      setProductoRelacionado(null)
      loadFactura()
    } catch (err) {
      showToast('Error guardando factor: ' + err.message, 'error')
    }
  }

  const omitirConversion = () => {
    setModalConversion(false)
    setProductoRelacionado(null)
    loadFactura()
  }

  // Cambiar relación de un producto ya relacionado
  const cambiarRelacion = async (producto) => {
    const confirmado = await confirm(`¿Cambiar la relación del producto "${producto.descripcion}"?\n\nEsto eliminará la relación actual y podrás seleccionar un nuevo producto de Alegra.`)
    if (!confirmado) return

    try {
      // Eliminar relación actual
      await api.delete(`/productos-revision/relacion/${producto.id}`)

      // Actualizar estado local
      setProductos(prev => prev.map(p =>
        p.id === producto.id
          ? { ...p, estadoRelacionado: 'SIN_RELACIONAR', productoPropioId: null, mapeoId: null }
          : p
      ))

      // Abrir modal para nueva relación
      abrirModalBusqueda(producto)
    } catch (err) {
      showToast('Error eliminando relación: ' + err.message, 'error')
    }
  }

  // Editar factor de conversión de un producto relacionado
  const editarFactor = async (producto) => {
    if (!producto.productoPropioId) return

    try {
      // Obtener mapeo actual
      const response = await api.get(`/productos-revision/mapeo/${producto.id}`)
      if (response.data.success) {
        const mapeo = response.data.mapeo
        const info = productoInfoPorLinea[producto.id]

        setProductoRelacionado({
          ...producto,
          productoElegido: info || { name: mapeo.productoNombre || 'Producto', reference: mapeo.productoReferencia || '' },
          mapeoId: mapeo.id
        })

        // Configurar valores actuales del factor
        if (mapeo.factorConversion && mapeo.factorConversion !== 1) {
          const { cantidadProveedor: cp, cantidadMia: cm } = inferirCantidadesDesdeFactor(mapeo.factorConversion)
          setCantidadProveedor(cp)
          setCantidadMia(cm)
        } else {
          setCantidadProveedor(1)
          setCantidadMia(1)
        }

        setModalConversion(true)
      }
    } catch (err) {
      showToast('Error cargando información de mapeo: ' + err.message, 'error')
    }
  }

  // Sugerencia, no imposición: al cambiar el CABYS o la categoría se
  // premarca la casilla si parece un medicamento. Si el usuario la desmarca,
  // se queda desmarcada hasta que vuelva a cambiar alguno de los dos.
  useEffect(() => {
    const huella = `${codigoCabys}|${categoriaSeleccionada}`
    if (sugerenciaAplicada.current === huella) return
    sugerenciaAplicada.current = huella

    if (pareceMedicamento(codigoCabys, categoriaSeleccionada, categorias)) {
      setEsMedicamento(true)
    }
  }, [codigoCabys, categoriaSeleccionada, categorias])

  const productosFiltrados = filtrarProductosPorEstado(productos, filtro)
  const stats = calcularStatsProductos(productos)
  const progreso = stats.total > 0 ? Math.round((stats.relacionados / stats.total) * 100) : 0
  const categoriaMedicamentoSeleccionada = categoriaPareceMedicamento(categoriaSeleccionada)
  const mostrarCamposMedicamento = esMedicamento

  return {
    factura,
    loading,
    error,
    filtro,
    setFiltro,
    productosFiltrados,
    stats,
    progreso,
    productoInfoPorLinea,

    modalBusqueda,
    productoSeleccionado,
    busqueda,
    setBusqueda,
    resultadosBusqueda,
    buscando,
    abrirModalBusqueda,
    cerrarModalBusqueda,
    relacionarProducto,

    modalCrear,
    setModalCrear,
    categorias,
    imagenPreview,
    abrirModalCrear,
    handleImagenChange,
    removerImagen,
    crearProducto,

    imagenModalOpen,
    imagenBusqueda,
    setImagenBusqueda,
    imagenSugerencias,
    cargandoImagenSugerencias,
    abrirBuscadorImagen,
    buscarSugerenciasImagen,
    cerrarBuscadorImagen,
    seleccionarImagenSugerida,
    handleSubirArchivoDesdeModal,

    modalConversion,
    setModalConversion,
    productoRelacionado,
    cantidadProveedor,
    setCantidadProveedor,
    cantidadMia,
    setCantidadMia,
    guardarFactorConversion,
    omitirConversion,

    formaFarmaceutica,
    setFormaFarmaceutica,
    registroSanitario,
    setRegistroSanitario,
    categoriaSeleccionada,
    handleCategoriaChange,
    codigoCabys,
    handleCabysChange,
    handleEsMedicamentoChange,
    mostrarCamposMedicamento,
    categoriaMedicamentoSeleccionada,

    cambiarRelacion,
    editarFactor,

    toasts,
    removeToast,
    dialogProps
  }
}

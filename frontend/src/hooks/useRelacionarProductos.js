import { useState, useEffect } from 'react'
import api from '../services/api'
import {
  categoriaPareceMedicamento as categoriaPareceMedicamentoUtil,
  detectarFormaSugerida,
  calcularFactorConversion,
  inferirCantidadesDesdeFactor,
  calcularStatsProductos,
  filtrarProductosPorEstado
} from '../utils/relacionarProductosUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'

/**
 * Estado y lógica de negocio de la relación de productos de una factura:
 * carga de la factura + productos, búsqueda y relación con Alegra, creación
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

  // Modal ajuste de conversión
  const [modalConversion, setModalConversion] = useState(false)
  const [productoRelacionado, setProductoRelacionado] = useState(null)
  const [cantidadProveedor, setCantidadProveedor] = useState(1)
  const [cantidadMia, setCantidadMia] = useState(1)

  // Estado para producto Alegra completo (con más info)
  const [productoAlegraInfo, setProductoAlegraInfo] = useState({})

  // Estado para forma farmacéutica (solo productos farmacéuticos)
  const [formaFarmaceutica, setFormaFarmaceutica] = useState('')
  const [esMedicamento, setEsMedicamento] = useState(false)
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

        // La info de productos Alegra ya viene en la respuesta del backend
        const infoAlegra = {}
        prods.forEach(prod => {
          if (prod.alegraProductInfo) {
            infoAlegra[prod.id] = {
              ...prod.alegraProductInfo,
              factorConversion: prod.mapeo?.factorConversion || 1
            }
          }
        })
        setProductoAlegraInfo(infoAlegra)
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

  const relacionarProducto = async (alegraProducto) => {
    if (!productoSeleccionado) return

    try {
      const response = await api.post('/productos-revision/relacion', {
        productoProveedorId: productoSeleccionado.id,
        alegraItemId: alegraProducto.id,
        facturaId: facturaId
      })

      if (response.data.success) {
        // Actualizar producto en la lista
        setProductos(prev => prev.map(p =>
          p.id === productoSeleccionado.id
            ? { ...p, estadoRelacionado: 'RELACIONADO', alegraItemId: alegraProducto.id }
            : p
        ))
        cerrarModalBusqueda()

        // Abrir modal de conversión
        setProductoRelacionado({
          ...productoSeleccionado,
          alegraProducto: alegraProducto,
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
    loadCategorias()

    // Inicializar CABYS editable
    const cabysInicial = producto.codigoCabys || ''
    setCodigoCabys(cabysInicial)

    // Auto-detectar si empieza por '35'
    const cabysEsMedicamento = cabysInicial.startsWith('35')
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

    // Si el nuevo CABYS empieza por '35', activar automáticamente campos de medicamento
    if (nuevoCabys.startsWith('35')) {
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

  const handleImagenChange = (e) => {
    const file = e.target.files[0]
    if (!file) {
      setImagenPreview(null)
      return
    }

    // Validar tamaño (2MB máximo)
    if (file.size > 2 * 1024 * 1024) {
      showToast('La imagen debe ser menor a 2MB', 'warning')
      e.target.value = ''
      setImagenPreview(null)
      return
    }

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      showToast('Solo se permiten archivos de imagen', 'warning')
      e.target.value = ''
      setImagenPreview(null)
      return
    }

    // Preview
    const reader = new FileReader()
    reader.onload = (event) => {
      setImagenPreview(event.target.result)
    }
    reader.readAsDataURL(file)
  }

  const removerImagen = () => {
    setImagenPreview(null)
    const input = document.getElementById('imagenProducto')
    if (input) input.value = ''
  }

  const crearProducto = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const categoriaActual = categorias.find(cat => String(cat.id) === String(categoriaSeleccionada))
    const productoEsMedicamento = esMedicamento || categoriaPareceMedicamento(categoriaSeleccionada) || (codigoCabys && codigoCabys.startsWith('35'))

    if (categoriaActual) {
      formData.set('categoriaNombre', categoriaActual.name || '')
    }

    formData.set('esMedicamento', productoEsMedicamento ? 'true' : 'false')

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
          ? { ...p, estadoRelacionado: 'SIN_RELACIONAR', alegraItemId: null, mapeoId: null }
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
    if (!producto.alegraItemId) return

    try {
      // Obtener mapeo actual
      const response = await api.get(`/productos-revision/mapeo/${producto.id}`)
      if (response.data.success) {
        const mapeo = response.data.mapeo
        const alegraInfo = productoAlegraInfo[producto.id]

        setProductoRelacionado({
          ...producto,
          alegraProducto: alegraInfo || { name: 'Producto Alegra', reference: producto.alegraItemId },
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

  const productosFiltrados = filtrarProductosPorEstado(productos, filtro)
  const stats = calcularStatsProductos(productos)
  const progreso = stats.total > 0 ? Math.round((stats.relacionados / stats.total) * 100) : 0
  const categoriaMedicamentoSeleccionada = categoriaPareceMedicamento(categoriaSeleccionada)
  const cabysEsMedicamento = codigoCabys && codigoCabys.startsWith('35')
  const mostrarCamposMedicamento = esMedicamento || categoriaMedicamentoSeleccionada || cabysEsMedicamento

  return {
    factura,
    loading,
    error,
    filtro,
    setFiltro,
    productosFiltrados,
    stats,
    progreso,
    productoAlegraInfo,

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

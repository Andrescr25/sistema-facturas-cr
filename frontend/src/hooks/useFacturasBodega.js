import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { alegraService } from '../services/alegraService'
import {
  filtrarPendientesPorFecha,
  getItemIdFromFacturaItem,
  buildDraftForFactura,
  filtrarPorBusqueda,
  calcularDiasYLimite,
  normalizeReferenceValue
} from '../utils/facturasBodegaUtils'

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutos
const CHECK_ANIMATION_DURATION = 600
const STORAGE_KEYS = {
  data: 'facturasBodega:data',
  selected: 'facturasBodega:selectedId',
  tab: 'facturasBodega:tab',
  observaciones: 'facturasBodega:obs',
  filtros: 'facturasBodega:filtros'
}

/**
 * Estado y lógica de negocio del despacho de bodega: listado
 * pendientes/listas con caché en localStorage, selección de factura y
 * armado del borrador de faltantes por producto, y las dos acciones de
 * guardado (factura lista / registrar faltantes). Extraído de
 * FacturasBodega.jsx.
 *
 * Nota: `checkAnimations`/`triggerCheckAnimation`, `completarYVolverAlListado`
 * y `totalFaltantes` existían en el original pero no se usan en ningún lado
 * del render (código muerto preexistente) — se preservan tal cual, sin
 * conectar ni eliminar, siguiendo la regla de cero cambios de comportamiento.
 */
export function useFacturasBodega() {
  const [pendientes, setPendientes] = useState([])
  const [pendientesRaw, setPendientesRaw] = useState([])
  const [listas, setListas] = useState([])
  const [selectedFacturaId, setSelectedFacturaId] = useState(null)
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [faltantesDraft, setFaltantesDraft] = useState({})
  const [observacionesAdicionales, setObservacionesAdicionales] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [ultimaSync, setUltimaSync] = useState(null)
  const [activeTab, setActiveTab] = useState('pendientes')
  const [checkAnimations, setCheckAnimations] = useState({})
  const [successMessage, setSuccessMessage] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [clienteCompletado, setClienteCompletado] = useState(null) // Modal de cliente completado
  const [imagenesPorReferencia, setImagenesPorReferencia] = useState({}) // { referencia: imageUrl }
  const [imagenProductoActivo, setImagenProductoActivo] = useState(null) // item para el modal de foto, o null
  const [filters, setFilters] = useState(() => {
    try {
      const savedFilters = localStorage.getItem(STORAGE_KEYS.filtros)
      if (savedFilters) return JSON.parse(savedFilters)
    } catch (filtersError) {
      console.warn('⚠️ No se pudieron cargar filtros de cache:', filtersError)
    }
    return {
      fechaInicio: '',
      mostrarSinFecha: true
    }
  })
  const hasCacheRef = useRef(false)
  const checkAnimationTimeouts = useRef({})

  useEffect(() => {
    setPendientes(filtrarPendientesPorFecha(pendientesRaw, filters))
  }, [pendientesRaw, filters])

  useEffect(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEYS.data)
      const savedTab = localStorage.getItem(STORAGE_KEYS.tab)
      const savedObservaciones = localStorage.getItem(STORAGE_KEYS.observaciones)
      if (savedTab && (savedTab === 'pendientes' || savedTab === 'listas')) {
        setActiveTab(savedTab)
      }
      if (savedObservaciones) {
        setObservacionesAdicionales(savedObservaciones)
      }
      if (savedData) {
        const parsed = JSON.parse(savedData)
        setPendientesRaw(parsed.pendientes || [])
        setListas(parsed.listas || [])
        setUltimaSync(parsed.ultimaSync || null)
        setLoading(false)
        hasCacheRef.current = true

        const savedSelectedId = localStorage.getItem(STORAGE_KEYS.selected)
        const todas = [...(parsed.pendientes || []), ...(parsed.listas || [])]
        let seleccion = null
        if (savedSelectedId) {
          seleccion = todas.find(
            (factura) => String(factura.alegra_id) === String(savedSelectedId)
          )
        }
        if (seleccion) {
          setSelectedFacturaId(seleccion.alegra_id)
          setFacturaSeleccionada(seleccion)
          setFaltantesDraft(buildDraftForFactura(seleccion))
        }
      }
    } catch (storageError) {
      console.warn('⚠️ No se pudo cargar cache local de facturas:', storageError)
    }
  }, [])

  useEffect(() => {
    return () => {
      Object.values(checkAnimationTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId)
      })
    }
  }, [])

  const fetchFacturas = useCallback(
    async (showLoader = false, forceRefresh = false) => {
      const bloquearInterfaz = showLoader && !hasCacheRef.current
      try {
        if (bloquearInterfaz) {
          setLoading(true)
        } else {
          setRefreshing(true)
        }

        const { dias, limit } = calcularDiasYLimite(filters.fechaInicio)

        const response = await alegraService.getFacturasBodega({
          force_refresh: forceRefresh,
          dias: dias,
          limit: limit
        })
        if (!response.success) {
          throw new Error(response.message || 'No se pudo cargar la información')
        }

        const pendientesApiRaw = response.data?.pendientes || []
        const listasApi = response.data?.listas || []

        const syncTimestamp = response.metadata?.lastSync || new Date().toISOString()
        setPendientesRaw(pendientesApiRaw)
        setListas(listasApi)
        setUltimaSync(syncTimestamp)
        setError(null)

        localStorage.setItem(
          STORAGE_KEYS.data,
          JSON.stringify({
            pendientes: pendientesApiRaw,
            listas: listasApi,
            ultimaSync: syncTimestamp
          })
        )
        hasCacheRef.current = true

        const todas = [...pendientesApiRaw, ...listasApi]
        let seleccion = null

        if (selectedFacturaId) {
          seleccion = todas.find(
            (factura) => String(factura.alegra_id) === String(selectedFacturaId)
          )
        }

        if (seleccion) {
          setFaltantesDraft(buildDraftForFactura(seleccion))
          setFacturaSeleccionada(seleccion)
          localStorage.setItem(STORAGE_KEYS.selected, seleccion.alegra_id)
        } else {
          setFacturaSeleccionada(null)
          setFaltantesDraft({})
          setSelectedFacturaId(null)
          localStorage.removeItem(STORAGE_KEYS.selected)
        }
      } catch (err) {
        console.error('❌ Error cargando facturas de bodega:', err)
        setError(err.message)
      } finally {
        if (bloquearInterfaz) {
          setLoading(false)
        } else {
          setRefreshing(false)
        }
      }
    },
    [selectedFacturaId, filters.fechaInicio]
  )

  const completarYVolverAlListado = useCallback(async () => {
    setSuccessMessage('Factura lista y registrada')
    setObservacionesAdicionales('')
    localStorage.removeItem(STORAGE_KEYS.observaciones)
    setFacturaSeleccionada(null)
    setFaltantesDraft({})
    await fetchFacturas(false)
    setSelectedFacturaId(null)
    localStorage.removeItem(STORAGE_KEYS.selected)
    setTimeout(() => setSuccessMessage(null), 4000)
  }, [fetchFacturas])

  useEffect(() => {
    fetchFacturas(true)

    // Solo auto-refrescar si NO hay una factura seleccionada (para no interrumpir el trabajo)
    const interval = setInterval(() => {
      if (!selectedFacturaId) {
        fetchFacturas(false)
      }
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [fetchFacturas, selectedFacturaId])

  // Scroll hacia arriba cuando se abre el detalle de una factura
  useEffect(() => {
    if (facturaSeleccionada) {
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }
  }, [facturaSeleccionada])

  // Traer las fotos ya asignadas en el catálogo para los productos de la
  // factura activa — las líneas de una factura de Alegra no traen foto
  // propia, a diferencia de los ítems de Auditoría/Excesos.
  useEffect(() => {
    const items = facturaSeleccionada?.items
    if (!items || items.length === 0) {
      setImagenesPorReferencia({})
      return
    }

    const referencias = Array.from(
      new Set(
        items
          .map((item) => normalizeReferenceValue(item?.referencia ?? item?.reference ?? ''))
          .filter(Boolean)
      )
    )

    if (referencias.length === 0) {
      setImagenesPorReferencia({})
      return
    }

    alegraService.getImagenesPorReferencia(referencias).then((result) => {
      if (result.success) {
        const mapa = {}
        result.data.forEach((row) => {
          if (row.imageUrl) mapa[row.referencia] = row.imageUrl
        })
        setImagenesPorReferencia(mapa)
      }
    })
  }, [facturaSeleccionada])

  const handleVerImagenProducto = (item) => {
    const referencia = normalizeReferenceValue(item?.referencia ?? item?.reference ?? '')
    setImagenProductoActivo({
      nombre_producto: item?.nombre || item?.name || 'Producto',
      referencia: referencia || 'N/A',
      image_url: imagenesPorReferencia[referencia] || null
    })
  }
  const handleCerrarImagenProducto = () => setImagenProductoActivo(null)

  const handleSeleccionarFactura = async (factura) => {
    setFacturaSeleccionada(factura)
    setSelectedFacturaId(factura.alegra_id)
    localStorage.setItem(STORAGE_KEYS.selected, factura.alegra_id)

    // Si la factura tiene estadosProductos guardados (viene de listas), usarlos directamente
    if (factura.estadosProductos && Object.keys(factura.estadosProductos).length > 0) {
      setFaltantesDraft(factura.estadosProductos)
      setObservacionesAdicionales('')
      localStorage.removeItem(STORAGE_KEYS.observaciones)
      return
    }

    // Inicializar con datos actuales mientras carga el detalle completo
    setFaltantesDraft(buildDraftForFactura(factura))
    setObservacionesAdicionales('')
    localStorage.removeItem(STORAGE_KEYS.observaciones)

    // Cargar detalle completo (incluye estados guardados del backend)
    try {
      const detalle = await alegraService.getFacturaDetalle(factura.alegra_id)
      const items = detalle?.data?.items || detalle?.items || []
      if (items.length > 0) {
        const nuevoDraft = {}
        items.forEach((item, index) => {
          const key = getItemIdFromFacturaItem(item) || `item-${index}`
          // El backend ya fusiona tipo_faltante/cantidad_faltante desde la tabla faltantes.
          // Mapeamos directamente: 'ninguno' → 'ninguno', 'completo' → 'completo', etc.
          // Solo dejamos null si el backend no tiene nada guardado (tipo_faltante === null).
          const tipoBackend = item.tipo_faltante || null

          const referenciaReal = normalizeReferenceValue(item.referencia || item.reference) || null

          nuevoDraft[key] = {
            key,
            itemId: referenciaReal || item.codigo_alegra || item.alegra_id || item.id, // Solo para depurar, no mandar al backend
            nombre: item.nombre || item.name || item.description || 'Producto sin nombre',
            referencia: referenciaReal || 'N/A',
            referenciaReal,
            alegra_id: item.alegra_id || item.id || null,
            cantidadFactura: Number(item.cantidad ?? item.quantity ?? 0),
            tipo: tipoBackend,
            cantidadFaltante: Number(item.cantidad_faltante || 0),
            observaciones: item.observaciones || ''
          }
        })
        setFaltantesDraft(nuevoDraft)
      }
    } catch (detalleError) {
      console.error('Error cargando detalle de factura:', detalleError)
    }
  }

  const actualizarEntradaFaltante = (key, updater) => {
    setFaltantesDraft((prev) => {
      if (!prev[key]) return prev
      return {
        ...prev,
        [key]: {
          ...prev[key],
          ...updater(prev[key])
        }
      }
    })
  }

  const triggerCheckAnimation = (key) => {
    if (checkAnimationTimeouts.current[key]) {
      clearTimeout(checkAnimationTimeouts.current[key])
    }
    setCheckAnimations((prev) => ({ ...prev, [key]: true }))
    checkAnimationTimeouts.current[key] = setTimeout(() => {
      setCheckAnimations((prev) => {
        const updated = { ...prev }
        delete updated[key]
        return updated
      })
      delete checkAnimationTimeouts.current[key]
    }, CHECK_ANIMATION_DURATION)
  }

  const marcarModoFaltante = (key, modo, cantidadFactura) => {
    if (modo === 'ninguno') {
      actualizarEntradaFaltante(key, () => ({ tipo: 'ninguno', cantidadFaltante: 0 }))
      triggerCheckAnimation(key)
    } else if (modo === 'total') {
      actualizarEntradaFaltante(key, () => ({
        tipo: 'total',
        cantidadFaltante: cantidadFactura
      }))
    }
  }

  const actualizarCantidadFaltante = (key, valor, cantidadFactura) => {
    const cantidad = Math.max(0, Math.min(cantidadFactura, Number(valor) || 0))
    actualizarEntradaFaltante(key, () => ({
      tipo: cantidad === 0 ? 'ninguno' : cantidad === cantidadFactura ? 'total' : 'parcial',
      cantidadFaltante: cantidad
    }))
  }

  const actualizarObservacionItem = (key, texto) => {
    actualizarEntradaFaltante(key, () => ({
      observaciones: texto
    }))
  }

  const faltantesSeleccionados = useMemo(
    () =>
      Object.values(faltantesDraft).filter(
        (item) => item.tipo !== 'ninguno' && item.cantidadFaltante > 0
      ),
    [faltantesDraft]
  )

  const totalFaltantes = useMemo(
    () => faltantesSeleccionados.reduce((sum, item) => sum + item.cantidadFaltante, 0),
    [faltantesSeleccionados]
  )

  const accionPrincipalLabel = guardando
    ? 'Guardando...'
    : facturaSeleccionada?.estado_bodega === 'procesado'
      ? '💾 Guardar Modificación'
      : faltantesSeleccionados.length > 0
        ? 'Registrar faltantes'
        : 'Factura lista'

  const marcarFacturaLista = async () => {
    if (!facturaSeleccionada) return
    try {
      setGuardando(true)

      // Guardar estados de TODOS los productos (todos 'completo') para que persistan
      if (Object.keys(faltantesDraft).length > 0) {
        const todosLosProductos = Object.values(faltantesDraft)
        const payload = todosLosProductos.map((item) => ({
          referencia: item.referenciaReal || null,
          alegra_item_id: item.alegra_id || null,
          nombre_producto: item.nombre,
          cantidad_faltante: item.cantidadFaltante || 0,
          tipo_faltante: (!item.tipo || item.tipo === 'ninguno') ? 'completo' : (item.tipo === 'total' ? 'total' : 'parcial'),
          observaciones: item.observaciones || ''
        }))

        await alegraService.registrarFaltantes(
          facturaSeleccionada.alegra_id,
          payload,
          'Bodega',
          observacionesAdicionales
        )
      }

      // Pasar true en enviarAImpresion para enviar a centro de impresión
      await alegraService.actualizarEstadoFacturaBodega(
        facturaSeleccionada.alegra_id,
        'procesado',
        observacionesAdicionales.trim() || null,
        true // enviar_a_impresion = true (sin faltantes → va a centro de impresión)
      )

      // NO llamar a completarYVolverAlListado para no interrumpir el trabajo
      // En su lugar, actualizar solo el estado local
      setSuccessMessage('✅ Factura lista y enviada a impresión')

      // Mover la factura de pendientes a listas localmente
      // Guardar copia de los estados de productos para que persistan al abrir desde listas
      const facturaActualizada = {
        ...facturaSeleccionada,
        estado_bodega: 'procesado',
        estadosProductos: { ...faltantesDraft } // Copia de los estados
      }
      setPendientesRaw((prev) => prev.filter((f) => f.alegra_id !== facturaSeleccionada.alegra_id))
      setListas((prev) => {
        // Si ya existe en listas (edición), actualizarla. Si no, agregarla al inicio.
        const existe = prev.some(f => f.alegra_id === facturaActualizada.alegra_id)
        if (existe) {
          return prev.map(f => f.alegra_id === facturaActualizada.alegra_id ? facturaActualizada : f)
        }
        return [facturaActualizada, ...prev]
      })

      // Limpiar formulario
      setObservacionesAdicionales('')
      localStorage.removeItem(STORAGE_KEYS.observaciones)
      setFacturaSeleccionada(null)
      setFaltantesDraft({})
      setSelectedFacturaId(null)
      localStorage.removeItem(STORAGE_KEYS.selected)

      setTimeout(() => setSuccessMessage(null), 3000)

      // Mostrar modal con nombre del cliente
      setClienteCompletado({
        nombre: facturaSeleccionada.cliente_nombre || facturaSeleccionada.client?.name || 'Cliente',
        tipo: 'listo'
      })
    } catch (err) {
      console.error('❌ Error marcando factura como lista:', err)
      setError(`Error marcando factura como lista: ${err.message}`)
    } finally {
      setGuardando(false)
    }
  }

  const handleRegistrarFaltantes = async () => {
    if (!facturaSeleccionada) return

    if (faltantesSeleccionados.length === 0) {
      await marcarFacturaLista()
      return
    }

    try {
      setGuardando(true)

      // Enviar TODOS los productos con sus estados (para persistir 'completo' también)
      const todosLosProductos = Object.values(faltantesDraft)
      const payload = todosLosProductos.map((item) => ({
        referencia: item.referenciaReal || null,
        alegra_item_id: item.alegra_id || null,
        nombre_producto: item.nombre,
        cantidad_faltante: item.cantidadFaltante || 0,
        tipo_faltante: (!item.tipo || item.tipo === 'ninguno') ? 'completo' : (item.tipo === 'total' ? 'total' : 'parcial'),
        observaciones: item.observaciones || ''
      }))

      await alegraService.registrarFaltantes(
        facturaSeleccionada.alegra_id,
        payload,
        'Bodega',
        observacionesAdicionales
      )
      await alegraService.actualizarEstadoFacturaBodega(
        facturaSeleccionada.alegra_id,
        'procesado',
        observacionesAdicionales.trim() || null
      )

      // NO llamar a completarYVolverAlListado para no interrumpir el trabajo
      // En su lugar, actualizar solo el estado local
      setSuccessMessage(`✅ ${faltantesSeleccionados.length} faltante(s) registrado(s)`)

      // Mover la factura de pendientes a listas localmente
      // Guardar copia de los estados de productos para que persistan al abrir desde listas
      const facturaActualizada = {
        ...facturaSeleccionada,
        estado_bodega: 'procesado',
        faltantes_pendientes: faltantesSeleccionados.length,
        estadosProductos: { ...faltantesDraft } // Copia de los estados
      }
      setPendientesRaw((prev) => prev.filter((f) => f.alegra_id !== facturaSeleccionada.alegra_id))
      setListas((prev) => {
        // Si ya existe en listas (edición), actualizarla. Si no, agregarla al inicio.
        const existe = prev.some(f => f.alegra_id === facturaActualizada.alegra_id)
        if (existe) {
          return prev.map(f => f.alegra_id === facturaActualizada.alegra_id ? facturaActualizada : f)
        }
        return [facturaActualizada, ...prev]
      })

      // Limpiar formulario
      setObservacionesAdicionales('')
      localStorage.removeItem(STORAGE_KEYS.observaciones)
      setFacturaSeleccionada(null)
      setFaltantesDraft({})
      setSelectedFacturaId(null)
      localStorage.removeItem(STORAGE_KEYS.selected)

      setTimeout(() => setSuccessMessage(null), 3000)

      // Mostrar modal con nombre del cliente
      setClienteCompletado({
        nombre: facturaSeleccionada.cliente_nombre || facturaSeleccionada.client?.name || 'Cliente',
        tipo: 'faltantes',
        cantidad: faltantesSeleccionados.length
      })
    } catch (err) {
      console.error('❌ Error registrando faltantes:', err)
      setError(`Error registrando faltantes: ${err.message}`)
    } finally {
      setGuardando(false)
    }
  }

  const facturasMostradas = useMemo(() => {
    const lista = activeTab === 'pendientes' ? pendientes : listas
    return filtrarPorBusqueda(lista, searchQuery)
  }, [activeTab, pendientes, listas, searchQuery])

  const handleFilterChange = async (field, value) => {
    const updated = { ...filters, [field]: value }
    setFilters(updated)
    localStorage.setItem(STORAGE_KEYS.filtros, JSON.stringify(updated))

    // Si cambia la fecha de inicio, recargar facturas con el nuevo rango
    if (field === 'fechaInicio') {
      setRefreshing(true)
      try {
        const { dias: diasNecesarios, limit } = calcularDiasYLimite(value)

        const response = await alegraService.getFacturasBodega({
          force_refresh: true,
          dias: diasNecesarios,
          limit: limit
        })

        if (response.success) {
          const pendientesApiRaw = response.data?.pendientes || []
          const listasApi = response.data?.listas || []
          const syncTimestamp = response.metadata?.lastSync || new Date().toISOString()

          setPendientesRaw(pendientesApiRaw)
          setListas(listasApi)
          setUltimaSync(syncTimestamp)

          localStorage.setItem(
            STORAGE_KEYS.data,
            JSON.stringify({
              pendientes: pendientesApiRaw,
              listas: listasApi,
              ultimaSync: syncTimestamp
            })
          )
        }
      } catch (err) {
        console.error('Error recargando facturas:', err)
        setError(err.message)
      } finally {
        setRefreshing(false)
      }
    }
  }

  const clearFilters = () => {
    const resetFilters = {
      fechaInicio: '',
      mostrarSinFecha: true
    }
    setFilters(resetFilters)
    localStorage.setItem(STORAGE_KEYS.filtros, JSON.stringify(resetFilters))
  }

  const handleSetActiveTab = (tab) => {
    setActiveTab(tab)
    localStorage.setItem(STORAGE_KEYS.tab, tab)
  }

  const cancelarDespacho = () => {
    setFacturaSeleccionada(null)
    setSelectedFacturaId(null)
    setFaltantesDraft({})
    localStorage.removeItem(STORAGE_KEYS.selected)
  }

  const checkedItemsCount = useMemo(() => {
    if (!facturaSeleccionada || !facturaSeleccionada.items) return 0
    return facturaSeleccionada.items.filter((item, index) => {
      const key = getItemIdFromFacturaItem(item) || `item-${index}`
      const draft = faltantesDraft[key]
      return draft && draft.tipo !== null && draft.tipo !== undefined
    }).length
  }, [facturaSeleccionada, faltantesDraft])

  const progressPercent = useMemo(() => {
    if (!facturaSeleccionada || !facturaSeleccionada.items || facturaSeleccionada.items.length === 0) return 0
    return Math.round((checkedItemsCount / facturaSeleccionada.items.length) * 100)
  }, [facturaSeleccionada, checkedItemsCount])

  const allItemsChecked = useMemo(() => {
    if (!facturaSeleccionada || !facturaSeleccionada.items || facturaSeleccionada.items.length === 0) return false
    return checkedItemsCount === facturaSeleccionada.items.length
  }, [facturaSeleccionada, checkedItemsCount])

  return {
    pendientes,
    listas,
    facturaSeleccionada,
    faltantesDraft,
    observacionesAdicionales,
    setObservacionesAdicionales,
    loading,
    refreshing,
    guardando,
    error,
    ultimaSync,
    activeTab,
    setActiveTab: handleSetActiveTab,
    successMessage,
    setSuccessMessage,
    searchQuery,
    setSearchQuery,
    clienteCompletado,
    setClienteCompletado,
    filters,
    handleFilterChange,
    clearFilters,

    imagenesPorReferencia,
    imagenProductoActivo,
    handleVerImagenProducto,
    handleCerrarImagenProducto,

    handleSeleccionarFactura,
    cancelarDespacho,
    marcarModoFaltante,
    actualizarCantidadFaltante,
    actualizarObservacionItem,

    faltantesSeleccionados,
    accionPrincipalLabel,
    handleRegistrarFaltantes,

    facturasMostradas,
    checkedItemsCount,
    progressPercent,
    allItemsChecked
  }
}

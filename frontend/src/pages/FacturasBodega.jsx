import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardList,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  FileText,
  Package,
  User,
  CalendarDays,
  Truck,
  Inbox,
  Search,
  Sparkles,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  Play,
  Minus,
  Plus,
  Calendar,
  Printer
} from 'lucide-react'
import { alegraService } from '../services/alegraService'

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutos
const CHECK_ANIMATION_DURATION = 600
const STORAGE_KEYS = {
  data: 'facturasBodega:data',
  selected: 'facturasBodega:selectedId',
  tab: 'facturasBodega:tab',
  observaciones: 'facturasBodega:obs',
  filtros: 'facturasBodega:filtros'
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(Number(value || 0))

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('es-CR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
    : 'Fecha no disponible'

const normalizeReferenceValue = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString()
  if (typeof value === 'object' && value !== null) {
    if (typeof value.reference === 'string' && value.reference.trim()) return value.reference.trim()
    if (typeof value.code === 'string' && value.code.trim()) return value.code.trim()
    if (typeof value.value === 'string' && value.value.trim()) return value.value.trim()
  }
  return ''
}

const filtrarPendientesPorFecha = (lista = [], filtros = {}) => {
  if (!Array.isArray(lista) || lista.length === 0) return []
  const {
    fechaInicio = '',
    mostrarSinFecha = true
  } = filtros || {}

  if (!fechaInicio && mostrarSinFecha) {
    return lista
  }

  return lista.filter((factura) => {
    if (!factura.fecha_emision) {
      return Boolean(mostrarSinFecha)
    }

    const fechaFactura = new Date(factura.fecha_emision)
    if (Number.isNaN(fechaFactura.getTime())) {
      return Boolean(mostrarSinFecha)
    }

    if (fechaInicio) {
      const inicio = new Date(fechaInicio)
      inicio.setHours(0, 0, 0, 0)
      if (fechaFactura < inicio) return false
    }

    // No filtramos por fecha fin - mostramos desde fechaInicio hasta hoy
    return true
  })
}

const getItemIdFromFacturaItem = (item) => {
  // ✅ Usar prefijos para evitar confusión entre referencia "100" y alegra_id 100
  const referencia = normalizeReferenceValue(
    item?.referencia ?? item?.reference ?? ''
  )
  if (referencia) return `REF-${referencia}`

  const codigoAlegra = item?.codigo_alegra ? item.codigo_alegra.toString() : ''
  if (codigoAlegra) return `ALG-${codigoAlegra}`

  const alegraId = item?.alegra_id ? item.alegra_id.toString() : ''
  if (alegraId) return `ALG-${alegraId}`

  const fallback = item?.id ? item.id.toString() : ''
  return fallback ? `ID-${fallback}` : ''
}

const buildDraftForFactura = (factura) => {
  if (!factura || !Array.isArray(factura.items)) return {}
  const draft = {}
  factura.items.forEach((item, index) => {
    const key = getItemIdFromFacturaItem(item) || `item-${index}`

    // ✅ Extraer el valor sin prefijo para enviar al backend
    const referencia = normalizeReferenceValue(item?.referencia ?? item?.reference ?? '')
    const rawItemId = referencia ||
      item?.codigo_alegra ||
      item?.alegra_id ||
      item?.id ||
      null

    draft[key] = {
      key,
      itemId: rawItemId, // ← Sin prefijo para enviar al backend
      nombre: item.nombre || item.name || item.description || 'Producto sin nombre',
      // ✅ Mostrar referencia real o codigo_alegra como fallback (NO codigo_producto/CABYS)
      referencia:
        normalizeReferenceValue(
          item?.referencia ?? item?.reference ?? ''
        ) || item?.codigo_alegra || item?.alegra_id || 'N/A',
      alegra_id: item.alegra_id || item.id,
      cantidadFactura: Number(item?.cantidad ?? item?.quantity ?? 0),
      tipo: null, // ✅ Sin marcar por defecto en facturas pendientes
      cantidadFaltante: 0,
      observaciones: ''
    }
  })
  return draft
}

export default function FacturasBodega() {
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

        // Calcular días necesarios basándose en el filtro de fecha de inicio
        let dias = 30; // Por defecto 30 días
        let limit = 40; // Límite por defecto

        if (filters.fechaInicio) {
          const fechaInicio = new Date(filters.fechaInicio);
          const hoy = new Date();
          const diferenciaDias = Math.ceil((hoy - fechaInicio) / (1000 * 60 * 60 * 24));
          dias = Math.min(Math.max(diferenciaDias + 1, 30), 365); // Mínimo 30, máximo 365 días
          limit = 120; // Aumentar límite cuando hay filtro de fecha
        }

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

  const handleSeleccionarFactura = async (factura) => {
    setFacturaSeleccionada(factura)
    setSelectedFacturaId(factura.alegra_id)
    localStorage.setItem(STORAGE_KEYS.selected, factura.alegra_id)

    // 🔍 DIAGNÓSTICO FRONTEND
    console.log('🔍 DIAGNÓSTICO handleSeleccionarFactura:', {
      alegra_id: factura.alegra_id,
      estado_bodega: factura.estado_bodega,
      tieneEstadosProductos: factura.estadosProductos ? Object.keys(factura.estadosProductos).length : 0
    })

    // 🆕 Si la factura tiene estadosProductos guardados (viene de listas), usarlos directamente
    if (factura.estadosProductos && Object.keys(factura.estadosProductos).length > 0) {
      console.log('📋 Usando estados guardados localmente:', Object.keys(factura.estadosProductos).length, 'items')
      // 🔍 Mostrar detalle de lo que se va a usar
      Object.entries(factura.estadosProductos).forEach(([key, item]) => {
        console.log(`   - ${item.referencia}: tipo="${item.tipo}", cantidad=${item.cantidadFaltante}`)
      })
      setFaltantesDraft(factura.estadosProductos)
      setObservacionesAdicionales('')
      localStorage.removeItem(STORAGE_KEYS.observaciones)
      return
    }

    // Inicializar con datos actuales mientras carga el detalle completo
    console.log('⏳ Cargando detalle desde backend...')
    setFaltantesDraft(buildDraftForFactura(factura))
    setObservacionesAdicionales('')
    localStorage.removeItem(STORAGE_KEYS.observaciones)

    // Cargar detalle completo (incluye observaciones guardadas del backend)
    try {
      const detalle = await alegraService.getFacturaDetalle(factura.alegra_id);
      console.log('✅ Detalle recibido del backend:', detalle)
      // ✅ FIX: Acceder a detalle.data.items (no detalle.items)
      const items = detalle?.data?.items || detalle?.items || [];
      console.log('📦 Items extraídos:', items.length)
      if (items.length > 0) {
        // Reconstruir draft con los datos detallados que incluyen persistencia
        const nuevoDraft = {};
        items.forEach((item, index) => {
          const key = getItemIdFromFacturaItem(item) || `item-${index}`;
          nuevoDraft[key] = {
            key,
            itemId: normalizeReferenceValue(item.referencia || item.reference) || item.codigo_alegra || item.alegra_id || item.id, // ✅ FIX: Usar valor raw sin prefijo
            nombre: item.nombre || item.name || item.description || 'Producto sin nombre',
            referencia: normalizeReferenceValue(item.referencia || item.reference) || 'N/A',
            cantidadFactura: Number(item.cantidad ?? item.quantity ?? 0),
            tipo: (item.tipo_faltante === 'ninguno' && Number(item.cantidad_faltante || 0) === 0)
              ? null
              : (item.tipo_faltante || null),
            cantidadFaltante: Number(item.cantidad_faltante || 0),
            observaciones: item.observaciones || ''
          };
          // 🔍 Log cada item
          console.log(`   - ${nuevoDraft[key].referencia}: tipo="${nuevoDraft[key].tipo}", cantidad=${nuevoDraft[key].cantidadFaltante}`)
        });
        setFaltantesDraft(nuevoDraft);
      }
    } catch (error) {
      console.error('Error cargando detalle de factura:', error);
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

      // 🆕 Guardar estados de TODOS los productos (todos 'completo') para que persistan
      if (Object.keys(faltantesDraft).length > 0) {
        const todosLosProductos = Object.values(faltantesDraft)
        const payload = todosLosProductos.map((item) => ({
          item_id: item.itemId,
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

      // ✅ NO llamar a completarYVolverAlListado para no interrumpir el trabajo
      // En su lugar, actualizar solo el estado local
      setSuccessMessage('✅ Factura lista y enviada a impresión')

      // Mover la factura de pendientes a listas localmente
      // 🆕 Guardar copia de los estados de productos para que persistan al abrir desde listas
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
      alert(`Error marcando factura como lista: ${err.message}`)
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
        item_id: item.itemId,
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

      // ✅ NO llamar a completarYVolverAlListado para no interrumpir el trabajo
      // En su lugar, actualizar solo el estado local
      setSuccessMessage(`✅ ${faltantesSeleccionados.length} faltante(s) registrado(s)`)

      // Mover la factura de pendientes a listas localmente
      // 🆕 Guardar copia de los estados de productos para que persistan al abrir desde listas
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
      alert(`Error registrando faltantes: ${err.message}`)
    } finally {
      setGuardando(false)
    }
  }

  const filtrarPorBusqueda = (lista) => {
    if (!searchQuery.trim()) return lista

    const query = searchQuery.toLowerCase().trim()
    return lista.filter((factura) => {
      const numeroFactura = (factura.numero_completo || factura.numero_factura || '').toLowerCase()
      const clienteNombre = (factura.cliente_nombre || '').toLowerCase()
      const total = (factura.total || 0).toString()

      return numeroFactura.includes(query) ||
        clienteNombre.includes(query) ||
        total.includes(query)
    })
  }

  const facturasMostradas = useMemo(() => {
    const lista = activeTab === 'pendientes' ? pendientes : listas
    return filtrarPorBusqueda(lista)
  }, [activeTab, pendientes, listas, searchQuery])

  const handleFilterChange = async (field, value) => {
    const updated = { ...filters, [field]: value }
    setFilters(updated)
    localStorage.setItem(STORAGE_KEYS.filtros, JSON.stringify(updated))

    // Si cambia la fecha de inicio, recargar facturas con el nuevo rango
    if (field === 'fechaInicio') {
      setRefreshing(true)
      try {
        let diasNecesarios = 30
        if (value) {
          const fechaInicio = new Date(value)
          const hoy = new Date()
          const diferenciaDias = Math.ceil((hoy - fechaInicio) / (1000 * 60 * 60 * 24))
          diasNecesarios = Math.min(Math.max(diferenciaDias + 1, 30), 365)
        }

        // Si hay un filtro de fecha específico, aumentar el límite de facturas
        const limit = value ? 120 : 40; // Máximo permitido cuando hay filtro, normal sin filtro

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

  const renderHeader = () => (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b pb-4 mb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="text-blue-600" size={24} />
          Despacho en Bodega
        </h1>
        <p className="text-sm text-gray-500">Registra de manera ágil los pedidos que salen de bodega.</p>
      </div>
      <div className="flex items-center gap-3">
        {refreshing && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600 font-medium animate-pulse">
            <RefreshCw size={12} className="animate-spin" />
            Sincronizando...
          </span>
        )}
        <div className="text-xs text-gray-400">
          Sync: {ultimaSync
            ? new Date(ultimaSync).toLocaleTimeString('es-CR', {
              hour: '2-digit',
              minute: '2-digit'
            })
            : '—'}
        </div>
      </div>
    </div>
  )

  const renderListado = () => (
    <div className="space-y-4">
      {/* Selector de pestañas móvil superior */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl">
        {['pendientes', 'listas'].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab)
              localStorage.setItem(STORAGE_KEYS.tab, tab)
            }}
            className={`flex-1 py-3 text-center text-sm font-semibold rounded-xl transition-all duration-200 ${activeTab === tab
              ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/5'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            {tab === 'pendientes' ? 'Por Preparar' : 'Historial Listas'}
          </button>
        ))}
      </div>

      {/* Buscador táctil */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Buscar factura o cliente..."
          className="input pl-10 w-full rounded-2xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-base py-3"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs hover:bg-gray-200"
          >
            ✕
          </button>
        )}
      </div>

      {activeTab === 'pendientes' && (
        <details className="group bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <summary className="flex items-center justify-between p-3.5 text-sm font-medium text-gray-700 cursor-pointer select-none hover:bg-gray-50 transition">
            <span className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-500" /> Rango de Fechas
            </span>
            <span className="text-xs text-gray-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-3.5 border-t border-gray-50 space-y-3 bg-gray-50/50">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ver facturas desde:</label>
              <input
                type="date"
                className="input w-full rounded-xl border-gray-200 text-sm"
                value={filters.fechaInicio}
                onChange={(e) => handleFilterChange('fechaInicio', e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="inline-flex items-center text-xs text-gray-600 gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-blue-600 focus:ring-blue-500"
                  checked={filters.mostrarSinFecha}
                  onChange={(e) => handleFilterChange('mostrarSinFecha', e.target.checked)}
                />
                Incluir facturas sin fecha
              </label>
              <button
                type="button"
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                onClick={clearFilters}
              >
                Resetear Filtros
              </button>
            </div>
          </div>
        </details>
      )}

      {/* Listado de tarjetas de facturas */}
      {facturasMostradas.length === 0 ? (
        <div className="text-center py-12 bg-white border border-dashed rounded-3xl p-6 text-gray-400">
          {activeTab === 'pendientes' ? (
            <div className="space-y-2">
              <CheckCircle className="mx-auto text-green-500" size={36} />
              <p className="font-semibold text-gray-700">¡Todo al día en bodega!</p>
              <p className="text-xs text-gray-400">No hay facturas pendientes en la cola.</p>
            </div>
          ) : (
            <p className="text-sm">No hay facturas listas registradas.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {facturasMostradas.map((factura) => (
            <div
              key={`${activeTab}-${factura.alegra_id}`}
              className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4 hover:border-blue-200 transition"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                      # {factura.numero_completo || factura.numero_factura}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(factura.fecha_emision)}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 line-clamp-1">{factura.cliente_nombre}</h3>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-gray-800">{formatCurrency(factura.total)}</p>
                  <p className="text-xs text-gray-400">
                    {factura.items ? factura.items.length : 0} ítems
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-50">
                {factura.estado_bodega === 'procesado' ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 font-semibold bg-green-50 px-3 py-1.5 rounded-xl">
                    <CheckCircle size={14} />
                    Completado
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold bg-amber-50 px-3 py-1.5 rounded-xl">
                    <Package size={14} />
                    Pendiente
                  </div>
                )}

                <button
                  onClick={() => handleSeleccionarFactura(factura)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.97] active:shadow-none ${factura.estado_bodega === 'procesado'
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-100'
                    }`}
                >
                  {factura.estado_bodega === 'procesado' ? (
                    <>
                      <Search size={14} />
                      Ver Detalle
                    </>
                  ) : (
                    <>
                      <ArrowRight size={14} />
                      Iniciar Despacho
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderDetalle = () => (
    <div className="space-y-4 pb-24">
      {/* Encabezado Fijo del Despacho Activo */}
      <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <button
            className="text-gray-500 flex items-center gap-1.5 text-sm hover:text-gray-800 font-semibold"
            onClick={() => {
              setFacturaSeleccionada(null)
              setSelectedFacturaId(null)
              setFaltantesDraft({})
              localStorage.removeItem(STORAGE_KEYS.selected)
            }}
          >
            ← Cancelar y salir
          </button>
          <span className="text-xs text-gray-400">Despacho Activo</span>
        </div>

        <div className="flex items-start justify-between border-t pt-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 line-clamp-1">{facturaSeleccionada.cliente_nombre}</h2>
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <CalendarDays size={12} />
              Emitido: {formatDate(facturaSeleccionada.fecha_emision)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-base font-bold text-blue-600">#{facturaSeleccionada.numero_completo || facturaSeleccionada.numero_factura}</p>
            <p className="text-xs text-gray-400">Total: {formatCurrency(facturaSeleccionada.total)}</p>
          </div>
        </div>

        {/* Barra de Progreso del Picking */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center text-xs font-semibold">
            <span className="text-gray-500">Progreso del empaque:</span>
            <span className={progressPercent === 100 ? 'text-green-600' : 'text-blue-600'}>
              {checkedItemsCount} de {facturaSeleccionada.items?.length || 0} productos ({progressPercent}%)
            </span>
          </div>
          <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${progressPercent === 100 ? 'bg-green-500 shadow-sm shadow-green-200' : 'bg-blue-600'
                }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Lista de productos para verificar */}
      <div className="space-y-3">
        {facturaSeleccionada.items?.map((item, index) => {
          const key = getItemIdFromFacturaItem(item) || `item-${index}`
          const draft = faltantesDraft[key]
          const cantidadFactura = Number(item?.cantidad ?? item?.quantity ?? 0)

          const esCompleto = draft?.tipo === 'ninguno' || draft?.tipo === 'completo'
          const esTotal = draft?.tipo === 'total'
          const esParcial = draft?.tipo === 'parcial'

          return (
            <div
              key={`${key}-${index}`}
              className={`bg-white border rounded-3xl p-5 shadow-sm transition space-y-4 ${esCompleto
                ? 'border-green-100 bg-green-50/20'
                : esTotal
                  ? 'border-orange-100 bg-orange-50/10'
                  : esParcial
                    ? 'border-blue-100 bg-blue-50/10'
                    : 'border-gray-100'
                }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <h4 className="text-base font-bold text-gray-900 leading-tight">
                    {item.nombre || item.name}
                  </h4>
                  <p className="text-sm font-semibold text-gray-600">
                    Cantidad a despachar: {cantidadFactura}
                  </p>
                  <p className="text-xs text-gray-400">Referencia: {draft?.referencia || 'N/A'}</p>
                </div>
              </div>

              {/* Botones de Selección Rápidos */}
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => marcarModoFaltante(key, 'ninguno', cantidadFactura)}
                    className={`py-3 px-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 border transition duration-150 active:scale-[0.96] ${esCompleto
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <Check size={14} />
                    Completo
                  </button>

                  <button
                    type="button"
                    onClick={() => marcarModoFaltante(key, 'total', cantidadFactura)}
                    className={`py-3 px-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 border transition duration-150 active:scale-[0.96] ${esTotal
                      ? 'bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-100'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <X size={14} />
                    Faltó Todo
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      actualizarCantidadFaltante(key, esParcial ? 0 : 1, cantidadFactura)
                    }}
                    className={`py-3 px-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 border transition duration-150 active:scale-[0.96] ${esParcial
                      ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-100'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <AlertTriangle size={14} />
                    Parcial
                  </button>
                </div>

                {/* Subpanel de Ajuste de Faltantes Parciales */}
                {esParcial && (
                  <div className="flex items-center justify-between bg-blue-50/50 border border-blue-100 rounded-2xl p-3 animate-fade-in">
                    <span className="text-sm font-bold text-blue-700 flex items-center gap-1">
                      <AlertTriangle size={14} className="text-blue-600" />
                      Unidades Faltantes:
                    </span>

                    <div className="flex items-center gap-3">
                      {/* Botón menos */}
                      <button
                        type="button"
                        onClick={() => {
                          const currentVal = draft?.cantidadFaltante || 0
                          actualizarCantidadFaltante(key, Math.max(1, currentVal - 1), cantidadFactura)
                        }}
                        className="w-10 h-10 rounded-xl bg-white border border-blue-200 flex items-center justify-center text-lg font-black text-blue-700 shadow-sm active:scale-95 transition"
                      >
                        <Minus size={14} />
                      </button>

                      {/* Input de cantidad */}
                      <span className="text-xl font-extrabold text-blue-900 w-8 text-center">
                        {draft?.cantidadFaltante ?? 1}
                      </span>

                      {/* Botón más */}
                      <button
                        type="button"
                        onClick={() => {
                          const currentVal = draft?.cantidadFaltante || 0
                          actualizarCantidadFaltante(key, Math.min(cantidadFactura - 1, currentVal + 1), cantidadFactura)
                        }}
                        className="w-10 h-10 rounded-xl bg-white border border-blue-200 flex items-center justify-center text-lg font-black text-blue-700 shadow-sm active:scale-95 transition"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notas del item */}
              <textarea
                rows={1}
                className="input w-full rounded-xl border-gray-200 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-50/50 py-2.5 px-3"
                placeholder="Nota sobre este producto"
                value={draft?.observaciones || ''}
                onChange={(e) => actualizarObservacionItem(key, e.target.value)}
              />
            </div>
          )
        })}
      </div>


      {/* Barra de Acciones al final de la página */}
      <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex flex-col gap-2 mt-4">
        <button
          onClick={handleRegistrarFaltantes}
          disabled={guardando || !facturaSeleccionada || !allItemsChecked}
          className={`w-full py-4 rounded-2xl text-base font-bold text-white transition-all shadow-lg text-center flex items-center justify-center gap-2 ${!allItemsChecked
            ? 'bg-gray-300 cursor-not-allowed shadow-none'
            : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 active:scale-[0.98]'
            }`}
        >
          {guardando ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <CheckCircle size={18} />
              {accionPrincipalLabel}
            </>
          )}
        </button>

        {!allItemsChecked && (
          <p className="text-xxs text-center text-amber-600 font-semibold bg-amber-50 py-1.5 rounded-lg border border-amber-100 flex items-center justify-center gap-1 animate-pulse">
            <AlertTriangle size={12} />
            Debes verificar todos los productos para poder finalizar.
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="max-w-md mx-auto space-y-4 px-3 pt-2">
      {renderHeader()}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between text-green-800 text-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-500" />
            <span>{successMessage}</span>
          </div>
          <button className="text-xs underline text-green-600" onClick={() => setSuccessMessage(null)}>
            Ocultar
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-2 text-red-800 text-sm animate-fade-in">
          <AlertCircle size={16} className="text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 bg-white border border-gray-50 rounded-3xl">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Cargando facturas de bodega...</p>
        </div>
      ) : facturaSeleccionada ? (
        renderDetalle()
      ) : (
        renderListado()
      )}

      {/* Modal de cliente completado */}
      {clienteCompletado && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-scale-up">
            <div className="bg-blue-600 p-6 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-white/90 rounded-full mb-3 shadow-lg">
                <Sparkles className="text-indigo-500" size={28} />
              </div>
              <h2 className="text-xl font-bold text-white">¡Despacho Procesado!</h2>
            </div>

            <div className="p-6 text-center">
              <p className="text-xs text-gray-400 uppercase font-medium mb-0.5">Cliente:</p>
              <p className="text-xl font-bold text-gray-900 mb-4 break-words">
                {clienteCompletado.nombre}
              </p>

              {clienteCompletado.tipo === 'faltantes' && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3.5 flex items-center justify-center gap-1.5">
                  <Package size={16} className="text-amber-600" />
                  <p className="text-amber-700 text-sm font-bold">
                    {clienteCompletado.cantidad} faltante{clienteCompletado.cantidad > 1 ? 's' : ''} registrado{clienteCompletado.cantidad > 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {clienteCompletado.tipo === 'listo' && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3.5 flex items-center justify-center gap-1.5">
                  <Printer size={16} className="text-blue-600" />
                  <p className="text-blue-700 text-sm font-bold">
                    Enviado a cola de impresión
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 pt-0">
              <button
                onClick={() => setClienteCompletado(null)}
                className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 shadow-md active:scale-[0.98] transition"
              >
                Siguiente pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


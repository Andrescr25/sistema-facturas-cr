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
  Search
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
  const referencia = normalizeReferenceValue(
    item?.referencia ?? item?.reference ?? item?.codigo_producto ?? item?.codigo_alegra ?? ''
  )
  const codigoAlegra = item?.codigo_alegra ? item.codigo_alegra.toString() : ''
  const alegraId = item?.alegra_id ? item.alegra_id.toString() : ''
  const fallback = item?.id ? item.id.toString() : ''
  return referencia || codigoAlegra || alegraId || fallback || ''
}

const buildDraftForFactura = (factura) => {
  if (!factura || !Array.isArray(factura.items)) return {}
  const draft = {}
  factura.items.forEach((item, index) => {
    const key = getItemIdFromFacturaItem(item) || `item-${index}`
    draft[key] = {
      key,
      itemId: getItemIdFromFacturaItem(item) || `item-${index}`,
      nombre: item.nombre || item.name || item.description || 'Producto sin nombre',
      referencia:
        normalizeReferenceValue(
          item?.referencia ?? item?.reference ?? item?.codigo_producto ?? item?.codigo_alegra
        ) || item?.codigo_alegra || item?.alegra_id || 'N/A',
        cantidadFactura: Number(item?.cantidad ?? item?.quantity ?? 0),
        tipo: null,
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
        // No seleccionar automáticamente la primera factura
        // if (!seleccion && todas.length > 0) {
        //   seleccion = todas[0]
        // }
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
    const interval = setInterval(() => fetchFacturas(false), REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchFacturas])

  const handleSeleccionarFactura = (factura) => {
    setFacturaSeleccionada(factura)
    setSelectedFacturaId(factura.alegra_id)
    localStorage.setItem(STORAGE_KEYS.selected, factura.alegra_id)
    setFaltantesDraft(buildDraftForFactura(factura))
    setObservacionesAdicionales('')
    localStorage.removeItem(STORAGE_KEYS.observaciones)
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
    : faltantesSeleccionados.length > 0
      ? 'Registrar faltantes'
      : 'Factura lista'

  const marcarFacturaLista = async () => {
    if (!facturaSeleccionada) return
    try {
      setGuardando(true)
      await alegraService.actualizarEstadoFacturaBodega(
        facturaSeleccionada.alegra_id,
        'procesado',
        observacionesAdicionales.trim() || null
      )
      await completarYVolverAlListado()
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
      const payload = faltantesSeleccionados.map((item) => ({
        item_id: item.itemId,
        nombre_producto: item.nombre,
        cantidad_faltante: item.cantidadFaltante,
        tipo_faltante: item.tipo === 'total' ? 'total' : 'parcial',
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
      await completarYVolverAlListado()
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

    // Recargar facturas con rango predeterminado (30 días)
    fetchFacturas(false, true)
  }

  const renderHeader = () => (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <ClipboardList className="text-blue-600" size={32} />
          Facturas en Bodega
        </h1>
        <p className="text-gray-600">Mantén el foco en una factura a la vez.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => fetchFacturas(false, true)}
          className="btn btn-outline flex items-center gap-2"
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Actualizando...' : 'Refrescar'}
        </button>
        <div className="text-xs text-gray-500">
          Última sincronización:{' '}
          {ultimaSync
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
    <div className="card space-y-6">
      <div className="flex items-center gap-2">
        {['pendientes', 'listas'].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab)
              localStorage.setItem(STORAGE_KEYS.tab, tab)
            }}
            className={`flex-1 btn text-lg py-3 ${
              activeTab === tab ? 'btn-primary' : 'btn-outline border-gray-200 text-gray-600'
            }`}
          >
            {tab === 'pendientes' ? 'Pendientes' : 'Listas'}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por factura, cliente o monto..."
          className="input pl-10 w-full"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {activeTab === 'pendientes' && (
        <div className="space-y-3 p-4 border rounded-2xl bg-gray-50">
          <div>
            <label className="label text-xs">Ver facturas desde (deja vacío para últimos 30 días)</label>
            <input
              type="date"
              className="input"
              value={filters.fechaInicio}
              onChange={(e) => handleFilterChange('fechaInicio', e.target.value)}
              placeholder="Selecciona una fecha"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center text-sm text-gray-600 gap-2">
              <input
                type="checkbox"
                className="rounded text-blue-600"
                checked={filters.mostrarSinFecha}
                onChange={(e) => handleFilterChange('mostrarSinFecha', e.target.checked)}
              />
              Incluir facturas sin fecha
            </label>
            <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        </div>
      )}

      {facturasMostradas.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {activeTab === 'pendientes' ? (
            <>
              <CheckCircle className="mx-auto mb-2 text-green-500" size={40} />
              Todo está al día en bodega.
            </>
          ) : (
            <p>No hay facturas listas en este rango.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {facturasMostradas.map((factura) => (
            <button
              key={`${activeTab}-${factura.alegra_id}`}
              onClick={() => handleSeleccionarFactura(factura)}
              className="w-full text-left border border-gray-200 hover:border-blue-300 hover:shadow-lg rounded-3xl px-6 py-5 transition bg-white"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-gray-500">Factura</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {factura.numero_completo || factura.numero_factura}
                  </p>
                </div>
                <span className="text-sm font-medium text-blue-600">
                  {formatCurrency(factura.total)}
                </span>
              </div>
              <p className="text-lg text-gray-700 mt-2">{factura.cliente_nombre}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const renderDetalle = () => (
    <div className="space-y-6">
      <button
        className="text-blue-600 flex items-center gap-2 text-sm"
        onClick={() => {
          setFacturaSeleccionada(null)
          setSelectedFacturaId(null)
          setFaltantesDraft({})
          localStorage.removeItem(STORAGE_KEYS.selected)
        }}
      >
        ← Volver al listado
      </button>

      <div className="bg-white rounded-3xl shadow overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-6 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-gray-500">Cliente</p>
            <p className="text-2xl font-bold text-gray-900">{facturaSeleccionada.cliente_nombre}</p>
            <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
              <CalendarDays size={14} />
              {formatDate(facturaSeleccionada.fecha_emision)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-gray-500">Factura</p>
            <p className="text-3xl font-bold text-blue-700">
              {facturaSeleccionada.numero_completo || facturaSeleccionada.numero_factura}
            </p>
            <p className="text-sm text-gray-500">Total {formatCurrency(facturaSeleccionada.total)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {facturaSeleccionada.items?.map((item, index) => {
          const key = getItemIdFromFacturaItem(item) || `item-${index}`
          const draft = faltantesDraft[key]
          const cantidadFactura = Number(item?.cantidad ?? item?.quantity ?? 0)

          return (
            <div
              key={`${key}-${index}`}
              className="border border-gray-200 rounded-3xl p-5 shadow-sm bg-white space-y-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xl font-semibold text-gray-900">{item.nombre || item.name}</p>
                  <p className="text-sm text-gray-500">Referencia: {draft?.referencia || 'N/A'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Cantidad en factura</p>
                  <p className="text-3xl font-bold text-gray-900">{cantidadFactura}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="relative inline-flex">
                  <button
                    type="button"
                    onClick={() => marcarModoFaltante(key, 'ninguno', cantidadFactura)}
                    className={`btn pr-8 ${
                      draft?.tipo === 'ninguno'
                        ? 'btn-primary'
                        : 'btn-outline border-gray-200 text-gray-600'
                    }`}
                  >
                    Completo
                  </button>
                  <span
                    className={`absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-lg transition-all duration-200 ${
                      draft?.tipo === 'ninguno' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                    }`}
                  >
                    <CheckCircle
                      size={18}
                      className={`text-green-500 ${
                        checkAnimations[key] ? 'check-pop' : ''
                      }`}
                    />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => marcarModoFaltante(key, 'total', cantidadFactura)}
                  className={`btn ${
                    draft?.tipo === 'total'
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'btn-outline border-orange-200 text-orange-600'
                  }`}
                >
                  No llegó
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={cantidadFactura}
                    value={draft?.cantidadFaltante ?? 0}
                    onChange={(e) => actualizarCantidadFaltante(key, e.target.value, cantidadFactura)}
                    className="input w-24 text-lg"
                  />
                  <span className="text-sm text-gray-500">faltaron</span>
                </div>
              </div>

              <textarea
                rows={2}
                className="input w-full text-base"
                placeholder="Observación del producto (opcional)"
                value={draft?.observaciones || ''}
                onChange={(e) => actualizarObservacionItem(key, e.target.value)}
              />
            </div>
          )
        })}
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label text-sm">Observaciones generales</label>
          <textarea
            rows={3}
            className="input w-full text-base"
            placeholder="Notas generales sobre este pedido..."
            value={observacionesAdicionales}
            onChange={(e) => {
              setObservacionesAdicionales(e.target.value)
              localStorage.setItem(STORAGE_KEYS.observaciones, e.target.value)
            }}
          />
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-between bg-gray-50 rounded-3xl px-4 py-3">
          <div>
            <p className="text-sm text-gray-600">Faltantes seleccionados</p>
            <p className="text-2xl font-semibold text-gray-900">
              {faltantesSeleccionados.length} producto
              {faltantesSeleccionados.length !== 1 && 's'} • {totalFaltantes} unidades
            </p>
          </div>
          <button
            onClick={handleRegistrarFaltantes}
            disabled={guardando || !facturaSeleccionada}
            className="btn btn-primary text-lg"
          >
            {accionPrincipalLabel}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {renderHeader()}

      {successMessage && (
        <div className="card border border-green-200 bg-green-50 flex items-center justify-between gap-3 text-green-800">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} className="text-green-500" />
            <span>{successMessage}</span>
          </div>
          <button className="text-sm underline" onClick={() => setSuccessMessage(null)}>
            Ocultar
          </button>
        </div>
      )}

      {error && (
        <div className="card border border-red-200 bg-red-50 flex items-center gap-3 text-red-700">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card text-center py-12">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando facturas recientes...</p>
        </div>
      ) : facturaSeleccionada ? (
        renderDetalle()
      ) : (
        renderListado()
      )}
    </div>
  )
}


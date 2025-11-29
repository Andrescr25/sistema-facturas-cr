import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Inbox
} from 'lucide-react'
import { alegraService } from '../services/alegraService'

const REFRESH_INTERVAL = 60 * 1000 // 60 segundos

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
      tipo: 'ninguno',
      cantidadFaltante: 0,
      observaciones: ''
    }
  })
  return draft
}

export default function FacturasBodega() {
  const [pendientes, setPendientes] = useState([])
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

  const fetchFacturas = useCallback(
    async (showLoader = false) => {
      try {
        if (showLoader) {
          setLoading(true)
        } else {
          setRefreshing(true)
        }
        const response = await alegraService.getFacturasBodega()
        if (!response.success) {
          throw new Error(response.message || 'No se pudo cargar la información')
        }

        const pendientesApi = response.data?.pendientes || []
        const listasApi = response.data?.listas || []

        setPendientes(pendientesApi)
        setListas(listasApi)
        setUltimaSync(response.metadata?.lastSync || new Date().toISOString())
        setError(null)

        const todas = [...pendientesApi, ...listasApi]
        let seleccion = null

        if (selectedFacturaId) {
          seleccion = todas.find(
            (factura) => String(factura.alegra_id) === String(selectedFacturaId)
          )
        }

        if (!seleccion) {
          seleccion = pendientesApi[0] || listasApi[0] || null
          if (seleccion) {
            setFaltantesDraft(buildDraftForFactura(seleccion))
            setObservacionesAdicionales('')
            setSelectedFacturaId(seleccion.alegra_id)
          } else {
            setFaltantesDraft({})
            setObservacionesAdicionales('')
            setSelectedFacturaId(null)
          }
        }

        setFacturaSeleccionada(seleccion || null)
      } catch (err) {
        console.error('❌ Error cargando facturas de bodega:', err)
        setError(err.message)
      } finally {
        if (showLoader) {
          setLoading(false)
        } else {
          setRefreshing(false)
        }
      }
    },
    [selectedFacturaId]
  )

  useEffect(() => {
    fetchFacturas(true)
    const interval = setInterval(() => fetchFacturas(false), REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchFacturas])

  const handleSeleccionarFactura = (factura) => {
    setFacturaSeleccionada(factura)
    setSelectedFacturaId(factura.alegra_id)
    setFaltantesDraft(buildDraftForFactura(factura))
    setObservacionesAdicionales('')
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

  const marcarModoFaltante = (key, modo, cantidadFactura) => {
    if (modo === 'ninguno') {
      actualizarEntradaFaltante(key, () => ({ tipo: 'ninguno', cantidadFaltante: 0 }))
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

  const handleRegistrarFaltantes = async () => {
    if (!facturaSeleccionada) return

    if (faltantesSeleccionados.length === 0 && !observacionesAdicionales.trim()) {
      alert('Registra al menos un faltante o añade observaciones para el pedido.')
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

      alert('✅ Faltantes registrados correctamente.')
      setFaltantesDraft(buildDraftForFactura(facturaSeleccionada))
      setObservacionesAdicionales('')
      fetchFacturas(false)
    } catch (err) {
      console.error('❌ Error registrando faltantes:', err)
      alert(`Error registrando faltantes: ${err.message}`)
    } finally {
      setGuardando(false)
    }
  }

  const handleActualizarEstado = async (estado) => {
    if (!facturaSeleccionada) return
    try {
      setRefreshing(true)
      await alegraService.actualizarEstadoFacturaBodega(
        facturaSeleccionada.alegra_id,
        estado,
        observacionesAdicionales
      )
      fetchFacturas(false)
      alert(
        estado === 'procesado'
          ? 'Factura marcada como lista. ¡Buen trabajo!'
          : 'Factura devuelta a pendientes.'
      )
    } catch (err) {
      console.error('❌ Error actualizando estado de factura:', err)
      alert(`Error actualizando estado: ${err.message}`)
    } finally {
      setRefreshing(false)
    }
  }

  const estadoFacturaSeleccionada = facturaSeleccionada?.estado_procesamiento || 'pendiente'

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ClipboardList className="text-blue-600" size={32} />
            Facturas en Bodega
          </h1>
          <p className="text-gray-600">
            Revisa pedidos pendientes, registra faltantes y marca facturas como listas desde un
            solo lugar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchFacturas(false)}
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
      ) : (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="card h-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Inbox className="text-blue-600" size={20} />
                    Facturas pendientes
                  </h2>
                  <p className="text-sm text-gray-500">
                    {pendientes.length} factura{pendientes.length !== 1 && 's'} por preparar
                  </p>
                </div>
              </div>
              {pendientes.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <CheckCircle className="mx-auto mb-2 text-green-500" size={28} />
                  Todo está al día en bodega.
                </div>
              ) : (
                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {pendientes.map((factura) => (
                    <button
                      key={factura.alegra_id}
                      onClick={() => handleSeleccionarFactura(factura)}
                      className={`w-full text-left border rounded-2xl px-4 py-3 transition-all ${
                        facturaSeleccionada &&
                        String(facturaSeleccionada.alegra_id) === String(factura.alegra_id)
                          ? 'border-blue-400 bg-blue-50 shadow-sm'
                          : 'border-gray-200 hover:border-blue-200 hover:shadow-sm bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Factura</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {factura.numero_completo || factura.numero_factura}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-blue-600">
                          {formatCurrency(factura.total)}
                        </span>
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <User size={14} />
                          {factura.cliente_nombre}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDays size={14} />
                          {formatDate(factura.fecha_emision)}
                        </span>
                      </div>
                      {factura.faltantes_pendientes > 0 && (
                        <div className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-700">
                          <AlertCircle size={12} />
                          {factura.faltantes_pendientes} faltante
                          {factura.faltantes_pendientes !== 1 && 's'}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <CheckCircle className="text-green-600" size={20} />
                    Facturas listas
                  </h2>
                  <p className="text-sm text-gray-500">
                    {listas.length} factura{listas.length !== 1 && 's'} completada{listas.length !== 1 && 's'}
                  </p>
                </div>
              </div>
              {listas.length === 0 ? (
                <p className="text-center text-gray-500 py-6 text-sm">
                  Aún no hay facturas listas en este rango de fechas.
                </p>
              ) : (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {listas.map((factura) => (
                    <button
                      key={`lista-${factura.alegra_id}`}
                      onClick={() => handleSeleccionarFactura(factura)}
                      className={`w-full text-left border rounded-2xl px-4 py-3 transition ${
                        facturaSeleccionada &&
                        String(facturaSeleccionada.alegra_id) === String(factura.alegra_id)
                          ? 'border-green-400 bg-green-50 shadow-sm'
                          : 'border-gray-200 hover:border-green-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-900">
                          {factura.numero_completo || factura.numero_factura}
                        </p>
                        <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          Lista
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{factura.cliente_nombre}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            {!facturaSeleccionada ? (
              <div className="card text-center py-12">
                <Package className="mx-auto text-gray-300 mb-3" size={48} />
                <p className="text-gray-600">
                  Selecciona una factura para ver sus productos y registrar faltantes.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-3xl shadow overflow-hidden">
                  <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-6 py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-wide text-gray-500">
                        Distribuidora Tachi
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        {facturaSeleccionada.cliente_nombre}
                      </p>
                      <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                        <CalendarDays size={14} />
                        {formatDate(facturaSeleccionada.fecha_emision)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase text-gray-500">Factura</p>
                      <p className="text-2xl font-bold text-blue-700">
                        {facturaSeleccionada.numero_completo || facturaSeleccionada.numero_factura}
                      </p>
                      <p className="text-sm text-gray-500">Total {formatCurrency(facturaSeleccionada.total)}</p>
                    </div>
                  </div>

                  <div className="px-4 py-5 space-y-4 bg-white">
                    {facturaSeleccionada.items?.map((item, index) => {
                      const key = getItemIdFromFacturaItem(item) || `item-${index}`
                      const draft = faltantesDraft[key]
                      const cantidadFactura = Number(item?.cantidad ?? item?.quantity ?? 0)

                      return (
                        <div
                          key={`${key}-${index}`}
                          className="border border-gray-200 rounded-2xl p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-semibold text-gray-900">{item.nombre || item.name}</p>
                              <p className="text-xs text-gray-500">
                                Ref: {draft?.referencia || 'N/A'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Cantidad factura</p>
                              <p className="text-2xl font-bold text-gray-900">{cantidadFactura}</p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => marcarModoFaltante(key, 'ninguno', cantidadFactura)}
                              className={`btn btn-sm ${
                                draft?.tipo === 'ninguno'
                                  ? 'btn-primary'
                                  : 'btn-outline border-gray-200 text-gray-600'
                              }`}
                            >
                              Completo
                            </button>
                            <button
                              type="button"
                              onClick={() => marcarModoFaltante(key, 'total', cantidadFactura)}
                              className={`btn btn-sm ${
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
                                onChange={(e) =>
                                  actualizarCantidadFaltante(key, e.target.value, cantidadFactura)
                                }
                                className="input input-sm w-24"
                              />
                              <span className="text-xs text-gray-500">faltaron</span>
                            </div>
                          </div>

                          <textarea
                            rows={2}
                            className="input w-full mt-3 text-sm"
                            placeholder="Observación opcional (ej. producto dañado, pendiente de otro pedido)"
                            value={draft?.observaciones || ''}
                            onChange={(e) => actualizarObservacionItem(key, e.target.value)}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="card space-y-4">
                  <div>
                    <label className="label text-sm">Observaciones generales</label>
                    <textarea
                      rows={3}
                      className="input w-full"
                      placeholder="Notas generales sobre esta factura (ej. entregas parciales, referencias internas, etc.)"
                      value={observacionesAdicionales}
                      onChange={(e) => setObservacionesAdicionales(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3 items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                    <div>
                      <p className="text-sm text-gray-600">Faltantes seleccionados</p>
                      <p className="text-xl font-semibold text-gray-900">
                        {faltantesSeleccionados.length} producto
                        {faltantesSeleccionados.length !== 1 && 's'} • {totalFaltantes} unidades
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleRegistrarFaltantes}
                        disabled={guardando || (!faltantesSeleccionados.length && !observacionesAdicionales.trim())}
                        className="btn btn-primary"
                      >
                        {guardando ? 'Guardando...' : 'Registrar faltantes'}
                      </button>
                      {estadoFacturaSeleccionada === 'pendiente' ? (
                        <button
                          onClick={() => handleActualizarEstado('procesado')}
                          className="btn bg-green-600 text-white hover:bg-green-700"
                        >
                          Marcar como lista
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActualizarEstado('pendiente')}
                          className="btn btn-outline border-gray-300"
                        >
                          Volver a pendientes
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


import { useState, useEffect } from 'react'
import { User, Package, FileText, AlertCircle, RefreshCw, Clock, Mail, Check, Calculator, Undo2, X, RotateCcw, ArrowLeft, AlertTriangle } from 'lucide-react'
import { alegraService } from '../services/alegraService'

export default function ReporteClientes() {
  const [clientes, setClientes] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [entregasAjustadas, setEntregasAjustadas] = useState(new Map())
  const [historialCambios, setHistorialCambios] = useState(new Map())
  const [facturasEstado, setFacturasEstado] = useState(new Map())
  const [clienteQuery, setClienteQuery] = useState('')

  // NAVEGACIÓN: lista de clientes → detalle de cliente
  const [clienteActivoNombre, setClienteActivoNombre] = useState(null)

  useEffect(() => {
    loadReporte()
  }, [])

  const loadReporte = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await alegraService.getReporteFaltantesCliente()

      if (result.success) {
        setClientes(result.data)
        setResumen(result.resumen)

        const estadosMap = new Map()
        const ajustesMap = new Map()

        result.data.forEach((cliente) => {
          cliente.facturas_con_faltantes.forEach((factura) => {
            const facturaKey = getFacturaKey(factura)

            if (factura.estado_procesamiento === 'procesado') {
              estadosMap.set(facturaKey, { estado: 'procesado', timestamp: factura.fecha_procesamiento || new Date().toISOString(), ajustes: [], requiere_reimpresion: false, origen: 'procesado' })
            } else if (factura.en_cola_impresion) {
              estadosMap.set(facturaKey, { estado: 'en_cola_impresion', timestamp: new Date().toISOString(), ajustes: [], requiere_reimpresion: true, origen: 'cola_impresion' })
            }

            factura.productos_faltantes.forEach((producto) => {
              const key = getProductKey(factura, producto)
              if (producto.cantidad_entregada > 0 || producto.ajuste_estado !== 'pendiente') {
                const cantidadEntregada = producto.cantidad_entregada || 0
                const cantidadAReducir = Math.max(producto.cantidad_faltante - cantidadEntregada, 0)
                ajustesMap.set(key, { faltanteId: producto.faltante_id, cantidadFaltante: producto.cantidad_faltante, cantidadEntregada, cantidadAReducir, estado: producto.ajuste_estado, tieneAjuste: true, requiereActualizacion: producto.requiere_actualizacion })
              }
            })

            if (factura.es_pendiente_manual && !estadosMap.has(facturaKey)) {
              estadosMap.set(facturaKey, { estado: 'pendiente', timestamp: factura.pendiente_desde || new Date().toISOString(), ajustes: [], requiere_reimpresion: false, origen: 'manual', motivo: factura.pendiente_motivo || '' })
            }
          })
        })

        setFacturasEstado(estadosMap)
        setEntregasAjustadas(ajustesMap)
      } else {
        setError(result.message || 'Error cargando reporte')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ==================== LÓGICA DE NEGOCIO (PRESERVADA) ====================

  const handleFacturaLista = async (clienteNombre, factura) => {
    const ajustesFactura = []
    factura.productos_faltantes.forEach((producto) => {
      const key = getProductKey(factura, producto)
      const ajuste = entregasAjustadas.get(key)
      if (ajuste) {
        ajustesFactura.push({ producto_codigo: producto.codigo, producto_nombre: producto.nombre, cantidad_faltante: producto.cantidad_faltante, cantidad_entregada: ajuste.cantidadEntregada, estado: ajuste.estado, requiere_actualizacion: ajuste.requiereActualizacion })
      } else {
        ajustesFactura.push({ producto_codigo: producto.codigo, producto_nombre: producto.nombre, cantidad_faltante: producto.cantidad_faltante, cantidad_entregada: 0, estado: 'pendiente', requiere_actualizacion: true })
      }
    })

    const facturaData = {
      alegra_id: factura.alegra_id, numero_factura: factura.numero_factura, cliente_nombre: clienteNombre, fecha_emision: factura.fecha_emision, ajustes: ajustesFactura,
      estado: ajustesFactura.length > 0 ? (ajustesFactura.some(aj => aj.requiere_actualizacion) ? 'requiere_reimpresion_con_ajustes' : 'requiere_reimpresion_solo_precios') : 'requiere_reimpresion_solo_precios',
      marcar_como_procesada: false
    }

    const ajustesHechos = ajustesFactura.filter(aj => aj.cantidad_entregada > 0).length
    const faltantesPendientes = ajustesFactura.filter(aj => aj.cantidad_entregada === 0).length
    const requiereReimpresion = ajustesFactura.some(aj => aj.requiere_actualizacion)

    const resumenMsg = `📋 Procesar Factura #${factura.numero_factura}:\n\nCliente: ${clienteNombre}\nTotal productos con faltantes: ${ajustesFactura.length}\n  • Ajustados: ${ajustesHechos}\n  • Pendientes: ${faltantesPendientes}\n\n${requiereReimpresion ? '🖨️ Se enviará a Impresión para hacer cambios' : '✅ Sin cambios necesarios'}\n\n¿Continuar?`
    if (!window.confirm(resumenMsg)) return

    try {
      await alegraService.procesarFacturaIndividual(facturaData)
      const facturaKey = getFacturaKey(factura)
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.set(facturaKey, { estado: 'procesado', timestamp: new Date().toISOString(), ajustes: ajustesFactura, requiere_reimpresion: requiereReimpresion, origen: 'procesado' })
      setFacturasEstado(nuevosEstados)

      setClientes(prev => prev.map(cliente => {
        if (cliente.nombre !== clienteNombre) return cliente
        const facturasActualizadas = cliente.facturas_con_faltantes.map(f => { if (getFacturaKey(f) !== facturaKey) return f; return { ...f, es_pendiente_manual: false, pendiente_desde: null, pendiente_motivo: null } })
        return { ...cliente, facturas_con_faltantes: facturasActualizadas }
      }))

      alert(`✅ Factura #${factura.numero_factura} enviada a Impresión\n\n• Productos: ${ajustesFactura.length}\n• Requiere cambios: ${requiereReimpresion ? 'Sí' : 'No'}\n\n🖨️ Ve al Centro de Impresión.\nUsa "Recuperar" si necesitas editarla.`)
    } catch (error) {
      alert(`❌ Error procesando factura: ${error.message}`)
    }
  }

  const handleRecuperarFactura = async (factura) => {
    const facturaKey = getFacturaKey(factura)
    if (!window.confirm(`¿Recuperar factura #${factura.numero_factura} para editarla?`)) return
    try {
      await alegraService.recuperarFactura(factura.alegra_id)
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.delete(facturaKey)
      setFacturasEstado(nuevosEstados)
      setClientes(prev => prev.map(cliente => {
        const facturasActualizadas = cliente.facturas_con_faltantes.map(f => { if (getFacturaKey(f) !== facturaKey) return f; return { ...f, es_pendiente_manual: false, pendiente_desde: null, pendiente_motivo: null } })
        return { ...cliente, facturas_con_faltantes: facturasActualizadas }
      }))
      alert(`✅ Factura #${factura.numero_factura} recuperada.`)
    } catch (error) {
      alert(`❌ Error recuperando factura: ${error.message}`)
    }
  }

  const handleMarcarFacturaPendiente = async (factura, clienteNombre) => {
    const facturaKey = getFacturaKey(factura)
    const motivo = window.prompt(`Notas para la factura #${factura.numero_factura} (opcional):`, '') || null
    try {
      await alegraService.marcarFacturaPendiente(factura.alegra_id, motivo)
      const timestamp = new Date().toISOString()
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.set(facturaKey, { estado: 'pendiente', timestamp, ajustes: [], requiere_reimpresion: false, origen: 'manual', motivo: motivo || '' })
      setFacturasEstado(nuevosEstados)
      setClientes(prev => prev.map(cliente => {
        if (cliente.nombre !== clienteNombre) return cliente
        const facturasActualizadas = cliente.facturas_con_faltantes.map(f => { if (getFacturaKey(f) !== facturaKey) return f; return { ...f, es_pendiente_manual: true, pendiente_desde: timestamp, pendiente_motivo: motivo } })
        return { ...cliente, facturas_con_faltantes: facturasActualizadas }
      }))
      alert(`⌛ Factura #${factura.numero_factura} marcada como pendiente.`)
    } catch (error) {
      alert(`❌ Error: ${error.message}`)
    }
  }

  const handleQuitarFacturaPendiente = async (factura, clienteNombre) => {
    const facturaKey = getFacturaKey(factura)
    if (!window.confirm(`¿Quitar estado pendiente de #${factura.numero_factura}?`)) return
    try {
      await alegraService.quitarFacturaPendiente(factura.alegra_id)
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.delete(facturaKey)
      setFacturasEstado(nuevosEstados)
      setClientes(prev => prev.map(cliente => {
        if (cliente.nombre !== clienteNombre) return cliente
        const facturasActualizadas = cliente.facturas_con_faltantes.map(f => { if (getFacturaKey(f) !== facturaKey) return f; return { ...f, es_pendiente_manual: false, pendiente_desde: null, pendiente_motivo: null } })
        return { ...cliente, facturas_con_faltantes: facturasActualizadas }
      }))
      alert(`✅ Estado pendiente removido.`)
    } catch (error) {
      alert(`❌ Error: ${error.message}`)
    }
  }

  // ==================== UTILIDADES ====================

  const getFacturaKey = (factura) => {
    if (!factura) return 'factura-desconocida'
    const identifier = factura.alegra_id ?? factura.factura_local_id ?? factura.numero_factura ?? factura.id ?? 'sin-identificador'
    return `factura-${identifier}`
  }

  const getProductKey = (factura, producto) => {
    if (producto?.faltante_id) return `faltante-${producto.faltante_id}`
    const facturaKey = getFacturaKey(factura)
    const productoId = producto?.producto_id ?? producto?.codigo ?? producto?.nombre ?? producto?.id ?? 'producto-sin-id'
    return `${facturaKey}::${productoId}`
  }

  const getEntregaInfo = (key, producto) => {
    const ajuste = entregasAjustadas.get(key)
    if (!ajuste) return { faltanteId: producto.faltante_id, cantidadFaltante: producto.cantidad_faltante, cantidadEntregada: 0, cantidadAReducir: 0, estado: 'pendiente', tieneAjuste: false, requiereActualizacion: false }
    return { ...ajuste, tieneAjuste: true }
  }

  const getFacturaEstado = (factura) => {
    return facturasEstado.get(getFacturaKey(factura)) || { estado: 'pendiente', origen: 'default' }
  }

  const guardarHistorial = (key, accion, valorAnterior, valorNuevo) => {
    const newHistorial = new Map(historialCambios)
    newHistorial.set(`${key}-${Date.now()}`, { key, accion, valorAnterior, valorNuevo, timestamp: new Date() })
    setHistorialCambios(newHistorial)
  }

  const guardarAjusteEnBD = async (producto, ajuste) => {
    if (!producto?.faltante_id) return
    try {
      await alegraService.guardarAjusteFaltante({ faltanteId: producto.faltante_id, cantidadEntregada: ajuste.cantidad_entregada, estado: ajuste.estado, requiereActualizacion: ajuste.requiere_actualizacion })
    } catch (error) {
      setError(`Error guardando ajuste: ${error.message}`)
      throw error
    }
  }

  const eliminarAjusteDeBD = async (producto) => {
    if (!producto?.faltante_id) return
    try {
      await alegraService.eliminarAjusteFaltante(producto.faltante_id)
    } catch (error) {
      setError(`Error eliminando ajuste: ${error.message}`)
      throw error
    }
  }

  const handleCantidadEntregadaChange = async (key, cantidadEntregada, producto) => {
    setError(null)
    const cantidadNumerica = Number.parseInt(cantidadEntregada ?? 0, 10)
    const cantidadFaltante = producto.cantidad_faltante
    const cantidadNormalizada = Number.isNaN(cantidadNumerica) ? 0 : Math.min(Math.max(cantidadNumerica, 0), cantidadFaltante)
    const entregaAnterior = getEntregaInfo(key, producto)
    if (cantidadNormalizada === (entregaAnterior.cantidadEntregada ?? 0)) return
    if (entregaAnterior.tieneAjuste) guardarHistorial(key, 'cambio_cantidad', entregaAnterior.cantidadEntregada, cantidadNormalizada)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    let estado = 'pendiente', cantidadAReducir = 0, requiereActualizacion = false
    if (cantidadNormalizada >= cantidadFaltante) { estado = 'completo' }
    else if (cantidadNormalizada > 0) { estado = 'parcial'; cantidadAReducir = Math.max(cantidadFaltante - cantidadNormalizada, 0); requiereActualizacion = true }
    if (cantidadNormalizada === 0) { newMap.delete(key); setEntregasAjustadas(newMap); try { await eliminarAjusteDeBD(producto) } catch (e) { setEntregasAjustadas(prevMap) }; return }
    newMap.set(key, { faltanteId: producto.faltante_id, cantidadFaltante, cantidadEntregada: cantidadNormalizada, cantidadAReducir, estado, tieneAjuste: true, requiereActualizacion })
    setEntregasAjustadas(newMap)
    try { await guardarAjusteEnBD(producto, { cantidad_entregada: cantidadNormalizada, estado, requiere_actualizacion: requiereActualizacion }) } catch (e) { setEntregasAjustadas(prevMap) }
  }

  const handleMarcarCompleto = async (key, producto) => {
    guardarHistorial(key, 'marcar_completo', getEntregaInfo(key, producto).cantidadEntregada, producto.cantidad_faltante)
    await handleCantidadEntregadaChange(key, producto.cantidad_faltante, producto)
  }

  const handleDeshacer = async (key, producto) => {
    guardarHistorial(key, 'deshacer', getEntregaInfo(key, producto).cantidadEntregada, 0)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    newMap.delete(key)
    setEntregasAjustadas(newMap)
    try { await eliminarAjusteDeBD(producto) } catch (e) { setEntregasAjustadas(prevMap) }
  }

  const handleNoLlegoNada = async (key, producto) => {
    guardarHistorial(key, 'no_llego_nada', getEntregaInfo(key, producto).cantidadEntregada, -1)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    newMap.set(key, { faltanteId: producto.faltante_id, cantidadFaltante: producto.cantidad_faltante, cantidadEntregada: 0, cantidadAReducir: producto.cantidad_faltante, estado: 'no_llego', tieneAjuste: true, requiereActualizacion: true })
    setEntregasAjustadas(newMap)
    try { await guardarAjusteEnBD(producto, { cantidad_entregada: 0, estado: 'no_llego', requiere_actualizacion: true }) } catch (e) { setEntregasAjustadas(prevMap) }
  }

  const contarAjustes = () => entregasAjustadas.size
  const contarFacturasProcesadas = () => Array.from(facturasEstado.values()).filter(e => e.estado === 'procesado').length
  const contarFacturasPendientes = () => Array.from(facturasEstado.values()).filter(e => e.estado === 'pendiente' && e.origen === 'manual').length

  const formatDate = (dateString) => new Date(dateString).toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })
  const formatDateTime = (dateString) => {
    if (!dateString) return 'Fecha no disponible'
    try {
      const fecha = typeof dateString === 'string' ? new Date(dateString) : dateString
      if (isNaN(fecha.getTime())) return 'Fecha inválida'
      return fecha.toLocaleString('es-CR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch (e) { return 'Error en fecha' }
  }

  // Detectar si un cliente tiene facturas "sin caja"
  const clienteTieneSinCaja = (cliente) => {
    return cliente.facturas_con_faltantes.some(factura => {
      const estadoFactura = getFacturaEstado(factura)
      if (estadoFactura.estado === 'procesado') return false
      const productosValidos = factura.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0)
      if (productosValidos.length === 0) return false
      return productosValidos.every(p => p.tipo_faltante === 'total')
    })
  }

  const contarClientesSinCaja = () => clientes.filter(c => clienteTieneSinCaja(c)).length

  // ==================== RENDERIZADO ====================

  if (loading && !clientes.length) {
    return (
      <div className="max-w-[1400px] mx-auto text-center py-12">
        <div className="spinner mx-auto mb-4 border-t-2 border-b-2 border-purple-500 rounded-full w-12 h-12 animate-spin"></div>
        <p className="text-gray-600">Cargando reporte de clientes...</p>
      </div>
    )
  }

  // ========== VISTA DETALLE DE CLIENTE ==========
  const renderClienteDetalle = () => {
    const cliente = clientes.find(c => c.nombre === clienteActivoNombre)
    if (!cliente) return null
    const esSinCaja = clienteTieneSinCaja(cliente)

    // Separar facturas activas de procesadas
    const facturasActivas = cliente.facturas_con_faltantes.filter(f => {
      const e = getFacturaEstado(f)
      return e.estado !== 'procesado' && e.estado !== 'en_cola_impresion'
    })
    const facturasProcesadas = cliente.facturas_con_faltantes.filter(f => {
      const e = getFacturaEstado(f)
      return e.estado === 'procesado' || e.estado === 'en_cola_impresion'
    })

    // Renderizar una factura activa (con todos sus productos y acciones)
    const renderFacturaActiva = (factura) => {
      const estadoFactura = getFacturaEstado(factura)
      const estaPendienteManual = estadoFactura.estado === 'pendiente' && estadoFactura.origen === 'manual'
      const productosValidos = factura.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0)
      const esFacturaSinCaja = productosValidos.length > 0 && productosValidos.every(p => p.tipo_faltante === 'total')

      return (
        <div key={getFacturaKey(factura)} className={`bg-white rounded-xl shadow-sm overflow-hidden border-l-4 transition-all ${estaPendienteManual ? 'border-l-yellow-400' : esFacturaSinCaja ? 'border-l-red-400' : 'border-l-gray-200'
          }`}>
          {/* Header Factura */}
          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-50">
            <div>
              <h5 className="font-bold text-lg text-gray-900">
                Factura #{factura.numero_factura}
                {estaPendienteManual && <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">⏳ Pendiente</span>}
                {esFacturaSinCaja && <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full">📦 Sin Caja</span>}
              </h5>
              <p className="text-sm text-gray-500">Fecha: {formatDate(factura.fecha_emision)}</p>
              {estaPendienteManual && estadoFactura.timestamp && <p className="text-xs text-yellow-700 mt-1">Pendiente desde: {formatDateTime(estadoFactura.timestamp)}</p>}
              {estaPendienteManual && estadoFactura.motivo && <p className="text-xs text-yellow-700">Motivo: {estadoFactura.motivo}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right mr-2">
                <p className="text-sm font-medium text-gray-700">{productosValidos.length} producto{productosValidos.length !== 1 ? 's' : ''}</p>
                {(() => {
                  if (estaPendienteManual) return <p className="text-xs text-yellow-600">⌛ Esperando entrega</p>
                  const ajustesF = factura.productos_faltantes.map(p => entregasAjustadas.get(getProductKey(factura, p))).filter(Boolean)
                  if (ajustesF.length === 0) return null
                  if (ajustesF.every(a => a.estado === 'completo')) return <p className="text-xs text-green-600">✓ Resuelto</p>
                  if (ajustesF.some(a => a.requiereActualizacion)) return <p className="text-xs text-blue-600">✓ Con ajustes</p>
                  return null
                })()}
              </div>
              <div className="flex flex-col gap-1.5">
                <button onClick={() => handleFacturaLista(cliente.nombre, factura)} className="btn btn-primary btn-sm whitespace-nowrap"><Check size={14} className="mr-1" /> Lista</button>
                {estaPendienteManual ? (
                  <button onClick={() => handleQuitarFacturaPendiente(factura, cliente.nombre)} className="btn btn-outline btn-sm text-yellow-800 border-yellow-500 hover:bg-yellow-50 whitespace-nowrap"><X size={14} className="mr-1" /> Quitar</button>
                ) : (
                  <button onClick={() => handleMarcarFacturaPendiente(factura, cliente.nombre)} className="btn btn-outline btn-sm text-yellow-700 border-yellow-400 hover:bg-yellow-50 whitespace-nowrap"><Clock size={14} className="mr-1" /> Pendiente</button>
                )}
              </div>
            </div>
          </div>

          {/* Productos */}
          <div className="divide-y divide-gray-50">
            {productosValidos.map((producto) => {
              const productoKey = getProductKey(factura, producto)
              const entrega = getEntregaInfo(productoKey, producto)
              const estaCompleto = entrega.estado === 'completo'
              const noLlego = entrega.estado === 'no_llego'
              const tieneAjuste = entrega.tieneAjuste

              return (
                <div key={productoKey} className={`p-4 transition-all ${estaCompleto ? 'bg-green-50/50' : entrega.estado === 'parcial' ? 'bg-blue-50/30' : noLlego ? 'bg-red-50/30' : 'hover:bg-gray-50/50'
                  }`}>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="lg:w-5/12 min-w-0">
                      <p className={`font-semibold truncate ${estaCompleto ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {estaCompleto && <Check size={14} className="inline text-green-600 mr-1" />}
                        {producto.nombre}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{producto.codigo} • {producto.proveedor}</p>
                      {producto.observaciones && <p className={`text-xs text-orange-600 mt-0.5 ${estaCompleto ? 'line-through opacity-60' : ''}`}>📝 {producto.observaciones}</p>}
                    </div>
                    <div className="lg:w-2/12">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${producto.tipo_faltante === 'total' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {producto.cantidad_faltante} {producto.tipo_faltante === 'total' ? 'total' : 'parcial'}
                      </span>
                    </div>
                    <div className="lg:w-2/12">
                      <input type="number" min="0" max={producto.cantidad_faltante} value={entrega.cantidadEntregada} placeholder="0"
                        onChange={(e) => handleCantidadEntregadaChange(productoKey, e.target.value, producto)}
                        disabled={estaCompleto} className={`input w-full max-w-[100px] ${estaCompleto ? 'bg-gray-100 text-gray-400' : ''}`} />
                    </div>
                    <div className="lg:w-1/12">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ${estaCompleto ? 'bg-green-100 text-green-800' : entrega.estado === 'parcial' ? 'bg-blue-100 text-blue-800' : noLlego ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                        {estaCompleto ? '✓ Ok' : entrega.estado === 'parcial' ? '◐' : noLlego ? '✗' : '○'}
                      </span>
                    </div>
                    <div className="lg:w-2/12">
                      <div className="flex gap-1.5">
                        {!estaCompleto && !noLlego && (
                          <>
                            <button onClick={() => handleMarcarCompleto(productoKey, producto)} className="btn btn-sm bg-green-600 text-white border-green-600 hover:bg-green-700" title="Completo"><Check size={13} /></button>
                            <button onClick={() => handleNoLlegoNada(productoKey, producto)} className="btn btn-sm bg-red-600 text-white border-red-600 hover:bg-red-700" title="No llegó"><X size={13} /></button>
                          </>
                        )}
                        {tieneAjuste && <button onClick={() => handleDeshacer(productoKey, producto)} className="btn btn-sm bg-orange-500 text-white border-orange-500 hover:bg-orange-600" title="Deshacer"><Undo2 size={13} /></button>}
                      </div>
                    </div>
                  </div>
                  {entrega.cantidadEntregada > 0 && (
                    <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200 flex items-center justify-between text-sm">
                      <span className="text-blue-800 flex items-center"><Calculator size={14} className="mr-1" /> {entrega.estado === 'completo' ? 'Resuelto — sin cambios' : `Se reducirá en ${entrega.cantidadAReducir} uds`}</span>
                      <span className="text-blue-600 font-medium">{entrega.cantidadEntregada}/{producto.cantidad_faltante}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Observaciones adicionales */}
          {factura.observaciones_adicionales && (
            <div className="p-4 bg-yellow-50 border-t border-yellow-200">
              <p className="text-sm text-yellow-800"><strong>📝 Encargos:</strong> {factura.observaciones_adicionales}</p>
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="animate-fade-in-up">
        {/* Barra superior */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setClienteActivoNombre(null)} className="flex items-center text-gray-500 hover:text-purple-600 transition-colors">
            <ArrowLeft className="mr-2" size={20} /> Volver a clientes
          </button>
        </div>

        {/* Header del cliente */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className={`p-4 rounded-xl ${esSinCaja ? 'bg-red-100' : 'bg-purple-100'}`}>
              <User className={esSinCaja ? 'text-red-600' : 'text-purple-600'} size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-bold text-gray-900">{cliente.nombre}</h1>
                {esSinCaja && <span className="text-[10px] bg-red-500 text-white px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">📦 Sin Caja</span>}
              </div>
              {cliente.email && <p className="text-gray-500 flex items-center mt-1"><Mail size={14} className="mr-1.5" /> {cliente.email}</p>}
              <p className="text-xs text-gray-400 mt-1"><Clock size={12} className="inline mr-1" /> Última actividad: {formatDateTime(cliente.ultima_actividad)}</p>
            </div>
          </div>
          <div className="flex bg-gray-50 p-4 rounded-xl divide-x divide-gray-200">
            <div className="px-5 text-center">
              <p className="text-sm text-gray-500 font-medium">Facturas</p>
              <p className="text-2xl font-bold text-gray-900">{cliente.facturas_con_faltantes.length}</p>
            </div>
            <div className="px-5 text-center">
              <p className="text-sm text-gray-500 font-medium">Pendientes</p>
              <p className="text-2xl font-bold text-purple-600">{cliente.total_cantidad}</p>
            </div>
          </div>
        </div>

        {/* Aviso sin caja */}
        {esSinCaja && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
            <p className="text-sm text-red-800">Este cliente tiene facturas con <strong>100% de faltantes totales</strong> — no tiene caja ni empaque en bodega.</p>
          </div>
        )}

        {/* Facturas activas */}
        {facturasActivas.length === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center mb-6">
            <Check className="mx-auto text-green-400 mb-2" size={32} />
            <p className="text-green-800 font-medium">Todas las facturas de este cliente han sido procesadas.</p>
          </div>
        )}

        <div className="space-y-4">
          {facturasActivas.map(renderFacturaActiva)}
        </div>

        {/* Separador + Facturas Procesadas al fondo */}
        {facturasProcesadas.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-[1px] flex-1 bg-gray-200"></div>
              <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <Check size={12} /> {facturasProcesadas.length} procesada{facturasProcesadas.length > 1 ? 's' : ''}
              </span>
              <div className="h-[1px] flex-1 bg-gray-200"></div>
            </div>
            <div className="space-y-3">
              {facturasProcesadas.map((factura) => {
                const estadoFactura = getFacturaEstado(factura)
                const productosValidos = factura.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0)
                return (
                  <div key={getFacturaKey(factura)} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden opacity-60 hover:opacity-80 transition-opacity">
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <h5 className="font-medium text-gray-400 line-through">
                          <Check size={14} className="inline text-green-500 mr-1" />
                          Factura #{factura.numero_factura}
                          <span className="ml-2 px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded-full no-underline inline-block">✓ Procesada</span>
                        </h5>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(factura.fecha_emision)} • {productosValidos.length} producto{productosValidos.length !== 1 ? 's' : ''}</p>
                        {estadoFactura.timestamp && <p className="text-[10px] text-green-600 mt-0.5">{estadoFactura.requiere_reimpresion ? '🖨️ En impresión' : '📚 Historial'} — {formatDateTime(estadoFactura.timestamp)}</p>}
                      </div>
                      <button onClick={() => handleRecuperarFactura(factura)} className="btn btn-sm bg-orange-500 text-white border-orange-500 hover:bg-orange-600 whitespace-nowrap">
                        <RotateCcw size={13} className="mr-1" /> Recuperar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ========== VISTA LISTADO (GRID DE CLIENTES) ==========
  const renderListaClientes = () => {
    const sinCajaCount = contarClientesSinCaja()

    return (
      <div className="space-y-6 animate-fade-in-up">
        {/* Filtros */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <input type="text" value={clienteQuery} onChange={(e) => setClienteQuery(e.target.value)} placeholder="Buscar cliente..." className="input flex-1 md:max-w-md bg-gray-50" />
          <div className="flex items-center gap-3">
            {sinCajaCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-red-700 bg-red-50 px-3 py-1.5 rounded-full font-medium border border-red-200">
                <AlertTriangle size={14} /> {sinCajaCount} sin caja
              </span>
            )}
            <button onClick={loadReporte} className="btn btn-outline"><RefreshCw size={16} className="mr-2" /> Actualizar</button>
          </div>
        </div>

        {/* Empty State */}
        {clientes.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-16">
            <User className="mx-auto text-gray-300 mb-4" size={64} />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No hay entregas pendientes</h3>
            <p className="text-gray-500">Cuando registres faltantes en las facturas, aparecerán aquí.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {clientes
              .filter(c => c.nombre.toLowerCase().includes(clienteQuery.toLowerCase()))
              .map((cliente, idx) => {
                const esSinCaja = clienteTieneSinCaja(cliente)
                const procesadas = cliente.facturas_con_faltantes.filter(f => { const e = getFacturaEstado(f); return e.estado === 'procesado' }).length
                const pendientes = cliente.facturas_con_faltantes.filter(f => { const e = getFacturaEstado(f); return e.estado === 'pendiente' && e.origen === 'manual' }).length

                return (
                  <div
                    key={idx}
                    onClick={() => setClienteActivoNombre(cliente.nombre)}
                    className={`group bg-white rounded-xl shadow-sm hover:shadow-lg border p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden ${esSinCaja ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100'
                      }`}
                  >
                    <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-[100px] -z-10 group-hover:bg-purple-100 transition-colors"></div>

                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-2.5 rounded-lg ${esSinCaja ? 'bg-red-100' : 'bg-purple-100'}`}>
                        <User className={esSinCaja ? 'text-red-600' : 'text-purple-600'} size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 truncate">{cliente.nombre}</h3>
                        {cliente.email && <p className="text-xs text-gray-500 truncate">{cliente.email}</p>}
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {esSinCaja && (
                        <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold uppercase">📦 Sin Caja</span>
                      )}
                      {procesadas > 0 && (
                        <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">✓ {procesadas} procesada{procesadas > 1 ? 's' : ''}</span>
                      )}
                      {pendientes > 0 && (
                        <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">⏳ {pendientes} pendiente{pendientes > 1 ? 's' : ''}</span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 pt-3 border-t border-gray-50">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Facturas</p>
                        <p className="text-xl font-bold text-gray-800">{cliente.facturas_con_faltantes.length}</p>
                      </div>
                      <div className="h-8 w-[1px] bg-gray-200"></div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Pendientes</p>
                        <p className="text-xl font-bold text-purple-600">{cliente.total_cantidad}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {/* Resumen Global */}
        {resumen && (
          <div className="mt-8 pt-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 opacity-70">
            <div className="text-center"><p className="text-sm text-gray-500">Clientes</p><p className="text-xl font-bold text-gray-800">{clientes.length}</p></div>
            <div className="text-center"><p className="text-sm text-gray-500">Facturas Afectadas</p><p className="text-xl font-bold text-gray-800">{resumen.total_facturas_afectadas}</p></div>
            <div className="text-center"><p className="text-sm text-gray-500">Productos Pendientes</p><p className="text-xl font-bold text-gray-800">{resumen.total_cantidad_faltante}</p></div>
            <div className="text-center"><p className="text-sm text-gray-500">Ajustes Hechos</p><p className="text-xl font-bold text-gray-800">{contarAjustes()}</p></div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-24">
      <div className="mb-8 pl-1">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Faltantes por Cliente</h1>
        <p className="text-gray-500 mt-2 text-lg">Ajusta entregas, procesa facturas y controla el estado de los pedidos.</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded shadow-sm">
          <div className="flex items-center"><AlertCircle className="text-red-500 mr-2" /><p className="text-red-700 font-medium">Error: {error}</p></div>
        </div>
      )}

      {!clienteActivoNombre ? renderListaClientes() : renderClienteDetalle()}
    </div>
  )
}
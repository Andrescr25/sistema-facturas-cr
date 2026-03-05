import { useState, useEffect } from 'react'
import { User, Package, FileText, AlertCircle, RefreshCw, Clock, Mail, Check, Calculator, Undo2, X, RotateCcw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
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
  const [clientesColapsados, setClientesColapsados] = useState(new Set())

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
        setClientesColapsados(new Set(result.data.map(c => c.nombre)))

        const estadosMap = new Map()
        const ajustesMap = new Map()

        result.data.forEach((cliente) => {
          cliente.facturas_con_faltantes.forEach((factura) => {
            const facturaKey = getFacturaKey(factura)

            if (factura.estado_procesamiento === 'procesado') {
              estadosMap.set(facturaKey, {
                estado: 'procesado',
                timestamp: factura.fecha_procesamiento || new Date().toISOString(),
                ajustes: [],
                requiere_reimpresion: false,
                origen: 'procesado'
              })
            } else if (factura.en_cola_impresion) {
              estadosMap.set(facturaKey, {
                estado: 'en_cola_impresion',
                timestamp: new Date().toISOString(),
                ajustes: [],
                requiere_reimpresion: true,
                origen: 'cola_impresion'
              })
            }

            factura.productos_faltantes.forEach((producto) => {
              const key = getProductKey(factura, producto)
              if (producto.cantidad_entregada > 0 || producto.ajuste_estado !== 'pendiente') {
                const cantidadEntregada = producto.cantidad_entregada || 0
                const cantidadAReducir = Math.max(producto.cantidad_faltante - cantidadEntregada, 0)

                ajustesMap.set(key, {
                  faltanteId: producto.faltante_id,
                  cantidadFaltante: producto.cantidad_faltante,
                  cantidadEntregada,
                  cantidadAReducir,
                  estado: producto.ajuste_estado,
                  tieneAjuste: true,
                  requiereActualizacion: producto.requiere_actualizacion
                })
              }
            })

            if (factura.es_pendiente_manual && !estadosMap.has(facturaKey)) {
              estadosMap.set(facturaKey, {
                estado: 'pendiente',
                timestamp: factura.pendiente_desde || new Date().toISOString(),
                ajustes: [],
                requiere_reimpresion: false,
                origen: 'manual',
                motivo: factura.pendiente_motivo || ''
              })
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
        ajustesFactura.push({
          producto_codigo: producto.codigo,
          producto_nombre: producto.nombre,
          cantidad_faltante: producto.cantidad_faltante,
          cantidad_entregada: ajuste.cantidadEntregada,
          estado: ajuste.estado,
          requiere_actualizacion: ajuste.requiereActualizacion
        })
      } else {
        ajustesFactura.push({
          producto_codigo: producto.codigo,
          producto_nombre: producto.nombre,
          cantidad_faltante: producto.cantidad_faltante,
          cantidad_entregada: 0,
          estado: 'pendiente',
          requiere_actualizacion: true
        })
      }
    })

    const facturaData = {
      alegra_id: factura.alegra_id,
      numero_factura: factura.numero_factura,
      cliente_nombre: clienteNombre,
      fecha_emision: factura.fecha_emision,
      ajustes: ajustesFactura,
      estado: ajustesFactura.length > 0 ?
        (ajustesFactura.some(aj => aj.requiere_actualizacion) ? 'requiere_reimpresion_con_ajustes' : 'requiere_reimpresion_solo_precios') :
        'requiere_reimpresion_solo_precios',
      marcar_como_procesada: false
    }

    const ajustesHechos = ajustesFactura.filter(aj => aj.cantidad_entregada > 0).length
    const faltantesPendientes = ajustesFactura.filter(aj => aj.cantidad_entregada === 0).length
    const requiereReimpresion = ajustesFactura.some(aj => aj.requiere_actualizacion)

    const resumenMsg = `📋 Procesar Factura #${factura.numero_factura}:\n\nCliente: ${clienteNombre}\nTotal productos con faltantes: ${ajustesFactura.length}\n  • Ajustados en este reporte: ${ajustesHechos}\n  • Pendientes de ajustar: ${faltantesPendientes}\n\n${requiereReimpresion ?
      '🖨️ Se enviará a Impresión para hacer cambios' :
      '✅ Se enviará a Impresión sin cambios necesarios'}\n\n¿Continuar?`

    if (!window.confirm(resumenMsg)) return

    try {
      await alegraService.procesarFacturaIndividual(facturaData)

      const facturaKey = getFacturaKey(factura)
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.set(facturaKey, {
        estado: 'procesado',
        timestamp: new Date().toISOString(),
        ajustes: ajustesFactura,
        requiere_reimpresion: requiereReimpresion,
        origen: 'procesado'
      })
      setFacturasEstado(nuevosEstados)

      setClientes(prev =>
        prev.map(cliente => {
          if (cliente.nombre !== clienteNombre) return cliente
          const facturasActualizadas = cliente.facturas_con_faltantes.map(f => {
            if (getFacturaKey(f) !== facturaKey) return f
            return { ...f, es_pendiente_manual: false, pendiente_desde: null, pendiente_motivo: null }
          })
          return { ...cliente, facturas_con_faltantes: facturasActualizadas }
        })
      )

      alert(`✅ Factura #${factura.numero_factura} enviada a Impresión\n\n📋 Resumen:\n• Productos con faltantes: ${ajustesFactura.length}\n• Requiere cambios: ${requiereReimpresion ? 'Sí' : 'No'}\n\n🖨️ Ve al Centro de Impresión para procesarla.\n\n💡 La factura permanece visible aquí (tachada).\nUsa "Recuperar" si necesitas editarla antes de imprimir.`)
    } catch (error) {
      alert(`❌ Error procesando factura: ${error.message}`)
    }
  }

  const handleRecuperarFactura = async (factura) => {
    const facturaKey = getFacturaKey(factura)
    if (!window.confirm(`¿Recuperar factura #${factura.numero_factura} para editarla nuevamente?\n\nEsto deshará el procesamiento en la base de datos.`)) return

    try {
      await alegraService.recuperarFactura(factura.alegra_id)
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.delete(facturaKey)
      setFacturasEstado(nuevosEstados)

      setClientes(prev =>
        prev.map(cliente => {
          const facturasActualizadas = cliente.facturas_con_faltantes.map(f => {
            if (getFacturaKey(f) !== facturaKey) return f
            return { ...f, es_pendiente_manual: false, pendiente_desde: null, pendiente_motivo: null }
          })
          return { ...cliente, facturas_con_faltantes: facturasActualizadas }
        })
      )
      alert(`✅ Factura #${factura.numero_factura} recuperada.\n\nPuede editarla nuevamente.\n\n🔄 El cambio se mantiene permanentemente en la base de datos.`)
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

      setClientes(prev =>
        prev.map(cliente => {
          if (cliente.nombre !== clienteNombre) return cliente
          const facturasActualizadas = cliente.facturas_con_faltantes.map(f => {
            if (getFacturaKey(f) !== facturaKey) return f
            return { ...f, es_pendiente_manual: true, pendiente_desde: timestamp, pendiente_motivo: motivo }
          })
          return { ...cliente, facturas_con_faltantes: facturasActualizadas }
        })
      )
      alert(`⌛ Factura #${factura.numero_factura} marcada como pendiente.\n\nSe mantendrá visible hasta que quites el estado.`)
    } catch (error) {
      alert(`❌ Error marcando factura como pendiente: ${error.message}`)
    }
  }

  const handleQuitarFacturaPendiente = async (factura, clienteNombre) => {
    const facturaKey = getFacturaKey(factura)
    if (!window.confirm(`¿Quitar el estado pendiente de la factura #${factura.numero_factura}?`)) return

    try {
      await alegraService.quitarFacturaPendiente(factura.alegra_id)
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.delete(facturaKey)
      setFacturasEstado(nuevosEstados)

      setClientes(prev =>
        prev.map(cliente => {
          if (cliente.nombre !== clienteNombre) return cliente
          const facturasActualizadas = cliente.facturas_con_faltantes.map(f => {
            if (getFacturaKey(f) !== facturaKey) return f
            return { ...f, es_pendiente_manual: false, pendiente_desde: null, pendiente_motivo: null }
          })
          return { ...cliente, facturas_con_faltantes: facturasActualizadas }
        })
      )
      alert(`✅ Estado pendiente removido de la factura #${factura.numero_factura}.`)
    } catch (error) {
      alert(`❌ Error quitando estado pendiente: ${error.message}`)
    }
  }

  // ==================== FUNCIONES DE UTILIDAD ====================

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
    if (!ajuste) {
      return { faltanteId: producto.faltante_id, cantidadFaltante: producto.cantidad_faltante, cantidadEntregada: 0, cantidadAReducir: 0, estado: 'pendiente', tieneAjuste: false, requiereActualizacion: false }
    }
    return { ...ajuste, tieneAjuste: true }
  }

  const getFacturaEstado = (factura) => {
    const facturaKey = getFacturaKey(factura)
    return facturasEstado.get(facturaKey) || { estado: 'pendiente', origen: 'default' }
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
      setError(`Error guardando ajuste para ${producto.codigo || 'producto'}: ${error.message}`)
      throw error
    }
  }

  const eliminarAjusteDeBD = async (producto) => {
    if (!producto?.faltante_id) return
    try {
      await alegraService.eliminarAjusteFaltante(producto.faltante_id)
    } catch (error) {
      setError(`Error eliminando ajuste para ${producto.codigo || 'producto'}: ${error.message}`)
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

    let estado = 'pendiente'
    let cantidadAReducir = 0
    let requiereActualizacion = false

    if (cantidadNormalizada >= cantidadFaltante) {
      estado = 'completo'; cantidadAReducir = 0; requiereActualizacion = false
    } else if (cantidadNormalizada > 0) {
      estado = 'parcial'; cantidadAReducir = Math.max(cantidadFaltante - cantidadNormalizada, 0); requiereActualizacion = true
    } else {
      estado = 'pendiente'; requiereActualizacion = false
    }

    if (cantidadNormalizada === 0) {
      newMap.delete(key)
      setEntregasAjustadas(newMap)
      try { await eliminarAjusteDeBD(producto) } catch (error) { setEntregasAjustadas(prevMap) }
      return
    }

    newMap.set(key, { faltanteId: producto.faltante_id, cantidadFaltante, cantidadEntregada: cantidadNormalizada, cantidadAReducir, estado, tieneAjuste: true, requiereActualizacion })
    setEntregasAjustadas(newMap)

    try {
      await guardarAjusteEnBD(producto, { cantidad_entregada: cantidadNormalizada, estado, requiere_actualizacion: requiereActualizacion })
    } catch (error) { setEntregasAjustadas(prevMap) }
  }

  const handleMarcarCompleto = async (key, producto) => {
    const entregaAnterior = getEntregaInfo(key, producto)
    guardarHistorial(key, 'marcar_completo', entregaAnterior.cantidadEntregada, producto.cantidad_faltante)
    await handleCantidadEntregadaChange(key, producto.cantidad_faltante, producto)
  }

  const handleDeshacer = async (key, producto) => {
    const entregaAnterior = getEntregaInfo(key, producto)
    guardarHistorial(key, 'deshacer', entregaAnterior.cantidadEntregada, 0)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    newMap.delete(key)
    setEntregasAjustadas(newMap)
    try { await eliminarAjusteDeBD(producto) } catch (error) { setEntregasAjustadas(prevMap) }
  }

  const handleNoLlegoNada = async (key, producto) => {
    const entregaAnterior = getEntregaInfo(key, producto)
    guardarHistorial(key, 'no_llego_nada', entregaAnterior.cantidadEntregada, -1)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    newMap.set(key, { faltanteId: producto.faltante_id, cantidadFaltante: producto.cantidad_faltante, cantidadEntregada: 0, cantidadAReducir: producto.cantidad_faltante, estado: 'no_llego', tieneAjuste: true, requiereActualizacion: true })
    setEntregasAjustadas(newMap)
    try {
      await guardarAjusteEnBD(producto, { cantidad_entregada: 0, estado: 'no_llego', requiere_actualizacion: true })
    } catch (error) { setEntregasAjustadas(prevMap) }
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

  // ==================== NUEVA LÓGICA: CLIENTES SIN CAJA ====================
  const getClientesSinCaja = () => {
    const resultado = []
    clientes.forEach(cliente => {
      const facturasSinCaja = cliente.facturas_con_faltantes.filter(factura => {
        const estadoFactura = getFacturaEstado(factura)
        if (estadoFactura.estado === 'procesado') return false // ignorar ya procesadas
        const productosValidos = factura.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0)
        if (productosValidos.length === 0) return false
        return productosValidos.every(p => p.tipo_faltante === 'total')
      })
      if (facturasSinCaja.length > 0) {
        resultado.push({ nombre: cliente.nombre, facturas: facturasSinCaja })
      }
    })
    return resultado
  }

  // ==================== RENDERIZADO ====================
  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto text-center py-12">
        <div className="spinner mx-auto mb-4 border-t-2 border-b-2 border-purple-500 rounded-full w-12 h-12 animate-spin"></div>
        <p className="text-gray-600">Generando reporte de faltantes por cliente...</p>
      </div>
    )
  }

  const clientesSinCaja = getClientesSinCaja()

  return (
    <div className="max-w-[1400px] mx-auto pb-24">
      {/* Encabezado Premium */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="pl-1">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Faltantes por Cliente</h1>
          <p className="text-gray-500 mt-2 text-lg">Ajusta entregas, procesa facturas y controla el estado de los pedidos.</p>
          <div className="flex flex-wrap items-center gap-4 mt-3">
            {contarAjustes() > 0 && (
              <span className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full font-medium">
                {contarAjustes()} producto{contarAjustes() > 1 ? 's' : ''} con ajustes
              </span>
            )}
            {contarFacturasPendientes() > 0 && (
              <span className="text-sm text-yellow-700 bg-yellow-50 px-3 py-1 rounded-full font-medium">
                ⏳ {contarFacturasPendientes()} pendiente{contarFacturasPendientes() > 1 ? 's' : ''}
              </span>
            )}
            {contarFacturasProcesadas() > 0 && (
              <span className="text-sm text-green-700 bg-green-50 px-3 py-1 rounded-full font-medium">
                ✓ {contarFacturasProcesadas()} procesada{contarFacturasProcesadas() > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={clienteQuery} onChange={(e) => setClienteQuery(e.target.value)} placeholder="Buscar cliente..." className="input w-64 bg-gray-50" />
          <button onClick={loadReporte} className="btn btn-outline"><RefreshCw size={16} className="mr-2" /> Actualizar</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded shadow-sm">
          <div className="flex items-center"><AlertCircle className="text-red-500 mr-2" /><p className="text-red-700 font-medium">Error: {error}</p></div>
        </div>
      )}

      {/* Stats Cards */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-xl"><User className="text-purple-600" size={24} /></div>
            <div><p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Clientes</p><p className="text-2xl font-bold text-gray-900">{clientes.length}</p></div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-xl"><FileText className="text-orange-600" size={24} /></div>
            <div><p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Facturas</p><p className="text-2xl font-bold text-gray-900">{resumen.total_facturas_afectadas}</p></div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-xl"><Package className="text-red-600" size={24} /></div>
            <div><p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Productos</p><p className="text-2xl font-bold text-gray-900">{resumen.total_cantidad_faltante}</p></div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl"><Calculator className="text-blue-600" size={24} /></div>
            <div><p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Ajustes</p><p className="text-2xl font-bold text-gray-900">{contarAjustes()}</p></div>
          </div>
        </div>
      )}

      {/* 🚨 ALERTA: CLIENTES SIN CAJA */}
      {clientesSinCaja.length > 0 && (
        <div className="mb-8 bg-red-50 border-2 border-red-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-100 rounded-xl flex-shrink-0">
              <AlertTriangle className="text-red-600" size={28} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 mb-1">🚨 Clientes sin Caja</h3>
              <p className="text-sm text-red-700 mb-4">
                Las siguientes facturas tienen el <strong>100% de sus productos registrados como faltante total</strong>, lo que indica que no tienen caja ni empaque en bodega.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {clientesSinCaja.map((item, idx) => (
                  <div key={idx} className="bg-white border border-red-100 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{item.nombre}</p>
                      <p className="text-xs text-red-600">
                        {item.facturas.map(f => `#${f.numero_factura}`).join(', ')}
                      </p>
                    </div>
                    <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full">
                      {item.facturas.length} factura{item.facturas.length > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Clientes */}
      {clientes.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-16">
          <User className="mx-auto text-gray-300 mb-4" size={64} />
          <h3 className="text-xl font-bold text-gray-900 mb-2">No hay entregas pendientes</h3>
          <p className="text-gray-500">Cuando registres faltantes en las facturas, aparecerán aquí organizados por cliente.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {clientes
            .filter(c => c.nombre.toLowerCase().includes(clienteQuery.toLowerCase()))
            .map((cliente, clienteIndex) => {
              const esSinCaja = clientesSinCaja.some(sc => sc.nombre === cliente.nombre)
              const estaColapsado = clientesColapsados.has(cliente.nombre)

              return (
                <div key={clienteIndex} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${esSinCaja ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100'}`}>
                  {/* Header del Cliente */}
                  <div
                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => {
                      const next = new Set(clientesColapsados)
                      if (next.has(cliente.nombre)) next.delete(cliente.nombre); else next.add(cliente.nombre)
                      setClientesColapsados(next)
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${esSinCaja ? 'bg-red-100' : 'bg-purple-100'}`}>
                        <User className={esSinCaja ? 'text-red-600' : 'text-purple-600'} size={24} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-bold text-gray-900">{cliente.nombre}</h3>
                          {esSinCaja && (
                            <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Sin Caja</span>
                          )}
                        </div>
                        {cliente.email && (
                          <p className="text-gray-500 flex items-center text-sm mt-0.5"><Mail size={13} className="mr-1.5" /> {cliente.email}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1"><Clock size={12} className="inline mr-1" /> {formatDateTime(cliente.ultima_actividad)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="text-right hidden md:block">
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Pendientes</p>
                        <p className="text-2xl font-bold text-purple-600">{cliente.total_cantidad}</p>
                        <p className="text-xs text-gray-500">{cliente.facturas_con_faltantes.length} factura{cliente.facturas_con_faltantes.length > 1 ? 's' : ''}</p>
                      </div>
                      <div className="text-gray-400">
                        {estaColapsado ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
                      </div>
                    </div>
                  </div>

                  {/* Contenido expandible: Facturas */}
                  {!estaColapsado && (
                    <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/30">
                      {cliente.facturas_con_faltantes.map((factura) => {
                        const estadoFactura = getFacturaEstado(factura)
                        const estaProcesada = estadoFactura.estado === 'procesado' || estadoFactura.estado === 'en_cola_impresion'
                        const estaPendienteManual = estadoFactura.estado === 'pendiente' && estadoFactura.origen === 'manual'
                        const productosValidos = factura.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0)
                        const esFacturaSinCaja = productosValidos.length > 0 && productosValidos.every(p => p.tipo_faltante === 'total') && !estaProcesada

                        return (
                          <div key={getFacturaKey(factura)} className={`rounded-xl p-5 transition-all border-l-4 ${estaProcesada ? 'bg-gray-100 border-l-green-400 opacity-70' :
                              estaPendienteManual ? 'bg-yellow-50 border-l-yellow-400' :
                                esFacturaSinCaja ? 'bg-red-50/50 border-l-red-400' :
                                  'bg-white border-l-gray-200'
                            }`}>
                            {/* Header de la Factura */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
                              <div>
                                <h5 className={`font-bold text-lg ${estaProcesada ? 'text-gray-400 line-through' : estaPendienteManual ? 'text-yellow-800' : 'text-gray-900'}`}>
                                  {estaProcesada && <Check size={16} className="inline text-green-600 mr-1" />}
                                  Factura #{factura.numero_factura}
                                  {estaProcesada && <span className="ml-2 px-2.5 py-0.5 text-xs bg-green-100 text-green-800 rounded-full font-medium">✓ Procesada</span>}
                                  {estaPendienteManual && <span className="ml-2 px-2.5 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full font-medium">⏳ Pendiente</span>}
                                  {esFacturaSinCaja && <span className="ml-2 px-2.5 py-0.5 text-xs bg-red-100 text-red-800 rounded-full font-medium">📦 Sin Caja</span>}
                                </h5>
                                <p className={`text-sm ${estaProcesada ? 'text-gray-400' : 'text-gray-500'}`}>
                                  Fecha: {formatDate(factura.fecha_emision)}
                                </p>
                                {estaProcesada && estadoFactura.timestamp && (
                                  <p className="text-xs text-green-600 mt-1">Procesada: {formatDateTime(estadoFactura.timestamp)}</p>
                                )}
                                {estaPendienteManual && estadoFactura.timestamp && (
                                  <p className="text-xs text-yellow-700 mt-1">Pendiente desde: {formatDateTime(estadoFactura.timestamp)}</p>
                                )}
                                {estaPendienteManual && estadoFactura.motivo && (
                                  <p className="text-xs text-yellow-700 mt-0.5">Motivo: {estadoFactura.motivo}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <p className={`text-sm font-medium ${estaProcesada ? 'text-gray-400' : 'text-gray-600'}`}>{productosValidos.length} producto{productosValidos.length > 1 ? 's' : ''}</p>
                                  {(() => {
                                    if (estaProcesada) return <p className="text-xs text-green-600">{estadoFactura.requiere_reimpresion ? '🖨️ En impresión' : '📚 En historial'}</p>
                                    if (estaPendienteManual) return <p className="text-xs text-yellow-600">⌛ Esperando entrega</p>
                                    const ajustesEnFactura = factura.productos_faltantes.map(p => entregasAjustadas.get(getProductKey(factura, p))).filter(Boolean)
                                    if (ajustesEnFactura.length === 0) return null
                                    const todosResueltos = ajustesEnFactura.every(a => a.estado === 'completo')
                                    if (todosResueltos) return <p className="text-xs text-green-600">✓ Sin cambios en factura</p>
                                    if (ajustesEnFactura.some(a => a.requiereActualizacion)) return <p className="text-xs text-blue-600">✓ Tiene ajustes</p>
                                    return null
                                  })()}
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  {!estaProcesada ? (
                                    <>
                                      <button onClick={() => handleFacturaLista(cliente.nombre, factura)} className="btn btn-primary btn-sm flex items-center whitespace-nowrap">
                                        <Check size={14} className="mr-1.5" /> Factura Lista
                                      </button>
                                      {estaPendienteManual ? (
                                        <button onClick={() => handleQuitarFacturaPendiente(factura, cliente.nombre)} className="btn btn-outline btn-sm text-yellow-800 border-yellow-600 hover:bg-yellow-50 flex items-center whitespace-nowrap">
                                          <X size={14} className="mr-1.5" /> Quitar Pendiente
                                        </button>
                                      ) : (
                                        <button onClick={() => handleMarcarFacturaPendiente(factura, cliente.nombre)} className="btn btn-outline btn-sm text-yellow-700 border-yellow-500 hover:bg-yellow-50 flex items-center whitespace-nowrap">
                                          <Clock size={14} className="mr-1.5" /> Pendiente
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <button onClick={() => handleRecuperarFactura(factura)} className="btn btn-sm bg-orange-600 text-white border-orange-600 hover:bg-orange-700 flex items-center whitespace-nowrap">
                                      <RotateCcw size={14} className="mr-1.5" /> Recuperar
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Lista de productos faltantes */}
                            <div className={`space-y-2.5 ${estaProcesada ? 'pointer-events-none' : ''}`}>
                              {productosValidos.map((producto) => {
                                const productoKey = getProductKey(factura, producto)
                                const entrega = getEntregaInfo(productoKey, producto)
                                const estaCompleto = entrega.estado === 'completo'
                                const estaParcial = entrega.estado === 'parcial'
                                const noLlego = entrega.estado === 'no_llego'
                                const tieneAjuste = entrega.tieneAjuste

                                return (
                                  <div key={productoKey} className={`rounded-lg p-4 border transition-all ${estaProcesada ? 'border-gray-200 bg-gray-50/50 opacity-60' :
                                      estaCompleto ? 'border-green-200 bg-green-50' :
                                        estaParcial ? 'border-blue-200 bg-blue-50' :
                                          noLlego ? 'border-red-200 bg-red-50' :
                                            tieneAjuste ? 'border-yellow-200 bg-yellow-50' :
                                              'border-gray-100 bg-white'
                                    }`}>
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                                      {/* Info del producto */}
                                      <div className="lg:col-span-5">
                                        <h6 className={`font-semibold ${estaProcesada ? 'text-gray-400 line-through' : estaCompleto ? 'line-through text-green-700' : 'text-gray-900'}`}>
                                          {(estaCompleto || estaProcesada) && <Check size={14} className="inline text-green-600 mr-1" />}
                                          {producto.nombre}
                                        </h6>
                                        <p className={`text-xs ${estaProcesada ? 'text-gray-400' : 'text-gray-500'}`}>
                                          Código: {producto.codigo} • Proveedor: {producto.proveedor}
                                        </p>
                                        {producto.observaciones && (
                                          <p className={`text-xs text-orange-600 mt-1 ${(estaCompleto || estaProcesada) ? 'line-through opacity-60' : ''}`}>
                                            📝 {producto.observaciones}
                                          </p>
                                        )}
                                      </div>

                                      {/* Faltante */}
                                      <div className="lg:col-span-2">
                                        <p className={`text-xs mb-1 ${estaProcesada ? 'text-gray-400' : 'text-gray-500'}`}>Faltante:</p>
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${estaProcesada ? 'bg-gray-100 text-gray-500' :
                                            producto.tipo_faltante === 'total' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                          }`}>
                                          {producto.cantidad_faltante} uds {producto.tipo_faltante === 'total' ? '(total)' : '(parcial)'}
                                        </span>
                                      </div>

                                      {/* Cantidad entregada */}
                                      <div className="lg:col-span-2">
                                        <label className={`text-xs block mb-1 ${estaProcesada ? 'text-gray-400' : 'text-gray-500'}`}>Entregado:</label>
                                        <input
                                          type="number" min="0" max={producto.cantidad_faltante}
                                          value={entrega.cantidadEntregada}
                                          onChange={(e) => handleCantidadEntregadaChange(productoKey, e.target.value, producto)}
                                          disabled={estaCompleto || estaProcesada}
                                          className={`input w-full ${(estaCompleto || estaProcesada) ? 'bg-gray-100 text-gray-500' : ''}`}
                                          placeholder="0"
                                        />
                                      </div>

                                      {/* Estado */}
                                      <div className="lg:col-span-1">
                                        <p className={`text-xs mb-1 ${estaProcesada ? 'text-gray-400' : 'text-gray-500'}`}>Estado:</p>
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ${estaProcesada ? 'bg-gray-100 text-gray-500' :
                                            entrega.estado === 'completo' ? 'bg-green-100 text-green-800' :
                                              entrega.estado === 'parcial' ? 'bg-blue-100 text-blue-800' :
                                                entrega.estado === 'no_llego' ? 'bg-red-100 text-red-800' :
                                                  'bg-gray-100 text-gray-800'
                                          }`}>
                                          {estaProcesada ? '✓' : entrega.estado === 'completo' ? '✓' : entrega.estado === 'parcial' ? '◐' : entrega.estado === 'no_llego' ? '✗' : '○'}
                                        </span>
                                      </div>

                                      {/* Acciones */}
                                      <div className="lg:col-span-2">
                                        {!estaProcesada && (
                                          <div className="flex gap-1.5 flex-wrap">
                                            {!estaCompleto && entrega.estado !== 'no_llego' && (
                                              <>
                                                <button onClick={() => handleMarcarCompleto(productoKey, producto)} className="btn btn-sm bg-green-600 text-white border-green-600 hover:bg-green-700" title="Completo">
                                                  <Check size={13} />
                                                </button>
                                                <button onClick={() => handleNoLlegoNada(productoKey, producto)} className="btn btn-sm bg-red-600 text-white border-red-600 hover:bg-red-700" title="No llegó">
                                                  <X size={13} />
                                                </button>
                                              </>
                                            )}
                                            {tieneAjuste && (
                                              <button onClick={() => handleDeshacer(productoKey, producto)} className="btn btn-sm bg-orange-500 text-white border-orange-500 hover:bg-orange-600" title="Deshacer">
                                                <Undo2 size={13} />
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Info de cálculo */}
                                    {entrega.cantidadEntregada > 0 && !estaProcesada && (
                                      <div className="mt-3 p-2 bg-blue-50 rounded-md border border-blue-200">
                                        <div className="flex items-center justify-between text-sm">
                                          <div className="flex items-center text-blue-800">
                                            <Calculator size={14} className="mr-1.5" />
                                            <span>{entrega.estado === 'completo' ? 'Faltante resuelto - Sin cambios en factura' : `Factura se reducirá en: ${entrega.cantidadAReducir} unidades`}</span>
                                          </div>
                                          <span className="text-blue-600 font-medium">{entrega.cantidadEntregada}/{producto.cantidad_faltante}</span>
                                        </div>
                                      </div>
                                    )}

                                    {estaProcesada && estadoFactura.ajustes && (
                                      <div className="mt-3 p-2 bg-green-50 rounded-md border border-green-200">
                                        <div className="flex items-center justify-between text-sm">
                                          <div className="flex items-center text-green-800">
                                            <Check size={14} className="mr-1.5" />
                                            <span>Procesado - Ajustes en {estadoFactura.requiere_reimpresion ? 'impresión' : 'historial'}</span>
                                          </div>
                                          <span className="text-green-600 font-medium text-xs">{formatDateTime(estadoFactura.timestamp)}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>

                            {/* Observaciones adicionales */}
                            {factura.observaciones_adicionales && (
                              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <h6 className="font-medium text-yellow-900 mb-1 text-sm">📝 Encargos adicionales:</h6>
                                <p className="text-sm text-yellow-800">{factura.observaciones_adicionales}</p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
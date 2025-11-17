import { useState, useEffect } from 'react'
import { User, Package, FileText, AlertCircle, RefreshCw, Clock, Mail, Check, Edit, Calculator, Undo2, X, RotateCcw } from 'lucide-react'
import { alegraService } from '../services/alegraService'

export default function ReporteClientes() {
  const [clientes, setClientes] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [entregasAjustadas, setEntregasAjustadas] = useState(new Map())
  const [historialCambios, setHistorialCambios] = useState(new Map())
  const [facturasEstado, setFacturasEstado] = useState(new Map()) // NUEVO: Para manejar estados
  const [clienteQuery, setClienteQuery] = useState('') // NUEVO: búsqueda
  const [clientesColapsados, setClientesColapsados] = useState(new Set()) // NUEVO: colapsables

  useEffect(() => {
    loadReporte()
  }, [])

  const loadReporte = async () => {
    try {
      setLoading(true)
      setError(null)

     const result = await alegraService.getReporteFaltantesCliente()

      if (result.success) {
        console.log('🔍 DEBUG: Datos completos del backend:', result.data);
        console.log('🔍 DEBUG: Primera factura:', result.data[0]?.facturas_con_faltantes[0]);
        setClientes(result.data)
        setResumen(result.resumen)
        // Colapsar todos los clientes por defecto
        setClientesColapsados(new Set(result.data.map(c => c.nombre)))

        // NUEVO: Cargar estados y ajustes desde BD
        const estadosMap = new Map()
        const ajustesMap = new Map()

        result.data.forEach((cliente) => {
          cliente.facturas_con_faltantes.forEach((factura) => {
            const facturaKey = getFacturaKey(factura)

            // Cargar estado de factura desde BD
            if (factura.estado_procesamiento === 'procesado') {
              estadosMap.set(facturaKey, {
                estado: 'procesado',
                timestamp: factura.fecha_procesamiento || new Date().toISOString(),
                ajustes: [],
            requiere_reimpresion: false,
            origen: 'procesado'
              })
            }

            // Cargar ajustes desde BD
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

        console.log(`🔄 Estados cargados desde BD: ${estadosMap.size} facturas procesadas`)
        console.log(`🔄 Ajustes cargados desde BD: ${ajustesMap.size} productos con ajustes`)

      } else {
        setError(result.message || 'Error cargando reporte')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFacturaLista = async (clienteNombre, factura) => {
    // Recopilar ajustes de esta factura específica
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
      }
    })

    // Preparar datos para enviar
    const facturaData = {
      alegra_id: factura.alegra_id,
      numero_factura: factura.numero_factura,
      cliente_nombre: clienteNombre,
      fecha_emision: factura.fecha_emision,
      ajustes: ajustesFactura,
      estado: ajustesFactura.length > 0 ?
        (ajustesFactura.some(aj => aj.requiere_actualizacion) ? 'requiere_reimpresion_con_ajustes' : 'requiere_reimpresion_solo_precios') :
        'requiere_reimpresion_solo_precios'
    }

    const tieneAjustes = ajustesFactura.length > 0
    const requiereReimpresion = true

    const resumen = `📋 Procesar Factura #${factura.numero_factura}:

Cliente: ${clienteNombre}
Ajustes realizados: ${ajustesFactura.length}
${tieneAjustes ?
        `Estado: ${requiereReimpresion ? '🖨️ Requiere reimpresión en Alegra' : '✅ Resuelto sin cambios'}` :
        'Estado: ℹ️ Sin ajustes - Solo se enviará al historial'
      }

La factura se marcará como procesada en la base de datos.
¿Continuar?`

    if (!window.confirm(resumen)) {
      return
    }

    try {
      // Enviar al endpoint individual
      const resultado = await alegraService.procesarFacturaIndividual(facturaData)

      // Actualizar estado local inmediatamente
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
            return {
              ...f,
              es_pendiente_manual: false,
              pendiente_desde: null,
              pendiente_motivo: null
            }
          })
          return {
            ...cliente,
            facturas_con_faltantes: facturasActualizadas
          }
        })
      )

      alert(`✅ Factura #${factura.numero_factura} procesada correctamente\n\n${requiereReimpresion ? '🖨️ Enviada a reimpresión' : '📚 Enviada solo al historial'}\n\n💡 La factura permanece visible (tachada). Use "Recuperar" si necesita editarla.\n\n🔄 El estado se mantiene permanentemente en la base de datos.`)

    } catch (error) {
      alert(`❌ Error procesando factura: ${error.message}`)
    }
  }



  // NUEVO: Recuperar factura procesada
  const handleRecuperarFactura = async (factura) => {
    const facturaKey = getFacturaKey(factura)

    if (!window.confirm(`¿Recuperar factura #${factura.numero_factura} para editarla nuevamente?\n\nEsto deshará el procesamiento en la base de datos.`)) {
      return
    }

    try {
      // Llamar endpoint para recuperar (actualiza BD)
      await alegraService.recuperarFactura(factura.alegra_id)

      // Eliminar estado procesado del frontend
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.delete(facturaKey)
      setFacturasEstado(nuevosEstados)

      setClientes(prev =>
        prev.map(cliente => {
          const facturasActualizadas = cliente.facturas_con_faltantes.map(f => {
            if (getFacturaKey(f) !== facturaKey) return f
            return {
              ...f,
              es_pendiente_manual: false,
              pendiente_desde: null,
              pendiente_motivo: null
            }
          })
          return {
            ...cliente,
            facturas_con_faltantes: facturasActualizadas
          }
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
      nuevosEstados.set(facturaKey, {
        estado: 'pendiente',
        timestamp,
        ajustes: [],
        requiere_reimpresion: false,
        origen: 'manual',
        motivo: motivo || ''
      })
      setFacturasEstado(nuevosEstados)

      setClientes(prev =>
        prev.map(cliente => {
          if (cliente.nombre !== clienteNombre) return cliente

          const facturasActualizadas = cliente.facturas_con_faltantes.map(f => {
            if (getFacturaKey(f) !== facturaKey) return f

            return {
              ...f,
              es_pendiente_manual: true,
              pendiente_desde: timestamp,
              pendiente_motivo: motivo
            }
          })

          return {
            ...cliente,
            facturas_con_faltantes: facturasActualizadas
          }
        })
      )

      alert(`⌛ Factura #${factura.numero_factura} marcada como pendiente.\n\nSe mantendrá visible hasta que quites el estado.`)
    } catch (error) {
      alert(`❌ Error marcando factura como pendiente: ${error.message}`)
    }
  }

  const handleQuitarFacturaPendiente = async (factura, clienteNombre) => {
    const facturaKey = getFacturaKey(factura)

    if (!window.confirm(`¿Quitar el estado pendiente de la factura #${factura.numero_factura}?`)) {
      return
    }

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

            return {
              ...f,
              es_pendiente_manual: false,
              pendiente_desde: null,
              pendiente_motivo: null
            }
          })

          return {
            ...cliente,
            facturas_con_faltantes: facturasActualizadas
          }
        })
      )

      alert(`✅ Estado pendiente removido de la factura #${factura.numero_factura}.`)
    } catch (error) {
      alert(`❌ Error quitando estado pendiente: ${error.message}`)
    }
  }

  // MODIFICADO: Limpiar facturas procesadas del localStorage (no del backend)
  const handleLimpiarFacturasListas = async () => {
    // Filtrar solo facturas procesadas
    const facturasProcessadas = []

    clientes.forEach((cliente) => {
      cliente.facturas_con_faltantes.forEach((factura) => {
        const facturaKey = getFacturaKey(factura)
        const estadoFactura = facturasEstado.get(facturaKey)

        if (estadoFactura && estadoFactura.estado === 'procesado') {
          facturasProcessadas.push({
            facturaKey,
            factura,
            cliente: cliente.nombre
          })
        }
      })
    })

    if (facturasProcessadas.length === 0) {
      alert('ℹ️ No hay facturas procesadas para limpiar.\n\nPrimero marque facturas como "Factura Lista".')
      return
    }

    const resumen = `🧹 Limpieza de facturas procesadas:

- Total facturas procesadas: ${facturasProcessadas.length}
- Estas facturas se eliminarán permanentemente de la vista
- Los ajustes ya están guardados en historial/reimpresión
- Esto actualiza la base de datos permanentemente

¿Proceder con la limpieza?`

    if (!window.confirm(resumen)) {
      return
    }

    try {
      // Preparar datos para eliminar de BD
      const facturasIds = facturasProcessadas.map(({ factura }) => factura.alegra_id)

      // NUEVO: Llamar endpoint que elimina de BD
      const resultado = await alegraService.eliminarFacturasProceadas(facturasIds)

      // Limpiar estados del frontend
      const nuevosEstados = new Map()
      facturasEstado.forEach((valor, key) => {
        if (valor.estado !== 'procesado') {
          nuevosEstados.set(key, valor)
        }
      })
      setFacturasEstado(nuevosEstados)

      // Recargar datos desde BD
      await loadReporte()

      alert(`✅ Limpieza completada:\n• ${facturasProcessadas.length} facturas eliminadas permanentemente de la base de datos\n• Los datos se mantienen en el historial\n\n🔄 Vista actualizada desde la base de datos`)

    } catch (error) {
      alert(`❌ Error en limpieza: ${error.message}`)
    }
  }

  const getFacturaKey = (factura) => {
    if (!factura) return 'factura-desconocida'
    const identifier = factura.alegra_id ?? factura.factura_local_id ?? factura.numero_factura ?? factura.id ?? 'sin-identificador'
    return `factura-${identifier}`
  }

  const getProductKey = (factura, producto) => {
    if (producto?.faltante_id) {
      return `faltante-${producto.faltante_id}`
    }

    const facturaKey = getFacturaKey(factura)
    const productoId = producto?.producto_id ?? producto?.codigo ?? producto?.nombre ?? producto?.id ?? 'producto-sin-id'

    return `${facturaKey}::${productoId}`
  }

  const getEntregaInfo = (key, producto) => {
    const ajuste = entregasAjustadas.get(key)
    if (!ajuste) {
      return {
        faltanteId: producto.faltante_id,
        cantidadFaltante: producto.cantidad_faltante,
        cantidadEntregada: 0,
        cantidadAReducir: 0,
        estado: 'pendiente',
        tieneAjuste: false,
        requiereActualizacion: false
      }
    }
    return { ...ajuste, tieneAjuste: true }
  }

  // NUEVO: Obtener estado de factura
  const getFacturaEstado = (factura) => {
    const facturaKey = getFacturaKey(factura)
    return facturasEstado.get(facturaKey) || { estado: 'pendiente', origen: 'default' }
  }

  const guardarHistorial = (key, accion, valorAnterior, valorNuevo) => {
    const newHistorial = new Map(historialCambios)
    const historialKey = `${key}-${Date.now()}`

    newHistorial.set(historialKey, {
      key,
      accion,
      valorAnterior,
      valorNuevo,
      timestamp: new Date()
    })

    setHistorialCambios(newHistorial)
  }

  const guardarAjusteEnBD = async (producto, ajuste) => {
    if (!producto?.faltante_id) {
      console.warn('❌ No se pudo guardar ajuste: faltante_id no disponible', producto)
      return
    }

    try {
      await alegraService.guardarAjusteFaltante({
        faltanteId: producto.faltante_id,
        cantidadEntregada: ajuste.cantidad_entregada,
        estado: ajuste.estado,
        requiereActualizacion: ajuste.requiere_actualizacion
      })
    } catch (error) {
      console.warn('❌ Error guardando ajuste:', error)
      setError(`Error guardando ajuste para ${producto.codigo || 'producto'}: ${error.message}`)
      throw error
    }
  }

  const eliminarAjusteDeBD = async (producto) => {
    if (!producto?.faltante_id) {
      console.warn('❌ No se pudo eliminar ajuste: faltante_id no disponible', producto)
      return
    }

    try {
      await alegraService.eliminarAjusteFaltante(producto.faltante_id)
    } catch (error) {
      console.warn('❌ Error eliminando ajuste:', error)
      setError(`Error eliminando ajuste para ${producto.codigo || 'producto'}: ${error.message}`)
      throw error
    }
  }

  const handleCantidadEntregadaChange = async (key, cantidadEntregada, producto) => {
    setError(null)

    const cantidadNumerica = Number.parseInt(cantidadEntregada ?? 0, 10)
    const cantidadFaltante = producto.cantidad_faltante
    const cantidadNormalizada = Number.isNaN(cantidadNumerica)
      ? 0
      : Math.min(Math.max(cantidadNumerica, 0), cantidadFaltante)

    const entregaAnterior = getEntregaInfo(key, producto)
    if (cantidadNormalizada === (entregaAnterior.cantidadEntregada ?? 0)) {
      return
    }

    // Guardar en historial si había un valor anterior
    if (entregaAnterior.tieneAjuste) {
      guardarHistorial(key, 'cambio_cantidad', entregaAnterior.cantidadEntregada, cantidadNormalizada)
    }

    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)

    let estado = 'pendiente'
    let cantidadAReducir = 0
    let requiereActualizacion = false

    if (cantidadNormalizada >= cantidadFaltante) {
      estado = 'completo'
      cantidadAReducir = 0
      requiereActualizacion = false
    } else if (cantidadNormalizada > 0) {
      estado = 'parcial'
      cantidadAReducir = Math.max(cantidadFaltante - cantidadNormalizada, 0)
      requiereActualizacion = true
    } else {
      estado = 'pendiente'
      requiereActualizacion = false
    }

    if (cantidadNormalizada === 0) {
      newMap.delete(key)
      setEntregasAjustadas(newMap)

      try {
        await eliminarAjusteDeBD(producto)
      } catch (error) {
        setEntregasAjustadas(prevMap)
      }
      return
    }

    newMap.set(key, {
      faltanteId: producto.faltante_id,
      cantidadFaltante,
      cantidadEntregada: cantidadNormalizada,
      cantidadAReducir,
      estado,
      tieneAjuste: true,
      requiereActualizacion
    })

    setEntregasAjustadas(newMap)

    try {
      await guardarAjusteEnBD(producto, {
        cantidad_entregada: cantidadNormalizada,
        estado,
        requiere_actualizacion: requiereActualizacion
      })
    } catch (error) {
      setEntregasAjustadas(prevMap)
    }
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

    try {
      await eliminarAjusteDeBD(producto)
    } catch (error) {
      setEntregasAjustadas(prevMap)
    }
  }

  const handleNoLlegoNada = async (key, producto) => {
    const entregaAnterior = getEntregaInfo(key, producto)
    guardarHistorial(key, 'no_llego_nada', entregaAnterior.cantidadEntregada, -1)

    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    newMap.set(key, {
      faltanteId: producto.faltante_id,
      cantidadFaltante: producto.cantidad_faltante,
      cantidadEntregada: 0,
      cantidadAReducir: producto.cantidad_faltante,
      estado: 'no_llego',
      tieneAjuste: true,
      requiereActualizacion: true
    })

    setEntregasAjustadas(newMap)

    try {
      await guardarAjusteEnBD(producto, {
        cantidad_entregada: 0,
        estado: 'no_llego',
        requiere_actualizacion: true
      })
    } catch (error) {
      setEntregasAjustadas(prevMap)
    }
  }

  const handleLimpiarTodosLosAjustes = () => {
    if (!window.confirm('¿Estás seguro de limpiar todos los ajustes de entrega?\n\nEsta acción no se puede deshacer.')) {
      return
    }

    setEntregasAjustadas(new Map())
    setHistorialCambios(new Map())
  }

  const contarAjustes = () => {
    return entregasAjustadas.size
  }

  // NUEVO: Contar facturas procesadas
  const contarFacturasProcesadas = () => {
    return Array.from(facturasEstado.values()).filter(estado => estado.estado === 'procesado').length
  }

  const contarFacturasPendientes = () => {
    return Array.from(facturasEstado.values()).filter(
      estado => estado.estado === 'pendiente' && estado.origen === 'manual'
    ).length
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-CR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // CORREGIDO: formatDateTime para manejar strings de localStorage
  const formatDateTime = (dateString) => {
    if (!dateString) return 'Fecha no disponible'

    try {
      // Manejar tanto Date objects como strings de localStorage
      const fecha = typeof dateString === 'string' ? new Date(dateString) : dateString

      if (isNaN(fecha.getTime())) {
        return 'Fecha inválida'
      }

      return fecha.toLocaleString('es-CR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      console.warn('Error formateando fecha:', e)
      return 'Error en fecha'
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-8">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Generando reporte de faltantes por cliente...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reporte de Faltantes por Cliente</h1>
          <p className="text-gray-600 mt-1">Ajusta las entregas y actualiza facturas en Alegra</p>
          <div className="flex items-center space-x-4 mt-2">
            {contarAjustes() > 0 && (
              <p className="text-sm text-blue-600">
                {contarAjustes()} producto{contarAjustes() > 1 ? 's' : ''} con ajustes pendientes
              </p>
            )}
            {contarFacturasPendientes() > 0 && (
              <p className="text-sm text-yellow-600">
                {contarFacturasPendientes()} factura{contarFacturasPendientes() > 1 ? 's' : ''} marcada{contarFacturasPendientes() > 1 ? 's' : ''} como pendiente
              </p>
            )}
            {contarFacturasProcesadas() > 0 && (
              <p className="text-sm text-green-600">
                {contarFacturasProcesadas()} factura{contarFacturasProcesadas() > 1 ? 's' : ''} procesada{contarFacturasProcesadas() > 1 ? 's' : ''} (se mantiene al recargar)
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* NUEVO: Búsqueda de clientes */}
          <input
            type="text"
            value={clienteQuery}
            onChange={(e) => setClienteQuery(e.target.value)}
            placeholder="Buscar cliente por nombre..."
            className="input w-64"
          />
          <button
            onClick={handleLimpiarFacturasListas}
            disabled={contarFacturasProcesadas() === 0}
            className={`btn btn-outline text-green-600 border-green-600 hover:bg-green-50 ${contarFacturasProcesadas() === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            title={contarFacturasProcesadas() === 0 ? 'No hay facturas procesadas para limpiar' : `Limpiar ${contarFacturasProcesadas()} facturas procesadas`}
          >
            <Check size={16} className="mr-2" />
            Limpiar Facturas Listas ({contarFacturasProcesadas()})
          </button>
          <button
            onClick={loadReporte}
            className="btn btn-outline"
          >
            <RefreshCw size={16} className="mr-2" />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card bg-red-50 border-red-200 mb-8">
          <div className="flex items-center">
            <AlertCircle className="text-red-500 mr-2" size={20} />
            <p className="text-red-700">Error: {error}</p>
          </div>
        </div>
      )}

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <User className="text-purple-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Clientes Afectados</p>
                <p className="text-2xl font-semibold text-gray-900">{clientes.length}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <FileText className="text-orange-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Facturas Afectadas</p>
                <p className="text-2xl font-semibold text-gray-900">{resumen.total_facturas_afectadas}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <Package className="text-red-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Productos Pendientes</p>
                <p className="text-2xl font-semibold text-gray-900">{resumen.total_cantidad_faltante}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calculator className="text-blue-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Ajustes Pendientes</p>
                <p className="text-2xl font-semibold text-gray-900">{contarAjustes()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Clientes */}
      {clientes.length === 0 ? (
        <div className="card text-center py-12">
          <User className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay entregas pendientes</h3>
          <p className="text-gray-600">Cuando registres faltantes en las facturas, aparecerán aquí organizados por cliente.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* NUEVO: Filtrar por nombre de cliente */}
          {clientes
            .filter(c => c.nombre.toLowerCase().includes(clienteQuery.toLowerCase()))
            .map((cliente, clienteIndex) => (
            <div key={clienteIndex} className="card">
              {/* Header del cliente */}
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg mr-4">
                    <User className="text-purple-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{cliente.nombre}</h3>
                    {cliente.email && (
                      <p className="text-gray-600 flex items-center">
                        <Mail size={14} className="mr-1" />
                        {cliente.email}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 flex items-center mt-1">
                      <Clock size={14} className="mr-1" />
                      Última actividad: {formatDateTime(cliente.ultima_actividad)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Productos pendientes</p>
                    <p className="text-2xl font-bold text-purple-600">{cliente.total_cantidad}</p>
                    <p className="text-sm text-gray-600">{cliente.facturas_con_faltantes.length} factura{cliente.facturas_con_faltantes.length > 1 ? 's' : ''}</p>
                  </div>
                  {/* NUEVO: Botón colapsar/expandir */}
                  <button
                    onClick={() => {
                      const next = new Set(clientesColapsados)
                      if (next.has(cliente.nombre)) next.delete(cliente.nombre); else next.add(cliente.nombre)
                      setClientesColapsados(next)
                    }}
                    className="btn btn-outline whitespace-nowrap"
                    title={clientesColapsados.has(cliente.nombre) ? 'Expandir' : 'Comprimir'}
                  >
                    {clientesColapsados.has(cliente.nombre) ? 'Expandir' : 'Comprimir'}
                  </button>
                </div>
              </div>

              {/* Facturas con faltantes */}
              {!clientesColapsados.has(cliente.nombre) && (
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900 flex items-center">
                  <FileText size={16} className="mr-2" />
                  Entregas pendientes:
                </h4>

                {cliente.facturas_con_faltantes.map((factura) => {
                  // NUEVO: Obtener estado de la factura
                  const facturaKey = getFacturaKey(factura)
                  const estadoFactura = getFacturaEstado(factura)
                  const estaProcesada = estadoFactura.estado === 'procesado'
                  const estaPendienteManual = estadoFactura.estado === 'pendiente' && estadoFactura.origen === 'manual'

                  const facturaClase = estaProcesada
                    ? 'bg-gray-100 border-2 border-gray-300 opacity-75'
                    : estaPendienteManual
                      ? 'bg-yellow-50 border-2 border-yellow-300'
                      : 'bg-gray-50'

                  return (
                    <div key={facturaKey} className={`rounded-lg p-4 transition-all ${facturaClase}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h5 className={`font-medium ${estaProcesada ? 'text-gray-500 line-through' : estaPendienteManual ? 'text-yellow-800' : 'text-gray-900'}`}>
                            {estaProcesada && <Check size={16} className="inline text-green-600 mr-1" />}
                            Factura #{factura.numero_factura}
                            {estaProcesada && (
                              <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                                ✓ Procesada
                              </span>
                            )}
                            {estaPendienteManual && (
                              <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                                ⏳ Pendiente
                              </span>
                            )}
                          </h5>
                          <p className={`text-sm ${estaProcesada ? 'text-gray-400 line-through' : estaPendienteManual ? 'text-yellow-700' : 'text-gray-600'}`}>
                            Fecha: {formatDate(factura.fecha_emision)}
                          </p>
                          {estaProcesada && estadoFactura.timestamp && (
                            <p className="text-xs text-green-600 mt-1">
                              Procesada: {formatDateTime(estadoFactura.timestamp)}
                            </p>
                          )}
                          {estaPendienteManual && estadoFactura.timestamp && (
                            <p className="text-xs text-yellow-700 mt-1">
                              Pendiente desde: {formatDateTime(estadoFactura.timestamp)}
                            </p>
                          )}
                          {estaPendienteManual && estadoFactura.motivo && (
                            <p className="text-xs text-yellow-700 mt-1">
                              Motivo: {estadoFactura.motivo}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <p className={`text-sm ${estaProcesada ? 'text-gray-400' : 'text-gray-600'}`}>
                              Productos faltantes
                            </p>
                            <p className={`text-lg font-bold ${estaProcesada ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                              {factura.productos_faltantes.length}
                            </p>
                            {(() => {
                              if (estaProcesada) {
                                return (
                                  <p className="text-sm text-green-600 mt-1">
                                    {estadoFactura.requiere_reimpresion ? '🖨️ En reimpresión' : '📚 En historial'}
                                  </p>
                                )
                              }

                              if (estaPendienteManual) {
                                return <p className="text-sm text-yellow-600 mt-1">⌛ Pendiente: esperando entrega restante</p>
                              }

                              const ajustesEnFactura = factura.productos_faltantes.map((producto) => {
                                const productoKey = getProductKey(factura, producto)
                                return entregasAjustadas.get(productoKey)
                              }).filter(Boolean)

                              if (ajustesEnFactura.length === 0) {
                                return null // Sin ajustes
                              }

                              const todosResueltos = ajustesEnFactura.every(ajuste => ajuste.estado === 'completo')
                              const tieneNoResueltos = ajustesEnFactura.some(ajuste => ajuste.requiereActualizacion)

                              if (todosResueltos) {
                                return <p className="text-sm text-green-600 mt-1">✓ Faltantes resueltos - Sin cambios en factura</p>
                              } else if (tieneNoResueltos) {
                                return <p className="text-sm text-blue-600 mt-1">✓ Tiene ajustes pendientes</p>
                              }

                              return null
                            })()}
                          </div>

                          {/* Botones de acción */}
                          <div className="flex flex-col space-y-2">
                            {!estaProcesada ? (
                              <>
                                <button
                                  onClick={() => handleFacturaLista(cliente.nombre, factura)}
                                  className="btn btn-primary flex items-center whitespace-nowrap"
                                >
                                  <Check size={16} className="mr-2" />
                                  Factura Lista
                                </button>
                                {estaPendienteManual ? (
                                  <button
                                    onClick={() => handleQuitarFacturaPendiente(factura, cliente.nombre)}
                                    className="btn btn-outline text-yellow-800 border-yellow-700 hover:bg-yellow-50 flex items-center whitespace-nowrap"
                                    title="Quitar estado pendiente manual"
                                  >
                                    <X size={16} className="mr-2" />
                                    Quitar Pendiente
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleMarcarFacturaPendiente(factura, cliente.nombre)}
                                    className="btn btn-outline text-yellow-700 border-yellow-600 hover:bg-yellow-50 flex items-center whitespace-nowrap"
                                    title="Marcar factura como pendiente"
                                  >
                                    <Clock size={16} className="mr-2" />
                                    Marcar Pendiente
                                  </button>
                                )}
                              </>
                            ) : (
                              // Botón recuperar para facturas procesadas
                              <button
                                onClick={() => handleRecuperarFactura(factura)}
                                className="btn bg-orange-600 text-white border-orange-600 hover:bg-orange-700 flex items-center whitespace-nowrap"
                                title="Recuperar factura para editarla"
                              >
                                <RotateCcw size={16} className="mr-2" />
                                Recuperar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lista de productos faltantes */}
                      <div className={`space-y-3 ${estaProcesada ? 'pointer-events-none' : ''}`}>
                        {factura.productos_faltantes.map((producto) => {
                          const productoKey = getProductKey(factura, producto)
                          const entrega = getEntregaInfo(productoKey, producto)
                          const estaCompleto = entrega.estado === 'completo'
                          const estaParcial = entrega.estado === 'parcial'
                          const noLlego = entrega.estado === 'no_llego'
                          const tieneAjuste = entrega.tieneAjuste

                          return (
                            <div key={productoKey} className={`rounded-md p-4 border-2 transition-all ${estaProcesada
                              ? 'border-gray-200 bg-gray-50 opacity-60'
                              : estaCompleto ? 'border-green-200 bg-green-50' :
                                estaParcial ? 'border-blue-200 bg-blue-50' :
                                  noLlego ? 'border-red-200 bg-red-50' :
                                    tieneAjuste ? 'border-yellow-200 bg-yellow-50' :
                                      'border-gray-200 bg-white'
                              }`}>
                              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                {/* Info del producto */}
                                <div className="lg:col-span-5">
                                  <h6 className={`font-medium ${estaProcesada
                                    ? 'text-gray-400 line-through'
                                    : estaCompleto ? 'line-through text-green-700' : 'text-gray-900'
                                    }`}>
                                    {(estaCompleto || estaProcesada) && <Check size={16} className="inline text-green-600 mr-1" />}
                                    {producto.nombre}
                                  </h6>
                                  <p className={`text-sm ${estaProcesada
                                    ? 'text-gray-400 line-through'
                                    : estaCompleto ? 'line-through text-gray-500' : 'text-gray-600'
                                    }`}>
                                    Código: {producto.codigo} • Proveedor: {producto.proveedor}
                                  </p>
                                  {producto.observaciones && (
                                    <p className={`text-sm text-orange-600 mt-1 ${(estaCompleto || estaProcesada) ? 'line-through opacity-60' : ''
                                      }`}>
                                      📝 {producto.observaciones}
                                    </p>
                                  )}
                                </div>

                                {/* Estado original */}
                                <div className="lg:col-span-2">
                                  <p className={`text-sm mb-1 ${estaProcesada ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Faltante:
                                  </p>
                                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${estaProcesada
                                    ? 'bg-gray-100 text-gray-500'
                                    : producto.tipo_faltante === 'total'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                    {producto.cantidad_faltante} unidades
                                  </div>
                                </div>

                                {/* Cantidad entregada */}
                                <div className="lg:col-span-2">
                                  <label className={`label ${estaProcesada ? 'text-gray-400' : ''}`}>
                                    Entregado:
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max={producto.cantidad_faltante}
                                    value={entrega.cantidadEntregada}
                                    onChange={(e) => handleCantidadEntregadaChange(productoKey, e.target.value, producto)}
                                    disabled={estaCompleto || estaProcesada}
                                    className={`input ${(estaCompleto || estaProcesada) ? 'bg-gray-100 text-gray-500' : ''
                                      }`}
                                    placeholder="0"
                                  />
                                </div>

                                {/* Estado resultado */}
                                <div className="lg:col-span-2">
                                  <p className={`text-sm mb-1 ${estaProcesada ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Estado:
                                  </p>
                                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${estaProcesada
                                    ? 'bg-gray-100 text-gray-500'
                                    : entrega.estado === 'completo'
                                      ? 'bg-green-100 text-green-800'
                                      : entrega.estado === 'parcial'
                                        ? 'bg-blue-100 text-blue-800'
                                        : entrega.estado === 'no_llego'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-gray-100 text-gray-800'
                                    }`}>
                                    {estaProcesada ? '✓ Procesado' :
                                      entrega.estado === 'completo' ? '✓ Completo' :
                                        entrega.estado === 'parcial' ? '◐ Parcial' :
                                          entrega.estado === 'no_llego' ? '✗ No llegó' :
                                            '○ Pendiente'}
                                  </div>
                                </div>

                                {/* Acciones */}
                                <div className="lg:col-span-1">
                                  {!estaProcesada && (
                                    <div className="flex flex-col space-y-2">
                                      {!estaCompleto && entrega.estado !== 'no_llego' && (
                                        <button
                                          onClick={() => handleMarcarCompleto(productoKey, producto)}
                                          className="btn bg-green-600 text-white border-green-600 hover:bg-green-700 flex items-center justify-center w-full"
                                          title="Marcar como entregado completo"
                                        >
                                          <Check size={14} className="mr-1" />
                                          Completo
                                        </button>
                                      )}
                                      {!estaCompleto && entrega.estado !== 'no_llego' && (
                                        <button
                                          onClick={() => handleNoLlegoNada(productoKey, producto)}
                                          className="btn bg-red-600 text-white border-red-600 hover:bg-red-700 flex items-center justify-center w-full whitespace-nowrap"
                                          title="No llegó nada - Eliminar de factura"
                                        >
                                          <X size={14} className="mr-1" />
                                          No llegó
                                        </button>
                                      )}
                                      {tieneAjuste && (
                                        <button
                                          onClick={() => handleDeshacer(productoKey, producto)}
                                          className="btn bg-orange-600 text-white border-orange-600 hover:bg-orange-700 flex items-center justify-center w-full"
                                          title="Deshacer cambios"
                                        >
                                          <Undo2 size={14} className="mr-1" />
                                          Deshacer
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Información del cálculo */}
                              {entrega.cantidadEntregada > 0 && !estaProcesada && (
                                <div className="mt-3 p-2 bg-blue-50 rounded-md border border-blue-200">
                                  <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center text-blue-800">
                                      <Calculator size={14} className="mr-1" />
                                      <span>
                                        {entrega.estado === 'completo' ?
                                          'Faltante resuelto - Sin cambios en factura' :
                                          `Factura se reducirá en: ${entrega.cantidadAReducir} unidades`}
                                      </span>
                                    </div>
                                    <span className="text-blue-600 font-medium">
                                      {entrega.cantidadEntregada}/{producto.cantidad_faltante}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Información de procesamiento */}
                              {estaProcesada && estadoFactura.ajustes && (
                                <div className="mt-3 p-2 bg-green-50 rounded-md border border-green-200">
                                  <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center text-green-800">
                                      <Check size={14} className="mr-1" />
                                      <span>
                                        Producto procesado - Ajustes guardados en {estadoFactura.requiere_reimpresion ? 'reimpresión' : 'historial'}
                                      </span>
                                    </div>
                                    <span className="text-green-600 font-medium text-xs">
                                      {formatDateTime(estadoFactura.timestamp)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {/* NUEVO: Observaciones adicionales - AL FINAL DE LA FACTURA */}
                      {factura.observaciones_adicionales && (
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                          <h6 className="font-medium text-yellow-900 mb-2">
                            📝 Encargos adicionales:
                          </h6>
                          <p className="text-sm text-yellow-800">
                            {factura.observaciones_adicionales}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
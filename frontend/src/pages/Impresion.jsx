import { useState, useEffect, useRef } from 'react'
import {
  Printer,
  FileText,
  AlertCircle,
  Edit,
  Eye,
  Save,
  RotateCcw,
  CheckCircle,
  Plus,
  Search,
  Trash2,
  Loader,
  Package,
  Inbox
} from 'lucide-react'
import { alegraService } from '../services/alegraService'

function extractStringValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString()
  if (typeof value === 'object') {
    const keysPrioridad = ['code', 'reference', 'value', 'label', 'name', 'displayName', 'text']
    for (const key of keysPrioridad) {
      if (typeof value[key] === 'string' && value[key].trim()) {
        return value[key]
      }
    }
    const primerString = Object.values(value).find(val => typeof val === 'string' && val.trim())
    if (primerString) return primerString
  }
  return ''
}

const getReferenceFromInvoiceItem = (item) => {
  if (!item) return ''
  const candidatos = [
    item.reference,
    item.reference?.code,
    item.reference?.reference,
    item.reference?.value,
    item.code,
    item.sku,
    item.item?.reference,
    item.item?.reference?.code,
    item.item?.code,
    item.item?.sku,
    item.itemReference,
    item.externalReference
  ]

  for (const candidato of candidatos) {
    const valor = extractStringValue(candidato).trim()
    if (valor) return valor
  }

  return ''
}

const getDescriptionFromInvoiceItem = (item) => {
  if (!item) return ''
  const candidatos = [
    item.description,
    item.name,
    item.item?.name,
    item.reference?.label,
    item.reference?.name
  ]

  for (const candidato of candidatos) {
    const valor = extractStringValue(candidato).trim()
    if (valor) return valor
  }

  return ''
}

const getReferenceFromSearchProduct = (producto) => {
  if (!producto) return ''
  const candidatos = [
    producto.reference,
    producto.code,
    producto.itemCode,
    producto.reference?.code,
    producto.reference?.value,
    producto.reference?.reference,
    producto.reference?.label,
    producto.sku,
    producto.id
  ]

  for (const candidato of candidatos) {
    const valor = extractStringValue(candidato).trim()
    if (valor) return valor
  }

  return ''
}

const getDescriptionFromSearchProduct = (producto) => {
  if (!producto) return ''
  const candidatos = [
    producto.description,
    producto.name,
    producto.label,
    producto.reference?.label,
    producto.reference?.name
  ]

  for (const candidato of candidatos) {
    const valor = extractStringValue(candidato).trim()
    if (valor) return valor
  }

  return ''
}

const getPriceValue = (price) => {
  if (Array.isArray(price)) {
    const main = price.find(p => p.main) || price[0]
    return Number(main?.price ?? 0)
  }
  if (price && typeof price === 'object') {
    return Number(price.price ?? price.value ?? 0)
  }
  return Number(price ?? 0)
}

const getTaxesArray = (tax) => {
  if (!tax) return []
  if (Array.isArray(tax)) return tax
  if (Array.isArray(tax.taxes)) return tax.taxes
  return [tax]
}

export default function Impresion() {
  const [activeTab, setActiveTab] = useState('requiereCambios')
  const [facturasSinCambios, setFacturasSinCambios] = useState([])
  const [facturasPendientes, setFacturasPendientes] = useState([])
  const [facturasProcesadas, setFacturasProcesadas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Estado para edición
  const [facturaEditando, setFacturaEditando] = useState(null)
  const [itemsEditados, setItemsEditados] = useState([])
  const [modoEdicion, setModoEdicion] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [ajustandoPrecios, setAjustandoPrecios] = useState(false)
  const [mensajeAjuste, setMensajeAjuste] = useState('')
  const [productoBusqueda, setProductoBusqueda] = useState({
    index: null,
    termino: '',
    resultados: [],
    cargando: false,
    error: null
  })
  const debounceBusquedaRef = useRef(null)
  const cacheProductosRef = useRef(new Map())

  useEffect(() => {
    if (activeTab === 'procesadas') {
      loadFacturasProcesadas()
    } else {
      loadFacturasPendientes()
    }
  }, [activeTab])

  useEffect(() => {
    return () => {
      if (debounceBusquedaRef.current) {
        clearTimeout(debounceBusquedaRef.current)
      }
    }
  }, [])

  const obtenerProductoAlegra = async (alegraItemId) => {
    if (!alegraItemId) return null

    if (cacheProductosRef.current.has(alegraItemId)) {
      return cacheProductosRef.current.get(alegraItemId)
    }

    try {
      const response = await alegraService.getProductoInfoAlegra(alegraItemId)
      if (response.success && response.producto) {
        cacheProductosRef.current.set(alegraItemId, response.producto)
        return response.producto
      }
    } catch (error) {
      console.error('Error obteniendo información de producto Alegra:', error)
    }

    return null
  }

  const completarItemConReferencia = async (itemBase) => {
    let referencia = itemBase.reference?.trim() ? itemBase.reference : ''
    let descripcion = itemBase.description?.trim() ? itemBase.description : ''
    let referenciaTipo = itemBase.referencia_tipo || itemBase.reference_type || itemBase.referenceType || null
    const alegraItemId = itemBase.alegraItemId || itemBase.itemId || itemBase.item?.id || itemBase.id
    const referenciaIgualId = alegraItemId && referencia === alegraItemId.toString()

    if ((!referencia || referenciaIgualId) && alegraItemId) {
      const producto = await obtenerProductoAlegra(alegraItemId)
      if (producto) {
        const refNormalizada = getReferenceFromSearchProduct(producto)
        const descNormalizada = getDescriptionFromSearchProduct(producto)
        if (refNormalizada) {
          referencia = refNormalizada
        }
        if (!descripcion && (descNormalizada || producto.name)) {
          descripcion = descNormalizada || producto.name || descripcion
        }
        referenciaTipo = producto.reference?.type || referenciaTipo || 'CODE_OF_INTERNAL_USE'
      }
    }

    return {
      ...itemBase,
      reference: referencia,
      description: descripcion,
      alegraItemId,
      referencia_tipo: referenciaTipo || 'CODE_OF_INTERNAL_USE'
    }
  }

  const loadFacturasPendientes = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await alegraService.getFacturasPendientesReimpresion()

      if (result.success) {
        const sinCambios = result.data?.sin_cambios || []
        const requiereCambios = result.data?.requiere_cambios || []
        setFacturasSinCambios(sinCambios)
        setFacturasPendientes(requiereCambios)
      } else {
        setError(result.message || 'Error cargando facturas pendientes')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadFacturasProcesadas = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await alegraService.getFacturasProcesadasReimpresion()

      if (result.success) {
        setFacturasProcesadas(result.data)
      } else {
        setError(result.message || 'Error cargando facturas procesadas')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleVerPDF = async (factura) => {
    try {
      await alegraService.visualizarPDFFactura(factura.alegra_id)
    } catch (error) {
      alert(`❌ Error abriendo PDF: ${error.message}`)
    }
  }

  const handleIniciarEdicion = (factura) => {
    setFacturaEditando(factura)

    const cargarFactura = async () => {
      try {
        const result = await alegraService.getInvoiceById(factura.alegra_id)
        if (result.success) {
          const items = Array.isArray(result.data.items) ? result.data.items : []
          const ajustesDetalle = Array.isArray(factura.ajustes_realizados) ? factura.ajustes_realizados : []
          const faltantesDetalle = Array.isArray(factura.faltantes_detalle) ? factura.faltantes_detalle : []

          const ajustesPorCodigo = ajustesDetalle.reduce((acc, ajuste) => {
            if (ajuste && ajuste.producto_codigo) {
              acc[ajuste.producto_codigo.toString()] = ajuste
            }
            return acc
          }, {})

          const faltantesPorCodigo = faltantesDetalle.reduce((acc, faltante) => {
            if (faltante && faltante.producto_codigo) {
              acc[faltante.producto_codigo.toString()] = faltante
            }
            return acc
          }, {})

          const normalizados = items.map(item => {
            const reference = getReferenceFromInvoiceItem(item)
            const description = getDescriptionFromInvoiceItem(item)
            const price = getPriceValue(item.price)
            const taxes = getTaxesArray(item.tax)
            const alegraItemId = item.item?.id ?? item.productId ?? item.itemId ?? item.id ?? null

            const codigoItem = (item.id ?? reference ?? item.reference?.reference ?? '').toString()
            const ajuste = ajustesPorCodigo[codigoItem]
            const faltante = faltantesPorCodigo[codigoItem]

            let cantidadOriginal = Number(item.quantity) || 0
            let cantidadFaltante = 0
            let eliminarPorFaltante = false
            let estadoAjuste = ajuste?.estado

            if (ajuste) {
              const faltanteOriginal = Number(ajuste.cantidad_faltante || ajuste.cantidad_faltante_original || 0)
              const entregada = Number(ajuste.cantidad_entregada || 0)
              const faltantePendiente = Math.max(faltanteOriginal - entregada, 0)
              cantidadFaltante = faltantePendiente
              if (faltantePendiente > 0) {
                cantidadOriginal = Math.max(cantidadOriginal - faltantePendiente, 0)
              }
              if (ajuste.estado === 'no_llego' || cantidadOriginal === 0) {
                eliminarPorFaltante = true
              }
            } else if (faltante) {
              const faltantePendiente = Number(faltante.cantidad_faltante || 0)
              if (faltantePendiente > 0) {
                cantidadFaltante = faltantePendiente
                cantidadOriginal = Math.max(cantidadOriginal - faltantePendiente, 0)
                eliminarPorFaltante = cantidadOriginal === 0
              }
            }

            return {
              id: item.id ?? null,
              reference,
              description,
              quantity: cantidadOriginal,
              price,
              tax: taxes,
              itemId: item.item?.id ?? alegraItemId,
              alegraItemId,
              item: item.item?.id ? { id: item.item.id } : item.item ?? undefined,
              esNuevo: false,
              cantidad_faltante: cantidadFaltante,
              eliminar_por_faltante: eliminarPorFaltante,
              ajuste_estado: estadoAjuste
            }
          })

          const enriquecidos = await Promise.all(normalizados.map(completarItemConReferencia))
          setItemsEditados(enriquecidos)
        }
      } catch (error) {
        console.error('Error cargando factura desde Alegra:', error)
        alert(`❌ No se pudo cargar la factura desde Alegra: ${error.message}`)
      }
    }

    cargarFactura()
    setModoEdicion(true)
  }

  const handleCancelarEdicion = () => {
    setFacturaEditando(null)
    setItemsEditados([])
    setModoEdicion(false)
    setProductoBusqueda({
      index: null,
      termino: '',
      resultados: [],
      cargando: false,
      error: null
    })
    cacheProductosRef.current.clear()
  }

  const handleAgregarItem = () => {
    const nuevoIndice = itemsEditados.length
    const nuevoItem = {
      id: null,
      reference: '',
      description: '',
      quantity: 1,
      price: 0,
      tax: [],
      itemId: null,
      alegraItemId: null,
      esNuevo: true
    }

    setItemsEditados(prev => [...prev, nuevoItem])
    setProductoBusqueda({
      index: nuevoIndice,
      termino: '',
      resultados: [],
      cargando: false,
      error: null
    })
  }

  const renderBuscadorProducto = (index) => {
    const item = itemsEditados[index]
    if (!item || !item.esNuevo) return null

    const esActivo = productoBusqueda.index === index
    const terminoActual = esActivo ? productoBusqueda.termino : ''

    return (
      <div className="border-t border-blue-100 pt-4">
        <p className="text-xs font-semibold text-blue-700 uppercase mb-2 flex items-center gap-2">
          <Search size={14} />
          Buscar producto en Alegra
        </p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={terminoActual}
            onFocus={() => iniciarBusquedaProducto(index)}
            onChange={(e) => manejarCambioTerminoBusqueda(index, e.target.value)}
            className="input input-sm w-full pl-10"
            placeholder="Escribe el código o parte del nombre..."
          />
        </div>

        <div className="mt-3">
          {esActivo ? (
            productoBusqueda.cargando ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader size={16} className="animate-spin" />
                Buscando productos…
              </div>
            ) : productoBusqueda.resultados.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {productoBusqueda.resultados.map((producto) => {
                  const price = getPriceValue(producto.price ?? producto.prices ?? producto.salePrice ?? 0)
                  const referencia = getReferenceFromSearchProduct(producto) || 'Sin referencia'
                  const descripcion = getDescriptionFromSearchProduct(producto) || referencia || 'Producto sin nombre'

                  return (
                    <div
                      key={producto.id}
                      className="p-3 border border-blue-100 rounded-md hover:border-blue-300 hover:bg-blue-50 transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{descripcion}</p>
                          <p className="text-xs text-gray-500">
                            Ref: {referencia} • Precio: ₡{Number(price).toLocaleString('es-CR')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => seleccionarProductoBusqueda(index, producto)}
                          className="btn btn-sm btn-primary flex items-center gap-1"
                        >
                          <CheckCircle size={14} />
                          Usar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-xs text-gray-500 py-4">
                <Package size={18} className="text-gray-400" />
                <span>{productoBusqueda.error || 'Sin resultados para ese texto.'}</span>
              </div>
            )
          ) : (
            <p className="text-xs text-gray-500">Empieza escribiendo para buscar en Alegra.</p>
          )}
        </div>
      </div>
    )
  }

  const handleGuardarFactura = async (imprimirDespues = false) => {
    if (!facturaEditando) return

    const confirmacion = window.confirm(
      `¿Confirmar ${imprimirDespues ? 'guardar e imprimir' : 'guardar'} factura ${facturaEditando.numero_factura}?\n\n` +
      `Se actualizarán los precios automáticamente desde Alegra.`
    )

    if (!confirmacion) return

    try {
      setProcesando(true)
      setAjustandoPrecios(true)
      setMensajeAjuste('Ajustando precios desde Alegra')

      if (modoEdicion && productoBusqueda.index !== null) {
        cerrarBusquedaProducto()
      }

      let itemsParaGuardar = null

      if (modoEdicion) {
        itemsParaGuardar = itemsEditados.map(item => {
          const descripcion = (item.description ?? '').trim()
          const referencia = (item.reference ?? '').toString().trim()
          const quantity = Number(item.quantity) || 0
          const price = Number(item.price) || 0
          const tax = Array.isArray(item.tax) ? item.tax : getTaxesArray(item.tax)

          const payload = {
            reference: referencia,
            description: descripcion || referencia,
            name: descripcion || referencia,
            quantity,
            price,
            tax
          }

          if (item.id) {
            payload.id = item.id
          }

          if (item.item && item.item.id) {
            payload.item = { id: item.item.id }
          } else if (item.itemId) {
            payload.item = { id: item.itemId }
          }

          if (payload.tax.length === 0) {
            delete payload.tax
          }

          delete payload.esNuevo
          if (payload.alegraItemId !== undefined) {
            delete payload.alegraItemId
          }
          if (payload.itemId !== undefined) {
            delete payload.itemId
          }

          return payload
        })

        const hayReferenciaVacia = itemsParaGuardar.some(item => !item.reference)
        if (hayReferenciaVacia) {
          alert('⚠️ Todos los productos deben tener una referencia antes de guardar.')
          setProcesando(false)
          return
        }

        const hayCantidadInvalida = itemsParaGuardar.some((item, idx) => {
          const original = itemsEditados[idx]
          const puedeEliminarse = original?.eliminar_por_faltante
          return item.quantity <= 0 && !puedeEliminarse
        })
        if (hayCantidadInvalida) {
          alert('⚠️ Las cantidades deben ser mayores a cero.')
          setProcesando(false)
          return
        }
      }

      // Procesar factura (con items editados si hay, o ajustes automáticos)
      // 🔧 Marcar como procesada porque viene desde Reimpresión (reimprimiendo)
      const facturaConFlag = {
        ...facturaEditando,
        marcar_como_procesada: true
      }

      setMensajeAjuste('Ya casi estamos listos')

      const result = await alegraService.procesarFacturaIndividual(
        facturaConFlag,
        modoEdicion ? itemsParaGuardar : null
      )

      if (result.success) {
        setMensajeAjuste('Precios actualizados correctamente')

        setTimeout(() => {
          alert(`✅ Factura ${facturaEditando.numero_factura} procesada exitosamente`)
        }, 500)

        // Si pidió imprimir, abrir PDF
        if (imprimirDespues) {
          await alegraService.visualizarPDFFactura(facturaEditando.alegra_id)
        }

        // Limpiar estado
        handleCancelarEdicion()

        // Recargar lista
        loadFacturasPendientes()
      } else {
        throw new Error(result.message || 'Error procesando factura')
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`)
    } finally {
      setProcesando(false)
      setAjustandoPrecios(false)
      setMensajeAjuste('')
    }
  }

  const handleProcesarSinCambios = async (factura, imprimirDespues = false) => {
    if (!factura) return

    // Determinar si es una factura de bodega sin faltantes (omitir ajuste de precios)
    const esSinPendientes = factura.categoria === 'sin_pendientes'

    const mensajeConfirmacion = esSinPendientes
      ? `¿Marcar la factura ${factura.numero_factura} como impresa${imprimirDespues ? ' e imprimir ahora' : ''}?`
      : `¿Marcar la factura ${factura.numero_factura} como impresa${imprimirDespues ? ' e imprimir ahora' : ''}?\n\nSe actualizarán los precios automáticamente desde Alegra.`

    const confirmacion = window.confirm(mensajeConfirmacion)
    if (!confirmacion) return

    try {
      setProcesando(true)

      // Solo ajustar precios si NO es 'sin_pendientes' (viene de bodega sin faltantes)
      if (!esSinPendientes) {
        setAjustandoPrecios(true)
        setMensajeAjuste('Ajustando precios desde Alegra')

        await alegraService.procesarFacturaIndividual({
          alegra_id: factura.alegra_id,
          numero_factura: factura.numero_factura,
          cliente_nombre: factura.cliente_nombre,
          fecha_emision: factura.fecha_emision,
          ajustes: factura.ajustes_realizados || [],
          estado: 'resuelto',
          marcar_como_procesada: true
        })

        setMensajeAjuste('Precios actualizados correctamente')
      } else {
        // Para facturas sin_pendientes, solo marcar como procesada sin ajustar precios
        await alegraService.procesarFacturaIndividual({
          alegra_id: factura.alegra_id,
          numero_factura: factura.numero_factura,
          cliente_nombre: factura.cliente_nombre,
          fecha_emision: factura.fecha_emision,
          ajustes: [],
          estado: 'resuelto',
          marcar_como_procesada: true,
          omitir_ajuste_precios: true // Flag para omitir ajuste de precios
        })
      }

      if (imprimirDespues) {
        await alegraService.visualizarPDFFactura(factura.alegra_id)
      }

      await loadFacturasPendientes()
      loadFacturasProcesadas()
      alert(`✅ Factura ${factura.numero_factura} enviada al historial de impresión`)
    } catch (error) {
      alert(`❌ Error procesando factura: ${error.message}`)
    } finally {
      setProcesando(false)
      setAjustandoPrecios(false)
      setMensajeAjuste('')
    }
  }

  const handleRecuperarFactura = async (factura) => {
    const confirmacion = window.confirm(
      `¿Recuperar factura ${factura.numero_factura}?\n\n` +
      `La factura volverá a la lista de pendientes.`
    )

    if (!confirmacion) return

    try {
      setLoading(true)
      const result = await alegraService.recuperarFactura(factura.alegra_id)

      if (result.success) {
        alert(`✅ Factura ${factura.numero_factura} recuperada`)
        loadFacturasProcesadas()
      } else {
        throw new Error(result.message || 'Error recuperando factura')
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const cerrarBusquedaProducto = () => {
    setProductoBusqueda({
      index: null,
      termino: '',
      resultados: [],
      cargando: false,
      error: null
    })
  }

  const buscarProductoRevision = async (index, termino) => {
    const item = itemsEditados[index]
    if (!item || !item.esNuevo) {
      return
    }
    const query = (termino || '').trim()

    if (query.length < 2) {
      setProductoBusqueda(prev => ({
        ...prev,
        index,
        termino,
        resultados: [],
        error: 'Ingresa al menos 2 caracteres.'
      }))
      return
    }

    setProductoBusqueda(prev => ({
      ...prev,
      index,
      termino: query,
      cargando: true,
      resultados: [],
      error: null
    }))

    try {
      const response = await alegraService.buscarProductosRevision(query)

      if (response.success) {
        const resultados = response.productos || response.data || []
        const terminoLower = query.toLowerCase()

        const score = (producto) => {
          const ref = getReferenceFromSearchProduct(producto).toLowerCase()
          const name = getDescriptionFromSearchProduct(producto).toLowerCase()
          let puntos = 0

          if (ref === terminoLower) puntos += 1000
          if (ref.startsWith(terminoLower)) puntos += 500
          if (ref.includes(terminoLower)) puntos += 200

          if (name === terminoLower) puntos += 150
          if (name.startsWith(terminoLower)) puntos += 120
          if (name.includes(terminoLower)) puntos += 80

          return puntos
        }

        resultados.sort((a, b) => score(b) - score(a))

        setProductoBusqueda(prev => ({
          ...prev,
          cargando: false,
          resultados,
          error: resultados.length === 0 ? 'Sin coincidencias para ese código.' : null
        }))
      } else {
        setProductoBusqueda(prev => ({
          ...prev,
          cargando: false,
          resultados: [],
          error: response.message || 'No se pudieron obtener los productos.'
        }))
      }
    } catch (error) {
      setProductoBusqueda(prev => ({
        ...prev,
        cargando: false,
        resultados: [],
        error: error.message
      }))
    }
  }

  const iniciarBusquedaProducto = (index) => {
    const item = itemsEditados[index]
    if (!item || !item.esNuevo) {
      return
    }
    const referencia = getReferenceFromInvoiceItem(itemsEditados[index]) || ''
    setProductoBusqueda({
      index,
      termino: referencia,
      resultados: [],
      cargando: false,
      error: null
    })

    if (referencia && referencia.length >= 2) {
      buscarProductoRevision(index, referencia)
    }
  }

  const manejarCambioTerminoBusqueda = (index, valor) => {
    setProductoBusqueda(prev => {
      const next = {
        ...prev,
        index,
        termino: valor,
        error: null
      }

      if (debounceBusquedaRef.current) {
        clearTimeout(debounceBusquedaRef.current)
      }

      const terminoLimpio = valor.trim()
      if (terminoLimpio.length >= 2) {
        debounceBusquedaRef.current = setTimeout(() => {
          buscarProductoRevision(index, terminoLimpio)
        }, 350)
      } else {
        next.resultados = []
        next.cargando = false
        next.error = terminoLimpio.length === 0 ? null : 'Ingresa al menos 2 caracteres.'
      }

      return next
    })
  }

  const seleccionarProductoBusqueda = async (index, productoBase) => {
    let producto = productoBase
    const referenciaNormalizada = getReferenceFromSearchProduct(producto)
    const referencia = referenciaNormalizada || productoBusqueda.termino || ''

    const requiereDetalles = (!producto.taxes || producto.taxes.length === 0) && (producto.id || referencia)

    if (requiereDetalles) {
      try {
        const query = referencia || producto.id?.toString() || ''
        const resultado = await alegraService.buscarProductosAlegra(query)

        if (resultado?.success) {
          const lista = resultado.data || resultado.productos || []
          const match = lista.find(item => item.id?.toString() === producto.id?.toString()) || lista[0]
          if (match) {
            producto = { ...match }
          }
        }
      } catch (error) {
        console.error('No se pudo obtener detalle del producto desde Alegra:', error)
      }
    }

    const descripcion = getDescriptionFromSearchProduct(producto) || referencia || 'Producto sin descripción'
    const precio = getPriceValue(producto.price ?? producto.prices ?? producto.salePrice ?? 0)
    const taxes = getTaxesArray(producto.taxes ?? producto.tax)

    setItemsEditados(prev => prev.map((item, idx) => {
      if (idx !== index) return item
      return {
        ...item,
        reference: referencia,
        description: descripcion,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        price: Number(precio) || 0,
        tax: taxes,
        itemId: producto.id ?? null,
        alegraItemId: producto.id ?? null,
        item: producto.id ? { id: producto.id } : item.item,
        referencia_tipo: producto.reference?.type || item.referencia_tipo || 'CODE_OF_INTERNAL_USE',
        esNuevo: false
      }
    }))

    cerrarBusquedaProducto()
  }

  const handleItemChange = (index, field, value) => {
    const newItems = [...itemsEditados]
    const itemActual = { ...newItems[index] }

    if (!itemActual.esNuevo && (field === 'reference' || field === 'description')) {
      return
    }

    if (field === 'quantity') {
      const numero = parseFloat(value)
      itemActual.quantity = Number.isFinite(numero) && numero >= 0 ? numero : 0
    } else if (field === 'price') {
      const numero = parseFloat(value)
      itemActual.price = Number.isFinite(numero) ? numero : 0
    } else if (field === 'description') {
      itemActual.description = value
    } else if (field === 'reference') {
      itemActual.reference = value
      itemActual.itemId = null
      itemActual.alegraItemId = null
      if (itemActual.referencia_tipo) {
        delete itemActual.referencia_tipo
      }
      if (itemActual.item) delete itemActual.item
    } else {
      itemActual[field] = value
    }

    newItems[index] = itemActual
    setItemsEditados(newItems)
  }

  const handleEliminarItem = (index) => {
    const newItems = itemsEditados.filter((_, i) => i !== index)
    setItemsEditados(newItems)

    if (productoBusqueda.index !== null) {
      if (productoBusqueda.index === index) {
        cerrarBusquedaProducto()
      } else if (productoBusqueda.index > index) {
        setProductoBusqueda(prev => ({
          ...prev,
          index: prev.index - 1
        }))
      }
    }

    if (newItems.length === 0) {
      setModoEdicion(false)
    }
  }

  // Renderizar vista de cambios automáticos (sin modo edición)
  const renderCambiosAutomaticos = (factura) => {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 mb-6 border border-blue-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-1">
              📋 Cambios por Ajustes Previos
            </h3>
            <p className="text-sm text-blue-700">
              Estos cambios se aplicarán automáticamente con precios actualizados
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleIniciarEdicion(factura)}
              className="btn btn-outline flex items-center gap-2 text-sm"
            >
              <Edit size={16} />
              Editar Factura
            </button>
            <button
              onClick={() => handleVerPDF(factura)}
              className="btn btn-outline flex items-center gap-2 text-sm"
            >
              <Eye size={16} />
              Ver PDF
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {factura.ajustes_realizados?.map((ajuste, index) => (
            <div key={index} className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{ajuste.producto_nombre}</p>
                  <p className="text-sm text-gray-600">Código: {ajuste.producto_codigo}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${ajuste.estado === 'completo' ? 'bg-green-100 text-green-800' :
                  ajuste.estado === 'parcial' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                  {ajuste.estado === 'completo' ? '✅ Completo' :
                    ajuste.estado === 'parcial' ? '◐ Parcial' : '❌ No llegó'}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Faltante:</span>
                  <span className="ml-2 font-medium">{ajuste.cantidad_faltante}</span>
                </div>
                <div>
                  <span className="text-gray-600">Entregado:</span>
                  <span className="ml-2 font-medium">{ajuste.cantidad_entregada}</span>
                </div>
              </div>
              {ajuste.requiere_actualizacion && (
                <p className="mt-2 text-sm text-yellow-700 font-medium">
                  ⚠️ Se actualizará cantidad y precio en la factura
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={() => handleGuardarFactura(false)}
            disabled={procesando}
            className="btn btn-primary flex items-center gap-2"
          >
            <Save size={16} />
            {procesando ? 'Procesando...' : 'Guardar'}
          </button>
          <button
            onClick={() => handleGuardarFactura(true)}
            disabled={procesando}
            className="btn bg-green-600 text-white border-green-600 hover:bg-green-700 flex items-center gap-2"
          >
            <Printer size={16} />
            {procesando ? 'Procesando...' : 'Guardar e Imprimir'}
          </button>
        </div>
      </div>
    )
  }

  // Renderizar formulario de edición completo
  const renderFormularioEdicion = () => {
    if (!facturaEditando || !modoEdicion) return null

    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">
            ✏️ Editando Factura #{facturaEditando.numero_factura}
          </h3>
          <button
            onClick={handleCancelarEdicion}
            className="btn btn-outline text-sm"
          >
            Cancelar
          </button>
        </div>

        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            <strong>Cliente:</strong> {facturaEditando.cliente_nombre} |
            <strong className="ml-3">Fecha:</strong> {formatDate(facturaEditando.fecha_emision)} |
            <strong className="ml-3">Total Original:</strong> ₡{(facturaEditando.total || 0).toLocaleString('es-CR')}
          </p>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h4 className="text-lg font-semibold text-gray-900">Productos en la factura</h4>
          <button
            onClick={handleAgregarItem}
            className="btn btn-outline btn-sm flex items-center gap-2"
            type="button"
          >
            <Plus size={14} />
            Agregar producto
          </button>
        </div>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {itemsEditados.map((item, index) => (
            <div key={index} className="bg-gray-50 rounded-lg border p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Producto #{index + 1}</p>
                  {!item.esNuevo && (
                    <p className="text-[11px] text-gray-400">Importado desde Alegra</p>
                  )}
                  {!item.esNuevo && item.eliminar_por_faltante && (
                    <p className="mt-1 text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded">
                      Este producto se eliminará automáticamente al reimprimir (faltante sin recibir)
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleEliminarItem(index)}
                  className="btn btn-outline btn-xs border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"
                >
                  <Trash2 size={14} />
                  Quitar
                </button>
              </div>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-3">
                  <label className="text-xs text-gray-600">Referencia</label>
                  <input
                    type="text"
                    value={item.reference || ''}
                    onChange={(e) => handleItemChange(index, 'reference', e.target.value)}
                    onFocus={() => item.esNuevo && iniciarBusquedaProducto(index)}
                    className="input input-sm w-full"
                    disabled={!item.esNuevo}
                    placeholder="Código o referencia"
                  />
                  {item.esNuevo ? (
                    <span className="inline-block mt-1 text-xs text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                      Nuevo producto
                    </span>
                  ) : (
                    <span className="inline-block mt-1 text-xs text-gray-500">
                      Código original (no editable)
                    </span>
                  )}
                </div>
                <div className="col-span-4">
                  <label className="text-xs text-gray-600">Descripción</label>
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    className={`input input-sm w-full ${item.esNuevo ? '' : 'bg-gray-100 text-gray-600'}`}
                    disabled={!item.esNuevo}
                    placeholder="Descripción del producto"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Cantidad</label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    className="input input-sm w-full"
                    min="0"
                    step="1"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Precio Unit.</label>
                  <input
                    type="number"
                    value={item.price}
                    onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                    className="input input-sm w-full"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs text-gray-600">Subtotal</label>
                  <div className="input input-sm w-full bg-gray-100 flex items-center">
                    ₡{(item.quantity * item.price).toLocaleString('es-CR')}
                  </div>
                </div>
              </div>
              {renderBuscadorProducto(index)}
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3 justify-end border-t pt-4">
          <button
            onClick={() => handleGuardarFactura(false)}
            disabled={procesando}
            className="btn btn-primary flex items-center gap-2"
          >
            <Save size={16} />
            {procesando ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            onClick={() => handleGuardarFactura(true)}
            disabled={procesando}
            className="btn bg-green-600 text-white border-green-600 hover:bg-green-700 flex items-center gap-2"
          >
            <Printer size={16} />
            {procesando ? 'Guardando...' : 'Guardar e Imprimir'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Modal de Ajuste de Precios */}
      {ajustandoPrecios && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <Loader className="mx-auto mb-4 text-blue-600 animate-spin" size={48} />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {mensajeAjuste}
              </h3>
              <div className="flex justify-center gap-1 mb-4">
                <span className="animate-bounce delay-0">.</span>
                <span className="animate-bounce delay-100">.</span>
                <span className="animate-bounce delay-200">.</span>
              </div>
              <p className="text-gray-600 text-sm">
                Actualizando precios desde Alegra...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Printer className="mr-3" size={32} />
            Centro de Impresión
          </h1>
          <p className="text-gray-600 mt-1">
            Imprime facturas resueltas o con cambios pendientes y refleja los precios revisados
          </p>
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

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex flex-wrap gap-4">
          {[
            {
              key: 'sinCambios',
              label: 'Facturas sin pendientes',
              icon: FileText,
              count: facturasSinCambios.length
            },
            {
              key: 'requiereCambios',
              label: 'Facturas que requieren cambios',
              icon: AlertCircle,
              count: facturasPendientes.length
            },
            {
              key: 'procesadas',
              label: 'Procesadas (7 días)',
              icon: CheckCircle,
              count: facturasProcesadas.length
            }
          ].map((tab) => {
            const Icon = tab.icon
            const isCurrent = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setFacturaEditando(null)
                  setModoEdicion(false)
                  setActiveTab(tab.key)
                }}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${isCurrent
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <Icon className="inline mr-2" size={16} />
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">
            {activeTab === 'pendientes' ? 'Cargando facturas pendientes...' : 'Cargando facturas procesadas...'}
          </p>
        </div>
      )}

      {/* Tab Pendientes */}
      {activeTab === 'sinCambios' && !loading && (
        <div>
          {facturasSinCambios.length === 0 ? (
            <div className="card text-center py-12">
              <Inbox className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No hay facturas listas sin ajustes
              </h3>
              <p className="text-gray-600">
                Cuando una factura no registre faltantes ni cambios aparecerá en esta pestaña.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {facturasSinCambios.map((factura) => (
                <div key={factura.reimpresion_id} className="card">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Factura #{factura.numero_factura}
                      </h3>
                      <p className="text-gray-600">
                        Cliente: {factura.cliente_nombre}
                      </p>
                      <p className="text-sm text-gray-500">
                        Fecha emisión: {formatDate(factura.fecha_emision)}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        ✅ Sin pendientes ni ajustes detectados
                      </p>
                      {factura.tiene_variacion_precio && (
                        <p className="text-xs text-blue-600 mt-1">
                          💲 Precios revisados en este ciclo
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">
                        ₡{(factura.total || 0).toLocaleString('es-CR')}
                      </p>
                      <div className="flex flex-wrap gap-2 justify-end mt-3">
                        <button
                          onClick={() => handleVerPDF(factura)}
                          className="btn btn-outline flex items-center gap-2"
                        >
                          <Eye size={16} />
                          Ver PDF
                        </button>
                        <button
                          onClick={() => handleProcesarSinCambios(factura, false)}
                          disabled={procesando}
                          className="btn btn-outline flex items-center gap-2"
                        >
                          <CheckCircle size={16} />
                          Marcar como Impresa
                        </button>
                        <button
                          onClick={() => handleProcesarSinCambios(factura, true)}
                          disabled={procesando}
                          className="btn btn-primary flex items-center gap-2"
                        >
                          <Printer size={16} />
                          Imprimir y cerrar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'requiereCambios' && !loading && (
        <div>
          {facturaEditando ? (
            // Mostrar formulario de edición o vista de cambios
            modoEdicion ? renderFormularioEdicion() : renderCambiosAutomaticos(facturaEditando)
          ) : (
            // Lista de facturas pendientes
            facturasPendientes.length === 0 ? (
              <div className="card text-center py-12">
                <CheckCircle className="mx-auto text-green-400 mb-4" size={48} />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  ¡No hay facturas con cambios pendientes!
                </h3>
                <p className="text-gray-600">
                  Todo está listo. Revisa la pestaña “Sin pendientes” para imprimir el resto.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {facturasPendientes.map((factura) => (
                  <div key={factura.reimpresion_id} className="card hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Factura #{factura.numero_factura}
                        </h3>
                        <p className="text-gray-600">
                          Cliente: {factura.cliente_nombre}
                        </p>
                        <p className="text-sm text-gray-500">
                          Fecha emisión: {formatDate(factura.fecha_emision)}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${factura.requiere_actualizacion
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                            }`}>
                            {factura.requiere_actualizacion ? '⚠️ Requiere Cambios' : '✅ Solo Resuelto'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {factura.total_ajustes} ajuste{factura.total_ajustes !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">
                          ₡{(factura.total || 0).toLocaleString('es-CR')}
                        </p>
                        <button
                          onClick={() => {
                            setFacturaEditando(factura)
                            setModoEdicion(false)
                          }}
                          className="mt-3 btn btn-primary flex items-center gap-2"
                        >
                          <Printer size={16} />
                          Reimprimir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Tab Procesadas */}
      {activeTab === 'procesadas' && !loading && (
        <div>
          {facturasProcesadas.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No hay facturas procesadas
              </h3>
              <p className="text-gray-600">
                Las facturas procesadas aparecerán aquí por 7 días.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  💡 <strong>Recuperación:</strong> Puedes recuperar facturas procesadas en los últimos 7 días.
                  Para facturas más antiguas, edítalas desde la sección de Facturación.
                </p>
              </div>

              <div className="space-y-4">
                {facturasProcesadas.map((factura) => (
                  <div key={factura.reimpresion_id} className="card">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-gray-900">
                            Factura #{factura.numero_factura}
                          </h3>
                          <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                            ✅ Procesada
                          </span>
                        </div>
                        <p className="text-gray-600">
                          Cliente: {factura.cliente_nombre}
                        </p>
                        <div className="mt-2 text-sm text-gray-500">
                          <p>Procesada: {formatDate(factura.fecha_procesamiento)}</p>
                          <p className="text-xs mt-1">
                            {factura.puede_recuperar ? (
                              <span className="text-green-600">
                                ⏰ {factura.dias_restantes_recuperacion} días restantes para recuperar
                              </span>
                            ) : (
                              <span className="text-red-600">
                                ❌ Período de recuperación expirado
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-700 mb-3">
                          ₡{(factura.total || 0).toLocaleString('es-CR')}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleVerPDF(factura)}
                            className="btn btn-outline btn-sm flex items-center gap-1"
                          >
                            <Eye size={14} />
                            Ver PDF
                          </button>
                          {factura.puede_recuperar && (
                            <button
                              onClick={() => handleRecuperarFactura(factura)}
                              className="btn btn-primary btn-sm flex items-center gap-1"
                            >
                              <RotateCcw size={14} />
                              Recuperar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

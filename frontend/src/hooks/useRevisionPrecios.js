import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { redondearPrecio, calcularFactorConversion, inferirCantidadesDesdeFactor } from '../utils/revisionPreciosUtils'
import { avisoDeAceptacion } from '../utils/aceptacionCompraTexto'
import { useDialog } from './useDialog'

/**
 * Estado y lógica de negocio de la revisión de precios: navegación
 * lista↔revisión, pestañas por estado de factura, ajuste de precios,
 * factor de conversión, y registro de la compra. Extraído de RevisionPrecios.jsx.
 *
 * El toast (array, con duración null para el mensaje "enviando" persistente
 * y remoción por tipo) se mantiene con su implementación local igual que en
 * el original — no usa useToast() porque necesita poder quitar un toast por
 * `type` en vez de por `id`. Los 2 window.confirm se migraron a confirm()
 * de useDialog(); la página debe renderizar <ConfirmModal {...dialogProps} />.
 */
export function useRevisionPrecios() {
  const { confirm, dialogProps } = useDialog()

  // Estados principales
  const [vista, setVista] = useState('lista')
  const [facturas, setFacturas] = useState([])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [productos, setProductos] = useState([])
  // Llaveado por `producto.id`.
  const [productosDelCatalogo, setProductosDelCatalogo] = useState({})
  const [sugerenciasPrecio, setSugerenciasPrecio] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Pestaña activa y filtros
  const [tabActiva, setTabActiva] = useState('PENDIENTE_RELACIONAR') // PENDIENTE_RELACIONAR, LISTAS_REVISION, ENVIADAS

  // Precios ajustados por el usuario
  const [preciosAjustados, setPreciosAjustados] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [devolviendo, setDevolviendo] = useState(false)

  // Factor de conversión inline
  const [modalFactor, setModalFactor] = useState(false)
  const [productoSeleccionadoFactor, setProductoSeleccionadoFactor] = useState(null)
  const [cantidadProveedor, setCantidadProveedor] = useState(1)
  const [cantidadMia, setCantidadMia] = useState(1)
  const [guardandoFactor, setGuardandoFactor] = useState(false)

  // Toast notifications
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const loadFacturas = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      let response

      if (tabActiva === 'PENDIENTE_RELACIONAR') {
        // Facturas procesadas pero sin relacionar completamente
        response = await api.get('/revision-precios/facturas?estado=PROCESADA')
      } else if (tabActiva === 'LISTAS_REVISION') {
        // Facturas 100% relacionadas listas para revisión
        response = await api.get('/revision-precios/facturas-relacionadas')
      } else if (tabActiva === 'ENVIADAS') {
        // Facturas con compra ya registrada. El filtro sigue siendo por
        // estado 'ENVIADA' en la base — el nombre quedó de cuando esto de
        // verdad mandaba algo a Alegra; cambiarlo es un cambio de esquema
        // aparte, no de esta pantalla.
        response = await api.get('/revision-precios/facturas?estado=ENVIADA')
      }

      if (response && response.data.success) {
        setFacturas(response.data.facturas || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [tabActiva])

  useEffect(() => {
    if (vista === 'lista') {
      loadFacturas()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, tabActiva])

  const abrirRevision = useCallback(async (factura) => {
    try {
      setLoading(true)
      setFacturaSeleccionada(factura)
      setProductos(factura.productos)
      setPreciosAjustados({})
      setSugerenciasPrecio({})

      // El precio y el costo de HOY de cada producto, del maestro propio y
      // por `producto.id` (cada línea trae su `productoPropioId`). Antes se le
      // preguntaba a Alegra en vivo, por el id de Alegra: mostraba el precio
      // de allá —no el que "Registrar compra" cambia acá— y un producto sin
      // ficha en Alegra no se podía revisar.
      const productoIds = [...new Set(factura.productos
        .map(p => p.productoPropioId)
        .filter(Boolean))]

      if (productoIds.length > 0) {
        const response = await api.post('/revision-precios/productos-batch', {
          productoIds
        })

        if (response.data.success) {
          setProductosDelCatalogo(response.data.productos)
        }
      }

      // Precio sugerido real del motor de precios (margen medido por
      // categoría + ajuste de rotación/exclusividad) — un fallo acá no debe
      // bloquear la revisión, simplemente no se muestra sugerencia.
      try {
        const sugerenciasRes = await api.get(`/revision-precios/facturas/${factura.id}/sugerencias-precio`)
        if (sugerenciasRes.data.success) {
          setSugerenciasPrecio(sugerenciasRes.data.sugerencias || {})
        }
      } catch (sugerenciasErr) {
        console.error('No se pudieron obtener las sugerencias de precio:', sugerenciasErr)
      }

      setVista('revision')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const volverALista = useCallback(() => {
    setVista('lista')
    setFacturaSeleccionada(null)
    setProductos([])
    setProductosDelCatalogo({})
    setPreciosAjustados({})
    setSugerenciasPrecio({})
  }, [])

  const devolverFactura = useCallback(async () => {
    if (!facturaSeleccionada) return

    const confirmacion = await confirm(
      `¿Devolver factura ${facturaSeleccionada.numeroConsecutivo} a PROCESADA?\n\n` +
      `Esta acción permitirá revisar y corregir las relaciones de productos.`
    )

    if (!confirmacion) return

    try {
      setDevolviendo(true)
      const response = await api.post('/revision-precios/devolver-factura', {
        facturaId: facturaSeleccionada.id
      })

      if (response.data.success) {
        showToast('Factura devuelta a estado PROCESADA correctamente', 'success')
        volverALista()
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error')
    } finally {
      setDevolviendo(false)
    }
  }, [facturaSeleccionada, confirm, showToast, volverALista])

  const ajustarPrecio = useCallback((productoId, nuevoPrecio) => {
    setPreciosAjustados(prev => ({
      ...prev,
      [productoId]: parseFloat(nuevoPrecio) || 0
    }))
  }, [])

  const aplicarPrecioSugerido = useCallback((productoId, precioSugerido) => {
    const precioRedondeado = redondearPrecio(precioSugerido)
    ajustarPrecio(productoId, precioRedondeado)
  }, [ajustarPrecio])

  const abrirFactor = useCallback((producto) => {
    setProductoSeleccionadoFactor(producto)

    if (producto.mapeo?.factorConversion && producto.mapeo.factorConversion !== 1) {
      const { cantidadProveedor: cp, cantidadMia: cm } = inferirCantidadesDesdeFactor(producto.mapeo.factorConversion)
      setCantidadProveedor(cp)
      setCantidadMia(cm)
    } else {
      setCantidadProveedor(1)
      setCantidadMia(1)
    }

    setModalFactor(true)
  }, [])

  const guardarFactor = useCallback(async () => {
    if (!productoSeleccionadoFactor?.mapeo) return

    const cantProv = parseFloat(cantidadProveedor)
    const cantMia = parseFloat(cantidadMia)

    if (cantProv <= 0 || cantMia <= 0) {
      showToast('Las cantidades deben ser mayores a 0', 'error')
      return
    }

    const factor = calcularFactorConversion(cantProv, cantMia)

    try {
      setGuardandoFactor(true)
      const response = await api.post('/productos-revision/factor-conversion', {
        mapeoId: productoSeleccionadoFactor.mapeo.id,
        factorConversion: factor
      })

      if (response.data.success) {
        setProductos(prev => prev.map(p => {
          if (p.id === productoSeleccionadoFactor.id) {
            return {
              ...p,
              mapeo: {
                ...p.mapeo,
                factorConversion: factor
              }
            }
          }
          return p
        }))

        showToast('Factor de conversión guardado correctamente', 'success')
        setModalFactor(false)
      }
    } catch (err) {
      showToast('Error guardando factor: ' + err.message, 'error')
    } finally {
      setGuardandoFactor(false)
    }
  }, [productoSeleccionadoFactor, cantidadProveedor, cantidadMia, showToast])

  const registrarCompra = useCallback(async () => {
    if (!facturaSeleccionada || enviando) return

    // Contar cuántos precios se van a actualizar
    const preciosQueActualizar = Object.keys(preciosAjustados).filter(
      id => preciosAjustados[id] > 0
    ).length

    const confirmacion = await confirm(
      `¿Registrar la compra de la factura ${facturaSeleccionada.numeroConsecutivo}?\n\n` +
      `Se realizará:\n` +
      `✅ Actualizar ${productos.length} costos\n` +
      `💰 Actualizar ${preciosQueActualizar} precios de venta\n` +
      `💳 Liberar la cuenta por pagar, si la tiene`
    )

    if (!confirmacion) return

    // Guardar info de la factura para el toast
    const facturaNumero = facturaSeleccionada.numeroConsecutivo
    const facturaId = facturaSeleccionada.id
    showToast(`📤 Registrando la compra de la factura ${facturaNumero}...`, 'loading', null)
    setEnviando(true)

    // Registrar en segundo plano. A diferencia del envío a Alegra de antes,
    // esto es todo o nada: si algo falla, no queda nada a medias — no hay
    // un "costos actualizados pero la compra no se creó" posible.
    try {
      const response = await api.post('/compras/registrar', {
        facturaId: facturaId,
        preciosAjustados: preciosAjustados
      })

      if (response.data.success) {
        const resultado = response.data.data
        volverALista()

        // Remover toast de "registrando"
        setToasts(prev => prev.filter(t => t.type !== 'loading'))

        const aceptacion = avisoDeAceptacion(resultado.hacienda)
        showToast(
          `✅ Compra de la factura ${facturaNumero} registrada\n` +
          `📦 ${resultado.lineas} líneas\n` +
          `💰 Costos actualizados: ${resultado.costosActualizados}\n` +
          `🔄 Precios ajustados: ${resultado.preciosActualizados}` +
          (resultado.sinProductoPropio ? `\n⚠️ ${resultado.sinProductoPropio} línea(s) sin producto propio, sin actualizar` : '') +
          (resultado.cuentaLiberada ? `\n💳 Cuenta por pagar liberada` : '') +
          (resultado.cuentaDeContado ? `\n💵 De contado: quedó pendiente en Pagos a Proveedores para anotar cómo se pagó` : '') +
          // La aceptación ante Hacienda sale sola al registrar: se dice cómo quedó.
          (aceptacion ? `\n${aceptacion}` : ''),
          resultado.hacienda?.estado === 'pendiente' ? 'warning' : 'success',
          resultado.hacienda?.estado === 'pendiente' ? 15000 : 8000
        )

        // Recargar la lista para actualizar estados
        loadFacturas()
      }
    } catch (err) {
      // Remover toast de "registrando"
      setToasts(prev => prev.filter(t => t.type !== 'loading'))

      // El mensaje del servidor es el motivo real (factura ya registrada,
      // sin proveedor propio, sin líneas...); si algo interno se cayó,
      // no queda nada a medias porque la transacción hizo ROLLBACK.
      showToast(
        `❌ No se pudo registrar la compra de ${facturaNumero}\n${err.response?.data?.message || err.message}`,
        'error',
        10000
      )
    } finally {
      setEnviando(false)
    }
  }, [facturaSeleccionada, preciosAjustados, productos.length, confirm, showToast, volverALista, loadFacturas, enviando])

  return {
    vista,
    facturas,
    facturaSeleccionada,
    productos,
    productosDelCatalogo,
    sugerenciasPrecio,
    loading,
    error,
    tabActiva,
    setTabActiva,
    preciosAjustados,
    enviando,
    devolviendo,
    abrirRevision,
    volverALista,
    devolverFactura,
    ajustarPrecio,
    aplicarPrecioSugerido,
    registrarCompra,

    modalFactor,
    productoSeleccionadoFactor,
    cantidadProveedor,
    setCantidadProveedor,
    cantidadMia,
    setCantidadMia,
    guardandoFactor,
    abrirFactor,
    guardarFactor,
    cerrarModalFactor: () => setModalFactor(false),

    toasts,
    removeToast,
    showToast,
    dialogProps,
    recargar: loadFacturas
  }
}

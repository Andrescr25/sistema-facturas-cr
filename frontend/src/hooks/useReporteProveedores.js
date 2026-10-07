import { useState, useEffect, useCallback, useRef } from 'react'
import { useContextoConsulta } from './useContextoConsulta'
import { useFiltroCicloOperacion } from './useFiltroCicloOperacion'
import { alegraService } from '../services/alegraService'
import api from '../services/api'
import { construirProductosParaOrden } from '../utils/reporteProveedoresUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'

/**
 * Estado y lógica de negocio del reporte de faltantes por proveedor: carga,
 * edición de cantidades a pedir, generación de PDF/envío por WhatsApp,
 * reasignación de productos a otro proveedor, y edición manual de la orden
 * (agregar/eliminar productos). Extraído de ReporteProveedores.jsx.
 *
 * Incluye prompt() (useDialog) y showToast() (useToast) en vez de
 * window.prompt/alert. La página debe renderizar
 * <ConfirmModal {...dialogProps} /> y <ToastContainer toasts={toasts} onRemove={removeToast} />.
 */
export function useReporteProveedores({activo=true}={}) {
  const filtroCiclo = useFiltroCicloOperacion('/reportes/faltantes/proveedor/ciclos')
  const peticion = useRef(0), peticionNotas = useRef(0)
  const consultaCiclo = Boolean(filtroCiclo.rutaId || filtroCiclo.cicloId)
  const { prompt, dialogProps } = useDialog()
  const { toasts, showToast, removeToast } = useToast()

  const [proveedores, setProveedores] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [cantidadesModificadas, setCantidadesModificadas] = useState(new Map())
  const [cantidadesGuardadas, setCantidadesGuardadas] = useState(new Map())
  const [fechaInicio, setFechaInicio] = useState('')
  const claveConsulta = JSON.stringify([activo, fechaInicio, filtroCiclo.params])
  const lectura = useContextoConsulta(claveConsulta)
  const notas = useContextoConsulta(claveConsulta)

  // Las notas que se escribieron al facturar, para leerlas al comprar. Se
  // piden APARTE del reporte: ambas lecturas son propias, pero agrupar las
  // notas no debe retrasar el listado. Si tardan o fallan, el reporte ya
  // está en pantalla.
  const [notasPorProducto, setNotasPorProducto] = useState({})
  const [cargandoNotas, setCargandoNotas] = useState(false)

  // Estados Modal Asignar Lotes
  const [modalAsignarVisible, setModalAsignarVisible] = useState(false)
  const [proveedoresDisponibles, setProveedoresDisponibles] = useState([])
  const [busquedaProveedor, setBusquedaProveedor] = useState('')
  const [loadingProveedores, setLoadingProveedores] = useState(false)
  const [modalCrearProveedor, setModalCrearProveedor] = useState(false)
  const [productosSeleccionados, setProductosSeleccionados] = useState(new Set())
  const [preferenciasDatosProveedor, setPreferenciasDatosProveedor] = useState({})

  // Estados Edición Manual
  const [productosEliminados, setProductosEliminados] = useState(new Set())
  const [productosAgregados, setProductosAgregados] = useState(new Map())
  const [modalAgregarProducto, setModalAgregarProducto] = useState(false)
  const [proveedorParaAgregar, setProveedorParaAgregar] = useState(null)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosEncontrados, setProductosEncontrados] = useState([])
  const [loadingProductos, setLoadingProductos] = useState(false)

  // Estados WhatsApp
  // A qué proveedores ya se les mandó el pedido en este período. Viene del
  // registro de envíos del servidor y no del navegador, para que la marca la
  // vea también quien abra el reporte desde otra máquina.
  const [pedidosEnviados, setPedidosEnviados] = useState(new Map())
  const [modalWhatsAppVisible, setModalWhatsAppVisible] = useState(false)
  const [proveedorParaWhatsApp, setProveedorParaWhatsApp] = useState(null)
  const [telefonoProveedor, setTelefonoProveedor] = useState('')
  const [mensajeWhatsApp, setMensajeWhatsApp] = useState('Hola buenas, adjunto el pedido\ngracias')

  const loadReporte = useCallback(async () => {
    if (!activo || !lectura.esActual()) return
    const actual = ++peticion.current
    try {
      setLoading(true)
      setError(null)
      const result = await alegraService.getReporteFaltantesProveedor(fechaInicio, filtroCiclo.params)
      if (!lectura.esActual() || actual !== peticion.current) return

      if (result.success) {
        // Filtrar proveedores que NO tienen productos para limpiar la vista principal
        const proveedoresConProductos = result.data.filter(p => p.productos_faltantes && p.productos_faltantes.length > 0)
        setProveedores(proveedoresConProductos)
        setResumen(result.resumen)
      } else {
        setProveedores([])
        setResumen(null)
        setError(result.message || 'Error cargando reporte')
      }
    } catch (err) {
      if (lectura.esActual() && actual === peticion.current) { setProveedores([]); setResumen(null); setError(err.message) }
    } finally {
      if (lectura.esActual() && actual === peticion.current) { lectura.confirmar(); setLoading(false) }
    }
  }, [activo, fechaInicio, filtroCiclo.params, lectura.esActual, lectura.confirmar])

  const loadNotas = useCallback(async () => {
    if (!activo || !notas.esActual()) return
    const actual = ++peticionNotas.current
    setCargandoNotas(true)
    try {
      const r = await alegraService.getNotasDeFaltantes(fechaInicio, filtroCiclo.params)
      if (!notas.esActual() || actual !== peticionNotas.current) return
      setNotasPorProducto(r?.data?.porProducto || {})
    } catch {
      // Sin notas se compra como se compraba hasta ayer: no se estorba.
      if (notas.esActual() && actual === peticionNotas.current) setNotasPorProducto({})
    } finally {
      if (notas.esActual() && actual === peticionNotas.current) { notas.confirmar(); setCargandoNotas(false) }
    }
  }, [activo, fechaInicio, filtroCiclo.params, notas.esActual, notas.confirmar])

  const loadCantidadesGuardadas = useCallback(async () => {
    try {
      const result = await alegraService.getCantidadesModificadas()
      if (result.success) {
        const cantidadesMap = new Map()
        result.data?.modificadas?.forEach(item => {
          const key = `${item.proveedor_nombre}-${item.producto_codigo}`
          cantidadesMap.set(key, {
            cantidad_original: item.cantidad_original,
            cantidad_modificada: item.cantidad_modificada
          })
        })
        setCantidadesGuardadas(cantidadesMap)

        const eliminados = new Set()
        result.data?.eliminadas?.forEach(item => {
          const key = `${item.proveedor_nombre}-${item.producto_codigo}`
          eliminados.add(key)
        })
        setProductosEliminados(eliminados)

        const agregados = new Map()
        result.data?.agregadas?.forEach(item => {
          const proveedorNombre = item.proveedor_nombre
          const productosDelProveedor = agregados.get(proveedorNombre) || []
          productosDelProveedor.push({
            codigo: item.producto_codigo,
            nombre: item.producto_nombre,
            cantidad: item.cantidad_modificada,
            agregadoManual: true
          })
          agregados.set(proveedorNombre, productosDelProveedor)
        })
        setProductosAgregados(agregados)
      }
    } catch (err) {
      console.warn('Error cargando cantidades guardadas:', err)
    }
  }, [])

  /**
   * Qué pedidos ya salieron por WhatsApp, en el mismo período del reporte.
   *
   * Acotado por `fechaInicio` a propósito: una orden mandada el mes pasado
   * no dice nada sobre la de esta semana, y marcarla igual haría que la
   * señal dejara de significar algo.
   */
  const loadPedidosEnviados = useCallback(async () => {
    const result = await alegraService.getOrdenesEnviadas(fechaInicio)
    if (!result?.success) return
    const mapa = new Map()
    for (const fila of result.data || []) {
      mapa.set(fila.proveedor, { ultimoEnvio: fila.ultimoEnvio, veces: fila.veces })
    }
    setPedidosEnviados(mapa)
  }, [fechaInicio])

  useEffect(() => {
    setModalAsignarVisible(false)
    // El reporte legado puede asignar proveedores al abrirse. Las otras
    // vistas no deben dispararlo de fondo ni aplicar sus borradores globales.
    if(!activo){++peticion.current;++peticionNotas.current;return}
    loadReporte()
    loadNotas()
    if (!consultaCiclo) { loadCantidadesGuardadas(); loadPedidosEnviados() }
    else { setPedidosEnviados(new Map()); setProductosSeleccionados(new Set()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaInicio, filtroCiclo.params,activo])

  const usaDatosProveedor = useCallback((proveedorNombre) => {
    const preferencia = preferenciasDatosProveedor[proveedorNombre]
    return preferencia === undefined ? true : preferencia
  }, [preferenciasDatosProveedor])

  const togglePreferenciaProveedor = useCallback((proveedorNombre, value) => {
    setPreferenciasDatosProveedor(prev => ({
      ...prev,
      [proveedorNombre]: value
    }))
  }, [])

  const handleCantidadChange = useCallback((proveedorNombre, productoCodigo, nuevaCantidad) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    const cantidadNum = parseInt(nuevaCantidad) || 0
    setCantidadesModificadas(prev => {
      const nuevasCantidades = new Map(prev)
      nuevasCantidades.set(key, cantidadNum)
      return nuevasCantidades
    })
  }, [])

  const handleGuardarCantidades = useCallback(async () => {
    if (cantidadesModificadas.size === 0) {
      showToast('No hay cantidades modificadas para guardar.', 'info')
      return
    }

    try {
      setLoading(true)
      const cantidadesParaGuardar = []
      proveedores.forEach(proveedor => {
        proveedor.productos_faltantes.forEach(producto => {
          const key = `${proveedor.nombre}-${producto.codigo}`
          const cantidadModificada = cantidadesModificadas.get(key)
          if (cantidadModificada !== undefined) {
            cantidadesParaGuardar.push({
              proveedor_nombre: proveedor.nombre,
              producto_codigo: producto.codigo,
              producto_nombre: producto.nombre,
              cantidad_original: producto.cantidad_faltante,
              cantidad_modificada: cantidadModificada
            })
          }
        })
      })

      const result = await alegraService.guardarCantidadesModificadas(cantidadesParaGuardar)
      if (result.success) {
        await loadCantidadesGuardadas()
        setCantidadesModificadas(new Map())
        showToast(`Cantidades guardadas correctamente\n\n• ${result.data?.cantidades_guardadas ?? 0} productos actualizados`, 'success')
      } else {
        showToast(`Error guardando cantidades: ${result.message}`, 'error')
      }
    } catch (error) {
      showToast(`Error guardando cantidades: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [cantidadesModificadas, proveedores, loadCantidadesGuardadas, showToast])

  const handleGenerarPDF = useCallback(async (proveedor) => {
    try {
      setLoading(true)
      const preferirDatosProveedor = usaDatosProveedor(proveedor.nombre)
      const productosParaPDF = construirProductosParaOrden(proveedor, {
        productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados
      })

      if (productosParaPDF.length === 0) {
        showToast('No hay productos para generar la orden de compra', 'warning')
        return
      }

      const blob = await alegraService.generarPDFOrdenCompra(proveedor.nombre, productosParaPDF, preferirDatosProveedor)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orden-${proveedor.nombre.replace(/\s+/g, '-')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      showToast(`PDF generado para ${proveedor.nombre}`, 'success')
    } catch (error) {
      showToast(`Error generando PDF: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [usaDatosProveedor, productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados, showToast])

  const abrirModalWhatsApp = useCallback(async (proveedor) => {
    setProveedorParaWhatsApp(proveedor)
    setMensajeWhatsApp('Hola buenas, adjunto el pedido\ngracias')
    setModalWhatsAppVisible(true)
    try {
      // El de la ficha del proveedor: el mismo en todas las computadoras.
      const telefonoDB = await alegraService.getTelefonoProveedor(proveedor)
      if (telefonoDB) {
        setTelefonoProveedor(telefonoDB)
      } else {
        const telefonoLocal = localStorage.getItem(`whatsapp_tel_${proveedor.nombre}`)
        setTelefonoProveedor(telefonoLocal || proveedor.telefono || '')
      }
    } catch (error) {
      const telefonoLocal = localStorage.getItem(`whatsapp_tel_${proveedor.nombre}`)
      setTelefonoProveedor(telefonoLocal || proveedor.telefono || '')
    }
  }, [])

  const enviarWhatsApp = useCallback(async () => {
    if (!telefonoProveedor.trim()) {
      showToast('Ingresa el número de teléfono del proveedor', 'warning')
      return
    }

    try {
      setLoading(true)
      const proveedor = proveedorParaWhatsApp
      const preferirDatosProveedor = usaDatosProveedor(proveedor.nombre)

      const productosParaPDF = construirProductosParaOrden(proveedor, {
        productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados
      })

      if (productosParaPDF.length === 0) {
        showToast('No hay productos para enviar', 'warning')
        return
      }

      // Guardar/Actualizar teléfono del proveedor de una vez
      try {
        await alegraService.guardarTelefonoProveedor(proveedor, telefonoProveedor)
        localStorage.setItem(`whatsapp_tel_${proveedor.nombre}`, telefonoProveedor)
      } catch (e) {
        localStorage.setItem(`whatsapp_tel_${proveedor.nombre}`, telefonoProveedor)
      }

      // Enviar directamente mediante el backend + Evolution API
      const result = await alegraService.enviarOrdenCompraWhatsApp(
        proveedor.nombre,
        telefonoProveedor,
        productosParaPDF,
        preferirDatosProveedor,
        mensajeWhatsApp
      )

      if (result.success) {
        showToast(`Orden de compra enviada con éxito a ${proveedor.nombre} por WhatsApp.`, 'success')
        setModalWhatsAppVisible(false)
        // Que la marca aparezca de una en la tarjeta, sin recargar.
        loadPedidosEnviados()
      } else {
        showToast(`Error enviando por WhatsApp: ${result.message}`, 'error')
      }
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [telefonoProveedor, proveedorParaWhatsApp, usaDatosProveedor, productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados, mensajeWhatsApp, showToast, loadPedidosEnviados])

  // Selección de Múltiples Productos
  const toggleProductoSeleccionado = useCallback((codigo) => {
    setProductosSeleccionados(prev => {
      const nuevaSeleccion = new Set(prev)
      if (nuevaSeleccion.has(codigo)) nuevaSeleccion.delete(codigo); else nuevaSeleccion.add(codigo)
      return nuevaSeleccion
    })
  }, [])

  const toggleTodosProductos = useCallback((proveedor) => {
    const todosCodigos = proveedor.productos_faltantes.map(p => p.codigo)
    setProductosSeleccionados(prev => {
      const todosSeleccionados = todosCodigos.every(codigo => prev.has(codigo))
      const nuevaSeleccion = new Set(prev)
      if (todosSeleccionados) {
        todosCodigos.forEach(codigo => nuevaSeleccion.delete(codigo))
      } else {
        todosCodigos.forEach(codigo => nuevaSeleccion.add(codigo))
      }
      return nuevaSeleccion
    })
  }, [])

  const cargarProveedores = useCallback(async (busqueda) => {
    try {
      setLoadingProveedores(true)
      // Las fichas PROPIAS de proveedor (`proveedor.id`), no los contactos de
      // Alegra. El modal las pinta con `name` e `identification`.
      const response = await api.get('/proveedores/fichas', { params: { buscar: busqueda || '', limite: 100 } })
      if (response.data.success) {
        setProveedoresDisponibles((response.data.data || []).map(f => ({
          id: f.id, name: f.nombre, identification: f.identificacion || ''
        })))
      } else {
        showToast('Error cargando proveedores: ' + response.data.message, 'error')
      }
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error')
    } finally {
      setLoadingProveedores(false)
    }
  }, [showToast])

  const abrirModalAsignar = useCallback(async () => {
    if (productosSeleccionados.size === 0) {
      showToast('Selecciona al menos un producto', 'warning')
      return
    }
    setModalAsignarVisible(true)
    setBusquedaProveedor('')
    await cargarProveedores('')
  }, [productosSeleccionados, cargarProveedores])

  const asignarProveedorManual = useCallback(async (proveedorId) => {
    if (productosSeleccionados.size === 0) return
    if (consultaCiclo && !filtroCiclo.cicloId) {
      showToast('Seleccioná una semana concreta o Sin ciclo para asignar.', 'warning')
      return
    }
    try {
      setLoading(true)
      const productosAAsignar = []
      proveedores.forEach(proveedor => {
        const prod = proveedor.productos_faltantes.filter(p => productosSeleccionados.has(p.codigo))
        prod.forEach(p => productosAAsignar.push({ producto: p, proveedorActual: proveedor.nombre }))
      })

      if (productosAAsignar.length === 0) return

      const BATCH_SIZE = 3
      const resultados = []

      for (let i = 0; i < productosAAsignar.length; i += BATCH_SIZE) {
        const lote = productosAAsignar.slice(i, i + BATCH_SIZE)
        const promesasLote = lote.map(({ producto, proveedorActual }) => {
          // Los dos ids son PROPIOS: el producto del que cuelgan los faltantes
          // (migración 032) y la ficha del proveedor. Asignar y reasignar son
          // la misma operación.
          return api.post('/proveedores/asignaciones', { productoId: producto.producto_id, proveedorId,
            ...(consultaCiclo ? { cicloId: filtroCiclo.cicloId } : {}) })
            .catch(err => ({ data: { success: false } }))
        })
        resultados.push(...(await Promise.all(promesasLote)))
      }

      const exitosos = resultados.filter(r => r.data?.success).length
      if (exitosos > 0) {
        showToast(`${exitosos} producto(s) asignado(s)`, 'success')
        setModalAsignarVisible(false)
        setProductosSeleccionados(new Set())
        await loadReporte()
      }
    } catch (error) {
      showToast('Error asignando proveedor: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [productosSeleccionados, proveedores, loadReporte, showToast, consultaCiclo, filtroCiclo.cicloId])

  const crearNuevoProveedor = useCallback(async (datosProveedor) => {
    try {
      setLoading(true)
      // Se crea la FICHA propia y se le asignan los productos elegidos.
      const response = await api.post('/proveedores/fichas', {
        nombre: datosProveedor.name,
        tipo_identificacion: datosProveedor.identificationType || undefined,
        identificacion: datosProveedor.identification || undefined
      })
      if (response.data.success) {
        showToast(`Proveedor creado: ${response.data.data.nombre}`, 'success')
        setModalCrearProveedor(false)
        await asignarProveedorManual(response.data.data.id)
      } else {
        showToast(`Error: ${response.data.message}`, 'error')
      }
    } catch (error) {
      showToast('Error creando proveedor: ' + (error.response?.data?.message || error.message), 'error')
    } finally {
      setLoading(false)
    }
  }, [asignarProveedorManual, showToast])

  const eliminarProductoDeOrden = useCallback(async (proveedorNombre, productoCodigo, productoNombre, cantidadOriginal) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    setProductosEliminados(prev => new Set(prev).add(key))

    try {
      await api.post('/orden-compra/producto-eliminado', { proveedorNombre, productoCodigo, productoNombre, cantidadOriginal: cantidadOriginal || 0 })
    } catch (error) {
      console.error('Error:', error)
    }
  }, [])

  const restaurarProducto = useCallback(async (proveedorNombre, productoCodigo) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    setProductosEliminados(prev => {
      const nuevosEliminados = new Set(prev)
      nuevosEliminados.delete(key)
      return nuevosEliminados
    })

    try {
      await api.delete('/orden-compra/producto-eliminado', { data: { proveedorNombre, productoCodigo } })
    } catch (error) {
      console.error('No se pudo restaurar el producto:', error)
      showToast('El producto se restauró en pantalla, pero NO se guardó. Recargue antes de enviar el pedido.', 'error')
    }
  }, [])

  const abrirModalAgregarProducto = useCallback((proveedor) => {
    setProveedorParaAgregar(proveedor)
    setModalAgregarProducto(true)
    setBusquedaProducto('')
    setProductosEncontrados([])
  }, [])

  const buscarProductos = useCallback(async (query) => {
    if (!query || query.length < 2) { setProductosEncontrados([]); return }
    try {
      setLoadingProductos(true)
      // Sin desactivados: no tiene sentido pedirle al proveedor algo que ya no se vende.
      // Del maestro propio, solo activos (la lectura compartida de
      // /catalogos). El modal los pinta con `name` y `reference`.
      const res = await api.get('/catalogos/productos', { params: { buscar: query, limite: 30 } })
      if (res.data.success) {
        setProductosEncontrados((res.data.data || []).map(p => ({ id: p.id, name: p.nombre, reference: p.referencia || '' })))
      }
    } catch (e) {
      // Búsqueda mientras se escribe: no se avisa —una petición cortada por
      // la siguiente tecla no es un problema— pero sí queda en consola.
      console.warn('Búsqueda de productos falló:', e.message)
    } finally { setLoadingProductos(false) }
  }, [])

  const agregarProductoAOrden = useCallback(async (producto, cantidad) => {
    if (!proveedorParaAgregar || cantidad <= 0) return
    const keyProv = proveedorParaAgregar.nombre
    const nuevosAgregados = new Map(productosAgregados)
    const list = nuevosAgregados.get(keyProv) || []
    list.push({ codigo: producto.reference, nombre: producto.name, cantidad: parseInt(cantidad), agregadoManual: true })
    nuevosAgregados.set(keyProv, list)
    setProductosAgregados(nuevosAgregados)

    try {
      await api.post('/orden-compra/producto-agregado', { proveedorNombre: keyProv, productoCodigo: producto.reference, productoNombre: producto.name, cantidad: parseInt(cantidad) })
    } catch (error) {
      console.error('No se pudo registrar el producto agregado:', error)
      showToast('El producto se agregó en pantalla, pero NO se guardó. Recargue antes de enviar el pedido.', 'error')
    }
    setModalAgregarProducto(false)
  }, [proveedorParaAgregar, productosAgregados])

  const solicitarCantidadYAgregar = useCallback(async (producto, reference) => {
    const q = await prompt(`${producto.name}\n¿Cantidad a añadir a la orden?`, { inputDefaultValue: '1' })
    if (q && parseInt(q) > 0) {
      await agregarProductoAOrden({ ...producto, reference }, q)
    }
  }, [prompt, agregarProductoAOrden])

  const eliminarProductoAgregado = useCallback(async (proveedorNombre, index) => {
    const nuevos = new Map(productosAgregados)
    const list = nuevos.get(proveedorNombre) || []
    const prod = list[index]
    list.splice(index, 1)
    if (list.length === 0) nuevos.delete(proveedorNombre); else nuevos.set(proveedorNombre, list)
    setProductosAgregados(nuevos)

    try {
      await api.delete('/orden-compra/producto-agregado', { data: { proveedorNombre, productoCodigo: prod.codigo } })
    } catch (e) {
      console.error('No se pudo quitar el producto agregado:', e)
      showToast('El cambio NO se guardó. Recargue antes de enviar el pedido.', 'error')
    }
  }, [productosAgregados])

  const actualizarCantidadAgregado = useCallback(async (proveedorNombre, index, nuevaCantidad) => {
    const cant = parseInt(nuevaCantidad)
    if (isNaN(cant) || cant <= 0) return
    const nuevos = new Map(productosAgregados)
    const list = nuevos.get(proveedorNombre) || []
    if (list[index]) {
      list[index] = { ...list[index], cantidad: cant }
      nuevos.set(proveedorNombre, list)
      setProductosAgregados(nuevos)

      try {
        await api.post('/orden-compra/producto-agregado', { proveedorNombre, productoCodigo: list[index].codigo, productoNombre: list[index].nombre, cantidad: cant })
      } catch (e) {
        console.error('No se pudo guardar la cantidad:', e)
        showToast('La cantidad NO se guardó. Recargue antes de enviar el pedido.', 'error')
      }
    }
  }, [productosAgregados])

  return {
    filtroCiclo, consultaCiclo,
    notasPorProducto: notas.vigente ? notasPorProducto : {},
    cargandoNotas: activo && (cargandoNotas || !notas.vigente),
    proveedores: lectura.vigente ? proveedores : [],
    pedidosEnviados,
    resumen: lectura.vigente ? resumen : null,
    loading: activo && (loading || !lectura.vigente),
    error: lectura.vigente ? error : null,
    fechaInicio,
    setFechaInicio,
    loadReporte,

    cantidadesModificadas,
    cantidadesGuardadas,
    handleCantidadChange,
    handleGuardarCantidades,

    preferenciasDatosProveedor,
    usaDatosProveedor,
    togglePreferenciaProveedor,

    handleGenerarPDF,

    modalWhatsAppVisible,
    setModalWhatsAppVisible,
    proveedorParaWhatsApp,
    telefonoProveedor,
    setTelefonoProveedor,
    mensajeWhatsApp,
    setMensajeWhatsApp,
    abrirModalWhatsApp,
    enviarWhatsApp,

    productosSeleccionados,
    toggleProductoSeleccionado,
    toggleTodosProductos,

    modalAsignarVisible,
    setModalAsignarVisible,
    proveedoresDisponibles,
    setProveedoresDisponibles,
    busquedaProveedor,
    setBusquedaProveedor,
    loadingProveedores,
    abrirModalAsignar,
    cargarProveedores,
    asignarProveedorManual,

    modalCrearProveedor,
    setModalCrearProveedor,
    crearNuevoProveedor,

    productosEliminados,
    eliminarProductoDeOrden,
    restaurarProducto,

    productosAgregados,
    modalAgregarProducto,
    setModalAgregarProducto,
    proveedorParaAgregar,
    busquedaProducto,
    setBusquedaProducto,
    productosEncontrados,
    loadingProductos,
    abrirModalAgregarProducto,
    buscarProductos,
    solicitarCantidadYAgregar,
    eliminarProductoAgregado,
    actualizarCantidadAgregado,

    dialogProps,
    toasts,
    showToast,
    removeToast
  }
}

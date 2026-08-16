import { useState, useEffect, useMemo, useRef } from 'react'
import {
  getAuditorias,
  getCategorias,
  crearAuditoria,
  getAuditoriaDetalle,
  guardarConteos,
  guardarConteoIndividual,
  finalizarAuditoria,
  ajustarAlegra,
  resyncAuditoria,
  getDevoluciones,
  crearDevolucion as crearDevolucionApi,
  buscarProductosDevolucion,
  agregarItemDevolucion as agregarItemDevolucionApi,
  eliminarItemDevolucion as eliminarItemDevolucionApi,
  getExcesos,
  generarExcesosAhora,
  actualizarItemExceso,
  getRegalos,
  crearExcesoManual as crearExcesoManualApi,
  eliminarExceso as eliminarExcesoApi,
  agregarItemExceso as agregarItemExcesoApi,
  aplicarDescuentoTanda as aplicarDescuentoTandaApi,
  getDescuentosExceso,
  guardarDescuentoExceso as guardarDescuentoExcesoApi,
  eliminarDescuentoExceso as eliminarDescuentoExcesoApi
} from '../services/inventarioService'
import {
  calcularKpis,
  filtrarItemsAuditoria,
  calcularItemsStats,
  calcularAjustesPreview,
  calcularImpactoFinanciero,
  calcularSiguienteNombreDevolucion
} from '../utils/inventarioAuditoriaUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'

/**
 * Estado y lógica de negocio de la auditoría de inventario: dashboard con
 * KPIs e historial, creación de sesiones, ejecución del conteo físico
 * (hoja de conteo, filtros, guardado con ajuste en Alegra), y el reporte
 * final con la acción correctiva. Extraído de InventarioAuditoria.jsx.
 *
 * Incluye confirm() (useDialog) y showToast()/toasts (useToast) en vez de
 * window.confirm/alert. La página debe renderizar <ConfirmModal {...dialogProps} />
 * y <ToastContainer toasts={toasts} onRemove={removeToast} />.
 */
export function useInventarioAuditoria() {
  const { confirm, dialogProps } = useDialog()
  const { toasts, showToast, removeToast } = useToast()

  // State
  const [auditorias, setAuditorias] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  // Active states
  const [auditoriaActiva, setAuditoriaActiva] = useState(null)
  const [conteosDraft, setConteosDraft] = useState({}) // { itemId: stock_real }
  const [observacionesFinales, setObservacionesFinales] = useState('')

  // Modal states
  const [showNewModal, setShowNewModal] = useState(false)
  const [newAuditTipo, setNewAuditTipo] = useState('random')
  const [newAuditCategoria, setNewAuditCategoria] = useState('')
  const [newAuditNombre, setNewAuditNombre] = useState('')
  const [imagenProductoActivo, setImagenProductoActivo] = useState(null) // item completo, o null

  // Search & filter states for audit execution
  const [executionSearch, setExecutionSearch] = useState('')
  const [executionFilter, setExecutionFilter] = useState('todos') // 'todos', 'pendiente', 'correcto', 'descuadre'

  // Alegra adjustment state
  const [loadingAjuste, setLoadingAjuste] = useState(false)
  const [successAjuste, setSuccessAjuste] = useState(null)

  // Shown while conteos/ajustes se están enviando a Alegra (puede tardar varios segundos por el loteo)
  const [applyingAdjustments, setApplyingAdjustments] = useState(false)

  // Pestaña de nivel de página: Auditorías (conteo cíclico) o Devoluciones
  // (reingreso de productos devueltos). auditoriaActiva se reutiliza para
  // ambas — se distingue por auditoriaActiva.tipo === 'devolucion'.
  const [vistaActiva, setVistaActiva] = useState('auditorias')
  const [devoluciones, setDevoluciones] = useState([])
  const [showNewDevolucionModal, setShowNewDevolucionModal] = useState(false)

  // Búsqueda de producto para agregar a la devolución activa
  const [busquedaProductoDevolucion, setBusquedaProductoDevolucion] = useState('')
  const [resultadosProductoDevolucion, setResultadosProductoDevolucion] = useState([])
  const [buscandoProductoDevolucion, setBuscandoProductoDevolucion] = useState(false)
  const [agregandoItemDevolucion, setAgregandoItemDevolucion] = useState(false)

  // Excesos de inventario: tandas de empaque generadas por el cron semanal o
  // armadas a mano — auditoriaActiva.tipo === 'exceso' reusa la misma
  // pantalla de detalle que auditorías/devoluciones.
  const [excesos, setExcesos] = useState([])
  const [generandoExcesos, setGenerandoExcesos] = useState(false)
  const [creandoExceso, setCreandoExceso] = useState(false)

  // Búsqueda para agregar productos a mano a una tanda de excesos. Estado
  // aparte del de devoluciones a propósito: son flujos distintos y compartir
  // el estado hacía que una búsqueda vieja apareciera en la otra pantalla.
  const [busquedaProductoExceso, setBusquedaProductoExceso] = useState('')
  const [resultadosProductoExceso, setResultadosProductoExceso] = useState([])
  const [buscandoProductoExceso, setBuscandoProductoExceso] = useState(false)
  const [agregandoItemExceso, setAgregandoItemExceso] = useState(false)
  const [aplicandoDescuentoTanda, setAplicandoDescuentoTanda] = useState(false)

  // Descuentos por exceso: es lo que de verdad ven los clientes en el
  // catálogo público, así que se puede editar/quitar a mano.
  const [descuentos, setDescuentos] = useState([])
  const [loadingDescuentos, setLoadingDescuentos] = useState(false)

  // Regalías: productos que llegaron a 100% de descuento acumulado y ya
  // fueron entregados a un cliente elegido al azar (ver escalarDescuentosExceso).
  const [regalos, setRegalos] = useState([])

  // Load initial dashboard data
  const loadDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getAuditorias()
      if (data.success) {
        setAuditorias(data.data)
      }

      const cats = await getCategorias()
      if (cats.success) {
        setCategorias(cats.data)
        if (cats.data.length > 0) {
          setNewAuditCategoria(cats.data[0])
        }
      }
    } catch (err) {
      console.error('Error cargando panel de inventario:', err)
      setError('No se pudo cargar la información de inventario.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  // Load devoluciones history (tipo='devolucion', filtradas en el backend)
  const loadDevoluciones = async () => {
    setLoading(true)
    try {
      const data = await getDevoluciones()
      if (data.success) {
        setDevoluciones(data.data)
      }
    } catch (err) {
      console.error('Error cargando devoluciones:', err)
      showToast('No se pudo cargar el historial de devoluciones.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Load excesos history (tipo='exceso', filtrados en el backend)
  const loadExcesos = async () => {
    setLoading(true)
    try {
      const data = await getExcesos()
      if (data.success) {
        setExcesos(data.data)
      }
    } catch (err) {
      console.error('Error cargando excesos:', err)
      showToast('No se pudo cargar el historial de excesos.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Load regalías history (productos que llegaron a 100% de descuento)
  const loadRegalos = async () => {
    try {
      const data = await getRegalos()
      if (data.success) {
        setRegalos(data.data)
      }
    } catch (err) {
      console.error('Error cargando regalías:', err)
    }
  }

  // Cambiar entre pestañas, cargando la lista correspondiente la primera
  // vez que se entra a cada una.
  const cambiarVista = (vista) => {
    setVistaActiva(vista)
    if (vista === 'devoluciones' && devoluciones.length === 0) {
      loadDevoluciones()
    }
    if (vista === 'excesos' && excesos.length === 0) {
      loadExcesos()
      loadRegalos()
      loadDescuentos()
    }
  }

  const handleGenerarExcesosAhora = async () => {
    setGenerandoExcesos(true)
    showToast('Generando excesos: consulta el stock completo en vivo de Alegra, puede tardar varios minutos...', 'info', 15000)
    try {
      const result = await generarExcesosAhora()
      if (result.success) {
        const regalosNuevos = result.regalosNuevos || []
        const sufijoRegalos = regalosNuevos.length > 0
          ? ` 🎁 ${regalosNuevos.length} producto(s) llegaron a 100% de descuento y fueron regalados.`
          : ''
        showToast(
          (result.creado
            ? `"${result.nombre}" creado con ${result.total} producto(s) (de ${result.totalDetectados} detectados en total).`
            : (result.message || 'No se detectaron productos en exceso.')) + sufijoRegalos,
          'success'
        )
        await loadExcesos()
        await loadRegalos()
      }
    } catch (err) {
      console.error('Error generando excesos:', err)
      showToast(err.response?.data?.error || 'Error generando excesos. Puede que siga corriendo en segundo plano — revisa el historial en unos minutos.', 'error')
    } finally {
      setGenerandoExcesos(false)
    }
  }

  // --- Control manual de excesos ---

  const handleCrearExcesoManual = async () => {
    setCreandoExceso(true)
    try {
      const result = await crearExcesoManualApi()
      if (result.success) {
        showToast(`"${result.data.nombre}" creado. Agregale los productos que quieras.`, 'success')
        await loadExcesos()
        // Se abre de una: una tanda vacía no sirve de nada hasta que se le
        // agregan productos, así que llevar al usuario ahí evita el paso
        // extra de buscarla en la lista que acaba de cambiar.
        await handleSelectAuditoria(result.data.id)
      }
    } catch (err) {
      console.error('Error creando tanda de excesos:', err)
      showToast(err.response?.data?.message || 'Error al crear la tanda.', 'error')
    } finally {
      setCreandoExceso(false)
    }
  }

  const handleEliminarExceso = async (id, nombre) => {
    const confirmado = await confirm(
      `¿Eliminar "${nombre}"? Se borra la tanda completa con todos sus productos. No se puede deshacer.`
    )
    if (!confirmado) return

    try {
      const result = await eliminarExcesoApi(id)
      if (result.success) {
        showToast(`"${result.nombre}" eliminado.`, 'success')
        if (auditoriaActiva?.id === id) volverAlDashboard()
        await loadExcesos()
      }
    } catch (err) {
      console.error('Error eliminando tanda de excesos:', err)
      showToast(err.response?.data?.message || 'Error al eliminar la tanda.', 'error')
    }
  }

  const buscarProductoExceso = async (q) => {
    if (!q || q.length < 2) {
      setResultadosProductoExceso([])
      return
    }
    setBuscandoProductoExceso(true)
    try {
      const result = await buscarProductosDevolucion(q)
      if (result.success) setResultadosProductoExceso(result.data)
    } catch (err) {
      console.error('Error buscando productos para exceso:', err)
    } finally {
      setBuscandoProductoExceso(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      buscarProductoExceso(busquedaProductoExceso)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaProductoExceso])

  const handleAgregarItemExceso = async (producto) => {
    if (!auditoriaActiva) return
    setAgregandoItemExceso(true)
    try {
      const result = await agregarItemExcesoApi(auditoriaActiva.id, { alegraId: producto.alegraId })
      if (result.success) {
        showToast(`"${producto.nombre}" agregado a la tanda.`, 'success')
        setBusquedaProductoExceso('')
        setResultadosProductoExceso([])
        await refrescarAuditoriaActiva()
      }
    } catch (err) {
      console.error('Error agregando producto a la tanda:', err)
      showToast(err.response?.data?.message || 'Error al agregar el producto.', 'error')
    } finally {
      setAgregandoItemExceso(false)
    }
  }

  const handleAplicarDescuentoTanda = async (descuentoPorcentaje) => {
    if (!auditoriaActiva) return

    // 0% borra las filas de descuento: se pierde veces_detectado y los
    // productos salen del catálogo. Es reversible volviendo a poner un
    // porcentaje, pero no en un click sin querer.
    if (Number(descuentoPorcentaje) === 0) {
      const confirmado = await confirm(
        `¿Quitar el descuento de los ${auditoriaActiva.items.length} productos de esta tanda? Dejan de verse en el catálogo público.`
      )
      if (!confirmado) return
    }

    setAplicandoDescuentoTanda(true)
    try {
      const result = await aplicarDescuentoTandaApi(auditoriaActiva.id, descuentoPorcentaje)
      if (result.success) {
        const { afectados, quitados } = result.data
        showToast(
          quitados
            ? `Descuento quitado a ${afectados} producto(s). Ya no se ven en el catálogo.`
            : `${descuentoPorcentaje}% aplicado a ${afectados} producto(s).`,
          'success'
        )
        await refrescarAuditoriaActiva()
        // La pestaña de Descuentos queda desactualizada si no se recarga.
        await loadDescuentos()
      }
    } catch (err) {
      console.error('Error aplicando descuento a la tanda:', err)
      showToast(err.response?.data?.message || 'Error al aplicar el descuento.', 'error')
    } finally {
      setAplicandoDescuentoTanda(false)
    }
  }

  const handleEliminarItemExceso = async (itemId) => {
    if (!auditoriaActiva) return
    const confirmado = await confirm('¿Quitar este producto de la tanda de excesos?')
    if (!confirmado) return

    try {
      await eliminarItemDevolucionApi(auditoriaActiva.id, itemId)
      await refrescarAuditoriaActiva()
    } catch (err) {
      console.error('Error quitando producto de la tanda:', err)
      showToast(err.response?.data?.message || 'Error al quitar el producto.', 'error')
    }
  }

  // --- Descuentos del catálogo público ---

  const loadDescuentos = async () => {
    setLoadingDescuentos(true)
    try {
      const result = await getDescuentosExceso()
      if (result.success) setDescuentos(result.data)
    } catch (err) {
      console.error('Error cargando descuentos:', err)
      showToast('No se pudieron cargar los descuentos.', 'error')
    } finally {
      setLoadingDescuentos(false)
    }
  }

  const handleGuardarDescuento = async (alegraItemId, descuentoPorcentaje, nombre) => {
    try {
      const result = await guardarDescuentoExcesoApi({ alegraItemId, descuentoPorcentaje })
      if (result.success) {
        showToast(`Descuento de "${nombre || result.data.nombre_producto}" en ${descuentoPorcentaje}%.`, 'success')
        await loadDescuentos()
      }
    } catch (err) {
      console.error('Error guardando descuento:', err)
      showToast(err.response?.data?.message || 'Error al guardar el descuento.', 'error')
    }
  }

  const handleEliminarDescuento = async (alegraItemId, nombre) => {
    const confirmado = await confirm(
      `¿Quitar el descuento de "${nombre}"? Deja de verse en el catálogo público de inmediato.`
    )
    if (!confirmado) return

    try {
      const result = await eliminarDescuentoExcesoApi(alegraItemId)
      if (result.success) {
        showToast(`Descuento de "${result.nombre}" eliminado.`, 'success')
        await loadDescuentos()
      }
    } catch (err) {
      console.error('Error eliminando descuento:', err)
      showToast(err.response?.data?.message || 'Error al eliminar el descuento.', 'error')
    }
  }

  // Compute KPIs
  const kpis = useMemo(() => calcularKpis(auditorias), [auditorias])

  // Vista previa informativa del nombre "Ajuste N" que asignará el backend
  const siguienteNombreDevolucion = useMemo(() => calcularSiguienteNombreDevolucion(devoluciones), [devoluciones])

  // Load details of a specific audit
  const handleSelectAuditoria = async (id) => {
    setLoading(true)
    setError(null)
    setSuccessAjuste(null)
    try {
      const result = await getAuditoriaDetalle(id)
      if (result.success) {
        setAuditoriaActiva(result.data)
        // Initialize draft counts
        const draft = {}
        result.data.items.forEach(item => {
          draft[item.id] = item.stock_real !== null ? Math.round(Number(item.stock_real)) : ''
        })
        setConteosDraft(draft)
        setObservacionesFinales(result.data.observaciones || '')
      }
    } catch (err) {
      console.error('Error cargando detalles de auditoría:', err)
      setError('No se pudieron obtener los detalles de la auditoría.')
    } finally {
      setLoading(false)
    }
  }

  // Start new audit
  const handleCreateAudit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await crearAuditoria(newAuditTipo, newAuditTipo === 'categoria' ? newAuditCategoria : null, newAuditNombre)
      if (result.success) {
        setShowNewModal(false)
        setNewAuditNombre('')
        // Load details immediately
        await handleSelectAuditoria(result.data.id)
        // Refresh dashboard list behind
        const dashboardData = await getAuditorias()
        if (dashboardData.success) {
          setAuditorias(dashboardData.data)
        }
      }
    } catch (err) {
      console.error('Error al iniciar auditoría:', err)
      setError(err.response?.data?.message || 'Error al crear la sesión de auditoría.')
    } finally {
      setLoading(false)
    }
  }

  // Resync expired audit stocks from Alegra
  const handleResyncAuditoria = async () => {
    if (!auditoriaActiva) return
    setLoading(true)
    setError(null)
    showToast('Re-sincronizando stocks de Alegra en vivo...', 'info')
    try {
      const result = await resyncAuditoria(auditoriaActiva.id)
      if (result.success) {
        showToast(result.message || 'Stocks sincronizados con éxito. Ya puede continuar con la auditoría.', 'success')
        // Refresh the detail to clear the expired flag
        const updatedDetail = await getAuditoriaDetalle(auditoriaActiva.id)
        if (updatedDetail.success) {
          setAuditoriaActiva(updatedDetail.data)
        }
      }
    } catch (err) {
      console.error('Error re-sincronizando auditoría:', err)
      showToast(err.response?.data?.message || 'Error al intentar re-sincronizar stocks.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Finalize audit
  const handleFinalize = async () => {
    if (!auditoriaActiva) return

    // El botón ya viene deshabilitado mientras itemsStats.pendientes > 0 — esto
    // es solo un respaldo defensivo, nunca debería alcanzarse desde la UI.
    if (itemsStats.pendientes > 0) {
      showToast(`Faltan ${itemsStats.pendientes} producto(s) por contar antes de finalizar.`, 'error')
      return
    }

    setLoading(true)
    try {
      // First, save all current counts
      const itemsPayload = Object.entries(conteosDraft).map(([id, val]) => ({
        id: Number(id),
        stock_real: val !== '' ? Number(val) : null
      }))
      setApplyingAdjustments(true)
      await guardarConteos(auditoriaActiva.id, itemsPayload)
      setApplyingAdjustments(false)

      // Finalize
      const result = await finalizarAuditoria(auditoriaActiva.id, observacionesFinales)
      if (result.success) {
        showToast('Auditoría finalizada con éxito.', 'success')
        // Refresh details and dashboard list
        const updatedDetail = await getAuditoriaDetalle(auditoriaActiva.id)
        if (updatedDetail.success) {
          setAuditoriaActiva(updatedDetail.data)
        }
        const dashboardData = await getAuditorias()
        if (dashboardData.success) {
          setAuditorias(dashboardData.data)
        }
      }
    } catch (err) {
      console.error('Error finalizando auditoría:', err)
      showToast('Error al finalizar la auditoría.', 'error')
    } finally {
      setLoading(false)
      setApplyingAdjustments(false)
    }
  }

  // Send adjustments to Alegra API
  const handleApplyAlegraAdjustment = async () => {
    if (!auditoriaActiva) return

    const confirmado = await confirm('Esto enviará una transacción de Ajuste de Inventario a Alegra y actualizará de forma irreversible el stock de los productos. ¿Está completamente seguro?')
    if (!confirmado) return

    setLoadingAjuste(true)
    setApplyingAdjustments(true)
    setSuccessAjuste(null)
    setError(null)
    try {
      const result = await ajustarAlegra(auditoriaActiva.id)
      if (result.success) {
        setSuccessAjuste(result.message || 'Ajuste de inventario aplicado con éxito en Alegra.')
      }
    } catch (err) {
      console.error('Error enviando ajustes a Alegra:', err)
      setError(err.response?.data?.message || 'Error al aplicar ajustes en Alegra. Verifique los logs.')
    } finally {
      setLoadingAjuste(false)
      setApplyingAdjustments(false)
    }
  }

  // Handle key digit/conteo changes — se guarda en la db unos milisegundos
  // después de dejar de teclear, para que un conteo ya escrito no se pierda
  // si el navegador se recarga o se cierra antes de "Guardar y Ajustar".
  // Es solo un borrador persistido: no dispara ningún ajuste en Alegra (eso
  // sigue siendo la acción explícita de guardarConteos/finalizarAuditoria).
  const conteoSaveTimers = useRef({})

  const handleConteoChange = (itemId, val) => {
    const parsed = val === '' ? '' : Math.round(Number(val))
    setConteosDraft(prev => ({
      ...prev,
      [itemId]: parsed
    }))

    if (!auditoriaActiva) return
    clearTimeout(conteoSaveTimers.current[itemId])
    conteoSaveTimers.current[itemId] = setTimeout(() => {
      guardarConteoIndividual(auditoriaActiva.id, itemId, parsed === '' ? null : parsed).catch(err => {
        console.error('No se pudo autoguardar el conteo:', err)
      })
    }, 700)
  }

  const handleVerImagenProducto = (item) => setImagenProductoActivo(item)
  const handleCerrarImagenProducto = () => setImagenProductoActivo(null)

  const volverAlDashboard = () => {
    const tipoActivo = auditoriaActiva?.tipo
    setAuditoriaActiva(null)
    if (tipoActivo === 'devolucion') {
      loadDevoluciones()
    } else if (tipoActivo === 'exceso') {
      loadExcesos()
    } else {
      loadDashboard()
    }
  }

  // --- Devoluciones ---

  const handleCreateDevolucion = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await crearDevolucionApi()
      if (result.success) {
        setShowNewDevolucionModal(false)
        await handleSelectAuditoria(result.data.id)
        const data = await getDevoluciones()
        if (data.success) setDevoluciones(data.data)
      }
    } catch (err) {
      console.error('Error creando devolución:', err)
      showToast(err.response?.data?.message || 'Error al crear la devolución.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const buscarProductoDevolucion = async (q) => {
    if (!q || q.length < 2) {
      setResultadosProductoDevolucion([])
      return
    }
    setBuscandoProductoDevolucion(true)
    try {
      const result = await buscarProductosDevolucion(q)
      if (result.success) setResultadosProductoDevolucion(result.data)
    } catch (err) {
      console.error('Error buscando productos para devolución:', err)
    } finally {
      setBuscandoProductoDevolucion(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      buscarProductoDevolucion(busquedaProductoDevolucion)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaProductoDevolucion])

  // Refresca el detalle de la devolución activa y su conteosDraft (que ya
  // trae cada stock_real calculado, así que ReporteFinalizado/adjustmentsPreview
  // funcionan igual que para una auditoría normal sin ningún cambio).
  const refrescarAuditoriaActiva = async () => {
    const updatedDetail = await getAuditoriaDetalle(auditoriaActiva.id)
    if (updatedDetail.success) {
      setAuditoriaActiva(updatedDetail.data)
      const draft = {}
      updatedDetail.data.items.forEach(item => {
        draft[item.id] = item.stock_real !== null ? Math.round(Number(item.stock_real)) : ''
      })
      setConteosDraft(draft)
    }
  }

  const handleAgregarItemDevolucion = async (producto, cantidad) => {
    if (!auditoriaActiva) return
    const cantidadNum = Number(cantidad)
    if (!cantidadNum || cantidadNum <= 0) {
      showToast('Ingresa una cantidad devuelta válida.', 'warning')
      return
    }

    setAgregandoItemDevolucion(true)
    try {
      // El backend consulta el producto en vivo en Alegra (stock/costo
      // frescos) al momento de agregarlo — solo hace falta mandar cuál y cuántos.
      const result = await agregarItemDevolucionApi(auditoriaActiva.id, {
        alegraId: producto.alegraId,
        cantidadDevuelta: cantidadNum
      })
      if (result.success) {
        showToast(`"${producto.nombre}" agregado (${cantidadNum} unid.)`, 'success')
        setBusquedaProductoDevolucion('')
        setResultadosProductoDevolucion([])
        await refrescarAuditoriaActiva()
      }
    } catch (err) {
      console.error('Error agregando producto a devolución:', err)
      showToast(err.response?.data?.message || 'Error al agregar el producto.', 'error')
    } finally {
      setAgregandoItemDevolucion(false)
    }
  }

  const handleEliminarItemDevolucion = async (itemId) => {
    if (!auditoriaActiva) return
    const confirmado = await confirm('¿Quitar este producto de la devolución?')
    if (!confirmado) return

    try {
      await eliminarItemDevolucionApi(auditoriaActiva.id, itemId)
      await refrescarAuditoriaActiva()
    } catch (err) {
      console.error('Error quitando producto de devolución:', err)
      showToast(err.response?.data?.message || 'Error al quitar el producto.', 'error')
    }
  }

  // Finalizar una devolución: a diferencia de handleFinalize (auditorías),
  // NO llama guardarConteos primero — los ítems ya quedaron guardados con su
  // stock_real correcto al agregarlos, y ninguno debe aplicarse a Alegra
  // todavía. El único paso explícito y confirmado que sí aplica el ajuste en
  // Alegra sigue siendo el botón "Aplicar Ajuste en Alegra" (handleApplyAlegraAdjustment),
  // reutilizado sin cambios.
  const handleFinalizeDevolucion = async () => {
    if (!auditoriaActiva) return
    if (!auditoriaActiva.items || auditoriaActiva.items.length === 0) {
      showToast('Agrega al menos un producto devuelto antes de finalizar.', 'warning')
      return
    }

    setLoading(true)
    try {
      const result = await finalizarAuditoria(auditoriaActiva.id, observacionesFinales)
      if (result.success) {
        showToast('Devolución finalizada. Ahora puedes aplicar el ajuste en Alegra.', 'success')
        await refrescarAuditoriaActiva()
        const data = await getDevoluciones()
        if (data.success) setDevoluciones(data.data)
      }
    } catch (err) {
      console.error('Error finalizando devolución:', err)
      showToast('Error al finalizar la devolución.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // --- Excesos: ejecución (empacar producto por producto) ---

  const handleActualizarItemExceso = async (itemId, payload) => {
    try {
      const result = await actualizarItemExceso(auditoriaActiva.id, itemId, payload)
      if (result.success) {
        await refrescarAuditoriaActiva()
      }
    } catch (err) {
      console.error('Error actualizando producto de exceso:', err)
      showToast(err.response?.data?.message || 'Error actualizando el producto.', 'error')
    }
  }

  // A diferencia de handleFinalize (auditorías normales), acá no hay
  // conteosDraft que guardar primero — cada producto ya se guarda al
  // marcarlo como empacado (handleActualizarItemExceso).
  const handleFinalizeExceso = async () => {
    if (!auditoriaActiva) return
    setLoading(true)
    try {
      const result = await finalizarAuditoria(auditoriaActiva.id, observacionesFinales)
      if (result.success) {
        showToast('Exceso finalizado con éxito.', 'success')
        await refrescarAuditoriaActiva()
        const data = await getExcesos()
        if (data.success) setExcesos(data.data)
      }
    } catch (err) {
      console.error('Error finalizando exceso:', err)
      showToast(err.response?.data?.message || 'Error al finalizar el exceso.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Filter items in active audit
  const filteredItems = useMemo(
    () => filtrarItemsAuditoria(auditoriaActiva?.items, { executionSearch, executionFilter, conteosDraft }),
    [auditoriaActiva, executionSearch, executionFilter, conteosDraft]
  )

  // Items count summaries
  const itemsStats = useMemo(
    () => calcularItemsStats(auditoriaActiva?.items, conteosDraft),
    [auditoriaActiva, conteosDraft]
  )

  // Adjustments preview for finalization / Alegra
  const adjustmentsPreview = useMemo(
    () => calcularAjustesPreview(auditoriaActiva?.items, conteosDraft),
    [auditoriaActiva, conteosDraft]
  )

  // Calculate live financial impact during execution (only for pending adjustments)
  const liveFinancialImpact = useMemo(
    () => calcularImpactoFinanciero(conteosDraft, auditoriaActiva?.items),
    [conteosDraft, auditoriaActiva]
  )

  return {
    auditorias,
    categorias,
    loading,
    error,
    showHistory,
    setShowHistory,
    loadDashboard,
    kpis,

    vistaActiva,
    cambiarVista,
    devoluciones,
    loadDevoluciones,
    showNewDevolucionModal,
    setShowNewDevolucionModal,
    siguienteNombreDevolucion,
    handleCreateDevolucion,
    busquedaProductoDevolucion,
    setBusquedaProductoDevolucion,
    resultadosProductoDevolucion,
    buscandoProductoDevolucion,
    agregandoItemDevolucion,
    handleAgregarItemDevolucion,
    handleEliminarItemDevolucion,
    handleFinalizeDevolucion,

    excesos,
    loadExcesos,
    generandoExcesos,
    handleGenerarExcesosAhora,
    handleActualizarItemExceso,
    handleFinalizeExceso,
    regalos,
    loadRegalos,

    // Control manual de excesos
    creandoExceso,
    handleCrearExcesoManual,
    handleEliminarExceso,
    busquedaProductoExceso,
    setBusquedaProductoExceso,
    resultadosProductoExceso,
    buscandoProductoExceso,
    agregandoItemExceso,
    handleAgregarItemExceso,
    aplicandoDescuentoTanda,
    handleAplicarDescuentoTanda,
    handleEliminarItemExceso,

    // Descuentos del catálogo público
    descuentos,
    loadingDescuentos,
    loadDescuentos,
    handleGuardarDescuento,
    handleEliminarDescuento,

    auditoriaActiva,
    conteosDraft,
    observacionesFinales,
    setObservacionesFinales,
    handleSelectAuditoria,
    volverAlDashboard,

    showNewModal,
    setShowNewModal,
    newAuditTipo,
    setNewAuditTipo,
    newAuditCategoria,
    setNewAuditCategoria,
    newAuditNombre,
    setNewAuditNombre,
    handleCreateAudit,

    executionSearch,
    setExecutionSearch,
    executionFilter,
    setExecutionFilter,

    loadingAjuste,
    successAjuste,
    applyingAdjustments,

    handleResyncAuditoria,
    handleFinalize,
    handleApplyAlegraAdjustment,
    handleConteoChange,
    imagenProductoActivo,
    handleVerImagenProducto,
    handleCerrarImagenProducto,

    filteredItems,
    itemsStats,
    adjustmentsPreview,
    liveFinancialImpact,

    toasts,
    removeToast,
    dialogProps
  }
}

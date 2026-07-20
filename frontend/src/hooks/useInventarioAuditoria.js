import { useState, useEffect, useMemo } from 'react'
import {
  getAuditorias,
  getCategorias,
  crearAuditoria,
  getAuditoriaDetalle,
  guardarConteos,
  finalizarAuditoria,
  ajustarAlegra,
  resyncAuditoria,
  getDevoluciones,
  crearDevolucion as crearDevolucionApi,
  buscarProductosDevolucion,
  agregarItemDevolucion as agregarItemDevolucionApi,
  eliminarItemDevolucion as eliminarItemDevolucionApi
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

  // Cambiar entre la pestaña de Auditorías y Devoluciones, cargando la lista
  // correspondiente la primera vez que se entra a Devoluciones.
  const cambiarVista = (vista) => {
    setVistaActiva(vista)
    if (vista === 'devoluciones' && devoluciones.length === 0) {
      loadDevoluciones()
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

  // Save draft counts
  // Save counts and immediately apply adjustments in Alegra
  const handleSaveDraft = async () => {
    if (!auditoriaActiva) return
    setLoading(true)
    try {
      // Filtrar sólo ítems no ajustados que tengan un conteo real ingresado
      const itemsPayload = Object.entries(conteosDraft)
        .map(([id, val]) => {
          const item = auditoriaActiva.items.find(i => i.id === Number(id))
          return {
            id: Number(id),
            stock_real: val !== '' ? Number(val) : null,
            ajustado_alegra: item?.ajustado_alegra
          }
        })
        .filter(p => !p.ajustado_alegra && p.stock_real !== null)

      if (itemsPayload.length === 0) {
        showToast('No hay nuevos conteos ingresados para guardar y ajustar.', 'info')
        setLoading(false)
        return
      }

      setApplyingAdjustments(true)
      const result = await guardarConteos(auditoriaActiva.id, itemsPayload)
      if (result.success) {
        showToast(result.message || 'Conteos guardados y ajustados en Alegra exitosamente.', 'success')
        // Refresh detail
        const updatedDetail = await getAuditoriaDetalle(auditoriaActiva.id)
        if (updatedDetail.success) {
          setAuditoriaActiva(updatedDetail.data)
          // Actualizar conteosDraft con los valores del servidor
          const draft = {}
          updatedDetail.data.items.forEach(item => {
            draft[item.id] = item.stock_real !== null ? Math.round(Number(item.stock_real)) : ''
          })
          setConteosDraft(draft)
        }
      }
    } catch (err) {
      console.error('Error guardando y ajustando inventario:', err)
      showToast(err.response?.data?.message || 'Error al guardar y ajustar el inventario.', 'error')
    } finally {
      setLoading(false)
      setApplyingAdjustments(false)
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

    // Check if there are empty counts
    const emptyCount = Object.values(conteosDraft).some(val => val === '')
    if (emptyCount) {
      const confirmado = await confirm('Hay productos sin conteo real. Se asumirá que coinciden con el stock de sistema. ¿Desea continuar?')
      if (!confirmado) return
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

  // Handle key digit/conteo changes
  const handleConteoChange = (itemId, val) => {
    setConteosDraft(prev => ({
      ...prev,
      [itemId]: val === '' ? '' : Math.round(Number(val))
    }))
  }

  const handleVerImagenProducto = (item) => setImagenProductoActivo(item)
  const handleCerrarImagenProducto = () => setImagenProductoActivo(null)

  const volverAlDashboard = () => {
    const eraDevolucion = auditoriaActiva?.tipo === 'devolucion'
    setAuditoriaActiva(null)
    if (eraDevolucion) {
      loadDevoluciones()
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
  const refrescarDevolucionActiva = async () => {
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
        await refrescarDevolucionActiva()
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
      await refrescarDevolucionActiva()
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
        await refrescarDevolucionActiva()
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

    handleSaveDraft,
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

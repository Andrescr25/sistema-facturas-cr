import { useCallback, useEffect, useState } from 'react'
import {
  getResumenFlujo,
  getGastos,
  crearGasto as crearGastoApi,
  actualizarGasto as actualizarGastoApi,
  cambiarActivoGasto as cambiarActivoGastoApi,
  eliminarGasto as eliminarGastoApi,
  getPeriodo,
  marcarPagado as marcarPagadoApi,
  revertirPago as revertirPagoApi,
  getFuentesAuto,
  sincronizarTodos as sincronizarTodosApi
} from '../services/pagosRecurrentesService'
import { periodoActual, moverPeriodo } from '../utils/pagosRecurrentesUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'

/**
 * Estado de Pagos Recurrentes: el mes que se está viendo (con sus pagos y
 * totales) y las plantillas de gastos fijos.
 *
 * Los períodos los genera el backend al consultar el mes, así que moverse a
 * un mes futuro ya muestra lo que va a haber que pagar — que es el punto de
 * tener esto: ver la plata que sale antes de que salga.
 */
export function usePagosRecurrentes() {
  const { confirm, dialogProps } = useDialog()
  const { toasts, showToast, removeToast } = useToast()

  const [periodo, setPeriodo] = useState(periodoActual())
  const [pagos, setPagos] = useState([])
  const [resumenMes, setResumenMes] = useState(null)
  const [loadingPeriodo, setLoadingPeriodo] = useState(true)

  const [gastos, setGastos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [frecuencias, setFrecuencias] = useState([])
  const [loadingGastos, setLoadingGastos] = useState(false)

  const [resumenFlujo, setResumenFlujo] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [fuentesAuto, setFuentesAuto] = useState([])
  const [sincronizando, setSincronizando] = useState(false)

  const cargarPeriodo = useCallback(async (p) => {
    setLoadingPeriodo(true)
    try {
      const data = await getPeriodo(p)
      if (data.success) {
        setPagos(data.pagos)
        setResumenMes(data.resumen)
      }
    } catch (err) {
      console.error('Error cargando el período:', err)
      showToast('No se pudo cargar el mes.', 'error')
    } finally {
      setLoadingPeriodo(false)
    }
    // showToast es estable (useToast), no hace falta como dependencia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cargarGastos = useCallback(async () => {
    setLoadingGastos(true)
    try {
      const data = await getGastos()
      if (data.success) {
        setGastos(data.data)
        setCategorias(data.categorias || [])
        setFrecuencias(data.frecuencias || [])
      }
    } catch (err) {
      console.error('Error cargando gastos:', err)
      showToast('No se pudieron cargar los gastos fijos.', 'error')
    } finally {
      setLoadingGastos(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cargarResumenFlujo = useCallback(async () => {
    try {
      const data = await getResumenFlujo()
      if (data.success) setResumenFlujo(data)
    } catch (err) {
      console.error('Error cargando el resumen de flujo:', err)
    }
  }, [])

  useEffect(() => { cargarPeriodo(periodo) }, [periodo, cargarPeriodo])
  useEffect(() => { cargarGastos(); cargarResumenFlujo() }, [cargarGastos, cargarResumenFlujo])

  useEffect(() => {
    getFuentesAuto()
      .then(d => { if (d.success) setFuentesAuto(d.data) })
      .catch(err => console.error('Error cargando fuentes automáticas:', err))
  }, [])

  /**
   * Consulta los recibos reales de todos los gastos con fuente automática.
   * Es lento a propósito (va en serie contra sitios ajenos), así que la UI
   * tiene que mostrar que está trabajando.
   */
  const handleSincronizarRecibos = async () => {
    setSincronizando(true)
    try {
      const data = await sincronizarTodosApi()
      if (data.success) {
        const fallidos = data.resultados.filter(r => !r.ok)
        const nuevos = data.resultados.reduce((s, r) => s + (r.creados || 0) + (r.actualizados || 0), 0)

        // Consultar bien y que el proveedor no haya publicado el recibo NO es
        // un fallo: se dice con esas palabras en vez de reportar "0 recibos",
        // que se lee como que algo salió mal.
        const sinRecibo = data.resultados.filter(r => r.ok && (r.recibos || 0) === 0)

        if (data.consultados === 0) {
          showToast('Ningún gasto tiene consulta automática configurada todavía.', 'info')
        } else if (fallidos.length) {
          showToast(`${fallidos.length} consulta(s) fallaron: ${fallidos.map(f => f.nombre).join(', ')}`, 'error')
        } else if (nuevos === 0 && sinRecibo.length) {
          showToast(
            `Sin recibo nuevo en ${sinRecibo.map(r => r.nombre).join(' y ')} — el proveedor todavía no lo publicó.`,
            'info', 6000
          )
        } else {
          const cola = sinRecibo.length
            ? ` Sin recibo nuevo todavía en ${sinRecibo.map(r => r.nombre).join(' y ')}.`
            : ''
          showToast(`${nuevos} recibo(s) actualizados de ${data.consultados} servicio(s).${cola}`, 'success', 6000)
        }

        await cargarPeriodo(periodo)
        await cargarGastos()
        await cargarResumenFlujo()
      }
    } catch (err) {
      console.error('Error consultando recibos:', err)
      showToast(err.response?.data?.message || 'Error al consultar los recibos.', 'error')
    } finally {
      setSincronizando(false)
    }
  }

  const irMesAnterior = () => setPeriodo(p => moverPeriodo(p, -1))
  const irMesSiguiente = () => setPeriodo(p => moverPeriodo(p, 1))
  const irMesActual = () => setPeriodo(periodoActual())

  // --- Pagos del mes ---

  const handleMarcarPagado = async (pago, monto, metodoPagoId) => {
    try {
      const data = await marcarPagadoApi(pago.id, {
        ...(monto !== undefined && monto !== '' ? { monto } : {}),
        metodoPagoId
      })
      if (data.success) {
        showToast(`"${pago.nombre}" marcado como pagado.`, 'success')
        await cargarPeriodo(periodo)
        await cargarResumenFlujo()
      }
    } catch (err) {
      console.error('Error marcando el pago:', err)
      showToast(err.response?.data?.message || 'Error al marcar el pago.', 'error')
    }
  }

  const handleRevertirPago = async (pago) => {
    const confirmado = await confirm(`¿Marcar "${pago.nombre}" como pendiente de nuevo?`)
    if (!confirmado) return
    try {
      await revertirPagoApi(pago.id)
      await cargarPeriodo(periodo)
      await cargarResumenFlujo()
    } catch (err) {
      console.error('Error revirtiendo el pago:', err)
      showToast(err.response?.data?.message || 'Error al revertir el pago.', 'error')
    }
  }

  // --- Gastos fijos (plantillas) ---

  const handleGuardarGasto = async (datos, id) => {
    setGuardando(true)
    try {
      const data = id ? await actualizarGastoApi(id, datos) : await crearGastoApi(datos)
      if (data.success) {
        showToast(id ? 'Gasto actualizado.' : `"${datos.nombre}" agregado.`, 'success')
        await cargarGastos()
        await cargarPeriodo(periodo)
        await cargarResumenFlujo()
        return true
      }
    } catch (err) {
      console.error('Error guardando el gasto:', err)
      showToast(err.response?.data?.message || 'Error al guardar el gasto.', 'error')
    } finally {
      setGuardando(false)
    }
    return false
  }

  const handleCambiarActivo = async (gasto) => {
    try {
      await cambiarActivoGastoApi(gasto.id, !gasto.activo)
      showToast(gasto.activo ? `"${gasto.nombre}" desactivado.` : `"${gasto.nombre}" activado.`, 'success')
      await cargarGastos()
      await cargarResumenFlujo()
    } catch (err) {
      console.error('Error cambiando el estado:', err)
      showToast(err.response?.data?.message || 'Error al cambiar el estado.', 'error')
    }
  }

  const handleEliminarGasto = async (gasto) => {
    const confirmado = await confirm(`¿Eliminar "${gasto.nombre}"? Se borra también su historial de períodos.`)
    if (!confirmado) return
    try {
      const data = await eliminarGastoApi(gasto.id)
      if (data.success) {
        showToast(`"${data.nombre}" eliminado.`, 'success')
        await cargarGastos()
        await cargarPeriodo(periodo)
        await cargarResumenFlujo()
      }
    } catch (err) {
      console.error('Error eliminando el gasto:', err)
      showToast(err.response?.data?.message || 'Error al eliminar el gasto.', 'error')
    }
  }

  return {
    periodo,
    pagos,
    resumenMes,
    loadingPeriodo,
    irMesAnterior,
    irMesSiguiente,
    irMesActual,
    recargarPeriodo: () => cargarPeriodo(periodo),

    gastos,
    categorias,
    frecuencias,
    loadingGastos,
    cargarGastos,

    resumenFlujo,
    guardando,

    fuentesAuto,
    sincronizando,
    handleSincronizarRecibos,

    handleMarcarPagado,
    handleRevertirPago,
    handleGuardarGasto,
    handleCambiarActivo,
    handleEliminarGasto,

    dialogProps,
    toasts,
    removeToast
  }
}

import { useCallback, useEffect, useState } from 'react'
import {
  listarPeriodos, cargarPeriodo, importarDesdeAlegra, obtenerPeriodo, eliminarPeriodo,
  toggleExcluirFactura, actualizarLinea, eliminarLinea,
  redetectarDuplicados, descargarExportado,
  listarContactos, crearContacto, eliminarContacto, enviarAlContador
} from '../services/reporteContadorService'
import { periodoMesAnterior } from '../utils/reporteContadorUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'

/**
 * Estado de Reporte Contador: qué mes se está viendo, los dos períodos
 * (ventas/compras) que haya cargados para ese mes, y el detalle abierto de
 * uno de los dos a la vez.
 *
 * Arranca en el mes ANTERIOR al actual — es lo que hay que revisar a
 * principios de mes, que es cuando este módulo se usa.
 */
export function useReporteContador() {
  const { confirm, dialogProps } = useDialog()
  const { toasts, showToast, removeToast } = useToast()

  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(periodoMesAnterior())
  const [periodos, setPeriodos] = useState([]) // [{tipo:'ventas',...}, {tipo:'compras',...}]
  const [loadingPeriodos, setLoadingPeriodos] = useState(true)
  const [subiendo, setSubiendo] = useState(null) // 'ventas' | 'compras' | null

  const [tabActiva, setTabActiva] = useState('ventas')
  const [detalle, setDetalle] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  // Independiente de qué pestaña esté abierta: el resumen de arriba tiene
  // que mostrar SIEMPRE el total de ventas ya ajustado (con los duplicados
  // excluidos), no solo cuando el usuario está mirando la tabla de ventas.
  const [resumenVentas, setResumenVentas] = useState(null)
  // Y lo mismo para compras: sin esto el resumen mostraba la cifra ORIGINAL
  // de compras mientras el Excel y el correo mandaban la ajustada.
  const [resumenCompras, setResumenCompras] = useState(null)

  // Correo del contador: es global (no por mes), así que se carga una vez y
  // se reutiliza. `envioDisponible` viene del backend: dice si el servidor
  // tiene credenciales SMTP, para no ofrecer un botón que no puede funcionar.
  const [modalContadorAbierto, setModalContadorAbierto] = useState(false)
  const [contactos, setContactos] = useState([])
  const [envioDisponible, setEnvioDisponible] = useState(true)

  const cargarPeriodos = useCallback(async () => {
    setLoadingPeriodos(true)
    try {
      const data = await listarPeriodos(periodoSeleccionado.anio, periodoSeleccionado.mes)
      if (data.success) setPeriodos(data.data)
    } catch (err) {
      console.error('Error cargando períodos:', err)
      showToast('No se pudieron cargar los períodos.', 'error')
    } finally {
      setLoadingPeriodos(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoSeleccionado.anio, periodoSeleccionado.mes])

  useEffect(() => { cargarPeriodos() }, [cargarPeriodos])

  const cargarContactos = useCallback(async () => {
    try {
      const data = await listarContactos()
      if (!data.success) return
      setContactos(data.data.contactos || [])
      setEnvioDisponible(data.data.envioDisponible !== false)
    } catch (err) {
      console.error('Error cargando los contactos:', err)
    }
  }, [])

  useEffect(() => { cargarContactos() }, [cargarContactos])

  const periodoDe = useCallback((tipo) => periodos.find(p => p.tipo === tipo) || null, [periodos])

  const refrescarResumen = useCallback(async (periodoId, tipo) => {
    const asignar = tipo === 'ventas' ? setResumenVentas : setResumenCompras
    if (!periodoId) { asignar(null); return }
    try {
      const data = await obtenerPeriodo(periodoId)
      if (data.success) asignar(data.resumen)
    } catch (err) {
      console.error(`Error refrescando el resumen de ${tipo}:`, err)
    }
  }, [])

  const refrescarResumenVentas = useCallback((id) => refrescarResumen(id, 'ventas'), [refrescarResumen])

  const cargarDetalle = useCallback(async (periodoId) => {
    if (!periodoId) { setDetalle(null); return }
    setLoadingDetalle(true)
    try {
      const data = await obtenerPeriodo(periodoId)
      if (data.success) setDetalle(data)
    } catch (err) {
      console.error('Error cargando el detalle:', err)
      showToast('No se pudo cargar el detalle del período.', 'error')
    } finally {
      setLoadingDetalle(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Al cambiar de pestaña o de mes, abre el detalle del período correspondiente si existe.
  useEffect(() => {
    const p = periodoDe(tabActiva)
    cargarDetalle(p?.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActiva, periodos])

  // El resumen de arriba se mantiene aparte de `detalle` (que sigue a la
  // pestaña activa) para que siempre muestre ventas ya ajustadas, sin
  // importar si el usuario está mirando la tabla de compras.
  useEffect(() => {
    refrescarResumen(periodoDe('ventas')?.id, 'ventas')
    refrescarResumen(periodoDe('compras')?.id, 'compras')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodos])

  const handleSubirArchivo = async (tipo, archivo) => {
    setSubiendo(tipo)
    try {
      const data = await cargarPeriodo({ archivo, tipo, anio: periodoSeleccionado.anio, mes: periodoSeleccionado.mes })
      if (data.success) {
        if (tipo === 'ventas' && data.altaConfianza > 0) {
          showToast(
            `Cargado: ${data.lineasCargadas} líneas, ${data.totalFacturas} facturas. ${data.altaConfianza} posible(s) duplicado(s) ya marcado(s) para excluir — revisalos antes de exportar.`,
            'warning', 8000
          )
        } else {
          showToast(`Cargado: ${data.lineasCargadas} líneas, ${data.totalFacturas} facturas.`, 'success')
        }
        await cargarPeriodos()
        setTabActiva(tipo)
      }
    } catch (err) {
      console.error('Error subiendo el archivo:', err)
      showToast(err.response?.data?.message || 'Error al subir el archivo.', 'error')
    } finally {
      setSubiendo(null)
    }
  }

  const handleImportarAlegra = async (tipo) => {
    setSubiendo(tipo)
    try {
      const data = await importarDesdeAlegra({ tipo, anio: periodoSeleccionado.anio, mes: periodoSeleccionado.mes })
      if (data.success) {
        showToast(
          data.altaConfianza > 0
            ? `Traído de Alegra: ${data.lineasCargadas} líneas, ${data.totalFacturas} facturas. ${data.altaConfianza} posible(s) duplicado(s) marcado(s) — revisalos.`
            : `Traído de Alegra: ${data.lineasCargadas} líneas, ${data.totalFacturas} facturas.`,
          data.altaConfianza > 0 ? 'warning' : 'success', 8000
        )
        await cargarPeriodos()
        setTabActiva(tipo)
      }
    } catch (err) {
      console.error('Error importando de Alegra:', err)
      showToast(err.response?.data?.message || 'Error trayendo los datos de Alegra.', 'error')
    } finally {
      setSubiendo(null)
    }
  }

  const handleEliminarPeriodo = async (periodoId, tipo) => {
    const confirmado = await confirm(`¿Eliminar el reporte de ${tipo} cargado? Vas a tener que subirlo de nuevo.`)
    if (!confirmado) return
    try {
      await eliminarPeriodo(periodoId)
      showToast('Período eliminado.', 'success')
      setDetalle(null)
      await cargarPeriodos()
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al eliminar.', 'error')
    }
  }

  const handleToggleFactura = async (numero, excluidoActual) => {
    const periodo = periodoDe(tabActiva)
    if (!periodo) return
    try {
      await toggleExcluirFactura(periodo.id, numero, !excluidoActual)
      await cargarDetalle(periodo.id)
      await refrescarResumen(periodo.id, tabActiva)
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al actualizar la factura.', 'error')
    }
  }

  const handleEditarLinea = async (lineaId, campos) => {
    const periodo = periodoDe(tabActiva)
    try {
      await actualizarLinea(lineaId, campos)
      if (periodo) await cargarDetalle(periodo.id)
      if (periodo) await refrescarResumen(periodo.id, tabActiva)
      return true
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al editar la línea.', 'error')
      return false
    }
  }

  const handleEliminarLinea = async (lineaId) => {
    const confirmado = await confirm('¿Eliminar esta línea? No se puede deshacer (pero podés volver a subir el Excel original).')
    if (!confirmado) return
    const periodo = periodoDe(tabActiva)
    try {
      await eliminarLinea(lineaId)
      if (periodo) await cargarDetalle(periodo.id)
      if (periodo) await refrescarResumen(periodo.id, tabActiva)
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al eliminar la línea.', 'error')
    }
  }

  const handleRedetectar = async () => {
    const periodo = periodoDe('ventas')
    if (!periodo) return
    try {
      const data = await redetectarDuplicados(periodo.id)
      showToast(`Detección actualizada: ${data.altaConfianza} de alta confianza, ${data.mediaConfianza} a revisar.`, 'success')
      await cargarDetalle(periodo.id)
      await refrescarResumenVentas(periodo.id)
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al redetectar duplicados.', 'error')
    }
  }

  const handleCrearContacto = async ({ nombre, email }) => {
    try {
      const data = await crearContacto({ nombre, email })
      await cargarContactos()
      return { ok: true, contacto: data.data }
    } catch (err) {
      return { ok: false, mensaje: err.response?.data?.message || 'No se pudo guardar el contacto.' }
    }
  }

  const handleEliminarContacto = async (contacto) => {
    const confirmado = await confirm(`¿Eliminar a ${contacto.nombre} (${contacto.email}) de la lista?`)
    if (!confirmado) return { ok: true }
    try {
      await eliminarContacto(contacto.id)
      await cargarContactos()
      return { ok: true }
    } catch (err) {
      return { ok: false, mensaje: err.response?.data?.message || 'No se pudo eliminar el contacto.' }
    }
  }

  const handleEnviarContador = async (contactoId) => {
    try {
      const data = await enviarAlContador({
        anio: periodoSeleccionado.anio, mes: periodoSeleccionado.mes, contactoId
      })
      await cargarContactos() // refresca el orden por último uso
      showToast(
        `Enviado a ${data.nombre} (${data.email}): ${data.adjuntos.length} archivo(s).` +
        (data.faltante ? ` No se adjuntó ${data.faltante} porque no está cargado.` : ''),
        'success', 7000
      )
      return { ok: true }
    } catch (err) {
      console.error('Error enviando al contador:', err)
      return { ok: false, mensaje: err.response?.data?.message || 'No se pudo enviar el correo.' }
    }
  }

  const handleExportar = async () => {
    const periodo = periodoDe(tabActiva)
    if (!periodo) return
    try {
      const nombre = `${tabActiva === 'ventas' ? 'Impuestos en Ventas' : 'Impuestos en Compras'} (revisado) - ${String(periodo.mes).padStart(2, '0')}-${periodo.anio}.xlsx`
      await descargarExportado(periodo.id, nombre)
    } catch (err) {
      showToast('Error al exportar.', 'error')
    }
  }

  return {
    periodoSeleccionado,
    setPeriodoSeleccionado,
    periodos,
    loadingPeriodos,
    periodoDe,
    subiendo,
    handleSubirArchivo,
    handleImportarAlegra,
    handleEliminarPeriodo,

    tabActiva,
    setTabActiva,
    detalle,
    loadingDetalle,
    resumenVentas,
    resumenCompras,
    handleToggleFactura,
    handleEditarLinea,
    handleEliminarLinea,
    handleRedetectar,
    handleExportar,

    modalContadorAbierto,
    setModalContadorAbierto,
    contactos,
    envioDisponible,
    handleCrearContacto,
    handleEliminarContacto,
    handleEnviarContador,

    dialogProps,
    toasts,
    removeToast
  }
}

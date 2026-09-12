import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import facturacionService from '../services/facturacionService'
import { abrirPdfFacturaPropia } from '../services/facturaPropiaAdaptador'

/**
 * Las facturas ya emitidas, desde nuestra base.
 *
 * Hasta ahora no había dónde verlas: se facturaba y el documento desaparecía
 * de la vista. Las 5.398 copiadas tampoco se podían consultar sin abrir
 * Alegra.
 *
 * EL FILTRO QUE IMPORTA ES "CON SALDO", y es el que abre por omisión: es la
 * pregunta que alguien se hace de verdad frente a esta pantalla —a quién hay
 * que cobrarle—, no "mostrame todas".
 */

const ESTADOS = [
  { clave: 'con_saldo', etiqueta: 'Con saldo' },
  { clave: 'emitidas', etiqueta: 'Emitidas' },
  { clave: 'anuladas', etiqueta: 'Anuladas' },
  { clave: 'todas', etiqueta: 'Todas' }
]

export function useFacturasEmitidas({ activa }) {
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState('con_saldo')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagina, setPagina] = useState(1)

  const [facturas, setFacturas] = useState([])
  const [paginacion, setPaginacion] = useState({ total: 0, pagina: 1, paginas: 1 })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const [detalleId, setDetalleId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const [abriendoPdf, setAbriendoPdf] = useState(null)
  const [mensaje, setMensaje] = useState('')

  // Cada búsqueda que se escribe cancela la anterior: sin esto, teclear
  // "PULPERIA" dispara ocho consultas y la que pinta es la que conteste de
  // última, que no tiene por qué ser la del texto completo.
  const temporizador = useRef(null)
  const peticion = useRef(0)

  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setCargando(true)
    setError('')
    try {
      const r = await facturacionService.listarFacturasEmitidas({
        buscar, estado, desde, hasta, pagina, limite: 20
      })
      if (mia !== peticion.current) return   // llegó tarde: ya hay otra búsqueda
      setFacturas(r.facturas)
      setPaginacion(r.paginacion)
    } catch (e) {
      if (mia !== peticion.current) return
      setError(e.response?.data?.message || 'No se pudieron traer las facturas.')
      setFacturas([])
    } finally {
      if (mia === peticion.current) setCargando(false)
    }
  }, [buscar, estado, desde, hasta, pagina])

  useEffect(() => {
    if (!activa) return
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(cargar, buscar ? 350 : 0)
    return () => clearTimeout(temporizador.current)
  }, [activa, cargar, buscar])

  // Cambiar un filtro vuelve a la primera página: quedarse en la 7 de una
  // búsqueda que ahora tiene 2 muestra una lista vacía que parece un error.
  const cambiarFiltro = (fn) => (valor) => { fn(valor); setPagina(1) }

  const abrirDetalle = async (id) => {
    if (detalleId === id) { setDetalleId(null); setDetalle(null); return }
    setDetalleId(id)
    setDetalle(null)
    setCargandoDetalle(true)
    try {
      setDetalle(await facturacionService.detalleFacturaEmitida(id))
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo abrir la factura.')
      setDetalleId(null)
    } finally {
      setCargandoDetalle(false)
    }
  }

  const verPdf = async (id) => {
    setAbriendoPdf(id)
    try {
      await abrirPdfFacturaPropia(api, id)
    } catch {
      setError('No se pudo abrir el PDF.')
    } finally {
      setAbriendoPdf(null)
    }
  }

  const anular = async (id, motivo) => {
    await facturacionService.anularFacturaEmitida(id, motivo)
    setMensaje('Factura anulada. Conserva su número.')
    if (detalleId === id) { setDetalleId(null); setDetalle(null) }
    await cargar()
  }

  const crearNota = async (datos) => {
    const nota = await facturacionService.crearNotaCredito(datos)
    setMensaje(`Nota de crédito ${nota.numero} creada.`)
    if (detalleId === datos.facturaId) {
      setDetalle(await facturacionService.detalleFacturaEmitida(datos.facturaId))
    }
    await cargar()
    return nota
  }

  return {
    ESTADOS,
    buscar, setBuscar: cambiarFiltro(setBuscar),
    estado, setEstado: cambiarFiltro(setEstado),
    desde, setDesde: cambiarFiltro(setDesde),
    hasta, setHasta: cambiarFiltro(setHasta),
    pagina, setPagina,
    facturas, paginacion, cargando, error, setError,
    detalleId, detalle, cargandoDetalle, abrirDetalle,
    abriendoPdf, verPdf, anular, crearNota,
    mensaje, setMensaje,
    recargar: cargar
  }
}

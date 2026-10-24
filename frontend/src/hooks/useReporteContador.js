import { useCallback, useEffect, useRef, useState } from 'react'
import * as servicio from '../services/reporteContadorService'
import { descargarArchivo } from '../services/descargarArchivoService'
import { periodoMesAnterior } from '../utils/reporteContadorUtils'
import { useDialog } from './useDialog'
const mensaje = (e) =>
  e.response?.data?.message || e.message || 'No se pudo completar la operación.'
export function useReporteContador() {
  const [periodo, setPeriodo] = useState(periodoMesAnterior)
  const [datos, setDatos] = useState(null)
  const [archivos, setArchivos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [tab, setTab] = useState('electronicas')
  const [buscar, setBuscar] = useState('')
  const [seleccionado, setSeleccionado] = useState(null)
  const [modal, setModal] = useState(false)
  const [contactos, setContactos] = useState([])
  const [envioDisponible, setEnvioDisponible] = useState(false)
  const { confirm, dialogProps } = useDialog()
  const secuencia = useRef(0)
  const cargar = useCallback(async () => {
    const mia = ++secuencia.current
    setCargando(true)
    setError('')
    setDatos(null)
    setSeleccionado(null)
    setModal(false)
    try {
      const [mes, guardados] = await Promise.all([
        servicio.leerMesContador(periodo),
        servicio.leerArchivosContador(periodo)
      ])
      if (mia === secuencia.current) {
        setDatos(mes)
        setArchivos(guardados)
      }
    } catch (e) {
      if (mia === secuencia.current) setError(mensaje(e))
    } finally {
      if (mia === secuencia.current) setCargando(false)
    }
  }, [periodo])
  useEffect(() => {
    const contador = secuencia
    cargar()
    return () => {
      contador.current++
    }
  }, [cargar])
  useEffect(() => {
    setBuscar('')
    setSeleccionado(null)
  }, [tab, periodo])
  const leerContactos = useCallback(async () => {
    const r = await servicio.leerContactosContador()
    setContactos(r.contactos)
    setEnvioDisponible(r.envioDisponible)
  }, [])
  useEffect(() => {
    if (modal) leerContactos().catch((e) => setError(mensaje(e)))
  }, [modal, leerContactos])
  const operar = async (tipo, trabajo, texto = '') => {
    if (ocupado) return false
    setOcupado(tipo)
    setError('')
    setAviso('')
    try {
      await trabajo()
      setAviso(texto)
      return true
    } catch (e) {
      setError(mensaje(e))
      return false
    } finally {
      setOcupado('')
    }
  }
  const descargar = (tipo) =>
    operar('descargar', () =>
      descargarArchivo(`/reporte-contador/mes/${tipo}`, {
        params: periodo,
        tipo:
          tipo === 'excel'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/zip',
        nombre: `contador-${periodo.anio}-${periodo.mes}.${tipo === 'excel' ? 'xlsx' : 'zip'}`
      })
    )
  const descargarHistorico = (id) =>
    operar('descargar', () =>
      descargarArchivo(`/reporte-contador/periodos/${id}/exportar`, {
        tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        nombre: `reporte-guardado-${id}.xlsx`
      })
    )
  const crearContacto = async (datos) => {
    try {
      const contacto = await servicio.guardarContactoContador(datos)
      await leerContactos()
      return { ok: true, contacto }
    } catch (e) {
      return { ok: false, mensaje: mensaje(e) }
    }
  }
  const eliminarContacto = async (c) => {
    if (!(await confirm(`¿Eliminar a ${c.nombre} de los contactos?`))) return { ok: true }
    try {
      await servicio.eliminarContactoContador(c.id)
      await leerContactos()
      return { ok: true }
    } catch (e) {
      return { ok: false, mensaje: mensaje(e) }
    }
  }
  const enviar = async (contactoId) => {
    const ok = await operar(
      'enviar',
      () => servicio.enviarMesContador({ ...periodo, contactoId, huella: datos.huella }),
      'Reporte mensual enviado al contador.'
    )
    return { ok, mensaje: ok ? '' : 'No se pudo enviar. Revisá el aviso en el reporte.' }
  }
  return {
    periodo,
    setPeriodo,
    datos,
    archivos,
    cargando,
    error,
    aviso,
    ocupado,
    tab,
    setTab,
    buscar,
    setBuscar,
    seleccionado,
    setSeleccionado,
    modal,
    setModal,
    contactos,
    envioDisponible,
    cargar,
    descargar,
    descargarHistorico,
    crearContacto,
    eliminarContacto,
    enviar,
    dialogProps
  }
}

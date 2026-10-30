import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { useContextoConsulta } from './useContextoConsulta'
import { agruparAgenda, contarAgenda } from '../utils/agendaPreventa'
import { hoyEnCostaRica } from '../utils/fechaCR'

export function useAgendaPreventa() {
  const [rutas, setRutas] = useState([])
  const [errorRutas, setErrorRutas] = useState('')
  const [cargandoRutas, setCargandoRutas] = useState(true)
  const [intentoRutas, setIntentoRutas] = useState(0)
  // La ruta va en la dirección (?ruta=): al volver de Facturar se queda donde estaba.
  const [parametros, setParametros] = useSearchParams()
  const [rutaId, setRutaId] = useState(() => parametros.get('ruta') || '')
  const [revision, setRevision] = useState(0)
  const [datos, setDatos] = useState({ clientes: [], hoy: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [seleccionId, setSeleccionId] = useState(null)
  const [aviso, setAviso] = useState('')
  const [filtros, setFiltros] = useState({ estado: 'todos', buscar: '' })
  const { esActual, confirmar, vigente } = useContextoConsulta(`${rutaId}:${revision}`)
  const recargar = useCallback(() => setRevision(n => n + 1), [])
  const recargarRutas = useCallback(() => setIntentoRutas(n => n + 1), [])
  const cambiarRuta = useCallback(valor => {
    setRutaId(valor); setSeleccionId(null); setAviso(''); setError(''); setCargando(false)
    setFiltros({ estado: 'todos', buscar: '' })
  }, [])

  // La dirección sigue a la ruta elegida, a mano o sola (la única del agente).
  useEffect(() => {
    if ((parametros.get('ruta') || '') !== rutaId) setParametros(rutaId ? { ruta: rutaId } : {}, { replace: true })
  }, [rutaId, parametros, setParametros])

  useEffect(() => {
    const control = new AbortController()
    let vivo = true
    setCargandoRutas(true)
    api.get('/preventa/rutas', { signal: control.signal })
      .then(({ data }) => {
        if (!vivo) return
        const lista = data.data || []
        setRutas(lista); setErrorRutas('')
        // Con una sola ruta a su cargo (el agente que empieza), entra directo a ella.
        if (lista.length === 1) setRutaId(actual => actual || String(lista[0].id))
      })
      .catch(e => { if (vivo) setErrorRutas(e.response?.data?.message || 'No se pudieron consultar las rutas.') })
      .finally(() => { if (vivo) setCargandoRutas(false) })
    return () => { vivo = false; control.abort() }
  }, [intentoRutas])

  useEffect(() => {
    if (!rutaId) return
    const control = new AbortController()
    let vivo = true
    setCargando(true); setError('')
    api.get('/preventa/agenda', { params: { rutaId }, signal: control.signal })
      .then(({ data }) => {
        if (!vivo || !esActual()) return
        setDatos(data.data); confirmar()
      })
      .catch(e => { if (vivo && esActual()) setError(e.response?.data?.message || 'No se pudo consultar la agenda.') })
      .finally(() => { if (vivo && esActual()) setCargando(false) })
    return () => { vivo = false; control.abort() }
  }, [rutaId, revision, esActual, confirmar])

  useEffect(() => {
    if (vigente && seleccionId && !datos.clientes.some(c => c.id === seleccionId)) {
      setSeleccionId(null)
      setAviso('El cliente ya no está activo en esta ruta. Se actualizó la agenda.')
    }
  }, [vigente, seleccionId, datos])

  // Al volver de Facturación/Clientes se vuelve a leer; al pasar la medianoche
  // de Costa Rica cambia hoy aunque el navegador esté en otra zona horaria.
  const dia = useRef(hoyEnCostaRica())
  useEffect(() => {
    const alVolver = () => { if (!document.hidden) { dia.current = hoyEnCostaRica(); recargar() } }
    const reloj = setInterval(() => {
      const hoy = hoyEnCostaRica()
      if (!document.hidden && hoy !== dia.current) { dia.current = hoy; recargar() }
    }, 60000)
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(reloj); window.removeEventListener('focus', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [recargar])

  const clientes = vigente && !error ? datos.clientes : []
  const grupos = useMemo(() => agruparAgenda(clientes, filtros), [clientes, filtros])
  const cantidades = useMemo(() => contarAgenda(clientes), [clientes])
  const seleccionado = clientes.find(c => c.id === seleccionId) || null
  return { rutas, errorRutas, cargandoRutas, recargarRutas, rutaId, cambiarRuta,
    error, cargando: Boolean(rutaId) && (cargando || (!vigente && !error)), recargar,
    filtros, setFiltros, grupos, cantidades, total: clientes.length, hoy: datos.hoy,
    seleccionId, seleccionado, seleccionar: setSeleccionId, aviso }
}

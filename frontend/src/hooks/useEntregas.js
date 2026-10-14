import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useContextoConsulta } from './useContextoConsulta'

/** Ruta actual hasta el primer evento; la carga registrada conserva su foto.
 * Lecturas de otra selección, aun A→B→A, nunca pisan la vigente.
 */
export function useEntregas() {
  const [rutas, setRutas] = useState([])
  const [rutaId, setRutaId] = useState('')
  const [vista, setVista] = useState('pendientes')
  const [orden, setOrden] = useState('entrega')
  const [pagina, setPagina] = useState(1)
  const [clave, setClave] = useState(null)
  const [revision, setRevision] = useState(0)
  const [revisionPlan, setRevisionPlan] = useState(0)
  const [revisionRutas, setRevisionRutas] = useState(0)
  const [plan, setPlan] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [error, setError] = useState('')
  const [errorDetalle, setErrorDetalle] = useState('')
  const [errorRutas, setErrorRutas] = useState('')
  const [cargando, setCargando] = useState(false)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const params = useMemo(() => ({ rutaId, vista }), [rutaId, vista])
  const cp = useContextoConsulta(`${rutaId}:${vista}:${pagina}:${revision}:${revisionPlan}`)
  const cd = useContextoConsulta(`${rutaId}:${vista}:${clave}:${revision}`)
  const actualizarPlan = useCallback(() => setRevisionPlan(r => r + 1), [])
  const limpiar = () => { setPagina(1); setClave(null); setError(''); setErrorDetalle('') }
  const cambiarRuta = valor => { setRutaId(valor); limpiar() }
  const cambiarVista = valor => { setVista(valor); limpiar(); setOrden('entrega') }
  useEffect(() => {
    let vivo = true
    api.get('/entregas/rutas').then(({ data }) => { if (vivo) { setRutas(data.data || []); setErrorRutas('') } })
      .catch(e => { if (vivo) setErrorRutas(e.response?.data?.message || 'No se pudieron consultar las rutas.') })
    return () => { vivo = false }
  }, [revisionRutas])
  useEffect(() => {
    if (!rutaId) return
    const control = new AbortController(); let vivo = true
    setError(''); setCargando(true)
    api.get('/entregas/plan', { params: { ...params, pagina }, signal: control.signal })
      .then(({ data }) => {
        if (!vivo || !cp.esActual()) return
        setPlan(data.data); cp.confirmar()
        if (pagina > data.data.paginacion.paginas) setPagina(data.data.paginacion.paginas)
      })
      .catch(e => { if (vivo && cp.esActual()) setError(e.response?.data?.message || 'No se pudo consultar la ruta.') })
      .finally(() => { if (vivo && cp.esActual()) setCargando(false) })
    return () => { vivo = false; control.abort() }
  }, [params, pagina, revision, revisionPlan, cp.esActual, cp.confirmar])
  useEffect(() => {
    if (!clave || !rutaId) return
    const control = new AbortController(); let vivo = true
    setErrorDetalle(''); setCargandoDetalle(true)
    api.get('/entregas/paradas/' + clave, { params, signal: control.signal })
      .then(({ data }) => { if (vivo && cd.esActual()) { setDetalle(data.data); cd.confirmar() } })
      .catch(e => { if (vivo && cd.esActual()) setErrorDetalle(e.response?.data?.message || 'No se pudo consultar la parada.') })
      .finally(() => { if (vivo && cd.esActual()) setCargandoDetalle(false) })
    return () => { vivo = false; control.abort() }
  }, [clave, params, revision, cd.esActual, cd.confirmar])
  useEffect(() => {
    // No desmontar un formulario con registro incierto al volver al foco.
    // La versión/firma del servidor protege el físico hasta actualizarlo.
    const volver = () => { if (!document.hidden) actualizarPlan() }
    window.addEventListener('focus', volver); document.addEventListener('visibilitychange', volver)
    return () => { window.removeEventListener('focus', volver); document.removeEventListener('visibilitychange', volver) }
  }, [actualizarPlan])
  return { filtro: { rutas, rutaId, vista, params, cambiarRuta, cambiarVista, errorRutas,
    reintentarRutas: () => setRevisionRutas(n => n + 1) },
    plan: cp.vigente && !error ? plan : null, detalle: cd.vigente && !errorDetalle ? detalle : null,
    error, errorDetalle, cargando: Boolean(rutaId) && (cargando || (!cp.vigente && !error)),
    cargandoDetalle: Boolean(clave) && (cargandoDetalle || (!cd.vigente && !errorDetalle)),
    seleccion: clave, pagina, cambiarPagina: setPagina, orden, cambiarOrden: setOrden,
    abrir: p => { setClave(p.clave); if (p.pagina) setPagina(p.pagina) }, volver: () => setClave(null),
    actualizar: () => setRevision(r => r + 1), actualizarPlan }
}

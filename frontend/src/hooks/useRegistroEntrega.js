import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useContextoConsulta } from './useContextoConsulta'
import { prepararCantidades, lineasDeRegistro } from '../utils/registroEntrega'

/** Un error de red conserva UUID/cuerpo para comprobar el mismo registro.
 * No sumar otra carga nueva hasta conocer si la primera quedó guardada.
 */
export function useRegistroEntrega(facturaId, onActualizar) {
  const [datos, setDatos] = useState(null)
  const [accion, setAccion] = useState('carga')
  const [cantidades, setCantidades] = useState({})
  const [motivo, setMotivo] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [leyendo, setLeyendo] = useState(true)
  const [pendiente, setPendiente] = useState(null)
  const [incierto, setIncierto] = useState(false)
  const peticionActual = useRef(null)
  const { esActual, vigente, confirmar: confirmarLectura } = useContextoConsulta(facturaId)
  const limpiar = (d, a = accion) => {
    setCantidades(prepararCantidades(d, a)); setMotivo(''); setConfirmar(false)
  }
  useEffect(() => {
    const control = new AbortController(); let vivo = true
    setLeyendo(true); setError('')
    api.get(`/entregas/facturas/${facturaId}/registro`, { signal: control.signal })
      .then(({ data }) => { if (vivo && esActual()) { setDatos(data.data); limpiar(data.data); confirmarLectura() } })
      .catch(e => { if (vivo && esActual()) setError(e.response?.data?.message || 'No se pudo consultar el registro físico.') })
      .finally(() => { if (vivo && esActual()) setLeyendo(false) })
    return () => { vivo = false; control.abort() }
  }, [facturaId, revision, esActual, confirmarLectura])

  const enviar = async peticion => {
    if (peticionActual.current) return
    peticionActual.current = peticion
    setOcupado(true); setError(''); setMensaje('')
    try {
      const { data } = await api.post(peticion.ruta, peticion.body)
      if (!esActual()) return
      setDatos(data.data); limpiar(data.data); confirmarLectura(); setPendiente(null); setIncierto(false)
      setMensaje('Registro guardado. Cantidades e historial actualizados.'); onActualizar?.()
    } catch (e) {
      if (!esActual()) return
      const dudoso = !e.response || e.response.status >= 500
      setIncierto(dudoso)
      if (!dudoso) setPendiente(null)
      setError(dudoso ? 'No se pudo confirmar la respuesta. Reintentá el mismo registro para comprobar si quedó guardado.'
        : e.response?.data?.message || 'No se pudo guardar.')
    } finally { peticionActual.current = null; if (esActual()) setOcupado(false) }
  }
  const guardar = () => {
    if (!vigente || ocupado || incierto || !confirmar) return
    const peticion = { ruta: `/entregas/facturas/${facturaId}/${accion === 'revision' ? 'revision' : 'eventos'}`,
      body: { clave: crypto.randomUUID(), version: datos.version, revision: datos.revision, confirmar, accion,
        lineas: lineasDeRegistro(datos, accion, cantidades), motivo } }
    setPendiente(peticion); enviar(peticion)
  }
  return { datos: vigente ? datos : null, accion, cantidades, motivo, confirmar, error, mensaje, ocupado,
    leyendo: leyendo || (!vigente && !error), incierto, guardar, reintentar: () => enviar(pendiente),
    actualizar: () => setRevision(n => n + 1),
    cambiar: a => { setAccion(a); limpiar(datos, a); setError(''); setMensaje('') },
    editar: (n, valor, campo) => { setConfirmar(false); setCantidades(q => ({ ...q, [n]: campo ? { ...q[n], [campo]: valor } : valor })) },
    cambiarMotivo: v => { setMotivo(v); setConfirmar(false) }, cambiarConfirmacion: setConfirmar }
}

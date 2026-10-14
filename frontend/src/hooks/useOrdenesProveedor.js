import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useContextoConsulta } from './useContextoConsulta'
import { useDialog } from './useDialog'
import { lineasDeCantidades, cantidadesOrdenValidas, revisionOrdenCambio } from '../utils/ordenCompraTexto'

const BASE = '/orden-compra/por-ciclo'

/** El reporte conserva faltantes originales; aquí se revisa la orden NUEVA,
 * que solo incorpora cantidades que todavía no se solicitaron al proveedor.
 */
export function useOrdenesProveedor(proveedor, onEnviada) {
  const filtros = { cedula: proveedor.cedula || '', nombre: proveedor.nombre }
  const clave = JSON.stringify(filtros)
  const contexto = useContextoConsulta(clave)
  const [lista, setLista] = useState([])
  const [orden, setOrden] = useState(null)
  const [cantidades, setCantidades] = useState({})
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [revision, setRevision] = useState(0)
  const peticion = useRef(0)
  const guardando = useRef(false)
  const actualOrden = useRef(null)
  const { prompt, dialogProps } = useDialog()
  const fallo = e => e.response?.data?.message || e.message || 'No se pudieron consultar o guardar las órdenes.'
  const actualizar = useCallback(nueva => {
    if (!contexto.esActual()) return
    const enviadaAhora = nueva.enviada_en && actualOrden.current?.id === nueva.id && !actualOrden.current.enviada_en
    actualOrden.current = nueva
    setOrden(nueva)
    setCantidades(Object.fromEntries(nueva.lineas.map(l => [l.producto_id, String(l.cantidad_proveedor)])))
    setRevision(n => n + 1)
    if (enviadaAhora) onEnviada?.()
  }, [contexto.esActual, onEnviada])
  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    api.get('/orden-compra/proveedor/ordenes', { params: filtros }).then(({ data }) => {
      if (vivo && contexto.esActual()) { setLista(data.data.ordenes); contexto.confirmar() }
    }).catch(e => { if (vivo && contexto.esActual()) setError(fallo(e)) })
      .finally(() => { if (vivo && contexto.esActual()) setCargando(false) })
    return () => { vivo = false }
  }, [clave, revision, contexto.esActual, contexto.confirmar])
  const ejecutar = async fn => {
    if (guardando.current) return
    guardando.current = true; setOcupado(true); setError('')
    try { await fn() } catch (e) { if (contexto.esActual()) setError(fallo(e)) }
    finally { guardando.current = false; if (contexto.esActual()) setOcupado(false) }
  }
  const abrir = async id => {
    const mia = ++peticion.current
    const { data } = await api.get(`${BASE}/${id}`)
    if (contexto.esActual() && mia === peticion.current) actualizar(data.data)
  }
  const preparar = () => ejecutar(async () => {
    const { data } = await api.post('/orden-compra/proveedor/preparar', filtros)
    if (!contexto.esActual()) return
    setLista(data.data.ordenes)
    const abierta = data.data.ordenes.find(o => ['borrador', 'pendiente_enviar'].includes(o.estado) && !o.envio_id)
    if (abierta) await abrir(abierta.id)
    else setError('No hay faltantes nuevos sin solicitar para preparar otra orden.')
  })
  const guardar = () => ejecutar(async () => {
    const lineas = lineasDeCantidades(cantidades)
    if (!cantidadesOrdenValidas(lineas)) throw new Error('Indicá cantidades enteras positivas del proveedor.')
    let actual = orden
    if (actual.estado === 'pendiente_enviar') actual = (await api.patch(`${BASE}/${actual.id}/estado`, { version: actual.version, estado: 'borrador' })).data.data
    const { data } = await api.put(`${BASE}/${actual.id}`, { version: actual.version, lineas })
    actualizar(data.data)
  })
  const confirmar = () => ejecutar(async () => actualizar((await api.patch(`${BASE}/${orden.id}/estado`, { version: orden.version, estado: 'pendiente_enviar' })).data.data))
  const cancelar = () => ejecutar(async () => {
    const motivo = await prompt('¿Por qué se cancela esta orden?', { title: 'Cancelar orden', confirmLabel: 'Cancelar orden' })
    if (motivo) actualizar((await api.patch(`${BASE}/${orden.id}/estado`, { version: orden.version, estado: 'cerrada', motivo })).data.data)
  })
  const lineas = lineasDeCantidades(cantidades)
  const editable = orden && ['borrador', 'pendiente_enviar'].includes(orden.estado) && !orden.envio_id
  return { lista: contexto.vigente ? lista : [], orden, cantidades, setCantidades, error, cargando, ocupado, setOcupado,
    abrir: id => ejecutar(() => abrir(id)), volver: () => { ++peticion.current; actualOrden.current = null; setOrden(null); setError('') },
    reintentar: () => setRevision(n => n + 1), preparar, guardar, confirmar, cancelar, actualizar, editable,
    cambios: revisionOrdenCambio(orden, lineas), valida: cantidadesOrdenValidas(lineas), prompt, dialogProps }
}

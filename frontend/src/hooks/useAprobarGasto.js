import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

const mensaje = e => e.response?.data?.message || 'No se pudo actualizar el gasto.'

export function useAprobarGasto() {
  const [gastos, setGastos] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [seleccion, setSeleccion] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const peticion = useRef(0)
  const enviando = useRef(false)
  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setCargando(true)
    try {
      const { data } = await api.get('/revision-precios/gastos-operativos', { params: { pagina } })
      if (mia === peticion.current) { setGastos(data.data.gastos); setTotal(data.data.total) }
    } catch (e) { if (mia === peticion.current) setError(mensaje(e)) }
    finally { if (mia === peticion.current) setCargando(false) }
  }, [pagina])
  useEffect(() => {
    const contador = peticion
    cargar()
    return () => { contador.current++ }
  }, [cargar])
  const abrir = (gasto, accion) => { setError(''); setAviso(''); setSeleccion({ gasto, accion }) }
  const cerrar = () => { if (!enviando.current) setSeleccion(null) }
  const confirmar = async datos => {
    if (!seleccion || enviando.current) return
    enviando.current = true; setOcupado(true); setError('')
    try {
      const { data } = await api.post(`/revision-precios/gastos-operativos/${seleccion.gasto.id}/decision`, {
        ...datos, accion: seleccion.accion, version: seleccion.gasto.version
      })
      const r = data.data
      setSeleccion(null)
      const resultado = r.decision === 'rechazado' ? 'Gasto rechazado, sin registrar pago.'
        : Number(r.gasto.saldo) > 0 ? 'El gasto ya estaba aprobado y tiene saldo pendiente. Revisá su pago en Gastos operativos.'
          : 'Gasto aprobado y pago completo registrado.'
      setAviso(`${resultado} ${r.hacienda.estado === 'pendiente' ? r.hacienda.motivo : 'Respuesta enviada a Hacienda; su confirmación se actualizará en Gastos operativos.'}`)
      if (pagina > 1) setPagina(1)
      else await cargar()
    } catch (e) { setError(mensaje(e)) }
    finally { enviando.current = false; setOcupado(false) }
  }
  return { gastos, total, pagina, setPagina, cargando, seleccion, ocupado, error, aviso, abrir, cerrar, confirmar, cargar }
}

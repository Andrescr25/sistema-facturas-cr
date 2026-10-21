import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { descargarArchivo } from '../services/descargarArchivoService'
import { useDialog } from './useDialog'
import { RESPUESTAS_GASTO } from '../utils/gastosOperativos'
import { formatCurrency } from '../utils/pagos'

const mensaje = e => e.response?.data?.message || e.message || 'No se pudo completar la operación.'

export function useGastosOperativos() {
  const [params, setParams] = useSearchParams()
  const id = params.get('gasto')
  const { confirm, dialogProps } = useDialog()
  const [gastos, setGastos] = useState([])
  const [total, setTotal] = useState(0)
  const [buscar, setBuscar] = useState('')
  const [categoria, setCategoria] = useState('')
  const [revision, setRevision] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState(null)
  const [fiscal, setFiscal] = useState(null)
  const [abriendo, setAbriendo] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modalPago, setModalPago] = useState(false)
  const peticion = useRef(0)
  const actual = useRef(id)
  actual.current = id

  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setCargando(true)
    try {
      const { data } = await api.get('/gastos-operativos', { params: { buscar, categoria, revision, pagina } })
      if (mia === peticion.current) { setGastos(data.data.gastos); setTotal(data.data.total) }
    } catch (e) { if (mia === peticion.current) setError(mensaje(e)) }
    finally { if (mia === peticion.current) setCargando(false) }
  }, [buscar, categoria, revision, pagina])

  useEffect(() => { const t = setTimeout(cargar, buscar ? 300 : 0); return () => clearTimeout(t) }, [cargar, buscar])
  useEffect(() => setPagina(1), [buscar, categoria, revision])

  const leerDetalle = useCallback(async (n) => {
    const { data } = await api.get(`/gastos-operativos/${n}`)
    if (actual.current !== String(n)) return
    setDetalle(data.data)
    if (data.data.compra_id) {
      const r = await api.get(`/gastos-operativos/${n}/hacienda`)
      if (actual.current === String(n)) setFiscal(r.data.data)
    }
  }, [])

  useEffect(() => {
    setDetalle(null); setFiscal(null); setError(''); setAviso(''); setModalPago(false)
    if (!id) return
    setAbriendo(true)
    leerDetalle(id).catch(e => { if (actual.current === id) setError(mensaje(e)) })
      .finally(() => { if (actual.current === id) setAbriendo(false) })
  }, [id, leerDetalle])

  const enCurso = fiscal?.comprobante && !['aceptada', 'rechazada'].includes(fiscal.comprobante.estado)
  useEffect(() => {
    if (!id || !enCurso) return undefined
    const t = setInterval(() => leerDetalle(id).catch(() => {}), 15000)
    return () => clearInterval(t)
  }, [id, enCurso, leerDetalle])

  const operar = async (accion, trabajo, texto) => {
    if (ocupado) return false
    const mia = id
    setOcupado(accion); setError(''); setAviso('')
    try {
      await trabajo()
      if (actual.current === mia) {
        if (mia) await leerDetalle(mia)
        setAviso(texto)
      }
      await cargar()
      return true
    } catch (e) { if (actual.current === mia) setError(mensaje(e)); return false }
    finally { setOcupado('') }
  }

  const guardar = datos => operar('guardar', () => api.patch(`/gastos-operativos/${id}`, { version: detalle.version, ...datos }), 'Cambios guardados.')
  const revalidar = () => operar('validar', () => api.post(`/gastos-operativos/${id}/revalidar`), 'Validación actualizada.')
  const adjuntarPdf = archivo => {
    if (!archivo) return
    const form = new FormData(); form.append('pdf', archivo)
    return operar('pdf', () => api.post(`/gastos-operativos/${id}/pdf`, form), 'PDF conservado.')
  }
  const adjuntarXml = archivo => {
    if (!archivo) return
    const form = new FormData(); form.append('xml', archivo)
    return operar('xml', () => api.post(`/gastos-operativos/${id}/xml`, form), 'XML conservado y validación actualizada.')
  }
  const descargar = tipo => operar('descargar', () => descargarArchivo(`/gastos-operativos/${id}/archivos/${tipo}`,
    { tipo: tipo === 'xml' ? 'application/xml' : 'application/pdf', nombre: `gasto-${id}.${tipo}` }), '')
  const pagar = datos => operar('pagar', () => api.post(`/gastos-operativos/${id}/pagos`, {
    metodoPagoId: datos.metodoPagoId, referencia: datos.referencia, fecha: datos.fecha, claveIdempotencia: datos.claveIdempotencia,
    monto: datos.lineas[0].monto, pagarTodo: datos.lineas[0].todo
  }), 'Pago registrado en Caja General.')
  const responderFiscal = async () => {
    const respuesta = RESPUESTAS_GASTO.find(r => r.valor === detalle.respuesta)?.texto
    if (!await confirm(`${respuesta}. Crédito de IVA: ${formatCurrency(detalle.iva_credito)}; gasto aplicable: ${formatCurrency(detalle.gasto_deducible)}.`,
      { title: 'Enviar respuesta a Hacienda', confirmLabel: 'Confirmar y enviar' })) return
    return operar('hacienda', () => api.post(`/gastos-operativos/${id}/hacienda`, { confirmar: true }), 'Respuesta enviada. El estado de Hacienda se actualizará al consultar.')
  }

  return { gastos, total, buscar, setBuscar, categoria, setCategoria, revision, setRevision, pagina, setPagina,
    cargando, detalle, fiscal, abriendo, ocupado, error, aviso, modalPago, setModalPago,
    abrir: n => setParams({ gasto: n }), volver: () => setParams({}), id,
    guardar, revalidar, adjuntarPdf, adjuntarXml, descargar, pagar, responderFiscal, dialogProps }
}

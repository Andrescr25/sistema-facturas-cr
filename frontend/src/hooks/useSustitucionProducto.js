import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { puedeAccion } from '../utils/modulos'

export function useSustitucionProducto({ onGuardado, ambito }) {
  const { usuario } = useAuth()
  const permitido = puedeAccion(usuario, 'sustituir-producto')
  const [contexto, setContexto] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [productos, setProductos] = useState([])
  const [seleccionado, setSeleccionado] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [prevision, setPrevision] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [cotizando, setCotizando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const enCurso = useRef(false)

  const cerrar = useCallback(() => { if (!enCurso.current) setContexto(null) }, [])
  useEffect(() => { cerrar() }, [ambito, cerrar])

  const abrir = useCallback((factura, producto) => {
    if (!permitido || enCurso.current) return
    setBusqueda(''); setProductos([]); setSeleccionado(null); setCantidad(''); setPrevision(null); setError('')
    setContexto({ factura, producto })
  }, [permitido])

  useEffect(() => {
    if (!contexto) return
    const control = new AbortController()
    setBuscando(true); setError('')
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/faltantes/${contexto.producto.faltante_id}/sustitutos`, { params: { q: busqueda }, signal: control.signal })
        if (!control.signal.aborted) setProductos(data.data.productos)
      } catch (e) {
        if (!control.signal.aborted) { setProductos([]); setError(e.response?.data?.message || 'No se pudieron consultar los productos ingresados.') }
      } finally { if (!control.signal.aborted) setBuscando(false) }
    }, 250)
    return () => { clearTimeout(timer); control.abort() }
  }, [contexto, busqueda])

  useEffect(() => {
    if (!contexto || !seleccionado || !cantidad) { setCotizando(false); return }
    const control = new AbortController()
    setCotizando(true); setPrevision(null); setError('')
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/faltantes/${contexto.producto.faltante_id}/sustitucion`, {
          params: { productoId: seleccionado.id, cantidad }, signal: control.signal
        })
        if (!control.signal.aborted) setPrevision(data.data)
      } catch (e) {
        if (!control.signal.aborted) setError(e.response?.data?.message || 'No se pudo calcular el cambio.')
      } finally { if (!control.signal.aborted) setCotizando(false) }
    }, 200)
    return () => { clearTimeout(timer); control.abort() }
  }, [contexto, seleccionado, cantidad, revision])

  const buscar = valor => { setBusqueda(valor); setSeleccionado(null); setPrevision(null); setError('') }
  const seleccionar = producto => {
    setSeleccionado(producto); setPrevision(null)
    setCantidad(String(Math.min(Number(contexto.producto.cantidad_faltante), Math.floor(producto.disponible))))
  }
  const cambiarCantidad = valor => { setCantidad(valor); setPrevision(null) }
  const puedeGuardar = permitido && !guardando && !cotizando && Boolean(prevision) &&
    prevision.producto.id === seleccionado?.id && prevision.cantidad === Number(cantidad)
  const guardar = async () => {
    if (!puedeGuardar || enCurso.current) return
    enCurso.current = true; setGuardando(true); setError('')
    try {
      const { data } = await api.post(`/faltantes/${contexto.producto.faltante_id}/sustitucion`, {
        productoId: seleccionado.id, cantidad: Number(cantidad), version: prevision.version
      })
      await onGuardado(data.data)
      setContexto(null)
    } catch (e) {
      setPrevision(null)
      setError(e.response?.data?.message || 'No se pudo confirmar el cambio. Revisá la factura antes de reintentar.')
    } finally { enCurso.current = false; setGuardando(false) }
  }
  return { permitido, contexto, busqueda, productos, seleccionado, cantidad, prevision, buscando, cotizando, guardando,
    error, puedeGuardar, abrir, cerrar, buscar, seleccionar, cambiarCantidad, guardar, revisar: () => setRevision(n => n + 1) }
}

import { useEffect, useState } from 'react'
import api from '../services/api'
import { hoyEnCostaRica } from '../utils/fechaCR'
import { borradorVacio, lineaDeProducto, motivoParaNoGuardar, datosParaEnviar } from '../utils/facturaManualUtils'

/**
 * Cargar a mano la factura de un proveedor que no manda factura electrónica
 * (2026-10-25). Con eso el producto ingresa, y Reporte Clientes ya deja
 * marcar que llegó. `onCargada(mensaje)` avisa a la pantalla.
 */
export function useFacturaManual(onCargada) {
  const [abierta, setAbierta] = useState(false)
  const [borrador, setBorrador] = useState(() => borradorVacio(hoyEnCostaRica()))
  const [proveedores, setProveedores] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const abrir = async () => {
    setBorrador(borradorVacio(hoyEnCostaRica()))
    setBusqueda(''); setResultados([]); setError('')
    setAbierta(true)
    if (proveedores.length) return
    try {
      const { data } = await api.get('/compras/proveedores')
      setProveedores(data.data || [])
    } catch (e) { setError(e.response?.data?.message || 'No se pudieron cargar los proveedores.') }
  }
  const cerrar = () => { if (!guardando) setAbierta(false) }

  // El mismo buscador del maestro que usa Relacionar productos.
  useEffect(() => {
    if (!abierta || busqueda.trim().length < 2) { setResultados([]); return undefined }
    let vigente = true
    const espera = setTimeout(async () => {
      setBuscando(true)
      try {
        const { data } = await api.get(`/productos-revision/buscar?q=${encodeURIComponent(busqueda.trim())}`)
        if (vigente) setResultados(data.productos || [])
      } catch { if (vigente) setResultados([]) }
      finally { if (vigente) setBuscando(false) }
    }, 300)
    return () => { vigente = false; clearTimeout(espera) }
  }, [abierta, busqueda])

  const cambiar = (campo, valor) => setBorrador((b) => ({ ...b, [campo]: valor }))
  const agregar = (producto) => {
    setBorrador((b) => ({ ...b, lineas: [...b.lineas, lineaDeProducto(producto)] }))
    setBusqueda(''); setResultados([])
  }
  const cambiarLinea = (i, campo, valor) =>
    setBorrador((b) => ({ ...b, lineas: b.lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)) }))
  const quitarLinea = (i) => setBorrador((b) => ({ ...b, lineas: b.lineas.filter((_, j) => j !== i) }))

  const motivo = motivoParaNoGuardar(borrador, hoyEnCostaRica())
  const guardar = async () => {
    if (motivo || guardando) return
    setGuardando(true); setError('')
    try {
      const { data } = await api.post('/compras/manual', datosParaEnviar(borrador))
      setAbierta(false)
      onCargada?.(data.message)
    } catch (e) { setError(e.response?.data?.message || 'No se pudo cargar la factura.') }
    finally { setGuardando(false) }
  }

  return {
    abierta, abrir, cerrar, borrador, cambiar, proveedores,
    busqueda, setBusqueda, resultados, buscando, agregar, cambiarLinea, quitarLinea,
    motivo, guardar, guardando, error
  }
}

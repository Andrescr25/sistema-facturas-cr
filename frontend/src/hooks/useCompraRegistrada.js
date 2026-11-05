import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { useBuscarProductoPropio } from './useBuscarProductoPropio'

/**
 * Una compra ya registrada, línea por línea, y corregir el producto de una
 * (2026-11-05). Corregir es solo de administrador: el servidor lo protege.
 *
 * `corrigiendo` es la línea elegida; primero se busca el producto bueno
 * (`elegido`) y después se confirma, con o sin las demás compras de ese código.
 */
export function useCompraRegistrada(facturaProveedorId, avisar) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [corrigiendo, setCorrigiendo] = useState(null)
  const [elegido, setElegido] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const buscador = useBuscarProductoPropio(Boolean(corrigiendo) && !elegido)

  const cargar = useCallback(async () => {
    if (!facturaProveedorId) return
    setCargando(true); setError('')
    try {
      const { data } = await api.get(`/compras/por-factura/${facturaProveedorId}`)
      setDatos(data.data)
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo cargar la compra.')
    } finally {
      setCargando(false)
    }
  }, [facturaProveedorId])

  useEffect(() => { cargar() }, [cargar])

  const empezar = (linea) => { setCorrigiendo(linea); setElegido(null); buscador.limpiar() }
  const cerrar = () => { if (!guardando) { setCorrigiendo(null); setElegido(null) } }

  const enviar = async (linea, productoId, todas) => {
    setGuardando(true)
    try {
      const { data } = await api.put(`/compras/lineas/${linea.id}/producto`, { productoId, todas })
      avisar(data.message, 'success')
      setCorrigiendo(null); setElegido(null)
      await cargar()
    } catch (e) {
      avisar(e.response?.data?.message || 'No se pudo corregir el producto.', 'error')
    } finally {
      setGuardando(false)
    }
  }
  const confirmar = ({ todas }) => (corrigiendo && elegido ? enviar(corrigiendo, elegido.id, todas) : undefined)
  // La compra quedó bien: la relación del código pasa a ser su producto.
  const dejarRelacion = (linea) => enviar(linea, linea.producto.id, true)

  return { datos, cargando, error, recargar: cargar, corrigiendo, elegido, setElegido, guardando, buscador, empezar, cerrar, confirmar, dejarRelacion }
}

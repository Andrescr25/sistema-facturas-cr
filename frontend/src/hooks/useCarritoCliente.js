import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import apiPortal from '../services/apiPortal'

/**
 * El carrito del cliente. Existe SOLO con sesión.
 *
 * Vive en el servidor: sobrevive al recargar, sigue entre el teléfono del
 * mostrador y la computadora, y la casa puede ver los carritos armados sin
 * enviar.
 *
 * Sin cuenta no hay carrito. El catálogo queda de consulta —se ven productos
 * y precios— y la pantalla no dibuja ningún control para agregar. Hubo una
 * versión con carrito anónimo en localStorage que se fusionaba al entrar; se
 * quitó al decidir que sin cuenta solo se mira, para no dejar código que
 * aparenta funcionar y ya nadie puede alcanzar.
 */
export function useCarritoCliente(cliente) {
  const [lineas, setLineas] = useState([])
  const [noDisponibles, setNoDisponibles] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  // Evita que dos respuestas del servidor se pisen entre sí cuando el
  // cliente toca "+" varias veces seguidas.
  const peticion = useRef(0)

  const aplicar = useCallback((data, id) => {
    if (id !== peticion.current) return
    setLineas(data.lineas || [])
    setNoDisponibles(data.noDisponibles || [])
  }, [])

  // ---- Carga inicial ----

  useEffect(() => {
    if (!cliente) {
      setLineas([])
      setNoDisponibles([])
      return
    }

    let vigente = true
    const id = ++peticion.current
    setCargando(true)

    apiPortal.get('/portal/carrito')
      .then(({ data }) => { if (vigente) aplicar(data.data, id) })
      .catch(() => { if (vigente) setError('No pudimos cargar su carrito.') })
      .finally(() => { if (vigente) setCargando(false) })

    return () => { vigente = false }
  }, [cliente, aplicar])

  // ---- Operaciones ----

  const cambiarCantidad = useCallback(async (producto, cantidad) => {
    // Sin sesión no hay carrito que tocar. La pantalla ya no ofrece los
    // controles, pero se protege igual por si alguien llama desde otro lado.
    if (!cliente) return

    const n = Math.max(0, Math.floor(Number(cantidad) || 0))

    // Optimista: la pantalla responde al instante y el servidor confirma.
    // Sin esto, cada "+" tiene medio segundo de espera y se siente rota.
    setLineas(prev => {
      const otras = prev.filter(l => l.producto.id !== producto.id)
      return n === 0 ? otras : [...otras, { producto, cantidad: n }]
    })

    const id = ++peticion.current
    setError('')
    try {
      const { data } = await apiPortal.put('/portal/carrito', { productoId: producto.id, cantidad: n })
      aplicar(data.data, id)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar el carrito.')
      // Se vuelve a leer del servidor: dejar la pantalla con el valor
      // optimista después de un fallo es peor que mostrar lo que hay.
      try {
        const { data } = await apiPortal.get('/portal/carrito')
        aplicar(data.data, id)
      } catch { /* sin red: se conserva lo que se ve */ }
    }
  }, [cliente, aplicar])

  const vaciar = useCallback(async () => {
    if (!cliente) { setLineas([]); return }
    const id = ++peticion.current
    setLineas([])
    try {
      const { data } = await apiPortal.delete('/portal/carrito')
      aplicar(data.data, id)
    } catch { /* ya se vació en pantalla */ }
  }, [cliente, aplicar])

  const repetirCompra = useCallback(async (facturaId) => {
    if (!cliente) return null
    const id = ++peticion.current
    setCargando(true)
    try {
      const { data } = await apiPortal.post(`/portal/compras/${facturaId}/repetir`)
      aplicar(data.data, id)
      return data.data
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo repetir esa compra.')
      return null
    } finally {
      setCargando(false)
    }
  }, [cliente, aplicar])

  const recargar = useCallback(async () => {
    if (!cliente) return
    const id = ++peticion.current
    try {
      const { data } = await apiPortal.get('/portal/carrito')
      aplicar(data.data, id)
    } catch { /* sin red */ }
  }, [cliente, aplicar])

  const porId = useMemo(
    () => Object.fromEntries(lineas.map(l => [l.producto.id, l])),
    [lineas]
  )

  const resumen = useMemo(() => ({
    lineas,
    unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
    total: lineas.reduce((s, l) => s + l.cantidad * l.producto.precio, 0)
  }), [lineas])

  return { lineas, porId, resumen, noDisponibles, cargando, error, cambiarCantidad, vaciar, repetirCompra, recargar }
}

import { useEffect, useRef, useState } from 'react'
import { productosService } from '../services/productosService'

/** Carga solo al abrir la pestaña y conserva el resultado al volver a Datos. */
export function useProveedoresProducto(productoId, activa) {
  const cache = useRef(null)
  const [estado, setEstado] = useState({ relaciones: [], cargando: false, error: '' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!productoId || !activa) return
    if (cache.current?.id === productoId) {
      setEstado({ relaciones: cache.current.relaciones, cargando: false, error: '' })
      return
    }
    const control = new AbortController()
    setEstado({ relaciones: [], cargando: true, error: '' })
    productosService.proveedoresDeProducto(productoId, control.signal)
      .then(data => {
        if (control.signal.aborted) return
        cache.current = { id: productoId, relaciones: data.relaciones }
        setEstado({ relaciones: data.relaciones, cargando: false, error: '' })
      })
      .catch(error => {
        if (control.signal.aborted) return
        setEstado({ relaciones: [], cargando: false,
          error: error.response?.data?.message || 'No se pudieron cargar los proveedores.' })
      })
    return () => control.abort()
  }, [productoId, activa, intento])

  const reintentar = () => {
    cache.current = null
    setIntento(prev => prev + 1)
  }
  return { ...estado, reintentar }
}

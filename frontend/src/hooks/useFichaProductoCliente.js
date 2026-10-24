import { useEffect, useState } from 'react'
import apiPortal from '../services/apiPortal'

/** El visitante abre los datos públicos ya cargados. Solo una sesión pide
 * historial al servidor, que resuelve al cliente por su token. */
export function useFichaProductoCliente(itemId, inicial, conSesion) {
  const [producto, setProducto] = useState(inicial || null)
  const [cargando, setCargando] = useState(conSesion || !inicial)
  const [error, setError] = useState('')
  useEffect(() => {
    let vigente = true
    setProducto(inicial || null)
    setError('')
    setCargando(conSesion)
    if (!conSesion) return
    apiPortal.get(`/portal/productos/${itemId}`)
      .then(({ data }) => { if (vigente) setProducto(data.data) })
      .catch(err => { if (vigente) setError(err.response?.data?.message || 'No se pudo abrir el producto.') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [itemId, inicial, conSesion])
  return { producto, cargando, error }
}

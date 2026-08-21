import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import apiPortal, { setTokenPortal, TOKEN_PORTAL_KEY } from '../services/apiPortal'

const PortalClienteContext = createContext(null)

/**
 * Sesión del CLIENTE en el portal. Independiente de la del personal
 * (AuthContext): distinta llave en localStorage, distinto cliente HTTP y
 * distinto secreto de firma en el servidor.
 */
export function PortalClienteProvider({ children }) {
  const [cliente, setCliente] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_PORTAL_KEY)
    if (!token) {
      setCargando(false)
      return
    }

    let vigente = true
    apiPortal.get('/portal/yo')
      .then(({ data }) => { if (vigente) setCliente(data.data) })
      .catch((err) => {
        // Igual que en el sistema: solo un 401 cierra la sesión. Sin red se
        // conserva, para no echar a alguien por una señal mala.
        if (vigente && err.response?.status === 401) {
          setTokenPortal(null)
          setCliente(null)
        }
      })
      .finally(() => { if (vigente) setCargando(false) })

    return () => { vigente = false }
  }, [])

  const entrar = useCallback(async (credenciales) => {
    const { data } = await apiPortal.post('/portal/entrar', credenciales)
    setTokenPortal(data.data.token)
    setCliente(data.data.cliente)
    return data.data.cliente
  }, [])

  const activar = useCallback(async (datos) => {
    const { data } = await apiPortal.post('/portal/activar', datos)
    setTokenPortal(data.data.token)
    setCliente(data.data.cliente)
    return data.data.cliente
  }, [])

  const salir = useCallback(() => {
    setTokenPortal(null)
    setCliente(null)
  }, [])

  return (
    <PortalClienteContext.Provider value={{ cliente, cargando, entrar, activar, salir }}>
      {children}
    </PortalClienteContext.Provider>
  )
}

export function usePortalCliente() {
  const ctx = useContext(PortalClienteContext)
  if (!ctx) throw new Error('usePortalCliente debe usarse dentro de <PortalClienteProvider>')
  return ctx
}

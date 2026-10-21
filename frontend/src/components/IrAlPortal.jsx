import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { urlPortal, conSesion } from '../utils/urlPortal'
import { sacarSesionParaElPortal } from '../services/apiPortal'

/**
 * Lleva al portal de clientes una dirección del cliente abierta en el
 * sistema interno: los enlaces que ya se mandaron por WhatsApp (catálogo,
 * activación, cotizaciones) apuntan acá y tienen que seguir funcionando.
 * El cliente con sesión llega con ella, sin volver a ingresar.
 *
 * `replace` y no un enlace: el botón Atrás no debe devolver al cliente a una
 * dirección del sistema interno.
 */
export default function IrAlPortal() {
  const { pathname, search, hash } = useLocation()
  // Una sola vez: en desarrollo React corre el efecto dos veces, y la
  // segunda ya no encontraría la sesión (se mudó en la primera).
  const yendo = useRef(false)

  useEffect(() => {
    if (yendo.current) return
    yendo.current = true
    const token = sacarSesionParaElPortal()
    const destino = urlPortal(`${pathname}${search}`)
    window.location.replace(token ? conSesion(destino, token) : `${destino}${hash}`)
  }, [pathname, search, hash])

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutro-50">
      <Loader2 size={24} className="animate-spin text-cliente-600" />
    </div>
  )
}

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { urlPortal } from '../utils/urlPortal'

/**
 * Lleva al portal de clientes una dirección del cliente abierta en el
 * sistema interno: los enlaces que ya se mandaron por WhatsApp (catálogo,
 * activación, cotizaciones) apuntan acá y tienen que seguir funcionando.
 *
 * `replace` y no un enlace: el botón Atrás no debe devolver al cliente a una
 * dirección del sistema interno.
 */
export default function IrAlPortal() {
  const { pathname, search, hash } = useLocation()

  useEffect(() => {
    window.location.replace(urlPortal(`${pathname}${search}${hash}`))
  }, [pathname, search, hash])

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutro-50">
      <Loader2 size={24} className="animate-spin text-cliente-600" />
    </div>
  )
}

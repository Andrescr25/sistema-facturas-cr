import { arrancar } from './arranque'
import AppPortal from './AppPortal.jsx'
import { PortalClienteProvider } from './contexts/PortalClienteContext'
import { recibirSesionTraspasada } from './services/apiPortal'

// Antes de dibujar: el contexto lee la sesión al montarse, y la del cliente
// que llega redirigido desde el sitio de siempre tiene que estar ya guardada.
recibirSesionTraspasada()

// La entrada del portal de clientes (`npm run build:portal`). Sin
// AuthProvider: en este sitio no existe la sesión del personal.
arrancar(
  <PortalClienteProvider>
    <AppPortal />
  </PortalClienteProvider>
)

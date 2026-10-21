import { arrancar } from './arranque'
import AppPortal from './AppPortal.jsx'
import { PortalClienteProvider } from './contexts/PortalClienteContext'

// La entrada del portal de clientes (`npm run build:portal`). Sin
// AuthProvider: en este sitio no existe la sesión del personal.
arrancar(
  <PortalClienteProvider>
    <AppPortal />
  </PortalClienteProvider>
)

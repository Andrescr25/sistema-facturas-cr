import { arrancar } from './arranque'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'
import { PortalClienteProvider } from './contexts/PortalClienteContext'

arrancar(
  <AuthProvider>
    <PortalClienteProvider>
      <App />
    </PortalClienteProvider>
  </AuthProvider>
)

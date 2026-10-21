import { arrancar } from './arranque'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'

arrancar(
  <AuthProvider>
    <App />
  </AuthProvider>
)

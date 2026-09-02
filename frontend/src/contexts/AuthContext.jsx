import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import api, { setTokenSesion, TOKEN_KEY } from '../services/api'

const AuthContext = createContext(null)

/**
 * Lee el nombre y el usuario del token SIN verificar la firma.
 *
 * Solo se usa para poder escribir "Hola, Fulano" cuando la tablet está sin
 * señal y no se puede preguntar al servidor. NO sirve como autorización y no
 * debe usarse para eso: la firma se valida en el backend, que es quien
 * entrega o niega los datos. Alguien puede escribir lo que quiera en su
 * propio localStorage; lo único que lograría es ver otro nombre en su
 * pantalla, porque el servidor le va a seguir diciendo que no.
 */
function datosDelToken(token) {
  try {
    const carga = JSON.parse(atob(token.split('.')[1]))
    // Los permisos también salen del token. Sin ellos, el agente que abre la
    // tablet sin cobertura veía "No tiene acceso a esta pantalla" sobre un
    // catálogo que YA tenía descargado en el dispositivo. Esto es interfaz,
    // no autorización: el servidor sigue siendo quien entrega o niega datos.
    return {
      id: carga.sub, usuario: carga.usuario, nombre: carga.nombre,
      esAdmin: Boolean(carga.esAdmin), modulos: carga.modulos || []
    }
  } catch {
    return null
  }
}

/**
 * Sesión del sistema.
 *
 * El token se guarda en localStorage y no en memoria porque si no, recargar
 * la página (F5, o volver a abrir la pestaña en la tablet de bodega)
 * obligaría a escribir la contraseña de nuevo cada vez.
 *
 * Al arrancar no se confía en el token guardado sin más: se pregunta al
 * backend con /auth/yo. Un token vencido en localStorage se ve igual que uno
 * bueno, y sin esta comprobación la aplicación entera se dibujaría para
 * después fallar pantalla por pantalla con 401.
 */
export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setCargando(false)
      return
    }

    let vigente = true
    api.get('/auth/yo')
      .then(({ data }) => { if (vigente) setUsuario(data.data) })
      .catch((err) => {
        if (!vigente) return

        // Distinguir "el token no vale" de "no hay red" es lo que mantiene
        // vivo el catálogo del agente. Ese catálogo trabaja sin señal contra
        // IndexedDB, y si cualquier fallo cerrara la sesión, el agente que
        // abre la tablet en una zona sin cobertura quedaría afuera de datos
        // que YA tiene descargados en el dispositivo.
        //
        // Solo un 401 —el servidor respondió y rechazó el token— cierra la
        // sesión. Sin respuesta se conserva y se sigue con lo guardado; si
        // el token de verdad venció, el backend lo rechazará en cuanto haya
        // red y el interceptor mandará a la pantalla de ingreso.
        if (err.response?.status === 401) {
          setTokenSesion(null)
          setUsuario(null)
          return
        }
        setUsuario(datosDelToken(token))
      })
      .finally(() => { if (vigente) setCargando(false) })

    return () => { vigente = false }
  }, [])

  const entrar = useCallback(async (credenciales) => {
    const { data } = await api.post('/auth/login', credenciales)
    setTokenSesion(data.data.token)
    setUsuario(data.data.usuario)
    return data.data.usuario
  }, [])

  const salir = useCallback(() => {
    setTokenSesion(null)
    setUsuario(null)
  }, [])

  return (
    <AuthContext.Provider value={{ usuario, cargando, entrar, salir }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

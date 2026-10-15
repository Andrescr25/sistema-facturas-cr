import { useEffect } from 'react'

/** Solo la lista se renueva; consultar nunca reinicia las 24 h y no se pisan
 * respuestas mientras se edita un detalle. Al volver a la pestaña se refresca.
 */
export function useActualizacionReporteClientes(activo, actualizar) {
  useEffect(() => {
    if (!activo) return
    let enCurso = false
    const consultar = () => {
      if (document.visibilityState !== 'visible' || enCurso) return
      enCurso = true
      Promise.resolve(actualizar()).finally(() => { enCurso = false })
    }
    const reloj = window.setInterval(consultar, 60000)
    document.addEventListener('visibilitychange', consultar)
    window.addEventListener('focus', consultar)
    return () => {
      window.clearInterval(reloj)
      document.removeEventListener('visibilitychange', consultar)
      window.removeEventListener('focus', consultar)
    }
  }, [activo, actualizar])
}

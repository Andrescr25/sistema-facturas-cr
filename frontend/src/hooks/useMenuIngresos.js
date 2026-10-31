import { useEffect, useState } from 'react'

const leer = (clave) => {
  try { return Boolean(clave) && localStorage.getItem(clave) === 'oculto' } catch { return false }
}

/** Preferencia visual del administrador, separada por usuario y navegador. */
export function useMenuIngresos(usuario) {
  const clave = usuario?.esAdmin && usuario.id ? `menu_ingresos_${usuario.id}` : null
  const [preferencia, setPreferencia] = useState(() => ({ clave, oculto: leer(clave) }))
  // Cambiar de sesión no debe heredar la preferencia del administrador anterior.
  const ocultarMisIngresos = Boolean(clave) && (preferencia.clave === clave ? preferencia.oculto : leer(clave))

  useEffect(() => {
    if (!clave) return
    const sincronizar = (e) => {
      if (e.key === clave || e.key === null) setPreferencia({ clave, oculto: leer(clave) })
    }
    window.addEventListener('storage', sincronizar)
    return () => window.removeEventListener('storage', sincronizar)
  }, [clave])

  const alternarMisIngresos = () => {
    if (!clave) return
    const oculto = !ocultarMisIngresos
    try { localStorage.setItem(clave, oculto ? 'oculto' : 'visible') } catch { /* sin almacenamiento, vale hasta recargar */ }
    setPreferencia({ clave, oculto })
  }

  return { ocultarMisIngresos, alternarMisIngresos }
}

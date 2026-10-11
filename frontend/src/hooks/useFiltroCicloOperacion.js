import { useState, useEffect, useMemo } from 'react'
import api from '../services/api'

/** Metadatos por el permiso del módulo; no depender de acceso a Clientes. */
export function useFiltroCicloOperacion(ruta) {
  const [ciclos, setCiclos] = useState([])
  const [rutaId, setRutaId] = useState('')
  const [cicloId, setCicloId] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    api.get(ruta).then(({ data }) => { if (vivo) { setCiclos(data.data || []); setError('') } })
      .catch(() => { if (vivo) setError('No se pudieron consultar las rutas y semanas.') })
    return () => { vivo = false }
  }, [ruta])
  const params = useMemo(() => ({ rutaId, cicloId }), [rutaId, cicloId])
  return { ciclos, rutaId, cicloId, error, params,
    cambiarRuta: valor => { setRutaId(valor); setCicloId('') }, cambiarCiclo: setCicloId }
}

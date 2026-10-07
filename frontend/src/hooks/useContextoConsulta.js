import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Una lectura pertenece a la selección que la inició. Comparar sólo el ID
 * no alcanza al volver A → B → A: la primera respuesta A sigue siendo vieja.
 * La identidad cambia en el render, antes del efecto que inicia otra consulta.
 */
export function useContextoConsulta(clave) {
  const seleccion = useRef({ clave })
  if (seleccion.current.clave !== clave) seleccion.current = { clave }
  const actual = seleccion.current
  const [resultado, setResultado] = useState(null)
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])
  const esActual = useCallback(() => montado.current && seleccion.current === actual, [actual])
  const confirmar = useCallback(() => { if (esActual()) setResultado(actual) }, [actual, esActual])
  return { vigente: resultado === actual, esActual, confirmar }
}

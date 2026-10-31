import { useEffect, useState } from 'react'

/** Una respuesta tardía de otra factura no reemplaza el detalle actual. */
export function useDetalleCobro(facturaId, cargarAbonos, cargarProductos) {
  const [abonos, setAbonos] = useState([])
  const [cargandoAbonos, setCargandoAbonos] = useState(true)
  const [productos, setProductos] = useState([])
  const [cargandoProductos, setCargandoProductos] = useState(true)
  const [errorProductos, setErrorProductos] = useState('')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    setAbonos([])
    setCargandoAbonos(true)
    Promise.resolve().then(() => cargarAbonos(facturaId))
      .then(datos => { if (vigente) setAbonos(datos) })
      .catch(() => { if (vigente) setAbonos([]) })
      .finally(() => { if (vigente) setCargandoAbonos(false) })
    return () => { vigente = false }
  }, [facturaId, cargarAbonos])

  useEffect(() => {
    let vigente = true
    setProductos([])
    setErrorProductos('')
    setCargandoProductos(true)
    Promise.resolve().then(() => cargarProductos ? cargarProductos(facturaId) : [])
      .then(datos => { if (vigente) setProductos(datos) })
      .catch(() => {
        if (vigente) setErrorProductos('No se pudo cargar el detalle de productos.')
      })
      .finally(() => { if (vigente) setCargandoProductos(false) })
    return () => { vigente = false }
  }, [facturaId, cargarProductos, intento])

  return { abonos, cargandoAbonos, productos, cargandoProductos, errorProductos,
    reintentarProductos: () => setIntento(n => n + 1) }
}

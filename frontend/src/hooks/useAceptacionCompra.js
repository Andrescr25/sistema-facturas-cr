import { useState } from 'react'
import useEmisionFactura from './useEmisionFactura'
import { subirOriginal, mensajeError } from '../integrations/hacienda/api'

/**
 * La aceptación ante Hacienda de UNA compra ya registrada, vista desde
 * Revisión de Precios. `buzonId` es el id de la factura del proveedor.
 *
 * La aceptación sale sola al registrar la compra (el servidor la prepara y la
 * envía). Esto es para verla después: cómo va, terminarla si quedó a medias,
 * y subir el XML del proveedor cuando la compra no lo conserva —sin ese
 * archivo no hay nada que aceptar—. Los pasos son los de la factura
 * (useEmisionFactura con `origen: 'compra'`).
 */
export default function useAceptacionCompra(buzonId, { activo = true } = {}) {
  const emision = useEmisionFactura(buzonId, { activo, origen: 'compra' })
  const [subiendo, setSubiendo] = useState(false)
  const [errorXml, setErrorXml] = useState('')

  const subirXml = async (archivo) => {
    if (!archivo || subiendo) return
    setSubiendo(true)
    setErrorXml('')
    try {
      await subirOriginal(buzonId, archivo)
      await emision.releer()
    } catch (e) {
      setErrorXml(mensajeError(e))
    } finally {
      setSubiendo(false)
    }
  }

  return { emision, subirXml, subiendo, errorXml }
}

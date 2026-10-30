import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { tomarUbicacion } from '../services/ubicacionService'

/**
 * Facturar desde Preventa (F3 del agente, 2026-10-29): el agente toca
 * «Facturar» en la visita y llega acá con `?cliente=ID&desde=preventa&ruta=R`.
 * Se elige ese cliente una sola vez, de la copia del catálogo que ya tiene el
 * dispositivo (funciona sin señal), y se ofrece volver a la agenda de su ruta.
 *
 * Vive aparte de useFacturacion, que ya es grande: solo lee la dirección y
 * llama a `seleccionarCliente`, el mismo camino que tocar el cliente a mano.
 *
 * LA VISITA (F4): al llegar se toma el GPS del dispositivo, y mientras el
 * cliente elegido sea el de la visita, `visita` viaja con la factura; el
 * servidor la anota como visita con venta, en la misma transacción.
 */
export function useClienteDesdePreventa({ clientes, clienteSeleccionado, seleccionarCliente }) {
  const [parametros] = useSearchParams()
  const id = Number(parametros.get('cliente')) || null
  const ruta = parametros.get('ruta')
  const [noEsta, setNoEsta] = useState(false)
  const [ubicacion, setUbicacion] = useState(null)
  const hecho = useRef(false)
  const desdePreventa = parametros.get('desde') === 'preventa'

  useEffect(() => {
    if (!desdePreventa || !id) return
    let vivo = true
    tomarUbicacion().then(u => { if (vivo) setUbicacion(u) })
    return () => { vivo = false }
  }, [desdePreventa, id])

  useEffect(() => {
    if (hecho.current || !id || clienteSeleccionado || !clientes?.length) return
    hecho.current = true
    const cliente = clientes.find(c => Number(c.id) === id)
    if (cliente) seleccionarCliente(cliente)
    else setNoEsta(true)
  }, [id, clientes, clienteSeleccionado, seleccionarCliente])

  const esElDeLaVisita = desdePreventa && id && Number(clienteSeleccionado?.id) === id
  const visita = useMemo(() => (esElDeLaVisita ? { desde: 'preventa', ...(ubicacion || { estado: 'no_disponible' }) } : null),
    [esElDeLaVisita, ubicacion])

  return {
    desdePreventa,
    visita,
    volverA: `/preventa${ruta ? `?ruta=${encodeURIComponent(ruta)}` : ''}`,
    clienteNoEsta: noEsta
  }
}

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Facturar desde Preventa (F3 del agente, 2026-10-29): el agente toca
 * «Facturar» en la visita y llega acá con `?cliente=ID&desde=preventa&ruta=R`.
 * Se elige ese cliente una sola vez, de la copia del catálogo que ya tiene el
 * dispositivo (funciona sin señal), y se ofrece volver a la agenda de su ruta.
 *
 * Vive aparte de useFacturacion, que ya es grande: solo lee la dirección y
 * llama a `seleccionarCliente`, el mismo camino que tocar el cliente a mano.
 */
export function useClienteDesdePreventa({ clientes, clienteSeleccionado, seleccionarCliente }) {
  const [parametros] = useSearchParams()
  const id = Number(parametros.get('cliente')) || null
  const ruta = parametros.get('ruta')
  const [noEsta, setNoEsta] = useState(false)
  const hecho = useRef(false)

  useEffect(() => {
    if (hecho.current || !id || clienteSeleccionado || !clientes?.length) return
    hecho.current = true
    const cliente = clientes.find(c => Number(c.id) === id)
    if (cliente) seleccionarCliente(cliente)
    else setNoEsta(true)
  }, [id, clientes, clienteSeleccionado, seleccionarCliente])

  return {
    desdePreventa: parametros.get('desde') === 'preventa',
    volverA: `/preventa${ruta ? `?ruta=${encodeURIComponent(ruta)}` : ''}`,
    clienteNoEsta: noEsta
  }
}

import { useState } from 'react'
import { filasTelefonosProveedor, revisarTelefonosProveedor, MAX_TELEFONOS_PROVEEDOR } from '../utils/telefonosProveedor'

export function useTelefonosProveedor(valorInicial) {
  const [filas, setFilas] = useState(() => {
    const guardadas = filasTelefonosProveedor(valorInicial)
    return guardadas.length ? guardadas : ['']
  })
  const cambiar = (indice, valor) => setFilas(prev => prev.map((fila, i) => i === indice ? valor : fila))
  const agregar = () => setFilas(prev => prev.length < MAX_TELEFONOS_PROVEEDOR ? [...prev, ''] : prev)
  const quitar = indice => setFilas(prev => prev.length === 1 ? [''] : prev.filter((_, i) => i !== indice))
  return { filas, cambiar, agregar, quitar, ...revisarTelefonosProveedor(filas) }
}

import { useEffect, useState, useCallback } from 'react'
import { consultarDescuentoCliente } from '../services/descuentoClienteService'

export default function useDescuentoClienteFacturacion(cliente, online, facturaExistente) {
  const [revision, setRevision] = useState(0)
  const refrescar = useCallback(() => setRevision(v => v + 1), [])
  const [estado, setEstado] = useState({ clienteId: null, porcentaje: 0, costos: new Map(), error: '', cargando: false })
  const id = cliente ? Number(cliente.clienteId ?? cliente.id) : null
  useEffect(() => {
    let vigente = true
    if (!id || facturaExistente) {
      setEstado({ clienteId: id, porcentaje: 0, costos: new Map(), error: '', cargando: false })
      return () => { vigente = false }
    }
    setEstado({ clienteId: id, porcentaje: 0, costos: new Map(), error: '', cargando: true })
    consultarDescuentoCliente(cliente, online).then(data => {
      if (vigente) setEstado({ clienteId: id, porcentaje: data.porcentaje,
        costos: new Map(data.costos.map(p => [Number(p.id), Number(p.costoSinIva)])), error: '', cargando: false })
    }).catch(error => {
      if (vigente) setEstado({ clienteId: id, porcentaje: 0, costos: new Map(),
        error: error.response?.data?.message || error.message, cargando: false })
    })
    return () => { vigente = false }
  }, [id, cliente, online, facturaExistente, revision])
  // En el render del cambio de cliente aún puede quedar la respuesta anterior.
  return estado.clienteId === id ? { ...estado, refrescar } : { refrescar, porcentaje: 0, costos: new Map(), error: '', cargando: Boolean(id) }
}

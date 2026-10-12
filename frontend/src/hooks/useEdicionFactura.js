import { useEffect, useMemo, useState } from 'react'
import { filaDe, lineaDeProducto, clienteDeFicha, faltaParaGuardar, cuerpoDeEdicion } from '../utils/facturaVista'

/**
 * La copia de trabajo de una factura mientras se corrige.
 *
 * Al entrar a editar se copia el documento; al salir, lo copiado se descarta.
 * Cancelar no puede dejar nada a medias. Las cuentas y la forma de lo que se
 * guarda están en utils/facturaVista.js; acá solo vive el estado.
 *
 * `onGuardar` es de quien abrió la factura (useFacturasEmitidas): este gancho
 * no habla con el servidor.
 */
export default function useEdicionFactura({ factura: f, editando, clientes = [], productos = [], onGuardar }) {
  const [lineas, setLineas] = useState([])
  const [cliente, setCliente] = useState(null)
  const [observaciones, setObservaciones] = useState('')
  const [motivo, setMotivo] = useState('')
  const [textoCliente, setTextoCliente] = useState(null)   // null = no se está buscando
  const [textoProducto, setTextoProducto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editando) return
    setLineas(f.lineas.map(filaDe))
    setCliente({ ...f.cliente })
    setObservaciones(f.observaciones || '')
    setMotivo('')
    setTextoCliente(null)
    setTextoProducto('')
    setError('')
    // Al guardar bien la pantalla sale de edición sin desmontarse, y este
    // "guardando" quedaba prendido: la SEGUNDA corrección de la misma factura
    // encontraba «Guardar cambios» apagado y girando para siempre.
    setGuardando(false)
    // A propósito sin f.lineas/f.cliente: se copia al ENTRAR a editar; si la
    // factura se relee mientras tanto, lo que la persona ya escribió no se pisa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, f.id])

  const clientesEncontrados = useMemo(() => {
    const t = (textoCliente || '').trim().toLowerCase()
    if (t.length < 2) return []
    return clientes.filter(c => `${c.name} ${c.identification || ''}`.toLowerCase().includes(t)).slice(0, 6)
  }, [textoCliente, clientes])

  const productosEncontrados = useMemo(() => {
    const t = textoProducto.trim().toLowerCase()
    if (t.length < 2) return []
    return productos.filter(p => `${p.name} ${p.reference || ''}`.toLowerCase().includes(t)).slice(0, 6)
  }, [textoProducto, productos])

  const cambiarLinea = (i, campo, valor) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))

  const quitarLinea = (i) => setLineas(lineas.filter((_, j) => j !== i))

  const agregarProducto = (p) => {
    setLineas([...lineas, lineaDeProducto(p)])
    setTextoProducto('')
  }

  const elegirCliente = (c) => {
    setCliente(clienteDeFicha(c))
    setTextoCliente(null)
  }

  const guardar = async () => {
    setError('')
    const falta = faltaParaGuardar(lineas)
    if (falta) return setError(falta)

    setGuardando(true)
    try {
      await onGuardar(cuerpoDeEdicion({ cliente, lineas, observaciones, motivo }))
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar la factura.')
      setGuardando(false)
    }
  }

  return {
    lineas, cliente, guardando, error,
    observaciones, setObservaciones, motivo, setMotivo,
    textoCliente, setTextoCliente, clientesEncontrados, elegirCliente,
    textoProducto, setTextoProducto, productosEncontrados, agregarProducto,
    cambiarLinea, quitarLinea, guardar
  }
}

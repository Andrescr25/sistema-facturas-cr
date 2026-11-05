import { AlertCircle } from 'lucide-react'
import LineaCompraRegistrada from './LineaCompraRegistrada'
import ModalCorregirProducto from './ModalCorregirProducto'
import { useCompraRegistrada } from '../../hooks/useCompraRegistrada'
import { useAuth } from '../../contexts/AuthContext'
import { puedeAccion } from '../../utils/modulos'
import { avisosDeLinea } from '../../utils/compraRegistrada'

/**
 * Una factura del buzón cuya compra ya se registró: cada línea como la mandó
 * el proveedor y a qué producto nuestro quedó (2026-11-05). El usuario: «un
 * empleado puede enlazar un producto del proveedor con otro nuestro mal; sale
 * en Reporte Clientes como que no ingresó». El administrador lo corrige acá.
 */
export default function CompraRegistrada({ facturaId, avisar }) {
  const { usuario } = useAuth()
  const puedeCorregir = puedeAccion(usuario, 'corregir-compra')
  const c = useCompraRegistrada(facturaId, avisar)

  if (c.cargando && !c.datos) {
    return <div className="py-16 text-center"><div className="spinner mx-auto mb-3" /><p className="text-neutro-500">Cargando la compra…</p></div>
  }
  if (c.error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-peligro-200 bg-peligro-50 p-3 font-semibold text-peligro-800">
        <AlertCircle size={18} className="shrink-0" /> {c.error}
      </div>
    )
  }
  const lineas = c.datos?.lineas || []
  const conAviso = lineas.filter((l) => avisosDeLinea(l).some((a) => a.tono === 'alerta')).length
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-neutro-900">Cómo quedó la compra</h3>
        <p className="text-sm text-neutro-500">
          {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}
          {conAviso > 0 && <span className="font-semibold text-alerta-700"> · {conAviso} para revisar</span>}
        </p>
      </div>
      {lineas.map((l) => (
        <LineaCompraRegistrada key={l.id} linea={l} puedeCorregir={puedeCorregir && !l.entregas.length} ocupado={c.guardando}
          onCorregir={c.empezar} onDejarRelacion={c.dejarRelacion} />
      ))}
      {c.corrigiendo && (
        <ModalCorregirProducto
          linea={c.corrigiendo}
          elegido={c.elegido}
          onElegir={c.setElegido}
          buscador={c.buscador}
          guardando={c.guardando}
          onConfirmar={c.confirmar}
          onCerrar={c.cerrar}
        />
      )}
    </section>
  )
}

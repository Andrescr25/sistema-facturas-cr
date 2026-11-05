import { AlertTriangle, ArrowRight, Info, Link2, Package, PencilLine } from 'lucide-react'
import Boton from '../ui/Boton'
import { colonesExacto } from '../../utils/colones'
import { urlArchivo } from '../../utils/urlArchivo'
import { avisosDeLinea, relacionDistinta } from '../../utils/compraRegistrada'

/**
 * Una línea de una compra ya registrada: cómo la llamó el proveedor y a qué
 * producto nuestro quedó (2026-11-05). Lo que manda para Reporte Clientes,
 * el inventario y el costo es lo de la derecha.
 */
export default function LineaCompraRegistrada({ linea, puedeCorregir, ocupado, onCorregir, onDejarRelacion }) {
  const p = linea.producto
  const avisos = avisosDeLinea(linea)
  return (
    <article className="rounded-2xl border border-neutro-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-400">Del proveedor</p>
          <p className="font-semibold leading-snug text-neutro-900">{linea.descripcion}</p>
          <p className="mt-0.5 text-sm text-neutro-500">
            <span className="font-mono">{linea.codigoProveedor || 'sin código'}</span> · {linea.cantidad} {linea.unidad || 'unid'}
          </p>
        </div>
        <ArrowRight size={20} className="hidden text-neutro-300 md:block" aria-hidden="true" />
        <div className="flex min-w-0 items-center gap-3">
          {p?.imagenUrl
            ? <img src={urlArchivo(p.imagenUrl)} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-neutro-100 bg-white object-contain" />
            : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-neutro-50"><Package size={22} className="text-neutro-300" /></div>}
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-400">Nuestro producto</p>
            <p className="font-semibold leading-snug text-neutro-900">{p ? p.nombre : 'Sin producto'}</p>
            <p className="mt-0.5 text-sm text-neutro-500">
              {p?.referencia ? `Ref. ${p.referencia} · ` : ''}entraron {linea.cantidadPropia} · costo {colonesExacto(linea.costoUnitario)} c/u
            </p>
          </div>
        </div>
      </div>

      {avisos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {avisos.map((a) => (
            <li key={a.texto} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${a.tono === 'alerta' ? 'bg-alerta-50 text-alerta-800' : 'bg-neutro-50 text-neutro-600'}`}>
              {a.tono === 'alerta' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
              {a.texto}
            </li>
          ))}
        </ul>
      )}

      {puedeCorregir && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {/* La compra está bien y la relación mal: se deja la relación como la compra. */}
          {relacionDistinta(linea) && (
            <Boton variante="secundario" icono={Link2} disabled={ocupado} onClick={() => onDejarRelacion(linea)}>Dejar la relación como esta compra</Boton>
          )}
          <Boton variante="secundario" icono={PencilLine} disabled={ocupado} onClick={() => onCorregir(linea)}>Corregir producto</Boton>
        </div>
      )}
    </article>
  )
}

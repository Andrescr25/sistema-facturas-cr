import { textoCiclo } from '../SelectorCiclo'

/** Desglose = suma exacta de los faltantes registrados, sin cobertura supuesta. */
export default function ProcedenciaFaltante({ producto }) {
  const grupos = new Map()
  for (const o of producto.origenes || []) {
    const key = o.cicloId || 'sin-ciclo'
    if (!grupos.has(key)) grupos.set(key, { origen: o, cantidad: 0, lineas: [] })
    const g = grupos.get(key); g.cantidad += Number(o.cantidad); g.lineas.push(o)
  }
  return <details className="mt-2 text-sm">
    <summary className="cursor-pointer font-semibold text-primario-700">Procedencia del faltante · {producto.cantidad_faltante} unidades</summary>
    <div className="mt-2 space-y-2">
      {[...grupos.values()].map(g => <div key={g.origen.cicloId || 'sin-ciclo'} className="rounded-lg bg-neutro-50 p-3">
        <p className="break-words font-semibold">{textoCiclo(g.origen.cicloId ? { rutaNombre: g.origen.rutaNombre, semana: g.origen.semana } : null)} · {g.cantidad} unidades</p>
        {g.lineas.map(o => <p key={o.faltanteId} className="mt-1 break-words text-xs text-neutro-600">
          {o.orden ? `Parada ${o.orden} · ` : ''}{o.cliente} · Factura {o.factura} · {o.cantidad} unidades{o.anticipado ? ' · Pedido anticipado' : ''}
        </p>)}
      </div>)}
    </div>
  </details>
}

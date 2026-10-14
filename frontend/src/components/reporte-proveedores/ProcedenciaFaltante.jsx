/** Faltantes originales por factura/cliente, sin agruparlos por semanas. */
export default function ProcedenciaFaltante({ producto }) {
  return <details className="mt-2 text-sm">
    <summary className="cursor-pointer font-semibold text-primario-700">Procedencia del faltante · {producto.cantidad_faltante} unidades</summary>
    <div className="mt-2 space-y-2">
      {(producto.origenes || []).map(o => <p key={o.faltanteId} className="rounded-lg bg-neutro-50 p-3 break-words text-xs text-neutro-600">
        {o.cliente} · Factura {o.factura} · {o.cantidad} unidades
      </p>)}
    </div>
  </details>
}

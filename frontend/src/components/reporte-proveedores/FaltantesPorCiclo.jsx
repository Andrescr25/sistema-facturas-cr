import ProcedenciaFaltante from './ProcedenciaFaltante'

/** El borrador anterior es global: no aplicarlo a una selección de semanas. */
export default function FaltantesPorCiclo({ proveedor, onVolver, cicloId, onPrepararOrden }) {
  return <div className="space-y-4">
    <button type="button" onClick={onVolver} className="btn btn-outline">Volver a proveedores</button>
    <div className="card p-5">
      <h2 className="break-words text-2xl font-bold">{proveedor.nombre}</h2>
      <p className="mt-2 text-neutro-600">{proveedor.total_cantidad} unidades faltantes registradas · {proveedor.total_productos} productos</p>
      <div className="mt-3 space-y-2">
        <button type="button" disabled={!cicloId} className="btn btn-primary" onClick={onPrepararOrden}>Preparar orden de este ciclo</button>
        {!cicloId&&<p className="text-sm text-neutro-600">Seleccioná una semana concreta o Sin ciclo para preparar la orden.</p>}
      </div>
    </div>
    {proveedor.productos_faltantes.map(p => <div key={p.producto_id} className="card p-5">
      <h3 className="break-words text-lg font-bold">{p.nombre}</h3>
      <p className="text-sm text-neutro-500">Código {p.codigo || `P-${p.producto_id}`} · {p.cantidad_faltante} unidades</p>
      <ProcedenciaFaltante producto={p} />
    </div>)}
  </div>
}

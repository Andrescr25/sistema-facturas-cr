import ProcedenciaFaltante from './ProcedenciaFaltante'

/** El borrador anterior es global: no aplicarlo a una selección de semanas. */
export default function FaltantesPorCiclo({ proveedor, onVolver }) {
  return <div className="space-y-4">
    <button type="button" onClick={onVolver} className="btn btn-outline">Volver a proveedores</button>
    <div className="card p-5">
      <h2 className="break-words text-2xl font-bold">{proveedor.nombre}</h2>
      <p className="mt-2 text-neutro-600">{proveedor.total_cantidad} unidades faltantes registradas · {proveedor.total_productos} productos</p>
      <p className="mt-3 rounded-lg bg-nota-50 p-3 text-sm text-nota-800">Consulta de faltantes por ruta y semana. La creación de órdenes de compra por ciclo está pendiente.</p>
    </div>
    {proveedor.productos_faltantes.map(p => <div key={p.producto_id} className="card p-5">
      <h3 className="break-words text-lg font-bold">{p.nombre}</h3>
      <p className="text-sm text-neutro-500">Código {p.codigo || `P-${p.producto_id}`} · {p.cantidad_faltante} unidades</p>
      <ProcedenciaFaltante producto={p} />
    </div>)}
  </div>
}

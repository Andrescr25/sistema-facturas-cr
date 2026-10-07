import ProcedenciaFaltante from './ProcedenciaFaltante'
import NotasDelProducto from './NotasDelProducto'
import PanelNotasProveedor from './PanelNotasProveedor'

/** El borrador anterior es global: no aplicarlo a una selección de semanas. */
export default function FaltantesPorCiclo({ proveedor, onVolver, cicloId, onPrepararOrden, notasPorProducto, cargandoNotas, productosSeleccionados, onSeleccionarProducto, onAsignar }) {
  return <div className="space-y-4">
    <button type="button" onClick={onVolver} className="btn btn-outline">Volver a proveedores</button>
    <div className="card p-5">
      <h2 className="break-words text-2xl font-bold">{proveedor.nombre}</h2>
      <p className="mt-2 text-neutro-600">{proveedor.total_cantidad} unidades faltantes registradas · {proveedor.total_productos} productos</p>
      <div className="mt-3 space-y-2">
        <button type="button" disabled={!cicloId} className="btn btn-primary" onClick={onPrepararOrden}>Preparar orden de este ciclo</button>
        <button type="button" disabled={!cicloId || !productosSeleccionados.size} className="btn btn-outline" onClick={onAsignar}>Asignar proveedor en este ciclo</button>
        {cicloId && <p className="text-sm text-neutro-600">La asignación cambia solo los faltantes pendientes de esta semana. Las órdenes ya enviadas conservan su proveedor y cantidades.</p>}
        {!cicloId&&<p className="text-sm text-neutro-600">Seleccioná una semana concreta o Sin ciclo para preparar la orden.</p>}
      </div>
    </div>
    {/* La variante pedida pertenece a la misma semana que su faltante; sin
        estas notas una compra por ciclo perdería la información del cliente. */}
    <PanelNotasProveedor productos={proveedor.productos_faltantes} notasPorProducto={notasPorProducto} cargando={cargandoNotas} />
    {proveedor.productos_faltantes.map(p => <div key={p.producto_id} className="card p-5">
      <label className="flex items-center gap-3 min-h-11 text-sm font-semibold"><input type="checkbox" aria-label={`Seleccionar ${p.nombre} para asignar proveedor`} disabled={!cicloId} checked={productosSeleccionados.has(p.codigo)} onChange={() => onSeleccionarProducto(p.codigo)} />Seleccionar para asignar proveedor</label>
      <h3 className="break-words text-lg font-bold">{p.nombre}</h3>
      <p className="text-sm text-neutro-500">Código {p.codigo || `P-${p.producto_id}`} · {p.cantidad_faltante} unidades</p>
      <ProcedenciaFaltante producto={p} />
      <NotasDelProducto notas={notasPorProducto?.[String(p.producto_id)]} />
    </div>)}
  </div>
}

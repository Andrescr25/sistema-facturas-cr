import Boton from '../ui/Boton'
import PanelSeccion from '../ui/PanelSeccion'
import ProcedenciaFaltante from './ProcedenciaFaltante'
import NotasDelProducto from './NotasDelProducto'
import PanelNotasProveedor from './PanelNotasProveedor'

/** El borrador anterior es global: no aplicarlo a una selección de semanas. */
export default function FaltantesPorCiclo({ proveedor, onVolver, cicloId, onPrepararOrden, notasPorProducto, cargandoNotas, productosSeleccionados, onSeleccionarProducto, onAsignar }) {
  return <div className="space-y-4">
    <Boton variante="fantasma" tamano="lg" onClick={onVolver}>← Volver a proveedores</Boton>
    <div className="card p-5">
      <h2 className="break-words text-2xl font-bold">{proveedor.nombre}</h2>
      <p className="mt-2 text-neutro-600">{proveedor.total_cantidad} unidades faltantes registradas · {proveedor.total_productos} productos</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!cicloId} className="btn btn-primary min-h-12" onClick={onPrepararOrden}>Preparar orden de este ciclo</button>
        <button type="button" disabled={!cicloId || !productosSeleccionados.size} className="btn btn-outline min-h-12" onClick={onAsignar}>Asignar proveedor en este ciclo</button>
        {cicloId && <p className="text-sm text-neutro-600">La asignación cambia solo los faltantes pendientes de esta semana. Las órdenes ya enviadas conservan su proveedor y cantidades.</p>}
        {!cicloId&&<p className="text-sm text-neutro-600">Seleccioná una semana concreta o Sin ciclo para preparar la orden.</p>}
      </div>
    </div>
    {/* La variante pedida pertenece a la misma semana que su faltante; sin
        estas notas una compra por ciclo perdería la información del cliente. */}
    <PanelNotasProveedor productos={proveedor.productos_faltantes} notasPorProducto={notasPorProducto} cargando={cargandoNotas} />
    <div className="grid gap-5 xl:grid-cols-2">
    {proveedor.productos_faltantes.map(p => <PanelSeccion key={p.producto_id} titulo={p.nombre} cuerpoClassName="p-5 space-y-3">
      <label className="flex items-center gap-3 min-h-11 text-sm font-semibold"><input type="checkbox" aria-label={`Seleccionar ${p.nombre} para asignar proveedor`} disabled={!cicloId} checked={productosSeleccionados.has(p.codigo)} onChange={() => onSeleccionarProducto(p.codigo)} />Seleccionar para asignar proveedor</label>
      <p className="text-sm text-neutro-500">Código {p.codigo || `P-${p.producto_id}`} · {p.cantidad_faltante} unidades</p>
      <ProcedenciaFaltante producto={p} />
      <NotasDelProducto notas={notasPorProducto?.[String(p.producto_id)]} />
    </PanelSeccion>)}
    </div>
  </div>
}

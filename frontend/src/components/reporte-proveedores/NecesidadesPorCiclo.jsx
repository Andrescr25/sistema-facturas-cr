import {useEffect,useState} from 'react'
import {useNecesidadesCiclo} from '../../hooks/useNecesidadesCiclo'
import {textoCiclo} from '../SelectorCiclo'
const numero=v=>v==null?'Por revisar':Number(v).toLocaleString('es-CR',{maximumFractionDigits:6})
const Metric=({nombre,valor,texto})=><div className="rounded-xl bg-neutro-50 p-3"><p className="text-sm text-neutro-600">{nombre}</p><p className="text-xl font-bold break-words">{texto??numero(valor)}</p></div>
const cantidadStock=p=>p.stock.inventariable?p.stock.existencia:null
function Origen({o}){
 return <article className="rounded-xl border p-4 space-y-2" aria-label={`${o.tipo} ${o.documentoId}`}>
  <p className="font-bold break-words">{o.tipo==='pedido'?`Pedido #${o.pedidoId} · por facturar`:o.tipo==='faltante'?`Faltante #${o.documentoId} · factura ${o.numero}`:`Factura ${o.numero}`}</p>
  <p className="break-words">{o.clienteNombre||'Cliente sin ficha'}{o.ciclo?` · Parada ${o.ciclo.orden}`:''}</p>
  <p className="text-sm break-words">{o.ciclo?textoCiclo(o.ciclo):'Sin ciclo: semana no asignada'}{o.anticipado?' · Preventa anticipada':''}</p>
  {o.pedidoId&&o.tipo==='factura'&&<p className="text-sm">Pedido de origen #{o.pedidoId}</p>}
  {o.tipo==='faltante'?<>
   <p>Registrado: {numero(o.cantidad)} · Cubierto: {numero(o.cubierta)} · Sin cobertura: {numero(o.sinCobertura)}</p>
   {Number(o.coberturaEnExceso)>0&&<p className="text-alerta-800">El faltante cambió; revisá la cobertura asignada a las órdenes.</p>}
   {o.ordenes.map(c=><p key={c.ordenId} className="text-sm break-words">OC-{c.ordenId} · {c.proveedor} · {c.estado.replaceAll('_',' ')}{['incierto','enviando'].includes(c.envioEstado)?' · Envío por verificar':''}: asignado {numero(c.cantidad)}, cubierto {numero(c.cubierta)}, recibido {numero(c.recibida)}</p>)}
  </>:<>
   <p>Cantidad del documento: {numero(o.cantidad)} · Pendiente: {numero(o.pendiente)}</p>
   {o.tipo==='factura'&&!o.requiereRevision&&<p className="text-sm">Entregado: {numero(o.entregada)} · En camión: {numero(o.enCamion)}</p>}
   {o.requiereRevision&&<p className="text-alerta-800">{o.historicoSinEntrega?'Documento histórico sin registro físico de entrega; pendiente de revisión manual.':'Cambió la factura o la revisión de bodega. Revisá su registro en Carga y Entregas.'}</p>}
  </>}
 </article>
}
export default function NecesidadesPorCiclo({filtro}){
 const b=useNecesidadesCiclo(filtro),[seleccion,setSeleccion]=useState(null),d=b.datos
 useEffect(()=>{setSeleccion(null)},[b.actual])
 const producto=d?.productos.find(p=>p.productoId===seleccion)
 return <section className="space-y-4" aria-label="Necesidades y cobertura por semana">
  <header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-bold">Necesidades y cobertura</h2><p className="mt-2 text-neutro-600">Pedidos, bodega y compras de la semana elegida.</p></div>
   <button type="button" className="btn btn-outline min-h-11" onClick={b.actualizar} disabled={b.cargando||!filtro.cicloId}>Actualizar necesidades</button></header>
  {!filtro.cicloId?<p className="card p-5">Elegí una semana o Sin ciclo para revisar sus necesidades.</p>:<>
   <label className="block font-semibold">Buscar producto o código<input aria-label="Buscar producto en necesidades" className="mt-2 min-h-11 w-full rounded-xl border-2 p-3" value={b.q} maxLength={200} onChange={e=>b.setQ(e.target.value)}/></label>
   {b.cargando&&<p role="status">Consultando necesidades de la semana…</p>}
   {b.error&&<p role="alert" className="rounded-xl bg-peligro-50 p-4 text-peligro-800">{b.error}</p>}
   {d&&<>
    <p className="font-semibold break-words">{d.ciclo?textoCiclo(d.ciclo):'Sin ciclo: documentos sin semana asignada'}</p>
    {d.ciclo&&['cerrado','cancelado'].includes(d.ciclo.estado)&&<p className="rounded-xl bg-alerta-50 p-4">Semana {d.ciclo.estado==='cerrado'?'cerrada':'cancelada'}. Se conserva para consulta.</p>}
    <p>{d.resumen.productos} {d.resumen.productos===1?'producto':'productos'} · {d.resumen.pedidosPorFacturar} {d.resumen.pedidosPorFacturar===1?'pedido':'pedidos'} por facturar · {d.resumen.documentosPorRevisar} {d.resumen.documentosPorRevisar===1?'documento':'documentos'} por revisar</p>
    <div className="rounded-xl bg-nota-50 p-4 text-sm space-y-2">
     <p>El stock es general. Las facturas ya lo descuentan; el compromiso pendiente de entrega no se resta otra vez ni se reserva automáticamente para una semana.</p>
     <p>Sin cobertura corresponde a faltantes registrados en bodega, después de lo apartado en órdenes. Los pedidos por facturar todavía requieren revisión; el stock provisional no confirma mercadería física.</p>
    </div>
    {producto?<>
     <button type="button" className="btn btn-outline min-h-11" onClick={()=>setSeleccion(null)}>Volver a productos</button>
     <article className="card p-5 space-y-5" aria-label={`Detalle de necesidades de ${producto.nombre}`}>
      <h3 className="text-2xl font-bold break-words">{producto.nombre}</h3><p>{producto.codigo||`P-${producto.productoId}`}</p>
      <h4 className="font-bold">Stock y pedidos</h4>
      <p className="text-sm">{!producto.stock.inventariable?'Este producto no lleva stock.':producto.stock.conteoConfirmado?'Stock con conteo registrado.':'Stock provisional; conteo físico pendiente.'}</p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
       {producto.stock.inventariable&&<Metric nombre="Stock general registrado" valor={cantidadStock(producto)}/>}
       <Metric nombre="Requerido por atender" valor={producto.cantidades.requerido}/><Metric nombre="Comprometido por entregar" valor={producto.cantidades.comprometido}/>
       <Metric nombre="Pedidos por facturar" valor={producto.cantidades.porFacturar}/><Metric nombre="Entregado verificado" valor={producto.cantidades.entregado}/><Metric nombre="En camión verificado" valor={producto.cantidades.enCamion}/>
      </div>
      {producto.requiereRevision&&<p className="rounded-xl bg-alerta-50 p-4">Hay documentos sin entrega verificada o facturas modificadas. Requerido y compromiso quedan por revisar; cantidades verificadas de los demás documentos: {numero(producto.cantidades.requeridoVerificado)}.</p>}
      <h4 className="font-bold">Bodega y compras</h4><p className="text-sm">Todas las cantidades corresponden a unidades propias del producto. Solicitado y recibido cuentan cada línea de compra una vez; su asignación a cada faltante se muestra abajo.</p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
       {Object.entries({faltanteRegistrado:'Faltante registrado',reservadaBorrador:'Apartado en borradores',envioPorVerificar:'Apartado, envío por verificar',solicitado:'Solicitado confirmado',pendienteRecibir:'Pendiente de recibir',recibido:'Recibido físicamente',sinCobertura:'Faltante sin cobertura'}).map(([k,n])=><Metric key={k} nombre={n} valor={producto.cantidades[k]}/>)}
      </div>
      <h4 className="font-bold">Procedencia de los pedidos y faltantes</h4>{producto.origenes.map(o=><Origen key={`${o.tipo}-${o.documentoId}`} o={o}/>)}
      <h4 className="font-bold">Órdenes del producto</h4>
      {!producto.compras.length&&<p>No hay órdenes de este producto en la selección.</p>}
      {producto.compras.map(o=><article key={o.ordenId} className="rounded-xl border p-4 space-y-2">
       <p className="font-bold break-words">OC-{o.ordenId} · {o.proveedor} · {o.estado.replaceAll('_',' ')}{o.archivada?' · Archivada':''}</p>
       {['incierto','enviando'].includes(o.envioEstado)&&<p className="text-alerta-800">Envío por verificar; sus cantidades permanecen apartadas.</p>}
       <p>{o.cantidadProveedor} unidades del proveedor × {numero(o.factorConversion)} = {numero(o.cantidad)} unidades propias</p>
       <p>Recibido: {numero(o.recibida)} · Pendiente: {numero(o.pendiente)}</p>
      </article>)}
     </article>
    </>:<>
     {!d.productos.length&&!d.sinProducto.length&&<p className="card p-5">No hay necesidades ni órdenes en esta selección.</p>}
     {d.productos.map(p=><article key={p.productoId} className="card p-5 space-y-3">
      <h3 className="text-xl font-bold break-words">{p.nombre}</h3><p className="text-sm">{p.codigo||`P-${p.productoId}`}{!p.activo?' · Producto inactivo':''}</p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4"><Metric nombre="Stock general registrado" valor={cantidadStock(p)} texto={p.stock.inventariable?undefined:'No lleva stock'}/><Metric nombre="Requerido por atender" valor={p.cantidades.requerido}/><Metric nombre="Faltante registrado" valor={p.cantidades.faltanteRegistrado}/><Metric nombre="Sin cobertura" valor={p.cantidades.sinCobertura}/></div>
      {p.stock.inventariable&&!p.stock.conteoConfirmado&&<p className="text-sm text-alerta-800">Stock provisional; conteo físico pendiente.</p>}
      {p.requiereRevision&&<p className="text-alerta-800">Hay documentos pendientes de revisión física o histórica.</p>}
      <button type="button" className="btn btn-outline min-h-11" onClick={()=>setSeleccion(p.productoId)}>Ver procedencia de {p.nombre}</button>
     </article>)}
    </>}
    {d.paginacion.sinProducto>0&&<details className="rounded-xl bg-alerta-50 p-4"><summary className="cursor-pointer font-bold">Productos sin relación propia ({d.paginacion.sinProducto})</summary><p className="my-3 text-sm">Conservan su documento y cliente. Revisá la relación del producto; no se suman a otra ficha por nombre o código.</p>
     {d.sinProducto.map((o,i)=><div key={i} className="space-y-2 my-3"><p className="font-semibold">{o.nombre||'Producto pendiente de relacionar'} · {o.codigo}</p><Origen o={o}/></div>)}
    </details>}
    {!producto&&d.paginacion.paginas>1&&<nav className="flex flex-wrap items-center gap-3" aria-label="Páginas de necesidades"><button type="button" className="btn btn-outline min-h-11" disabled={b.pagina===1||b.cargando} onClick={()=>b.setPagina(b.pagina-1)}>Anterior</button><p>Página {b.pagina} de {d.paginacion.paginas}</p><button type="button" className="btn btn-outline min-h-11" disabled={b.pagina>=d.paginacion.paginas||b.cargando} onClick={()=>b.setPagina(b.pagina+1)}>Siguiente</button></nav>}
   </>}
  </>}
 </section>
}

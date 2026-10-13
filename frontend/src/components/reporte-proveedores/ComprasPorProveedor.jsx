import { useState } from 'react'
import { Truck, RefreshCw, Search } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import PanelSeccion from '../ui/PanelSeccion'
import { textoCiclo } from '../SelectorCiclo'
import { useComprasProveedores } from '../../hooks/useComprasProveedores'
import { estadoOrdenCompra, grupoOrdenCompra } from '../../utils/ordenCompraTexto'
import { fechaHoraEnCostaRica } from '../../utils/fechaCR'

const numero=n=>Number(n).toLocaleString('es-CR',{maximumFractionDigits:6})
const GRUPOS=[['pendientes','Órdenes pendientes de envío'],['verificar','Envíos por verificar'],['enviadas','Órdenes enviadas']]

export default function ComprasPorProveedor({filtro,onAbrirOrden,onAsignar}) {
  const compras=useComprasProveedores(filtro)
  const [busqueda,setBusqueda]=useState(''),[elegido,setElegido]=useState(null)
  const proveedor=compras.proveedores.find(p=>p.clave===elegido)
  const visibles=compras.proveedores.filter(p=>p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  return <div className="space-y-5">
    <div className="card p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold">Compras por proveedor</h2><p className="mt-2 text-sm text-neutro-600">Cada envío conserva su pedido. Los faltantes posteriores van a otra orden.</p></div>
        <Boton variante="secundario" disabled={compras.preparando} onClick={compras.actualizar}><RefreshCw size={18}/>Actualizar</Boton>
      </div>
      {!elegido&&<label className="block text-sm font-semibold">Buscar proveedor
        <div className="relative mt-2"><Search size={18} className="absolute left-3 top-4 text-neutro-400"/>
          <input type="search" className="input min-h-12 w-full pl-10" aria-label="Buscar compras del proveedor" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
        </div>
      </label>}
    </div>
    {compras.error&&<div role="alert" className="card p-5 text-peligro-700">{compras.error}<Boton variante="fantasma" onClick={compras.actualizar}>Reintentar</Boton></div>}
    {compras.cargando&&<p role="status">Consultando faltantes y órdenes…</p>}
    {!compras.cargando&&!compras.error&&(proveedor?<>
      <Boton variante="fantasma" onClick={()=>setElegido(null)}>← Volver a proveedores</Boton>
      <div className="card p-5"><h3 className="text-2xl font-bold break-words">{proveedor.nombre}</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          {proveedor.id&&proveedor.activo!==false&&proveedor.productos.some(p=>p.sinOrden>0)&&<Boton cargando={compras.preparando} onClick={()=>compras.preparar(proveedor.id)}>Preparar faltantes sin orden</Boton>}
          <Boton variante="secundario" onClick={onAsignar}>Asignar proveedores y revisar procedencia</Boton>
        </div>
        <p className="mt-3 text-sm text-neutro-600">Los nuevos faltantes de bodega se preparan automáticamente cuando tienen proveedor. Este botón prepara los pendientes anteriores o liberados al cancelar.</p>
        {proveedor.activo===false&&<p className="mt-3 text-alerta-800">Este proveedor está inactivo. Reactivalo en su ficha antes de preparar nuevas órdenes.</p>}
        {!proveedor.id&&<p className="mt-3 text-alerta-800">Asigná una ficha de proveedor para preparar estos productos.</p>}
      </div>
      <PanelSeccion titulo="Faltantes actuales" cuerpoClassName="p-5 space-y-3">
        {!proveedor.productos.length&&<p className="text-neutro-500">No hay faltantes registrados en esta selección.</p>}
        {proveedor.productos.map(p=><div key={p.id} className="rounded-xl border border-neutro-200 p-4">
          <h4 className="font-bold break-words">{p.nombre}</h4>
          <p className="mt-2 text-sm">Necesario: {numero(p.necesarias)} unidades · Sin orden: <strong>{numero(p.sinOrden)}</strong></p>
          {p.porVerificar>0&&<p className="mt-1 text-sm text-alerta-800">Envío por verificar: {numero(p.porVerificar)} unidades apartadas.</p>}
          <p className="mt-1 text-sm text-neutro-600">En órdenes pendientes de envío: {numero(p.pendienteEnviar)} · Pendiente de recibir: {numero(p.pendienteRecibir)} · Recibido: {numero(p.recibida)}</p>
        </div>)}
      </PanelSeccion>
      {GRUPOS.map(([grupo,titulo])=>{
        const ordenes=proveedor.ordenes.filter(o=>grupoOrdenCompra(o)===grupo)
        if(!ordenes.length&&grupo==='verificar')return null
        return <PanelSeccion key={grupo} titulo={titulo} cuerpoClassName="p-5 space-y-3">
          {!ordenes.length&&<p className="text-neutro-500">No hay órdenes en este estado.</p>}
          {ordenes.map(o=><button type="button" key={o.id} onClick={()=>onAbrirOrden(o.id)} aria-label={`Abrir ${o.referencia} de ${proveedor.nombre}`} className="w-full rounded-xl border border-neutro-200 p-4 text-left hover:border-primario-300">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{o.referencia}</strong><Insignia tono={grupo==='enviadas'?'exito':'alerta'}>{estadoOrdenCompra(o)}</Insignia></div>
            <p className="mt-2 text-sm break-words">{textoCiclo(o.ciclo)}</p>
            <p className="mt-2 text-sm">Creada el {fechaHoraEnCostaRica(o.creado_en)} · {o.productos} productos</p>
            {o.enviada_en&&<p className="mt-1 text-sm text-neutro-600">Enviada el {fechaHoraEnCostaRica(o.enviada_en)} · Cantidades originales conservadas</p>}
          </button>)}
        </PanelSeccion>
      })}
    </>:<>
      {!visibles.length&&<p className="card p-5 text-neutro-500">No hay proveedores con faltantes u órdenes en esta selección.</p>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visibles.map(p=><button type="button" key={p.clave} onClick={()=>setElegido(p.clave)} aria-label={`Ver compras de ${p.nombre}`} className="card min-w-0 p-5 text-left hover:border-primario-300">
        <Truck size={26} className="text-primario-800"/><h3 className="mt-3 text-lg font-bold break-words">{p.nombre}</h3>
        <p className="mt-3 text-sm">{p.productos.length} productos con faltantes · {numero(p.productos.reduce((s,p)=>s+p.sinOrden,0))} unidades sin orden</p>
        <p className="mt-2 text-sm text-neutro-600">{p.ordenes.filter(o=>grupoOrdenCompra(o)==='pendientes').length} órdenes por enviar · {p.ordenes.filter(o=>grupoOrdenCompra(o)==='enviadas').length} enviadas</p>
        <span className="mt-4 block font-bold text-primario-700">Ver productos y órdenes →</span>
      </button>)}</div>
    </>)}
  </div>
}

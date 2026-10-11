import { RefreshCw, Package, Check, Truck, Boxes, Search, ArrowRight } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import TarjetasResumen from '../pagos/TarjetasResumen'

/** La búsqueda vive en la página: volver de una ficha conserva el filtro y el Excel. */
export default function ListaProveedores({ proveedores, pedidosEnviados, resumen, fechaInicio, setFechaInicio, onRefresh, onSelectProveedor, proveedorQuery, setProveedorQuery, consultaCiclo = false }) {
  const visibles = proveedores.filter(p => p.nombre.toLowerCase().includes(proveedorQuery.toLowerCase()))
  const cuandoSeEnvio = fecha => new Date(fecha).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })
  return <div className="space-y-5">
    <div><h2 className="text-xl font-bold text-neutro-900">Faltantes por proveedor</h2><p className="mt-1 text-sm text-neutro-500">Abrí un proveedor para revisar productos y preparar su compra.</p></div>
    {resumen && <TarjetasResumen compacta tarjetas={[
      {clave:'proveedores',titulo:'Proveedores',valor:proveedores.length,icono:Truck},
      {clave:'productos',titulo:'Productos',valor:resumen.total_productos_faltantes,icono:Package},
      {clave:'unidades',titulo:'Unidades',valor:resumen.total_cantidad_faltante,icono:Boxes}
    ]}/>}
    <div className="rounded-2xl border border-neutro-200 bg-white p-5">
      <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <label className="block text-sm font-semibold text-neutro-700">Buscar proveedor
          <div className="relative mt-2"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400"/>
            <input type="search" aria-label="Buscar proveedor con faltantes" value={proveedorQuery} onChange={e=>setProveedorQuery(e.target.value)} placeholder="Nombre del proveedor" className="input min-h-12 w-full pl-10"/>
          </div>
        </label>
        <label className="block text-sm font-semibold text-neutro-700">Desde la fecha
          <input type="date" aria-label="Fecha inicial de faltantes" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)} className="input mt-2 min-h-12 w-full"/>
        </label>
        <Boton variante="secundario" tamano="lg" onClick={onRefresh}><RefreshCw size={18}/>Actualizar</Boton>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutro-100 pt-4 text-sm text-neutro-500">
        <p>{visibles.length} {visibles.length===1?'proveedor':'proveedores'} en la lista · Resumen del reporte completo arriba</p>
        {(proveedorQuery||fechaInicio)&&<Boton variante="fantasma" onClick={()=>{setProveedorQuery('');setFechaInicio('')}}>Limpiar filtros</Boton>}
      </div>
    </div>
    {!visibles.length ? <div className="rounded-2xl border border-neutro-200 bg-white px-6 py-12 text-center">
      <Package size={48} className="mx-auto mb-4 text-neutro-300"/>
      <h3 className="text-xl font-bold text-neutro-900">{proveedores.length?'No encontramos proveedores':'No hay faltantes en esta selección'}</h3>
      <p className="mt-2 text-base text-neutro-500">{proveedores.length?'Probá otro nombre o limpiá la búsqueda.':'Los faltantes registrados en bodega aparecerán aquí con su procedencia.'}</p>
    </div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {visibles.map(p=>{const enviado=pedidosEnviados?.get(p.nombre);return <button key={p.id} type="button" aria-label={`Ver faltantes de ${p.nombre}`} onClick={()=>onSelectProveedor(p.id)} className="group min-w-0 rounded-2xl border border-neutro-200 bg-white p-5 text-left shadow-sm hover:border-primario-300 hover:shadow-md">
        <div className="flex items-start gap-3"><span className="shrink-0 rounded-xl bg-primario-50 p-3 text-primario-800"><Truck size={26}/></span>
          <div className="min-w-0"><h3 className="break-words text-lg font-bold text-neutro-900">{p.nombre}</h3><p className="mt-2 break-words text-sm text-neutro-500">{p.contacto||'Sin contacto registrado'}</p></div>
        </div>
        <div className="mt-4">{consultaCiclo?<Insignia tono="activo">Del ciclo seleccionado</Insignia>:enviado?<Insignia tono="exito" icono={Check}>Enviado {cuandoSeEnvio(enviado.ultimoEnvio)}{enviado.veces>1?` · ${enviado.veces} veces`:''}</Insignia>:<Insignia>Sin enviar</Insignia>}</div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-neutro-100 pt-4"><div><p className="text-sm text-neutro-500">Productos</p><p className="mt-1 text-2xl font-bold text-neutro-900">{p.total_productos}</p></div><div><p className="text-sm text-neutro-500">Unidades faltantes</p><p className="mt-1 text-2xl font-bold text-neutro-900">{p.total_cantidad}</p></div></div>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primario-700">Ver faltantes<ArrowRight size={17}/></span>
      </button>})}
    </div>}
  </div>
}

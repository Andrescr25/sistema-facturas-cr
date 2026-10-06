import { useState } from 'react'
import { RefreshCw, Truck } from 'lucide-react'
import FiltroCicloOperacion from '../components/FiltroCicloOperacion'
import ContextoCicloDocumento from '../components/ContextoCicloDocumento'
import { textoCiclo } from '../components/SelectorCiclo'
import ParadaDetalle from '../components/entregas/ParadaDetalle'
import { useEntregas } from '../hooks/useEntregas'

export default function Entregas() {
  const b=useEntregas(),[vista,setVista]=useState('entrega'),plan=b.plan
  return <div className="mx-auto max-w-6xl space-y-5 pb-24">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-extrabold">Carga y Entregas</h1>
        <p className="mt-2 text-neutro-600">Paradas y pedidos de cada ruta y semana.</p></div>
      <button type="button" onClick={b.actualizar} disabled={b.cargando||b.cargandoDetalle||!b.filtro.cicloId} className="btn btn-outline min-h-11 inline-flex gap-2"><RefreshCw size={18}/>Actualizar ruta</button>
    </header>
    <FiltroCicloOperacion filtro={b.filtro} requiereCiclo/>
    {!b.filtro.cicloId&&<p className="card p-5">Elegí una semana para consultar sus pedidos y preparar la carga.</p>}
    {b.error&&<p role="alert" className="rounded-xl bg-peligro-50 p-4 text-peligro-800">{b.error}</p>}
    {b.cargando&&<p role="status">Consultando paradas de la semana…</p>}
    {b.seleccion?<>
      <button type="button" className="btn btn-outline min-h-11" onClick={b.volver}>Volver al recorrido</button>
      {b.errorDetalle&&<p role="alert" className="rounded-xl bg-peligro-50 p-4 text-peligro-800">{b.errorDetalle}</p>}
      {b.cargandoDetalle&&<p role="status">Consultando documentos de la parada…</p>}
      {b.detalle&&<ParadaDetalle parada={b.detalle}/>}
    </>:plan&&<>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de la semana">
        <div className="card p-4"><p className="text-sm text-neutro-600">Paradas con pedidos</p><p className="text-3xl font-bold">{plan.resumen.paradas}</p></div>
        <div className="card p-4"><p className="text-sm text-neutro-600">Facturas con revisión de bodega</p><p className="text-3xl font-bold">{plan.resumen.revisadas} / {plan.resumen.facturas}</p></div>
        <div className="card p-4"><p className="text-sm text-neutro-600">Pedidos por facturar</p><p className="text-3xl font-bold">{plan.resumen.pedidosSinFacturar}</p></div>
      </div>
      <p className="text-sm text-neutro-600">La revisión de bodega y la sugerencia de carga no confirman una entrega al cliente.</p>
      <div className="flex flex-wrap gap-2" aria-label="Vista del recorrido">
        <button type="button" aria-pressed={vista==='entrega'} className={vista==='entrega'?'btn btn-primary min-h-11':'btn btn-outline min-h-11'} onClick={()=>setVista('entrega')}>Orden de entrega</button>
        <button type="button" aria-pressed={vista==='carga'} className={vista==='carga'?'btn btn-primary min-h-11':'btn btn-outline min-h-11'} onClick={()=>setVista('carga')}>Sugerencia de carga</button>
      </div>
      {vista==='entrega'?<section className="space-y-3" aria-label="Paradas en orden de entrega">
        <h2 className="text-xl font-bold">{textoCiclo(plan.ciclo)}</h2>
        {!plan.ciclo&&<p className="rounded-lg bg-alerta-50 p-4 text-alerta-800">Documentos sin ruta ni semana asignada. No tienen orden de carga sugerido.</p>}
        {!plan.paradas.length&&<p className="card p-5">No hay pedidos en esta selección.</p>}
        {plan.paradas.map(p=><article key={p.clave} className="card p-5 space-y-2">
          <h3 className="break-words text-xl font-bold">{p.ciclo?`Parada ${p.ciclo.orden} · `:''}{p.clienteNombre}</h3>
          <ContextoCicloDocumento documento={p} maps/>
          <p className="text-sm">{p.documentos.filter(d=>d.tipo==='factura').length} facturas · {p.documentos.filter(d=>d.tipo==='pedido').length} pedidos por facturar</p>
          {p.documentos.some(d=>d.anticipado)&&<p className="font-semibold text-nota-700">Incluye preventa anticipada</p>}
          <button type="button" onClick={()=>b.abrir(p)} className="btn btn-outline min-h-11">Ver pedidos de {p.clienteNombre}</button>
        </article>)}
        {plan.paginacion.paginas>1&&<nav className="flex flex-wrap items-center gap-3" aria-label="Páginas de paradas">
          <button type="button" className="btn btn-outline min-h-11" disabled={b.pagina<=1||b.cargando} onClick={()=>b.cambiarPagina(b.pagina-1)}>Anterior</button>
          <p>Página {b.pagina} de {plan.paginacion.paginas}</p>
          <button type="button" className="btn btn-outline min-h-11" disabled={b.pagina>=plan.paginacion.paginas||b.cargando} onClick={()=>b.cambiarPagina(b.pagina+1)}>Siguiente</button>
        </nav>}
      </section>:<section className="space-y-3" aria-label="Orden sugerido de carga">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Truck size={22}/>Carga de {textoCiclo(plan.ciclo)}</h2>
        <p>Empezá por la última parada. Cargá al final los pedidos de la primera entrega para dejarlos más accesibles.</p>
        <p className="text-sm text-neutro-600">La sugerencia incluye las facturas con revisión de bodega de toda la semana. Verificá paquetes y faltantes antes de cargar.</p>
        {!plan.carga.length&&<p className="card p-5">{plan.ciclo?'No hay facturas con revisión de bodega en esta semana.':'Asigná un ciclo a los nuevos pedidos para organizar su recorrido.'}</p>}
        {plan.carga.map(p=><article key={p.clave} className="card p-5 space-y-2">
          <h3 className="break-words text-xl font-bold">Carga {p.ordenCarga} · {p.clienteNombre}</h3>
          <ContextoCicloDocumento documento={p} maps/>
          <p className="break-words text-sm">{p.facturas.map(f=>`Factura ${f.numero}`).join(' · ')}</p>
          {p.facturas.some(f=>f.faltantes>0)&&<p className="text-alerta-800">Incluye faltantes registrados; revisá qué paquetes están preparados.</p>}
          <button type="button" onClick={()=>b.abrir(p)} className="btn btn-outline min-h-11">Ver pedidos de {p.clienteNombre}</button>
        </article>)}
      </section>}
    </>}
  </div>
}

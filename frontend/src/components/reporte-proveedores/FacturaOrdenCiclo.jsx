import { useEffect, useRef, useState } from 'react'
import api from '../../services/api'
import { useDialog } from '../../hooks/useDialog'
import ConfirmModal from '../ConfirmModal'

const BASE='/orden-compra/por-ciclo',n=v=>Number(v).toLocaleString('es-CR',{maximumFractionDigits:6})
const tipos={original_adjuntado:'PDF adjuntado como original',representacion_buzon:'Representación de datos del sistema'}
const estados={sin_comprobante:'Sin comprobante vinculado',por_revisar:'Requiere revisión de relación o conversión',coincide:'Cantidad facturada conforme',menos_facturado:'Menos facturado de lo solicitado',mas_facturado:'Más facturado de lo solicitado'}
function Comparacion({datos}){
  if(!datos)return null
  return <div className="space-y-3" aria-label="Comparación de cantidades">
    <h4 className="font-bold">Solicitado y facturado · unidades propias</h4>
    <p className="text-sm text-neutro-600">La factura no confirma recepción física. Una línea ausente no demuestra agotamiento.</p>
    {datos.requiereRevision&&<p role="status" className="rounded-lg bg-nota-50 p-3 text-sm text-nota-800">Hay datos que requieren revisión. Las cantidades sin producto o conversión confirmados no se usan para afirmar faltantes.</p>}
    {[...datos.productos,...datos.extras].map(p=><div key={p.productoId} className="min-w-0 rounded-lg border p-3 space-y-1">
      <p className="break-words font-semibold">{p.nombre}</p><p className="text-sm">{estados[p.estado]}{p.solicitado===0?' · Producto fuera de la orden':''}</p>
      <p className="text-sm">Solicitado: {n(p.solicitado)} · Facturado: {p.facturado==null?'Por verificar':n(p.facturado)}</p>
      {p.faltante>0&&<p className="text-sm text-nota-800">Diferencia sin facturar: {n(p.faltante)} · Motivo sin confirmar</p>}
      {p.exceso>0&&<p className="text-sm text-peligro-700">Cantidad adicional facturada: {n(p.exceso)}</p>}
      {!!p.lineas.length&&<details className="text-sm"><summary className="cursor-pointer">Líneas de las facturas</summary>{p.lineas.map(l=><p key={l.facturaId+'-'+l.id} className="mt-2 break-words">Factura {l.numeroFactura} · {l.codigo_proveedor||'Sin código'} · {n(l.cantidad)} {l.unidad} · {l.factor_conversion?`1 = ${n(l.factor_conversion)} propias`:'Conversión por verificar'}{l.revision?' · '+l.revision:''}</p>)}</details>}
    </div>)}
    {!!datos.porRelacionar.length&&<div className="rounded-lg border p-3 text-sm"><p className="font-bold">Productos sin relacionar</p>{datos.porRelacionar.map(l=><p key={l.facturaId+'-'+l.id} className="mt-2 break-words">Factura {l.numeroFactura} · {l.codigo_proveedor} · {l.descripcion} · {n(l.cantidad)} {l.unidad}</p>)}</div>}
  </div>
}

/** El vínculo registra lo que se revisó; no acepta la compra ni ingresa stock. */
export default function FacturaOrdenCiclo({orden,ocupado,onOcupado}){
  const [datos,setDatos]=useState(null),[error,setError]=useState(''),[cargando,setCargando]=useState(true)
  const [buscar,setBuscar]=useState(''),[lista,setLista]=useState(null),[propuesta,setPropuesta]=useState(null),[revisada,setRevisada]=useState(false)
  const [archivo,setArchivo]=useState(null),[confirmaPdf,setConfirmaPdf]=useState(false),[vinculoActivo,setVinculoActivo]=useState(''),[pdfAbierto,setPdfAbierto]=useState(null)
  const {prompt,dialogProps}=useDialog(),vivo=useRef(true),lectura=useRef(0),url=useRef(''),solicitud=useRef(null),pdfSolicitud=useRef(null)
  const fallo=e=>e.response?.data?.message||'No se pudo consultar o guardar la factura. Recargá antes de reintentar.'
  const limpiarPdf=()=>{if(url.current)URL.revokeObjectURL(url.current);url.current='';setPdfAbierto(null)}
  useEffect(()=>{vivo.current=true;api.get(`${BASE}/${orden.id}/facturas`).then(({data})=>{if(vivo.current)setDatos(data.data)}).catch(e=>{if(vivo.current)setError(fallo(e))}).finally(()=>{if(vivo.current)setCargando(false)})
    return()=>{vivo.current=false;lectura.current++;if(url.current)URL.revokeObjectURL(url.current)}},[orden.id])
  const ejecutar=async tarea=>{onOcupado(true);setError('');try{const result=await tarea();if(vivo.current){setDatos(result);setPropuesta(null);setRevisada(false)}}catch(e){if(vivo.current)setError(fallo(e))}finally{onOcupado(false)}}
  const consultar=async pagina=>{const id=++lectura.current;onOcupado(true);setError('');try{const {data}=await api.get(`${BASE}/${orden.id}/facturas/candidatas`,{params:{buscar,pagina}});if(vivo.current&&id===lectura.current)setLista(data.data)}catch(e){if(vivo.current)setError(fallo(e))}finally{onOcupado(false)}}
  const revisar=async id=>{onOcupado(true);setError('');setPropuesta(null);setRevisada(false);try{const {data}=await api.get(`${BASE}/${orden.id}/facturas/propuesta/${id}`);if(vivo.current){setPropuesta(data.data);solicitud.current=null}}catch(e){if(vivo.current)setError(fallo(e))}finally{onOcupado(false)}}
  const vincular=()=>ejecutar(async()=>{const cuerpo={facturaId:propuesta.documento.id,version:propuesta.version,revision:propuesta.revision,confirmar:true}
    const firma=JSON.stringify(cuerpo);if(solicitud.current?.firma!==firma)solicitud.current={firma,clave:crypto.randomUUID()}
    const {data}=await api.post(`${BASE}/${orden.id}/facturas`,{...cuerpo,clave:solicitud.current.clave});setLista(null);return data.data})
  const retirar=async v=>{const motivo=await prompt('Retirar el vínculo conserva sus datos y PDF en historial. No cambia la factura, la compra ni la orden. Indicá el motivo.',{title:'Corregir vínculo de factura',inputPlaceholder:'Motivo para retirar este vínculo',confirmLabel:'Retirar vínculo'})
    if(motivo)ejecutar(async()=>{const {data}=await api.post(`${BASE}/${orden.id}/facturas/${v.id}/retirar`,{motivo});setLista(null);return data.data})}
  const guardarPdf=(v,tipo)=>ejecutar(async()=>{
    const firma=v.id+'|'+tipo;if(pdfSolicitud.current?.firma!==firma)pdfSolicitud.current={firma,clave:crypto.randomUUID()}
    let cuerpo={tipo,clave:pdfSolicitud.current.clave}
    if(tipo==='original_adjuntado'){const form=new FormData();for(const [k,val]of Object.entries(cuerpo))form.append(k,val);form.append('confirmar','true');form.append('pdf',archivo);cuerpo=form}
    const {data}=await api.post(`${BASE}/${orden.id}/facturas/${v.id}/pdf`,cuerpo,{headers:tipo==='original_adjuntado'?{'Content-Type':'multipart/form-data'}:undefined})
    setArchivo(null);setConfirmaPdf(false);return data.data
  })
  const abrirPdf=async(v,p)=>{onOcupado(true);setError('');try{const {data}=await api.get(`${BASE}/${orden.id}/facturas/${v.id}/pdf/${p.id}`,{responseType:'blob'});if(!vivo.current)return
    limpiarPdf();url.current=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));setPdfAbierto({url:url.current,tipo:p.tipo,numero:v.documento.numero_consecutivo})
  }catch(e){if(vivo.current)setError(fallo(e))}finally{onOcupado(false)}}
  const v=datos?.facturas.find(f=>f.id===vinculoActivo&&f.estado==='vigente')
  return <section className="card min-w-0 p-5 space-y-5" aria-label="Facturas del proveedor de la orden">
    <h3 className="text-lg font-bold">Factura del proveedor y comparación</h3>
    {error&&<p role="alert" className="break-words text-peligro-700">{error}</p>}
    {cargando&&<p role="status">Consultando facturas vinculadas…</p>}
    <p className="text-sm text-neutro-600">Vincular y consultar no registra la compra ni aumenta inventario. La recepción física se registra en su apartado.</p>
    <Comparacion datos={datos?.comparacion}/>
    {!['recibida','cerrada'].includes(orden.estado)&&<div className="rounded-lg border p-4 space-y-3">
      <label className="block text-sm font-semibold">Buscar factura de este proveedor<input aria-label="Buscar factura de este proveedor" value={buscar} maxLength={80} disabled={ocupado||cargando} onChange={e=>{setBuscar(e.target.value);setLista(null)}} className="mt-1 block w-full min-h-11 rounded-lg border p-2" placeholder="Número de factura o clave"/></label>
      <button type="button" disabled={ocupado||cargando} className="btn btn-outline" onClick={()=>consultar(1)}>Consultar facturas del proveedor</button>
      {lista&&!lista.facturas.length&&<p className="text-sm">No hay facturas del proveedor en esta búsqueda.</p>}
      {lista?.facturas.map(f=><div key={f.id} className="min-w-0 rounded-lg border p-3 space-y-2"><p className="break-words font-semibold">Factura {f.numero_consecutivo}</p><p className="text-sm">{f.fecha_emision.slice(0,10)} · {f.moneda} {n(f.total_factura)}</p>
        {f.orden_asignada?<p className="text-sm">Vinculada a OC-{f.orden_asignada}. Una factura completa no se cuenta en dos órdenes.</p>:<button type="button" className="btn btn-outline" disabled={ocupado} onClick={()=>revisar(f.id)}>Revisar factura {f.numero_consecutivo}</button>}
      </div>)}
      {lista&&<div className="flex flex-wrap gap-2"><button className="btn btn-outline" disabled={ocupado||lista.pagina===1} onClick={()=>consultar(lista.pagina-1)}>Anterior</button><button className="btn btn-outline" disabled={ocupado||!lista.hayMas} onClick={()=>consultar(lista.pagina+1)}>Siguiente</button></div>}
    </div>}
    {propuesta&&<div className="rounded-lg border p-4 space-y-3"><h4 className="break-words font-bold">Revisar factura {propuesta.documento.numero_consecutivo}</h4><p className="break-words text-sm">{propuesta.documento.proveedor_nombre} · Clave {propuesta.documento.clave}</p>
      <Comparacion datos={propuesta.comparacion}/>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={revisada} disabled={ocupado} onChange={e=>setRevisada(e.target.checked)}/>Revisé el proveedor, el comprobante y las cantidades comparadas de esta orden.</label>
      <button type="button" className="btn btn-primary" disabled={ocupado||!revisada} onClick={vincular}>Vincular esta factura</button>
    </div>}
    {!!datos?.facturas.length&&<div className="space-y-3"><h4 className="font-bold">Comprobantes e historial</h4>{datos.facturas.map(f=><div key={f.id} className="rounded-lg border p-3 space-y-2 min-w-0"><p className="break-words font-semibold">Factura {f.documento.numero_consecutivo} · {f.estado==='vigente'?'Vínculo vigente':'Vínculo retirado'}</p>
      {f.motivo&&<p className="break-words text-sm">Motivo: {f.motivo}</p>}{f.fuenteCambio&&<p role="status" className="text-sm text-nota-800">{['recibida','cerrada'].includes(orden.estado)?'La fuente cambió desde la revisión. La orden está finalizada y conserva esta comparación; revisá cualquier diferencia en la compra.':'La fuente cambió desde la revisión. Esta comparación se conserva; revisá la compra antes de recibir. Si el vínculo es incorrecto, retiralo con motivo y revisá uno nuevo.'}</p>}
      <div className="flex flex-wrap gap-2">{f.pdfs.map(p=><button key={p.id} type="button" className="btn btn-outline" disabled={ocupado} onClick={()=>abrirPdf(f,p)}>Ver {tipos[p.tipo]}</button>)}</div>
      {f.estado==='vigente'&&<div className="flex flex-wrap gap-2"><button type="button" className="btn btn-outline" disabled={ocupado} onClick={()=>{setVinculoActivo(f.id);setArchivo(null);setConfirmaPdf(false);pdfSolicitud.current=null}}>Adjuntar PDF de factura {f.documento.numero_consecutivo}</button>
        <button type="button" className="btn btn-outline" disabled={ocupado} onClick={()=>guardarPdf(f,'representacion_buzon')}>Generar representación de factura {f.documento.numero_consecutivo}</button>
        {!['recibida','cerrada'].includes(orden.estado)&&<button type="button" className="text-sm underline" disabled={ocupado} onClick={()=>retirar(f)}>Corregir vínculo de factura {f.documento.numero_consecutivo}</button>}</div>}
    </div>)}</div>}
    {v&&<div className="rounded-lg border p-4 space-y-3"><p className="font-semibold break-words">PDF de factura {v.documento.numero_consecutivo}</p><input type="file" accept="application/pdf,.pdf" aria-label="PDF original del proveedor" disabled={ocupado} onChange={e=>{setArchivo(e.target.files?.[0]||null);setConfirmaPdf(false);pdfSolicitud.current=null}} className="block w-full text-sm"/>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmaPdf} disabled={ocupado||!archivo} onChange={e=>setConfirmaPdf(e.target.checked)}/>Este PDF original corresponde a la factura {v.documento.numero_consecutivo} y a su proveedor.</label>
      <button type="button" className="btn btn-primary" disabled={ocupado||!archivo||!confirmaPdf||archivo.size>5*1024*1024} onClick={()=>guardarPdf(v,'original_adjuntado')}>Guardar PDF original adjuntado</button><p className="text-sm">Hasta 5 MB. El PDF se conserva junto al vínculo; no reemplaza copias anteriores.</p>
    </div>}
    {pdfAbierto&&<div className="space-y-3 min-w-0"><p className="break-words font-semibold">Factura {pdfAbierto.numero} · {tipos[pdfAbierto.tipo]}</p><div className="flex flex-wrap gap-2"><a className="btn btn-outline" href={pdfAbierto.url} target="_blank" rel="noopener noreferrer">Abrir factura PDF</a><a className="btn btn-outline" href={pdfAbierto.url} download="factura-proveedor.pdf">Descargar factura PDF</a><button type="button" className="btn btn-outline" onClick={limpiarPdf}>Cerrar vista PDF</button></div><iframe title="Factura del proveedor en PDF" src={pdfAbierto.url} className="w-full h-[560px] rounded-lg border"/></div>}
    <ConfirmModal {...dialogProps}/>
  </section>
}

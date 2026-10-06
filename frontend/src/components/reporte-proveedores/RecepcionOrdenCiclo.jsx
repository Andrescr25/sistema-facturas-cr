import { useEffect, useRef, useState } from 'react'
import api from '../../services/api'
const BASE='/orden-compra/por-ciclo',n=v=>Number(v).toLocaleString('es-CR',{maximumFractionDigits:6})
const causas={agotado_confirmado:'Agotado confirmado por proveedor',pendiente_proveedor:'Pendiente del proveedor',rechazado:'Producto rechazado o no aceptado',otro:'Otro motivo confirmado'}
/** Cantidades de ESTA entrega física, no acumulados ni cantidades del PDF. */
export default function RecepcionOrdenCiclo({orden,ocupado,onOcupado,onActualizar}){
 const [datos,setDatos]=useState(null),[cantidades,setCantidades]=useState({}),[motivos,setMotivos]=useState({}),[final,setFinal]=useState(false),[confirmar,setConfirmar]=useState(false),[observaciones,setObservaciones]=useState(''),[error,setError]=useState(''),[cargando,setCargando]=useState(true)
 const vivo=useRef(true),solicitud=useRef(null)
 const fallo=e=>e.response?.data?.message||'No se pudo consultar o guardar la recepción. Recargá antes de reintentar.'
 const aplicar=d=>{setDatos(d);setCantidades({});setMotivos({});setFinal(false);setConfirmar(false);setObservaciones('');solicitud.current=null}
 const cargar=async()=>{onOcupado(true);setError('');try{const {data}=await api.get(`${BASE}/${orden.id}/recepciones`);if(vivo.current)aplicar(data.data)}catch(e){if(vivo.current)setError(fallo(e))}finally{if(vivo.current)setCargando(false);onOcupado(false)}}
 useEffect(()=>{vivo.current=true;cargar();return()=>{vivo.current=false}},[orden.id])
 const cambiar=f=>{setConfirmar(false);f()}
 const guardar=async()=>{onOcupado(true);setError('');try{
   const cuerpo={version:datos.version,revision:datos.revision,final,confirmar:true,observaciones,lineas:Object.entries(cantidades).filter(([,q])=>q!=='').map(([id,q])=>({lineaId:Number(id),cantidad:q})).sort((a,b)=>a.lineaId-b.lineaId),motivos:Object.entries(motivos).filter(([,m])=>m.detalle?.trim()).map(([id,m])=>({productoId:Number(id),tipo:m.tipo||'otro',detalle:m.detalle})).sort((a,b)=>a.productoId-b.productoId)}
   const firma=JSON.stringify(cuerpo);if(solicitud.current?.firma!==firma)solicitud.current={firma,clave:crypto.randomUUID()}
   const {data}=await api.post(`${BASE}/${orden.id}/recepciones`,{...cuerpo,clave:solicitud.current.clave});if(vivo.current){aplicar(data.data);onActualizar(data.data.orden)}
 }catch(e){if(vivo.current)setError(fallo(e))}finally{onOcupado(false)}}
 const completa=orden.estado==='recibida'
 return <section className="card min-w-0 p-5 space-y-4" aria-label="Recepción física de la orden">
  <h3 className="text-lg font-bold">Recepción física</h3>
  <p className="text-sm text-neutro-600">Registrá lo que llegó físicamente en cada entrega. Lo facturado y lo recibido se muestran por separado.</p>
  {error&&<p role="alert" className="break-words text-peligro-700">{error}</p>}{cargando&&<p role="status">Consultando recepciones…</p>}
  {!!datos?.bloqueos.length&&datos.bloqueos.map((b,i)=><p key={i} className="break-words text-nota-800">{b}</p>)}
  {!!datos?.comprasPendientes.length&&<p className="text-sm text-nota-800">Primero revisá y registrá la compra de: {datos.comprasPendientes.map(p=>p.numero).join(', ')}. Las otras facturas revisadas permiten recepción parcial.</p>}
  {datos?.comparacion.map(p=><div key={p.productoId} className="min-w-0 rounded-lg border p-3 space-y-1"><p className="font-semibold break-words">{p.nombre}</p><p className="text-sm">Solicitado: {n(p.solicitado)} · Facturado en compras: {n(p.facturado)} · Recibido físico: {n(p.recibido)} unidades propias</p>
    {p.noRecibido>0&&<p className="text-sm">{completa?'No recibido al finalizar':'Pendiente de recibir'}: {n(p.noRecibido)}</p>}{p.adicionalRecibido>0&&<p className="text-sm text-nota-800">Adicional recibido: {n(p.adicionalRecibido)}</p>}{p.facturadoSinRecibir>0&&<p className="text-sm">Facturado sin recibir: {n(p.facturadoSinRecibir)}</p>}
    {datos.motivos.filter(m=>m.productoId===p.productoId).map(m=><p key={m.productoId} className="break-words text-sm">{causas[m.tipo]}: {m.detalle}</p>)}
  </div>)}
  {completa&&<p role="status" className="rounded-lg bg-exito-50 p-3 text-exito-800">Recepción final registrada: {new Date(datos?.completaEn||orden.recepcion_completa_en).toLocaleString('es-CR',{timeZone:'America/Costa_Rica'})}. Los datos y PDF quedan en historial.</p>}
  {!completa&&datos&&<>
   <div className="space-y-3"><h4 className="font-bold">Cantidades que llegaron en esta entrega</h4>{datos.lineas.map(l=><div key={l.id} className="min-w-0 rounded-lg border p-3 space-y-2"><p className="font-semibold break-words">{l.descripcion} · Factura {l.numeroFactura}</p><p className="text-sm">Facturado: {n(l.cantidad)} {l.unidad} × {n(l.factor_conversion)} = {n(l.cantidad_propia)} propias. Recibido antes: {n(l.recibida)} · Pendiente en esta línea: {n(l.pendiente)}</p>
    <p className="text-sm text-neutro-600">{l.inventarioPorRecepcion?'El inventario de esta compra ingresa con lo recibido físicamente.':'Esta compra usa su entrada comercial anterior; recibir no vuelve a acreditar inventario.'}</p>
    <label className="block text-sm font-semibold">Cantidad física nueva · unidades propias<input aria-label={`Recibir línea ${l.id} de ${l.descripcion}`} type="number" min="0" max={l.pendiente} step="0.0001" value={cantidades[l.id]??''} disabled={ocupado||!l.segura||l.pendiente<=0} onChange={e=>cambiar(()=>setCantidades(q=>({...q,[l.id]:e.target.value})))} className="mt-1 block w-full max-w-xs min-h-11 rounded-lg border p-2" placeholder="0"/></label>
   </div>)}</div>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={final} disabled={ocupado} onChange={e=>cambiar(()=>setFinal(e.target.checked))}/>Esta es la entrega final de esta orden; no queda otra recepción del proveedor.</label>
   <div className="space-y-3"><h4 className="font-bold">Motivos de diferencias</h4><p className="text-sm">Al finalizar, indicá un motivo y detalle para lo solicitado o facturado que no se recibió. Elegí “agotado” únicamente si lo confirmó el proveedor.</p>{datos.comparacion.map(p=><div key={p.productoId} className="min-w-0 rounded-lg border p-3 space-y-2"><p className="font-semibold break-words">{p.nombre}</p><select aria-label={`Motivo de ${p.nombre}`} disabled={ocupado} value={motivos[p.productoId]?.tipo||'otro'} onChange={e=>cambiar(()=>setMotivos(m=>({...m,[p.productoId]:{...m[p.productoId],tipo:e.target.value}})))} className="w-full min-h-11 rounded-lg border p-2">{Object.entries(causas).map(([k,t])=><option key={k} value={k}>{t}</option>)}</select><input aria-label={`Detalle de ${p.nombre}`} maxLength={500} value={motivos[p.productoId]?.detalle||''} disabled={ocupado} onChange={e=>cambiar(()=>setMotivos(m=>({...m,[p.productoId]:{...m[p.productoId],detalle:e.target.value}})))} placeholder="Qué confirmó el proveedor o qué se verificó" className="w-full min-h-11 rounded-lg border p-2"/></div>)}</div>
   <label className="block text-sm">Observaciones<textarea aria-label="Observaciones de recepción" maxLength={1000} value={observaciones} disabled={ocupado} onChange={e=>cambiar(()=>setObservaciones(e.target.value))} className="block w-full rounded-lg border p-2"/></label>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmar} disabled={ocupado} onChange={e=>setConfirmar(e.target.checked)}/>Verifiqué las cantidades físicas de esta entrega y los motivos indicados.</label>
   <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary" disabled={ocupado||!confirmar||!!datos.bloqueos.length} onClick={guardar}>{final?'Registrar recepción final':'Registrar recepción parcial'}</button><button type="button" className="btn btn-outline" disabled={ocupado} onClick={cargar}>Actualizar recepción</button></div>
  </>}
  {!!datos?.historial.length&&<details className="text-sm"><summary className="cursor-pointer font-semibold">Historial de recepciones</summary>{datos.historial.map(h=><div key={h.id} className="mt-3 space-y-1 border-t pt-3"><p>{h.final?'Recepción final':'Recepción parcial'} · {new Date(h.fecha).toLocaleString('es-CR',{timeZone:'America/Costa_Rica'})} · {h.usuario||'Sin usuario registrado'}</p>{h.resumen.incrementos.map(l=><p key={l.lineaId}>Línea {l.lineaId}: {n(l.cantidad)} unidades físicas</p>)}{h.observaciones&&<p className="break-words">{h.observaciones}</p>}{h.motivos.map(m=><p key={m.productoId} className="break-words">{causas[m.tipo]}: {m.detalle}</p>)}</div>)}</details>}
 </section>
}

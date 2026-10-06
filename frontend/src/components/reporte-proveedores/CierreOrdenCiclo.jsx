import {useEffect,useRef,useState} from 'react'
import api from '../../services/api'
const BASE='/orden-compra/por-ciclo',n=v=>Number(v).toLocaleString('es-CR',{maximumFractionDigits:6})
/** El cierre libera pendientes; las recepciones y el documento enviado permanecen. */
export default function CierreOrdenCiclo({orden,ocupado,onOcupado,onActualizar}){
 const [datos,setDatos]=useState(null),[motivo,setMotivo]=useState(''),[confirmar,setConfirmar]=useState(false),[error,setError]=useState(''),[cargando,setCargando]=useState(true),[pendiente,setPendiente]=useState(false)
 const vivo=useRef(true),solicitud=useRef(null),lectura=useRef(0)
 const aplicar=d=>{setDatos(d);setConfirmar(false);if(d.evento){solicitud.current=null;setPendiente(false)}}
 const cargar=async()=>{
  const turno=++lectura.current;onOcupado(true);setError('');setCargando(true)
  try{const {data}=await api.get(`${BASE}/${orden.id}/cierre`);if(!vivo.current||turno!==lectura.current)return
   aplicar(data.data)
   if(data.data.evento){const {data:detalle}=await api.get(`${BASE}/${orden.id}`);if(vivo.current&&turno===lectura.current)onActualizar(detalle.data)}
  }catch(e){if(vivo.current&&turno===lectura.current)setError(e.response?.data?.message||'No se pudo consultar el cierre.')}finally{if(vivo.current&&turno===lectura.current)setCargando(false);onOcupado(false)}
 }
 useEffect(()=>{vivo.current=true;cargar();return()=>{vivo.current=false;lectura.current++}},[orden.id,orden.version])
 const guardar=async()=>{onOcupado(true);setError('');try{
  // Si se perdió la respuesta, bloquear edición y repetir EXACTAMENTE la
  // misma solicitud. Consultar/volver a abrir nunca genera otro cierre.
  if(!solicitud.current)solicitud.current={clave:crypto.randomUUID(),version:datos.version,revision:datos.revision,motivo:motivo.trim(),confirmar:true}
  setPendiente(true)
  const {data}=await api.post(`${BASE}/${orden.id}/cierre`,solicitud.current)
  if(vivo.current){aplicar(data.data);onActualizar(data.data.orden)}
 }catch(e){if(vivo.current){if([400,403,404,409].includes(e.response?.status)){solicitud.current=null;setPendiente(false);setConfirmar(false)}setError(e.response?.data?.message||'La respuesta no llegó. Consultá el resultado o reintentá el mismo cierre.')}}finally{onOcupado(false)}}
 return <section className="card min-w-0 p-5 space-y-4" aria-label="Cierre de orden enviada">
  <h3 className="text-lg font-bold">Cierre de orden enviada</h3>
  <p className="text-sm">Conserva lo recibido y libera la cobertura pendiente para otra orden del mismo ciclo. El PDF, las facturas y las recepciones quedan en el historial. La compra y sus saldos se revisan por separado.</p>
  {error&&<p role="alert" className="break-words text-peligro-700">{error}</p>}{cargando&&<p role="status">Consultando cobertura para el cierre…</p>}
  {datos?.resumen.lineas.map(p=><div key={p.productoId} className="min-w-0 rounded-lg border p-3 space-y-2"><h4 className="font-semibold break-words">{p.nombre}</h4><p className="text-sm">Solicitado original: {n(p.solicitado)} · Recibido físico: {n(p.recibido)} · No recibido: {n(p.noRecibido)} unidades propias</p><p className="text-sm">Cobertura que se conserva: {n(p.conservada)} · Cobertura que se libera: {n(p.liberada)}</p><details className="text-sm"><summary className="cursor-pointer font-semibold">Cobertura por factura</summary>{p.origenes.map(o=><p key={o.faltanteId} className="mt-2 break-words">{o.orden?`Parada ${o.orden} · `:''}{o.cliente} · Factura {o.numero}: conserva {n(o.conservada)}, libera {n(o.liberada)}</p>)}</details></div>)}
  {datos?.evento&&<div role="status" className="rounded-lg bg-neutro-50 p-3 space-y-2"><p>Cerrada el {new Date(datos.evento.fecha).toLocaleString('es-CR',{timeZone:'America/Costa_Rica'})} · {datos.evento.usuario}</p><p className="break-words">Motivo: {datos.evento.motivo}</p><p>El cierre conserva su historial y no se reabre.</p></div>}
  {datos?.puedeCerrar&&!datos.evento&&<>
   <label className="block text-sm font-semibold">Motivo del cierre<textarea aria-label="Motivo del cierre enviado" maxLength={1000} value={motivo} disabled={ocupado||pendiente} onChange={e=>{setMotivo(e.target.value);setConfirmar(false)}} className="mt-1 block w-full rounded-lg border p-2"/></label>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmar} disabled={ocupado||pendiente} onChange={e=>setConfirmar(e.target.checked)}/>Revisé lo recibido y confirmé con el proveedor el cierre de lo pendiente.</label>
   {pendiente&&<p role="status" className="text-sm">Solicitud de cierre pendiente de confirmar. El reintento conserva la misma clave y cantidades revisadas.</p>}
   <button type="button" className="btn btn-primary" disabled={ocupado||(!pendiente&&(!confirmar||!motivo.trim()))} onClick={guardar}>{pendiente?'Reintentar el mismo cierre':'Confirmar cierre de orden'}</button>
  </>}
  <button type="button" className="btn btn-outline" disabled={ocupado} onClick={cargar}>Actualizar cierre</button>
 </section>
}

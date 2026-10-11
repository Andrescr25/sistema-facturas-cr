import {useEffect,useRef,useState} from 'react'
import api from '../../services/api'
import {useAuth} from '../../contexts/AuthContext'

export const ESTADO_FISICO={por_cargar:'Por cargar',cargada:'Cargada',parcialmente_entregada:'Entrega parcial',entregada:'Entregada',requiere_revision:'Requiere revisión'}
const ACCIONES={carga:'Registrar carga',entrega:'Registrar entrega',descarga:'Registrar descarga',incidencia:'Registrar incidencia',revision:'Revisar registro físico'}
const numero=v=>Number(v).toLocaleString('es-CR',{maximumFractionDigits:4})
const fecha=v=>new Date(v).toLocaleString('es-CR',{timeZone:'America/Costa_Rica'})
const INPUT='mt-1 w-full min-h-11 rounded-xl border p-2'

/** Cantidades NUEVAS por evento. Un error de red conserva UUID y cuerpo
 * para reintentar el mismo registro; jamás sumar automáticamente otra vez.
 */
export default function RegistroFisico({facturaId,onActualizar}) {
 const {usuario}=useAuth(),admin=Boolean(usuario?.esAdmin)
 const [datos,setDatos]=useState(null),[accion,setAccion]=useState('carga'),[cantidades,setCantidades]=useState({})
 const [motivo,setMotivo]=useState(''),[confirmar,setConfirmar]=useState(false),[revision,setRevision]=useState(0)
 const [error,setError]=useState(''),[mensaje,setMensaje]=useState(''),[ocupado,setOcupado]=useState(false),[leyendo,setLeyendo]=useState(true)
 const [pendiente,setPendiente]=useState(null),[incierto,setIncierto]=useState(false)
 const vivo=useRef(false);useEffect(()=>{vivo.current=true;return()=>{vivo.current=false}},[])
 const preparar=(d,a=accion)=>{
  setCantidades(a==='revision'?Object.fromEntries(d.documento.lineas.map(l=>{
   const anterior=d.lineas.find(x=>x.numeroLinea===l.numeroLinea&&x.productoId===l.productoId)
   // Una fotografía cambiada nunca reasigna cantidades a líneas nuevas.
   return[l.numeroLinea,{cargada:String(d.requiereRevision?0:anterior?.cargada||0),entregada:String(d.requiereRevision?0:anterior?.entregada||0),descargada:String(d.requiereRevision?0:anterior?.descargada||0)}]
  })):{});setMotivo('');setConfirmar(false);
 }
 useEffect(()=>{
  let activo=true;setLeyendo(true);setError('')
  api.get(`/entregas/facturas/${facturaId}/registro`).then(({data})=>{if(activo){setDatos(data.data);preparar(data.data)}})
   .catch(e=>{if(activo)setError(e.response?.data?.message||'No se pudo consultar el registro físico.')})
   .finally(()=>{if(activo)setLeyendo(false)})
  return()=>{activo=false}
 },[facturaId,revision])
 const cambiar=a=>{setAccion(a);preparar(datos,a);setError('');setMensaje('')}
 const editar=(n,valor,campo)=>{setConfirmar(false);setCantidades(q=>({...q,[n]:campo?{...q[n],[campo]:valor}:valor}))}
 const enviar=async peticion=>{
  setOcupado(true);setError('');setMensaje('');
  try{
   const {data}=await api.post(peticion.ruta,peticion.body)
   if(!vivo.current)return
   setDatos(data.data);preparar(data.data);setPendiente(null);setIncierto(false);
   setMensaje('Registro guardado. Cantidades e historial actualizados.');onActualizar?.()
  }catch(e){if(!vivo.current)return
   const dudoso=!e.response||e.response.status>=500;setIncierto(dudoso);
   if(!dudoso)setPendiente(null);
   setError(dudoso?'No se pudo confirmar la respuesta. Reintentá el mismo registro para comprobar si quedó guardado.':e.response?.data?.message||'No se pudo guardar.')
  }finally{if(vivo.current)setOcupado(false)}
 }
 const guardar=()=>{
  const lineas=accion==='incidencia'?[]:accion==='revision'?datos.documento.lineas.map(l=>({numeroLinea:l.numeroLinea,...Object.fromEntries(['cargada','entregada','descargada'].map(k=>[k,cantidades[l.numeroLinea]?.[k]??'0']))})):
   datos.lineas.filter(l=>Number(cantidades[l.numeroLinea])>0).map(l=>({numeroLinea:l.numeroLinea,cantidad:cantidades[l.numeroLinea]}));
  const peticion={ruta:`/entregas/facturas/${facturaId}/${accion==='revision'?'revision':'eventos'}`,
   body:{clave:crypto.randomUUID(),version:datos.version,revision:datos.revision,confirmar,accion,lineas,motivo}}
  setPendiente(peticion);enviar(peticion)
 }
 const bloqueado=ocupado||leyendo||incierto,permite=accion==='carga'?datos?.puedeCargar:accion==='entrega'?datos?.puedeEntregar:accion==='revision'?admin:true
 const lineas=accion==='revision'?datos?.documento.lineas:datos?.lineas
 return <section className="space-y-3 rounded-xl border border-neutro-200 p-4" aria-label={`Registro físico de factura ${facturaId}`}>
  <h4 className="text-lg font-bold">Carga y entrega física</h4>
  {leyendo&&<p role="status">Consultando cantidades e historial…</p>}
  {error&&<p role="alert" className="rounded-lg bg-peligro-50 p-3 text-peligro-800">{error}</p>}
  {mensaje&&<p role="status" className="rounded-lg bg-exito-50 p-3 text-exito-800">{mensaje}</p>}
  {datos&&<>
   <p className="font-semibold">{ESTADO_FISICO[datos.estado]}</p>
   {datos.bloqueos.map((texto,i)=><p key={i} className="text-sm text-alerta-800">{texto}</p>)}
   {!datos.puedeEntregar&&datos.ciclo.estado!=='entrega'&&<p className="text-sm">Para entregar, el responsable de Rutas debe activar esta semana en Entrega.</p>}
   {incierto?<button type="button" disabled={ocupado} className="btn btn-primary min-h-11" onClick={()=>enviar(pendiente)}>Reintentar el mismo registro</button>:<>
    <label className="block text-sm font-semibold">Operación física
     <select aria-label={`Operación física de factura ${facturaId}`} className={INPUT} value={accion} disabled={bloqueado} onChange={e=>cambiar(e.target.value)}>
      <option value="carga">Carga nueva al camión</option><option value="entrega">Entrega nueva al cliente</option>
      <option value="descarga">Descarga de lo no entregado</option><option value="incidencia">Incidencia o visita fallida</option>
      {admin&&<option value="revision">Revisión / corrección con motivo</option>}
     </select>
    </label>
    {accion==='revision'&&<div className="rounded-lg bg-alerta-50 p-3 text-alerta-800 space-y-2">
     <p>Revisá los acumulados reales de cada línea actual. Indicá qué registro estaba equivocado o cómo corresponden a la factura revisada.</p>
     <p className="text-sm">El historial anterior se conserva. Las cantidades de una factura modificada comienzan en cero para que las verifiqués.</p>
    </div>}
    {accion!=='incidencia'&&lineas?.map(l=>{
     const fisico=datos.lineas.find(x=>x.numeroLinea===l.numeroLinea&&x.productoId===l.productoId&&x.nombre===l.nombre),n=l.numeroLinea;
     return <div key={n} className="rounded-lg bg-neutro-50 p-3 space-y-2">
      <p className="break-words font-semibold">Línea {n} · {l.nombre}</p>
      <p className="text-sm">Facturado: {numero(l.cantidad)}</p>
      {fisico&&<p className="text-sm">Cargado: {numero(fisico.cargada)} · Entregado: {numero(fisico.entregada)} · Descargado: {numero(fisico.descargada)} · En camión: {numero(fisico.enCamion)}</p>}
      {accion==='revision'?['cargada','entregada','descargada'].map(k=><label key={k} className="block text-sm">{k==='cargada'?'Cargado total':k==='entregada'?'Entregado total':'Descargado total'}
       <input aria-label={`${k} total línea ${n}`} type="number" min="0" step="0.0001" disabled={bloqueado} className={INPUT} value={cantidades[n]?.[k]??'0'} onChange={e=>editar(n,e.target.value,k)}/>
      </label>):<label className="block text-sm">Cantidad nueva de esta {accion}
       <input aria-label={`Cantidad nueva línea ${n}`} type="number" min="0" step="0.0001" disabled={bloqueado||!permite} className={INPUT} value={cantidades[n]??''} onChange={e=>editar(n,e.target.value)}/>
      </label>}
     </div>
    })}
    <label className="block text-sm font-semibold">{['revision','descarga','incidencia'].includes(accion)?'Motivo confirmado (obligatorio)':'Observación (opcional)'}
     <textarea aria-label={`Motivo físico de factura ${facturaId}`} maxLength={1000} disabled={bloqueado} className={INPUT} value={motivo} onChange={e=>{setMotivo(e.target.value);setConfirmar(false)}}/>
    </label>
    <label className="flex items-start gap-3 text-sm py-2">
     <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={bloqueado||!permite} checked={confirmar} onChange={e=>setConfirmar(e.target.checked)}/>
     Verifiqué físicamente las cantidades y el motivo de este registro.
    </label>
    <button type="button" className="btn btn-primary min-h-11" disabled={bloqueado||!permite||!confirmar} onClick={guardar}>{ACCIONES[accion]}</button>
    <button type="button" className="btn btn-outline min-h-11 ml-2" disabled={bloqueado} onClick={()=>setRevision(r=>r+1)}>Actualizar registro físico</button>
   </>}
   <details><summary className="cursor-pointer min-h-11 py-3 font-semibold">Historial físico ({datos.historial.length})</summary>
    {!datos.historial.length&&<p className="text-sm">Todavía no hay carga ni entrega registrada.</p>}
    {datos.historial.map(e=><div key={e.id} className="mt-3 rounded-lg border p-3 text-sm space-y-1">
     <p className="font-semibold">{ACCIONES[e.accion]} · {fecha(e.fecha)}</p><p>Responsable: {e.responsable} · Revisión {e.version}</p>
     {e.motivo&&<p className="break-words">{e.motivo}</p>}
     {e.saldos.map(l=><p key={l.numeroLinea} className="break-words">Línea {l.numeroLinea} · {e.documento.lineas.find(x=>x.numeroLinea===l.numeroLinea)?.nombre}: cargado {numero(l.cargada)}, entregado {numero(l.entregada)}, descargado {numero(l.descargada)}</p>)}
    </div>)}
   </details>
  </>}
 </section>
}

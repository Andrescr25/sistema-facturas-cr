import { useEffect, useRef, useState } from 'react'
import api from '../../services/api'

const BASE='/orden-compra/por-ciclo'
const ESTADOS={revisado:'PDF preparado',enviando:'Envío en curso o pendiente de verificar',confirmado:'Envío confirmado',incierto:'Resultado por verificar',no_enviado:'El envío no se inició'}
const normalizar=t=>{const n=String(t).replace(/\D/g,'');return n.length===8?'506'+n:n}

/** Una copia se revisa y luego se manda tal cual. Consultar nunca reenvía. */
export default function EnvioOrdenCiclo({orden,onActualizar,onOcupado,ocupado,prompt}) {
  const [telefono,setTelefono]=useState(''),[mensaje,setMensaje]=useState(''),[telefonos,setTelefonos]=useState([])
  const [error,setError]=useState(''),[aviso,setAviso]=useState(''),[url,setUrl]=useState(''),[revisado,setRevisado]=useState(false)
  const [copiaAbierta,setCopiaAbierta]=useState(null)
  const [cargandoPropuesta,setCargandoPropuesta]=useState(true)
  const solicitud=useRef(null),blob=useRef(''),vivo=useRef(true)
  const actual=orden.envios?.find(e=>e.id===orden.envio_id)||orden.envios?.find(e=>e.estado==='revisado'&&e.version_orden===orden.version)
  const fijo=Boolean(orden.envio_id)||orden.estado==='enviada'
  const vigente=actual&&(!fijo?actual.numero===normalizar(telefono)&&actual.mensaje===mensaje.trim():true)
  const fallo=e=>e.response?.data?.message||'No se pudo consultar o guardar el envío. Recargá antes de reintentar.'
  const limpiar=()=>{if(blob.current)URL.revokeObjectURL(blob.current);blob.current='';setUrl('');setRevisado(false);setCopiaAbierta(null)}
  useEffect(()=>{
    // La propuesta llega una sola vez. Esperarla evita que su respuesta
    // reemplace el destino o mensaje que la persona empezó a escribir.
    let activo=true;vivo.current=true;setCargandoPropuesta(true)
    api.get(`${BASE}/${orden.id}/envios/propuesta`).then(({data})=>{
      if(!activo)return
      setTelefonos(data.data.telefonos)
      setTelefono(actual?.numero||data.data.telefonos[0]?.numero||'');setMensaje(actual?.mensaje||data.data.mensaje)
    }).catch(e=>{if(activo)setError(fallo(e))}).finally(()=>{if(activo)setCargandoPropuesta(false)})
    return()=>{activo=false;vivo.current=false;if(blob.current)URL.revokeObjectURL(blob.current)}
  },[orden.id])
  useEffect(()=>{limpiar()},[actual?.id])
  useEffect(()=>{
    if(actual?.estado!=='enviando')return
    let vivo=true
    const timer=setInterval(()=>api.get(`${BASE}/${orden.id}`).then(({data})=>{if(vivo)onActualizar(data.data)}).catch(()=>{}),3000)
    return()=>{vivo=false;clearInterval(timer)}
  },[orden.id,actual?.estado])
  const ejecutar=async tarea=>{
    onOcupado(true);setError('');setAviso('')
    try{const nueva=await tarea();if(!vivo.current)return;onActualizar(nueva)
      const e=nueva.envios?.find(e=>e.id===nueva.envio_id)||nueva.envios?.[0]
      if(e?.estado==='incierto'||e?.estado==='enviando')setAviso('No reenviés esta orden. Consultá si el proveedor tiene este mismo PDF y referencia.')
      else if(e?.estado==='confirmado')setAviso('Envío confirmado. Los productos y cantidades quedaron bloqueados; la recepción física sigue pendiente.')
      else if(e?.estado==='no_enviado')setAviso(e.motivo)
    }catch(e){setError(fallo(e))}finally{onOcupado(false)}
  }
  const preparar=()=>ejecutar(async()=>{
    const cuerpo={version:orden.version,telefono,mensaje},firma=JSON.stringify(cuerpo)
    if(solicitud.current?.firma!==firma)solicitud.current={firma,clave:crypto.randomUUID()}
    limpiar();return(await api.post(`${BASE}/${orden.id}/envios`,{...cuerpo,clave:solicitud.current.clave})).data.data
  })
  const abrirPdf=async copia=>{
    onOcupado(true);setError('')
    try{const {data}=await api.get(`${BASE}/${orden.id}/envios/${copia.id}/pdf`,{responseType:'blob'})
      if(!vivo.current)return
      limpiar();blob.current=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));setUrl(blob.current);setCopiaAbierta(copia)
    }catch{setError('No se pudo abrir la copia guardada. Recargá antes de enviar.')}finally{onOcupado(false)}
  }
  const enviar=()=>ejecutar(async()=>(await api.post(`${BASE}/${orden.id}/envios/${actual.id}/enviar`,{confirmar:true})).data.data)
  const verificar=async()=>{
    const motivo=await prompt('Confirmá únicamente si verificaste que el proveedor tiene esta orden y sus cantidades. ¿Cómo lo verificaste?',{title:'Confirmar envío verificado',inputPlaceholder:'Ejemplo: confirmó la referencia y cantidades por llamada',confirmLabel:'Registrar confirmación'})
    if(motivo)ejecutar(async()=>(await api.post(`${BASE}/${orden.id}/envios/${actual.id}/verificar`,{confirmarEnvio:true,motivo})).data.data)
  }
  const verificable=actual?.estado==='incierto'||(actual?.estado==='enviando'&&Date.now()-new Date(actual.iniciado_en).getTime()>300000)
  return <section className="card min-w-0 p-5 space-y-4" aria-label="Envío de la orden">
    <h3 className="text-lg font-bold">PDF y envío al proveedor</h3>
    {error&&<p role="alert" className="break-words text-peligro-700">{error}</p>}
    {aviso&&<p role="status" className="break-words text-nota-800">{aviso}</p>}
    {!fijo&&<p className="text-sm text-neutro-600">Prepará la copia con el destino y mensaje definitivos. Revisá el PDF antes de enviar.</p>}
    {telefonos.length>1&&!fijo&&<label className="block text-sm">Teléfonos de la ficha
      <select aria-label="Teléfonos del proveedor" disabled={ocupado||cargandoPropuesta} value={telefono} onChange={e=>{limpiar();setTelefono(e.target.value)}} className="mt-1 block w-full rounded-lg border p-2">
        <option value="">Escribir otro número</option>{telefonos.map(t=><option key={t.numero} value={t.numero}>{t.formateado}{t.esMovil?'':' · Fijo'}</option>)}
      </select></label>}
    <label className="block text-sm font-semibold">Número de WhatsApp
      <input aria-label="Número de WhatsApp de la orden" type="tel" value={fijo?actual?.numero||'':telefono} disabled={ocupado||fijo||cargandoPropuesta}
        onChange={e=>{limpiar();setTelefono(e.target.value)}} placeholder="Ej.: 8888 8888" className="mt-1 block w-full min-h-11 rounded-lg border p-2"/>
    </label>
    <label className="block text-sm font-semibold">Mensaje de la orden
      <textarea aria-label="Mensaje de la orden" value={fijo?actual?.mensaje||'':mensaje} disabled={ocupado||fijo||cargandoPropuesta} maxLength={2000} rows={3}
        onChange={e=>{limpiar();setMensaje(e.target.value)}} className="mt-1 block w-full rounded-lg border p-2"/>
    </label>
    <div className="flex flex-wrap gap-2">
      {!fijo&&<button type="button" className="btn btn-outline" disabled={ocupado||cargandoPropuesta||!telefono||!mensaje} onClick={preparar}>Preparar PDF para revisar</button>}
      {vigente&&<button type="button" className="btn btn-outline" disabled={ocupado} onClick={()=>abrirPdf(actual)}>Revisar PDF guardado</button>}
      {url&&<a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-outline">Abrir PDF</a>}
      {url&&<a href={url} download={copiaAbierta?.nombre_archivo||'orden.pdf'} className="btn btn-outline">Descargar PDF</a>}
    </div>
    {vigente&&<p className="break-words text-sm font-semibold">{ESTADOS[actual.estado]} · {actual.nombre_archivo}</p>}
    {url&&!fijo&&vigente&&copiaAbierta?.id===actual.id&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={revisado} onChange={e=>setRevisado(e.target.checked)} disabled={ocupado} className="mt-1"/>Revisé el PDF, el número y el mensaje de esta orden.</label>}
    {!fijo&&vigente&&actual.estado==='revisado'&&<button type="button" className="btn btn-primary" disabled={ocupado||!revisado||!url||copiaAbierta?.id!==actual.id} onClick={enviar}>Enviar esta copia por WhatsApp</button>}
    {fijo&&<p className="text-sm text-neutro-600">Se conserva exactamente este PDF, número y mensaje. La confirmación de envío no registra recepción física ni aumenta inventario.</p>}
    {verificable&&<button type="button" className="btn btn-outline" disabled={ocupado} onClick={verificar}>Confirmar envío verificado con el proveedor</button>}
    {!!orden.envios?.length&&<details className="text-sm"><summary className="cursor-pointer font-semibold">Historial de copias e intentos</summary>
      {orden.envios.map(e=><div key={e.id} className="mt-3 space-y-1 break-words"><p>{ESTADOS[e.estado]} · {e.numero} · {e.confirmacion==='manual'?'Confirmación manual':e.nombre_archivo}</p>{e.motivo&&<p>{e.motivo}</p>}
        <button type="button" className="underline" disabled={ocupado} onClick={()=>abrirPdf(e)}>Consultar esta copia</button></div>)}
    </details>}
  </section>
}

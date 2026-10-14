import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { normalizarTelefonoOrden } from '../utils/ordenCompraTexto'

const BASE='/orden-compra/por-ciclo'

/** Copia persistida y revisada; un intento incierto nunca se reenvía. */
export function useEnvioOrdenProveedor({orden,onActualizar,onOcupado,prompt}) {
  const [telefono,setTelefono]=useState(''),[mensaje,setMensaje]=useState(''),[telefonos,setTelefonos]=useState([])
  const [error,setError]=useState(''),[aviso,setAviso]=useState(''),[url,setUrl]=useState(''),[revisado,setRevisado]=useState(false)
  const [copiaAbierta,setCopiaAbierta]=useState(null)
  const [cargandoPropuesta,setCargandoPropuesta]=useState(true)
  const solicitud=useRef(null),blob=useRef(''),vivo=useRef(true)
  const actual=orden.envios?.find(e=>e.id===orden.envio_id)||orden.envios?.find(e=>e.estado==='revisado'&&e.version_orden===orden.version)
  const fijo=Boolean(orden.envio_id)||orden.estado==='enviada'
  const vigente=actual&&(!fijo?actual.numero===normalizarTelefonoOrden(telefono)&&actual.mensaje===mensaje.trim():true)
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
      else if(e?.estado==='confirmado')setAviso('Envío confirmado. Los productos y cantidades quedaron bloqueados; los próximos faltantes irán en otra orden.')
      else if(e?.estado==='no_enviado')setAviso(e.motivo)
    }catch(e){if(vivo.current)setError(fallo(e))}finally{if(vivo.current)onOcupado(false)}
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
    }catch{if(vivo.current)setError('No se pudo abrir la copia guardada. Recargá antes de enviar.')}finally{if(vivo.current)onOcupado(false)}
  }
  const enviar=()=>ejecutar(async()=>(await api.post(`${BASE}/${orden.id}/envios/${actual.id}/enviar`,{confirmar:true})).data.data)
  const verificar=async()=>{
    const motivo=await prompt('Confirmá únicamente si verificaste que el proveedor tiene esta orden y sus cantidades. ¿Cómo lo verificaste?',{title:'Confirmar envío verificado',inputPlaceholder:'Ejemplo: confirmó la referencia y cantidades por llamada',confirmLabel:'Registrar confirmación'})
    if(motivo)ejecutar(async()=>(await api.post(`${BASE}/${orden.id}/envios/${actual.id}/verificar`,{confirmarEnvio:true,motivo})).data.data)
  }
  const verificable=actual?.estado==='incierto'||(actual?.estado==='enviando'&&Date.now()-new Date(actual.iniciado_en).getTime()>300000)
  return { telefono,mensaje,telefonos,error,aviso,url,revisado,copiaAbierta,cargandoPropuesta,
    actual,fijo,vigente,verificable,preparar,abrirPdf,enviar,verificar,
    cambiarTelefono:v=>{limpiar();setTelefono(v)},cambiarMensaje:v=>{limpiar();setMensaje(v)},setRevisado }
}

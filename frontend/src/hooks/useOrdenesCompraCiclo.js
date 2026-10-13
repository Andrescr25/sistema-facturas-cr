import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useDialog } from './useDialog'
import { lineasDeCantidades, cantidadesOrdenValidas, revisionOrdenCambio, productosParaRevisar } from '../utils/ordenCompraTexto'

const BASE='/orden-compra/por-ciclo'

export function useOrdenesCompraCiclo({filtro,proveedorInicial,ordenInicial}) {
  const [lista,setLista]=useState([]),[vista,setVista]=useState('activas')
  const [seccion,setSeccion]=useState('productos')
  const [orden,setOrden]=useState(null),[sugerencia,setSugerencia]=useState(null)
  useEffect(()=>setSeccion('productos'),[orden?.id])
  const [cantidades,setCantidades]=useState({}),[error,setError]=useState(''),[mensaje,setMensaje]=useState('')
  const [cargando,setCargando]=useState(false),[ocupado,setOcupado]=useState(false),[revision,setRevision]=useState(0)
  const { prompt,dialogProps }=useDialog()
  const solicitud=useRef(null),lectura=useRef(0),proveedorConsumido=useRef(null)
  const ambito=`${filtro.rutaId}|${filtro.cicloId}`,actual=useRef(ambito);actual.current=ambito
  const fallo=e=>e.response?.data?.message||'No se pudo consultar o guardar la orden.'
  useEffect(()=>{
    let vivo=true;setLista([]);setCargando(true);setError('')
    api.get(BASE,{params:{...filtro.params,vista}}).then(({data})=>{if(vivo)setLista(data.data||[])})
      .catch(e=>{if(vivo)setError(fallo(e))}).finally(()=>{if(vivo)setCargando(false)})
    return()=>{vivo=false}
  },[filtro.params,vista,revision])
  useEffect(()=>{
    if(orden||sugerencia||ocupado||cargando)return
    // Programar la próxima consulta con la diferencia de horas DEL SERVIDOR;
    // el reloj del celular no decide qué se archiva. Consultar al recuperar
    // foco cubre una pestaña suspendida. No reemplazar formularios abiertos.
    const pendientes=lista.filter(o=>o.archivo_programado_en&&!o.archivada)
      .map(o=>new Date(o.archivo_programado_en)-new Date(o.consultada_en)).filter(Number.isFinite)
    const refrescar=()=>setRevision(r=>r+1)
    const timer=pendientes.length?setTimeout(refrescar,Math.min(2147483647,Math.max(1000,Math.min(...pendientes)+1000))):null
    window.addEventListener('focus',refrescar)
    return()=>{clearTimeout(timer);window.removeEventListener('focus',refrescar)}
  },[lista,orden,sugerencia,ocupado,cargando])
  useEffect(()=>{lectura.current++;setOrden(null);setSugerencia(null);setMensaje('');solicitud.current=null},[ambito])
  useEffect(()=>{
    // El botón de Faltantes inicia UNA revisión. Cambiar luego el filtro en
    // la lista/historial no debe abrir otra creación por el proveedor anterior.
    if (!proveedorInicial || !filtro.cicloId || proveedorConsumido.current===proveedorInicial) return
    let vivo=true;const n=++lectura.current;setOrden(null);setSugerencia(null);setCargando(true)
    api.get(BASE+'/sugerencia',{params:{...proveedorInicial,cicloId:filtro.cicloId}}).then(async({data})=>{
      if(!vivo||n!==lectura.current)return
      const identidad={proveedorId:data.data.proveedor.id,cicloId:filtro.cicloId}
      await api.post(BASE+'/sincronizar',identidad)
      const lista=(await api.get(BASE,{params:identidad})).data.data
      const abierta=lista.find(o=>['borrador','pendiente_enviar'].includes(o.estado)&&!o.envio_id)
      const existente=abierta?(await api.get(BASE+'/'+abierta.id)).data.data:null
      if(!vivo||n!==lectura.current)return
      proveedorConsumido.current=proveedorInicial
      if(existente){setOrden(existente);setCantidades(Object.fromEntries(existente.lineas.map(l=>[l.producto_id,String(l.cantidad_proveedor)])));setRevision(r=>r+1);return}
      setSugerencia(data.data);solicitud.current=null
      setCantidades(Object.fromEntries(data.data.productos.filter(p=>p.disponible>0&&p.factorValido).map(p=>[p.productoId,String(p.cantidadSugerida)])))
    }).catch(e=>{if(vivo){proveedorConsumido.current=proveedorInicial;setError(fallo(e))}}).finally(()=>{if(vivo)setCargando(false)})
    return()=>{vivo=false}
  },[proveedorInicial,filtro.cicloId])
  const abrir=async id=>{
    const n=++lectura.current;setError('');setMensaje('');setSugerencia(null);setCargando(true)
    try{const {data}=await api.get(BASE+'/'+id);if(n!==lectura.current)return
      setOrden(data.data);setCantidades(Object.fromEntries(data.data.lineas.map(l=>[l.producto_id,String(l.cantidad_proveedor)])))
    }catch(e){if(n===lectura.current)setError(fallo(e))}finally{if(n===lectura.current)setCargando(false)}
  }
  useEffect(()=>{
    if(ordenInicial)abrir(ordenInicial)
    return()=>{lectura.current++}
  },[ordenInicial])
  const ejecutar=async trabajo=>{
    const contexto=actual.current;setOcupado(true);setError('');setMensaje('')
    try{const nueva=await trabajo();if(contexto!==actual.current)return
      setOrden(nueva);setSugerencia(null);setCantidades(Object.fromEntries(nueva.lineas.map(l=>[l.producto_id,String(l.cantidad_proveedor)])))
      setMensaje('Orden guardada.');setRevision(r=>r+1)
    }catch(e){if(contexto===actual.current)setError(fallo(e))}finally{setOcupado(false)}
  }
  const lineas=()=>lineasDeCantidades(cantidades)
  const validas=()=>cantidadesOrdenValidas(lineas())
  const guardar=()=>ejecutar(async()=>{
    const productos=lineas()
    if(orden)return (await api.put(BASE+'/'+orden.id,{version:orden.version,lineas:productos})).data.data
    const cuerpo={proveedorId:sugerencia.proveedor.id,cicloId:filtro.cicloId,lineas:productos}
    const firma=JSON.stringify(cuerpo)
    // Reintentar una respuesta perdida conserva clave y cuerpo; otra revisión
    // usa otra clave. El servidor además impide reservar dos veces el faltante.
    if(solicitud.current?.firma!==firma)solicitud.current={firma,clave:crypto.randomUUID()}
    return (await api.post(BASE,{...cuerpo,clave:solicitud.current.clave})).data.data
  })
  const estado=async valor=>{
    let motivo
    if(valor==='cerrada'){
      motivo=await prompt('La orden se conservará en el historial y liberará sus reservas. Indicá el motivo.',{title:'Cancelar orden sin enviar',inputPlaceholder:'Motivo del cierre',confirmLabel:'Cancelar orden'})
      if(!motivo)return
    }
    ejecutar(async()=>(await api.patch(BASE+'/'+orden.id+'/estado',{version:orden.version,estado:valor,motivo})).data.data)
  }
  // Consultar adiciones no es un guardado: no reemplazar el formulario con
  // una respuesta vacía ni borrar cantidades que la persona aún no guardó.
  const consultarAdiciones=async()=>{
    setOcupado(true);setError('');const contexto=actual.current
    try{const {data}=await api.get(BASE+'/sugerencia',{params:{proveedorId:orden.proveedor_id,cicloId:orden.ciclo_id||'sin-ciclo'}})
      if(contexto!==actual.current)return
      const nuevas=data.data.productos.filter(p=>p.disponible>0&&p.factorValido&&!orden.lineas.some(l=>l.producto_id===p.productoId))
      setSugerencia({...data.data,productos:nuevas,adiciones:true});setMensaje(nuevas.length?'Seleccioná los productos y guardá la revisión.':'No hay productos nuevos con faltantes libres en este ciclo.')
    }catch(e){if(contexto===actual.current)setError(fallo(e))}finally{setOcupado(false)}
  }
  const prepararFaltantes=()=>ejecutar(async()=>{
    const {data}=await api.post(BASE+'/sincronizar',{proveedorId:orden.proveedor_id,cicloId:orden.ciclo_id||'sin-ciclo'})
    const id=data.data.ordenes[0]
    if(!id){const e=new Error('No hay faltantes libres para otra orden. Revisá las órdenes existentes del proveedor.');e.response={data:{message:e.message}};throw e}
    return(await api.get(BASE+'/'+id)).data.data
  })
  const volver=()=>{lectura.current++;setOrden(null);setSugerencia(null);setError('');setMensaje('');setRevision(r=>r+1)}
  const editar=orden?.estado==='borrador'||(!orden&&Boolean(sugerencia))
  const cambio=revisionOrdenCambio(orden,lineas())
  const productos=productosParaRevisar(orden,sugerencia)
  return { lista,vista,setVista,seccion,setSeccion,orden,sugerencia,cantidades,setCantidades,error,mensaje,cargando,ocupado,setOcupado,abrir,guardar,estado,consultarAdiciones,volver,editar,cambio,productos,validas,actual,ambito,setOrden,setRevision,prompt,dialogProps,prepararFaltantes }
}

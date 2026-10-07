import BotonExportarExcel from '../ui/BotonExportarExcel'
import CierreOrdenCiclo from './CierreOrdenCiclo'
import { useEffect, useRef, useState } from 'react'
import api from '../../services/api'
import { textoCiclo } from '../SelectorCiclo'
import { useDialog } from '../../hooks/useDialog'
import ConfirmModal from '../ConfirmModal'
import EnvioOrdenCiclo from './EnvioOrdenCiclo'
import FacturaOrdenCiclo from './FacturaOrdenCiclo'
import RecepcionOrdenCiclo from './RecepcionOrdenCiclo'

const BASE='/orden-compra/por-ciclo'
const ESTADOS={borrador:'Borrador',pendiente_enviar:'Pendiente de enviar',enviada:'Enviada · recepción pendiente',parcialmente_recibida:'Parcialmente recibida',recibida:'Recibida · recepción final registrada',cerrada:'Cerrada'}
const numero=n=>Number(n).toLocaleString('es-CR',{maximumFractionDigits:6})
const fecha=v=>new Date(v).toLocaleString('es-CR',{timeZone:'America/Costa_Rica'})

/** Las cantidades de este flujo son propias; no leer el borrador global. */
export default function OrdenesCompraCiclo({ filtro, proveedorInicial }) {
  const [lista,setLista]=useState([]),[vista,setVista]=useState('activas')
  const [orden,setOrden]=useState(null),[sugerencia,setSugerencia]=useState(null)
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
    api.get(BASE+'/sugerencia',{params:{...proveedorInicial,cicloId:filtro.cicloId}}).then(({data})=>{
      if(!vivo||n!==lectura.current)return
      proveedorConsumido.current=proveedorInicial
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
  const ejecutar=async trabajo=>{
    const contexto=actual.current;setOcupado(true);setError('');setMensaje('')
    try{const nueva=await trabajo();if(contexto!==actual.current)return
      setOrden(nueva);setSugerencia(null);setCantidades(Object.fromEntries(nueva.lineas.map(l=>[l.producto_id,String(l.cantidad_proveedor)])))
      setMensaje('Orden guardada.');setRevision(r=>r+1)
    }catch(e){if(contexto===actual.current)setError(fallo(e))}finally{setOcupado(false)}
  }
  const lineas=()=>Object.entries(cantidades).filter(([,q])=>q!=='').map(([id,q])=>({productoId:Number(id),cantidadProveedor:Number(q)}))
  const validas=()=>lineas().length>0&&lineas().every(l=>Number.isInteger(l.cantidadProveedor)&&l.cantidadProveedor>0&&l.cantidadProveedor<=1000000)
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
      motivo=await prompt('La orden se conservará en el historial y liberará sus reservas. Indicá el motivo.',{title:'Cerrar orden sin enviar',inputPlaceholder:'Motivo del cierre',confirmLabel:'Cerrar orden'})
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
  const volver=()=>{lectura.current++;setOrden(null);setSugerencia(null);setError('');setMensaje('');setRevision(r=>r+1)}
  const editar=orden?.estado==='borrador'||(!orden&&Boolean(sugerencia))
  const cambio=orden&&JSON.stringify(lineas().sort((a,b)=>a.productoId-b.productoId))!==JSON.stringify(orden.lineas.map(l=>({productoId:l.producto_id,cantidadProveedor:l.cantidad_proveedor})).sort((a,b)=>a.productoId-b.productoId))
  const productos=orden?orden.lineas.map(l=>({productoId:l.producto_id,nombre:l.producto_nombre,codigo:l.codigo_interno,codigoProveedor:l.codigo_proveedor,
    nombreProveedor:l.nombre_proveedor,factorConversion:l.factor_conversion,origenes:l.origenes,reservada:l.origenes.reduce((s,o)=>s+Number(o.cantidad),0)})):sugerencia?.productos.filter(p=>p.disponible>0)||[]
  return <div className="space-y-4">
    {error&&<p role="alert" className="rounded-lg bg-peligro-50 p-4 text-peligro-800">{error}</p>}
    {mensaje&&<p role="status" className="rounded-lg bg-exito-50 p-3 text-exito-800">{mensaje}</p>}
    {cargando&&<p role="status">Consultando órdenes de compra…</p>}
    {(orden||sugerencia)?<>
      {orden?<div className="flex flex-wrap gap-2"><button type="button" disabled={ocupado} className="btn btn-outline" onClick={volver}>Volver a órdenes</button><BotonExportarExcel ruta={`${BASE}/${orden.id}/exportar`} params={filtro.params} disabled={ocupado||cargando||Boolean(error)} title="Descarga esta orden y su procedencia; el PDF enviado se conserva."/></div>:<button type="button" disabled={ocupado} className="btn btn-outline" onClick={volver}>Volver a órdenes</button>}
      <div className="card p-5 space-y-2">
        <h2 className="break-words text-xl font-bold">{orden?orden.referencia:'Nueva orden'} · {orden?.proveedor_nombre||sugerencia?.proveedor.nombre}</h2>
        <p className="break-words font-semibold">{textoCiclo(orden?.ciclo||sugerencia?.ciclo)}</p>
        <p>{orden?ESTADOS[orden.estado]:'Revisá los productos y cantidades antes de guardar.'}</p>
        {orden?.archivada&&<p className="font-semibold">Archivada · disponible en Historial desde {fecha(orden.archivada_en)}</p>}
        {orden?.archivo_programado_en&&!orden.archivada&&<p className="text-sm">Pasará al historial el {fecha(orden.archivo_programado_en)}, 24 horas después de la recepción final.</p>}
        {orden?.motivo_cierre&&<p>Motivo: {orden.motivo_cierre}</p>}
        <p className="text-sm text-neutro-600">{orden?.estado==='cerrada'?(orden.enviada_en?'Cierre registrado. Se conserva la cobertura recibida y se libera únicamente lo pendiente. Documento enviado y procedencia conservados.':'Reservas liberadas. La orden conserva sus cantidades y procedencia.'):orden?.estado==='recibida'?'Recepción final registrada; cantidades originales y procedencia conservadas.':orden?.enviada_en?'Las cantidades solicitadas conservan su cobertura; la recepción física se registra abajo.':orden?.envio_id?'Intento de envío guardado. La orden queda bloqueada hasta verificar el resultado.':'Las reservas separan estos faltantes de otros borradores. La orden todavía no se ha enviado al proveedor.'}</p>
      </div>
      {!orden&&!productos.length&&<p className="card p-4">No hay faltantes libres para otra orden en este ciclo. Podés revisar las órdenes existentes.</p>}
      {productos.map(p=><div key={p.productoId} className="card min-w-0 p-4 space-y-2">
        <h3 className="break-words font-bold">{p.nombre}</h3>
        <p className="break-words text-sm">{p.codigoProveedor?`Proveedor: ${p.codigoProveedor} · ${p.nombreProveedor||p.nombre}`:`Código interno: ${p.codigo||p.productoId}`}</p>
        {!orden&&<p className="text-sm">Faltante: {numero(p.faltante)} · Apartado sin envío confirmado: {numero(p.reservadaBorrador)} · Ya pedido: {numero(p.solicitada)} · Libre: {numero(p.disponible)} unidades propias</p>}
        {orden&&<p className="text-sm">{['cerrada','recibida'].includes(orden.estado)?'Procedencia original conservada':orden.enviada_en?'Solicitado para estas facturas':'Apartado para estas facturas'}: {numero(p.reservada)} unidades propias.</p>}
        <p className="text-sm">1 unidad del proveedor = {numero(p.factorConversion)} unidades propias</p>
        {editar?<label className="block text-sm font-semibold">Cantidad del proveedor
          <input aria-label={`Cantidad del proveedor de ${p.nombre}`} type="number" min="1" max="1000000" step="1" value={cantidades[p.productoId]??''}
            disabled={ocupado||p.factorValido===false} className="mt-1 block w-full max-w-xs min-h-11 rounded-lg border p-2"
            onChange={e=>setCantidades(q=>({...q,[p.productoId]:e.target.value}))}/>
        </label>:<p className="font-bold">{'Pedido original'}: {numero(orden.lineas.find(l=>l.producto_id===p.productoId).cantidad_proveedor)} unidades del proveedor</p>}
        {editar&&cantidades[p.productoId]&&<p className="text-sm">Equivale a {numero(Number(cantidades[p.productoId])*p.factorConversion)} unidades propias.</p>}
        {!orden&&cantidades[p.productoId]&&Number(cantidades[p.productoId])*p.factorConversion>p.disponible&&<p className="text-sm text-nota-800">Excedente de empaque: {numero(Number(cantidades[p.productoId])*p.factorConversion-p.disponible)} unidades propias sin asignar a faltantes.</p>}
        {editar&&cantidades[p.productoId]&&<button type="button" disabled={ocupado} onClick={()=>setCantidades(q=>({...q,[p.productoId]:''}))} className="text-sm text-peligro-700 underline">Excluir producto de esta revisión</button>}
        {p.factorValido===false&&<p className="text-peligro-700">Corregí la conversión antes de incluir este producto.</p>}
        <details className="text-sm"><summary className="cursor-pointer font-semibold">Procedencia por factura</summary>
          {p.origenes.map(o=><p key={o.faltante_id||o.faltanteId} className="mt-1 break-words">{o.orden_visita||o.orden?`Parada ${o.orden_visita||o.orden} · `:''}{o.cliente_nombre} · Factura {o.factura_numero||o.numero} · {numero(o.cantidad??o.cantidad_faltante)} unidades{o.anticipado||o.preventa_anticipada?' · Anticipado':''}</p>)}
        </details>
      </div>)}
      {sugerencia?.adiciones&&sugerencia.productos.map(p=><div key={p.productoId} className="card p-4">
        <p className="font-bold break-words">{p.nombre} · {numero(p.disponible)} unidades libres</p>
        <label className="block text-sm">Agregar cantidad del proveedor
          <input aria-label={`Agregar ${p.nombre}`} type="number" min="1" max="1000000" step="1" value={cantidades[p.productoId]??''} disabled={ocupado}
            className="mt-1 w-full max-w-xs min-h-11 rounded-lg border p-2" onChange={e=>setCantidades(q=>({...q,[p.productoId]:e.target.value}))}/>
        </label><p className="text-sm">1 unidad del proveedor = {numero(p.factorConversion)} propias.</p>
      </div>)}
      <div className="flex flex-wrap gap-2">
        {editar&&<button type="button" className="btn btn-primary" disabled={ocupado||!validas()} onClick={guardar}>{orden?'Guardar revisión':'Guardar borrador'}</button>}
        {orden?.estado==='borrador'&&<>
          <button type="button" className="btn btn-outline" disabled={ocupado} onClick={consultarAdiciones}>Agregar faltantes del mismo ciclo</button>
          <button type="button" className="btn btn-outline" disabled={ocupado||cambio} onClick={()=>estado('pendiente_enviar')}>Marcar pendiente de enviar</button>
        </>}
        {orden?.estado==='pendiente_enviar'&&!orden.envio_id&&<button type="button" className="btn btn-outline" disabled={ocupado} onClick={()=>estado('borrador')}>Volver a borrador</button>}
        {orden&&['borrador','pendiente_enviar'].includes(orden.estado)&&!orden.envio_id&&<button type="button" className="btn btn-outline" disabled={ocupado} onClick={()=>estado('cerrada')}>Cerrar sin enviar</button>}
      </div>
      {cambio&&<p className="text-sm text-nota-800">Guardá la revisión antes de marcar la orden pendiente de enviar.</p>}
      {orden&&(orden.estado==='pendiente_enviar'||orden.enviada_en)&&<EnvioOrdenCiclo key={`envio-${orden.id}`} orden={orden} ocupado={ocupado} onOcupado={setOcupado} prompt={prompt}
        onActualizar={nueva=>{if(actual.current!==ambito)return;setOrden(nueva);setRevision(r=>r+1)}}/>}
      {orden?.enviada_en&&<FacturaOrdenCiclo key={`factura-${orden.id}`} orden={orden} ocupado={ocupado} onOcupado={setOcupado}/>}
      {orden?.enviada_en&&orden.estado!=='recibida'&&<CierreOrdenCiclo key={`cierre-${orden.id}`} orden={orden} ocupado={ocupado} onOcupado={setOcupado} onActualizar={nueva=>{if(actual.current!==ambito)return;setOrden(nueva);setRevision(r=>r+1)}}/>}
      {orden?.enviada_en&&<RecepcionOrdenCiclo key={`recepcion-${orden.id}-${orden.version}`} orden={orden} ocupado={ocupado} onOcupado={setOcupado} onActualizar={nueva=>{if(actual.current!==ambito)return;setOrden(nueva);setRevision(r=>r+1)}}/>}
    </>:<>
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">Órdenes por ciclo</h2><p className="text-sm text-neutro-600">Para preparar una nueva, abrí un proveedor en Faltantes y elegí su semana.</p></div>
        <div className="flex flex-wrap items-start gap-3"><BotonExportarExcel ruta={`${BASE}/exportar`} params={{...filtro.params,vista}} disabled={ocupado||cargando||Boolean(error)} title="Descarga las órdenes y su procedencia según los filtros y la vista activa o histórica."/><label className="text-sm font-semibold">Mostrar
          <select aria-label="Mostrar órdenes" value={vista} disabled={ocupado} onChange={e=>setVista(e.target.value)} className="ml-2 min-h-11 rounded-lg border p-2">
            <option value="activas">Activas</option><option value="historial">Historial</option>
          </select>
        </label></div>
      </div>
      {!cargando&&!lista.length&&<p className="card p-5 text-neutro-600">No hay órdenes en esta selección.</p>}
      {lista.map(o=><button type="button" key={o.id} onClick={()=>abrir(o.id)} disabled={ocupado||cargando} className="card block w-full p-5 text-left hover:border-primario-400">
        <p className="break-words font-bold">{o.referencia} · {o.proveedor_nombre}</p><p className="break-words text-sm">{textoCiclo(o.ciclo)}</p>
        <p className="mt-1 text-sm">{o.archivada?'Archivada · ':''}{ESTADOS[o.estado]} · {o.productos} productos</p>
      </button>)}
    </>}
    <ConfirmModal {...dialogProps}/>
  </div>
}

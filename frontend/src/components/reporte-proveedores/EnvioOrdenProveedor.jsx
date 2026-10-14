import Boton from '../ui/Boton'
import { useEnvioOrdenProveedor } from '../../hooks/useEnvioOrdenProveedor'

const ESTADOS={revisado:'PDF preparado',enviando:'Envío en curso o pendiente de verificar',confirmado:'Envío confirmado',incierto:'Resultado por verificar',no_enviado:'El envío no se inició'}

export default function EnvioOrdenProveedor({orden,onActualizar,onOcupado,ocupado,prompt}) {
  const { telefono,mensaje,telefonos,error,aviso,url,revisado,copiaAbierta,cargandoPropuesta,actual,fijo,vigente,verificable,preparar,abrirPdf,enviar,verificar,cambiarTelefono,cambiarMensaje,setRevisado } = useEnvioOrdenProveedor({orden,onActualizar,onOcupado,prompt})
  return <section className="card min-w-0 p-5 space-y-4" aria-label="Envío de la orden">
    <h3 className="text-lg font-bold">PDF y envío al proveedor</h3>
    {error&&<p role="alert" className="break-words text-peligro-700">{error}</p>}
    {aviso&&<p role="status" className="break-words text-nota-800">{aviso}</p>}
    {!fijo&&<p className="text-sm text-neutro-600">Prepará la copia con el destino y mensaje definitivos. Revisá el PDF antes de enviar.</p>}
    {telefonos.length>1&&!fijo&&<label className="block text-sm">Teléfonos de la ficha
      <select aria-label="Teléfonos del proveedor" disabled={ocupado||cargandoPropuesta} value={telefono} onChange={e=>cambiarTelefono(e.target.value)} className="mt-1 block w-full rounded-lg border p-2">
        <option value="">Escribir otro número</option>{telefonos.map(t=><option key={t.numero} value={t.numero}>{t.formateado}{t.esMovil?'':' · Fijo'}</option>)}
      </select></label>}
    <label className="block text-sm font-semibold">Número de WhatsApp
      <input aria-label="Número de WhatsApp de la orden" type="tel" value={fijo?actual?.numero||'':telefono} disabled={ocupado||fijo||cargandoPropuesta}
        onChange={e=>cambiarTelefono(e.target.value)} placeholder="Ej.: 8888 8888" className="mt-1 block w-full min-h-11 rounded-lg border p-2"/>
    </label>
    <label className="block text-sm font-semibold">Mensaje de la orden
      <textarea aria-label="Mensaje de la orden" value={fijo?actual?.mensaje||'':mensaje} disabled={ocupado||fijo||cargandoPropuesta} maxLength={2000} rows={3}
        onChange={e=>cambiarMensaje(e.target.value)} className="mt-1 block w-full rounded-lg border p-2"/>
    </label>
    <div className="flex flex-wrap gap-2">
      {!fijo&&<Boton variante="secundario" disabled={ocupado||cargandoPropuesta||!telefono||!mensaje} onClick={preparar}>Preparar PDF para revisar</Boton>}
      {vigente&&<Boton variante="secundario" disabled={ocupado} onClick={()=>abrirPdf(actual)}>Revisar PDF guardado</Boton>}
      {url&&<a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-outline">Abrir PDF</a>}
      {url&&<a href={url} download={copiaAbierta?.nombre_archivo||'orden.pdf'} className="btn btn-outline">Descargar PDF</a>}
    </div>
    {vigente&&<p className="break-words text-sm font-semibold">{ESTADOS[actual.estado]} · {actual.nombre_archivo}</p>}
    {url&&!fijo&&vigente&&copiaAbierta?.id===actual.id&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={revisado} onChange={e=>setRevisado(e.target.checked)} disabled={ocupado} className="mt-1"/>Revisé el PDF, el número y el mensaje de esta orden.</label>}
    {!fijo&&vigente&&actual.estado==='revisado'&&<Boton disabled={ocupado||!revisado||!url||copiaAbierta?.id!==actual.id} onClick={enviar}>Enviar esta copia por WhatsApp</Boton>}
    {fijo&&<p className="text-sm text-neutro-600">Se conserva exactamente este PDF, número y mensaje. Los faltantes nuevos se solicitan en otra orden.</p>}
    {verificable&&<Boton variante="secundario" disabled={ocupado} onClick={verificar}>Confirmar envío verificado con el proveedor</Boton>}
    {!!orden.envios?.length&&<details className="text-sm"><summary className="cursor-pointer font-semibold">Historial de copias e intentos</summary>
      {orden.envios.map(e=><div key={e.id} className="mt-3 space-y-1 break-words"><p>{ESTADOS[e.estado]} · {e.numero} · {e.confirmacion==='manual'?'Confirmación manual':e.nombre_archivo}</p>{e.motivo&&<p>{e.motivo}</p>}
        <Boton variante="fantasma" tamano="sm" disabled={ocupado} onClick={()=>abrirPdf(e)}>Consultar esta copia</Boton></div>)}
    </details>}
  </section>
}

import {useRegistroEntrega} from '../../hooks/useRegistroEntrega'
import {ESTADO_FISICO,ACCIONES_FISICAS as ACCIONES} from '../../utils/registroEntrega'
import {fechaHoraEnCostaRica as fecha} from '../../utils/fechaCR'
import Boton from '../ui/Boton'
import {useAuth} from '../../contexts/AuthContext'

const numero=v=>Number(v).toLocaleString('es-CR',{maximumFractionDigits:4})
const INPUT='mt-1 w-full min-h-11 rounded-xl border p-2'

export default function RegistroFisico({facturaId,onActualizar}) {
 const {usuario}=useAuth(),admin=Boolean(usuario?.esAdmin)
 const r=useRegistroEntrega(facturaId,onActualizar)
 const {datos,accion,cantidades,motivo,confirmar,error,mensaje,ocupado,leyendo,incierto,guardar,editar,cambiar}=r
 const bloqueado=ocupado||leyendo||incierto,permite=accion==='carga'?datos?.puedeCargar:accion==='entrega'?datos?.puedeEntregar:accion==='revision'?admin:true
 const lineas=accion==='revision'?datos?.documento.lineas:datos?.lineas
 return <section className="space-y-3 rounded-xl border border-neutro-200 p-4" aria-label={`Registro físico de factura ${facturaId}`}>
  <h4 className="text-lg font-bold">Carga y entrega física</h4>
  {leyendo&&<p role="status">Consultando cantidades e historial…</p>}
  {error&&<p role="alert" className="rounded-lg bg-peligro-50 p-3 text-peligro-800">{error}</p>}
  {mensaje&&<p role="status" className="rounded-lg bg-exito-50 p-3 text-exito-800">{mensaje}</p>}
  {!datos&&!leyendo&&!incierto&&<Boton variante="secundario" onClick={r.actualizar}>Reintentar registro físico</Boton>}
  {datos&&<>
   <p className="font-semibold">{ESTADO_FISICO[datos.estado]}</p>
   {datos.bloqueos.map((texto,i)=><p key={i} className="text-sm text-alerta-800">{texto}</p>)}
   {incierto?<Boton disabled={ocupado} onClick={r.reintentar}>Reintentar el mismo registro</Boton>:<>
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
     <textarea aria-label={`Motivo físico de factura ${facturaId}`} maxLength={1000} disabled={bloqueado} className={INPUT} value={motivo} onChange={e=>r.cambiarMotivo(e.target.value)}/>
    </label>
    <label className="flex items-start gap-3 text-sm py-2">
     <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={bloqueado||!permite} checked={confirmar} onChange={e=>r.cambiarConfirmacion(e.target.checked)}/>
     Verifiqué físicamente las cantidades y el motivo de este registro.
    </label>
    <Boton disabled={bloqueado||!permite||!confirmar} onClick={guardar}>{ACCIONES[accion]}</Boton>
    <Boton variante="secundario" className="ml-2" disabled={bloqueado} onClick={r.actualizar}>Actualizar registro físico</Boton>
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

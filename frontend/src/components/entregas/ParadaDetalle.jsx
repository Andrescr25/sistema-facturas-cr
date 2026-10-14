import { UbicacionEntrega } from './ListaEntrega'
import RegistroFisico from './RegistroFisico'
const numero=n=>Number(n).toLocaleString('es-CR',{maximumFractionDigits:4})

export default function ParadaDetalle({parada,onActualizar}) {
  return <section className="space-y-4" aria-label="Documentos de la parada">
    <div className="card p-5">
      <h2 className="break-words text-2xl font-bold">{parada.ruta?.orden?`Parada ${parada.ruta.orden} · `:''}{parada.clienteNombre}</h2>
      <UbicacionEntrega parada={parada}/>
    </div>
    {parada.documentos.map(d=><article key={`${d.tipo}-${d.id}`} className="card p-5 space-y-3">
      <h3 className="break-words text-xl font-bold">{d.tipo==='factura'?`Factura ${d.numero}`:`Pedido #${d.id} · por facturar`}</h3>
      {d.pedidoId&&d.tipo==='factura'&&<p className="text-sm">Pedido de origen #{d.pedidoId}</p>}
      {d.anticipado&&<p className="font-semibold text-nota-700">Preventa anticipada</p>}
      {d.origen&&<p className="text-sm">{d.origen==='portal'?'Pedido en línea':'Pedido del agente'}</p>}
      <p className="font-semibold">{d.tipo==='pedido'?'Pendiente de revisión y facturación':d.revisionBodega?'Revisión de bodega registrada':'Por preparar en bodega'}</p>
      {d.faltantes>0&&<p className="rounded-lg bg-alerta-50 p-3 text-alerta-800">{d.faltantes} faltantes registrados. Revisá los paquetes antes de cargar.</p>}
      <p className="text-sm text-neutro-600">{d.tipo==='pedido'?'Cantidades solicitadas':'Cantidades facturadas'}</p>
      <ul className="divide-y divide-neutro-100">
        {d.lineas.map((l,i)=><li key={i} className="py-3 space-y-1">
          <p className="break-words font-semibold">{l.nombre} · {numero(l.cantidad)}</p>
          {l.referencia&&<p className="break-words text-sm text-neutro-600">Ref. {l.referencia}</p>}
          {l.descripcion&&<p className="break-words text-sm">{l.descripcion}</p>}
        </li>)}
      </ul>
      {!d.lineas.length&&<p className="text-sm text-neutro-600">Este documento no tiene líneas registradas.</p>}
      {d.tipo==='factura'&&<RegistroFisico key={d.id} facturaId={d.id} onActualizar={onActualizar}/>}
    </article>)}
  </section>
}

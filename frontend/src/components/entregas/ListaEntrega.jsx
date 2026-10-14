import { MapPin, Truck, ClipboardCheck, FileText } from 'lucide-react'
import TarjetasResumen from '../pagos/TarjetasResumen'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { ESTADO_FISICO } from '../../utils/registroEntrega'

export function UbicacionEntrega({ parada }) {
  return <div className="space-y-2 text-sm text-neutro-600">
    <p>{parada.ruta?.nombre || 'Sin ruta'}{parada.ruta?.orden ? ` · Parada ${parada.ruta.orden}` : ''}</p>
    {parada.ubicacion_maps && <a href={parada.ubicacion_maps} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primario-200 px-3 font-semibold text-primario-700"><MapPin size={16} />Ver ubicación</a>}
  </div>
}

export default function ListaEntrega({ datos: b }) {
  const p = b.plan, carga = b.orden === 'carga', historial = b.filtro.vista === 'historial'
  const paradas = carga ? p.carga : p.paradas
  return <div className="space-y-5">
    <TarjetasResumen compacta tarjetas={[
      { clave: 'paradas', titulo: 'Paradas', valor: p.resumen.paradas, icono: MapPin },
      { clave: 'facturas', titulo: 'Facturas', valor: p.resumen.facturas, icono: FileText },
      { clave: 'bodega', titulo: 'Revisadas en bodega', valor: `${p.resumen.revisadas} / ${p.resumen.facturas}`, icono: ClipboardCheck }
    ]} />
    {!historial && <div className="flex flex-wrap gap-2" aria-label="Vista del recorrido">
      <Boton variante={carga ? 'secundario' : 'primario'} onClick={() => b.cambiarOrden('entrega')}>Orden de entrega</Boton>
      <Boton variante={carga ? 'primario' : 'secundario'} icono={Truck} onClick={() => b.cambiarOrden('carga')}>Sugerencia de carga</Boton>
    </div>}
    <section className="space-y-4" aria-label={carga ? 'Orden sugerido de carga' : 'Paradas en orden de entrega'}>
      <h2 className="text-xl font-bold text-neutro-900">{historial ? 'Historial físico' : carga ? 'Carga' : 'Entregas'} · {p.ruta.nombre}</h2>
      <p className="text-sm text-neutro-500">{historial ? 'Facturas entregadas y registros de facturas retiradas de la operación activa.' : carga
        ? 'Toda la ruta, en orden inverso. Las pendientes de bodega aparecen para preparar; la carga física exige su revisión.'
        : 'La revisión de bodega prepara el pedido. La entrega al cliente se confirma con el registro físico.'}</p>
      {!paradas.length && <p className="card p-5 text-neutro-600">{historial ? 'No hay registros en el historial de esta ruta.' : 'No hay facturas pendientes en esta ruta.'}</p>}
      {paradas.map(parada => {
        const documentos = carga ? parada.facturas : parada.documentos
        return <article key={parada.clave} className="card space-y-3 p-5">
          <h3 className="break-words text-xl font-bold text-neutro-900">{carga ? `Carga ${parada.ordenCarga} · ` : ''}{parada.clienteNombre}</h3>
          <p className="text-xs text-neutro-500">{parada.clienteId ? `Cliente #${parada.clienteId}` : 'Documento sin ficha'} · {documentos.length} facturas</p>
          <UbicacionEntrega parada={parada} />
          {documentos.map(d => <div key={d.id} className="space-y-1 text-sm">
            <p className="break-words font-semibold text-neutro-800">Factura {d.numero}</p>
            <div className="flex flex-wrap items-center gap-2"><Insignia tono={d.vigente ? 'neutro' : 'peligro'}>{d.vigente ? ESTADO_FISICO[d.avance.estado] : 'Anulada / acreditada'}</Insignia>
              {!d.revisionBodega && <Insignia tono="alerta">Por preparar en bodega</Insignia>}</div>
            {!d.vigente && Number(d.avance.enCamion) > 0 && <p className="text-peligro-700">Hay carga en camión que debe descargarse físicamente.</p>}
            {d.faltantes > 0 && <p className="text-alerta-700">{d.faltantes} faltantes registrados; verificá los paquetes.</p>}
          </div>)}
          <Boton variante="secundario" aria-label={`Ver pedidos de ${parada.clienteNombre}, parada ${parada.clave}`} onClick={() => b.abrir(parada)}>Ver pedidos de {parada.clienteNombre}</Boton>
        </article>
      })}
      {!carga && p.paginacion.paginas > 1 && <nav className="flex flex-wrap items-center gap-3" aria-label="Páginas de paradas">
        <Boton variante="secundario" disabled={b.pagina <= 1} onClick={() => b.cambiarPagina(b.pagina - 1)}>Anterior</Boton>
        <p className="text-sm">Página {b.pagina} de {p.paginacion.paginas}</p>
        <Boton variante="secundario" disabled={b.pagina >= p.paginacion.paginas} onClick={() => b.cambiarPagina(b.pagina + 1)}>Siguiente</Boton>
      </nav>}
    </section>
  </div>
}

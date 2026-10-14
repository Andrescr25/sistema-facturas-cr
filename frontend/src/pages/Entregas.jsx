import { RefreshCw, Truck } from 'lucide-react'
import BotonExportarExcel from '../components/ui/BotonExportarExcel'
import Boton from '../components/ui/Boton'
import FiltroRutaEntrega from '../components/entregas/FiltroRutaEntrega'
import ListaEntrega from '../components/entregas/ListaEntrega'
import ParadaDetalle from '../components/entregas/ParadaDetalle'
import { useEntregas } from '../hooks/useEntregas'

export default function Entregas() {
  const b = useEntregas()
  return <div className="mx-auto max-w-6xl space-y-5 pb-24">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-3xl font-extrabold text-neutro-900"><Truck />Carga y Entregas</h1>
        <p className="mt-2 text-neutro-600">Facturas pendientes y carga de cada ruta.</p></div>
      <div className="flex flex-wrap gap-2">
        <BotonExportarExcel ruta="/entregas/exportar" params={{ ...b.filtro.params, ...(b.seleccion ? { clave: b.seleccion } : {}) }}
          disabled={!b.plan || Boolean(b.error) || (Boolean(b.seleccion) && !b.detalle)} title="Descarga todos los resultados de la ruta y la carga, incluidas todas las páginas." />
        <Boton variante="secundario" icono={RefreshCw} onClick={b.actualizar} disabled={!b.filtro.rutaId || b.cargando || b.cargandoDetalle}>Actualizar ruta</Boton>
      </div>
    </header>
    <FiltroRutaEntrega filtro={b.filtro} />
    {!b.filtro.rutaId && <p className="card p-5 text-neutro-600">Elegí una ruta para preparar sus facturas pendientes.</p>}
    {b.error && <div role="alert" className="card space-y-3 p-5 text-peligro-700"><p>{b.error}</p><Boton variante="secundario" onClick={b.actualizar}>Reintentar ruta</Boton></div>}
    {b.cargando && <p role="status" className="text-neutro-500">Consultando facturas de la ruta…</p>}
    {b.seleccion ? <>
      <Boton variante="secundario" onClick={b.volver}>Volver al recorrido</Boton>
      {b.errorDetalle && <div role="alert" className="card space-y-3 p-5 text-peligro-700"><p>{b.errorDetalle}</p><Boton variante="secundario" onClick={b.actualizar}>Reintentar parada</Boton></div>}
      {b.cargandoDetalle && <p role="status" className="text-neutro-500">Consultando documentos de la parada…</p>}
      {b.detalle && <ParadaDetalle parada={b.detalle} onActualizar={b.actualizarPlan} />}
    </> : b.plan && <ListaEntrega datos={b} />}
  </div>
}

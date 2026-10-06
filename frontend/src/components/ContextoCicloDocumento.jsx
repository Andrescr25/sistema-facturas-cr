import { textoCiclo } from './SelectorCiclo'

export default function ContextoCicloDocumento({ documento, maps = false }) {
  const c = documento.ciclo
  return <div className="mt-2 space-y-1 text-sm">
    <p className="break-words font-semibold text-primario-700">{textoCiclo(c)}{c ? ` · Parada ${c.orden}` : ''}</p>
    {documento.anticipado && <p className="text-xs font-semibold text-nota-700">Pedido anticipado en línea</p>}
    {maps && documento.ubicacion_maps && <a href={documento.ubicacion_maps} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center rounded-lg border border-primario-200 px-3 font-semibold text-primario-700">Ver ubicación</a>}
  </div>
}

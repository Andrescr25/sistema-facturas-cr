import { Package, Users, UploadCloud } from 'lucide-react'

/**
 * Cuánto catálogo hay guardado en este dispositivo.
 *
 * Antes eran tres tarjetas grandes; en el teléfono un carrusel horizontal
 * que había que pasar de lado y que empujaba el buscador de cliente fuera de
 * la primera pantalla. Es información de contexto —se mira una vez al abrir,
 * para saber si hay que actualizar— así que ahora es una sola línea.
 *
 * De paso: el carrusel llamaba a `scrollbar-hide`, que no existe en
 * index.css (la clase real es `scrollbar-none`), así que la barra se veía
 * igual.
 *
 * `porSubir` es la cola de ahora mismo. `cacheStats` se lee al abrir y al
 * actualizar el catálogo: después de facturar sin señal seguía diciendo
 * "0 por subir" mientras la cabecera marcaba 1.
 */
export default function EstadoCatalogo({ cacheStats, porSubir }) {
  const fecha = (valor) =>
    valor ? new Date(valor).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }) : null

  const datos = [
    { icono: Package, color: 'text-primario-600', etiqueta: 'productos', valor: cacheStats.productos.total, pie: fecha(cacheStats.productos.ultimaActualizacion) },
    { icono: Users, color: 'text-exito-600', etiqueta: 'clientes', valor: cacheStats.clientes.total, pie: fecha(cacheStats.clientes.ultimaActualizacion) },
    { icono: UploadCloud, color: 'text-nota-600', etiqueta: 'por subir', valor: porSubir ?? cacheStats.facturasPendientes, pie: null }
  ]

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-neutro-200 bg-neutro-50 px-4 py-2.5 text-sm">
      {datos.map((d) => {
        const Icono = d.icono
        return (
          <span key={d.etiqueta} className="flex items-center gap-1.5">
            <Icono size={15} className={`shrink-0 ${d.color}`} />
            <span className="font-bold text-neutro-900">{d.valor}</span>
            <span className="text-neutro-500">{d.etiqueta}</span>
            {d.pie && <span className="hidden text-xs text-neutro-400 sm:inline">· {d.pie}</span>}
          </span>
        )
      })}
    </div>
  )
}

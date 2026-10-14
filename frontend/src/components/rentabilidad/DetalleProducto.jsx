import { ArrowLeft, Loader2 } from 'lucide-react'
import Insignia from '../ui/Insignia'
import Dato from './Dato'
import CuandoSeVende from './CuandoSeVende'
import { Foto, AvisoMargen, TONO_CLASE } from './ListaProductos'
import { colonesCorto, colonesExactos, porcentaje, unidades, MESES_CORTOS } from '../../utils/rentabilidadFormato'

/**
 * Un producto: su margen, su rotación real y cuándo se vende, en unidades.
 */

function fechaCorta(fecha) {
  if (!fecha) return 'sin ventas en 3 meses'
  const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`
}

export default function DetalleProducto({ seleccionado, detalle, cargando, error, onVolver }) {
  const p = detalle?.producto || seleccionado

  return (
    <div className="space-y-5">
      <button type="button" onClick={onVolver}
        className="-ml-2 flex items-center rounded-xl px-2 py-2.5 text-neutro-500 transition-colors hover:text-primario-600">
        <ArrowLeft className="mr-2" size={20} /> Volver a productos
      </button>

      <div className="card flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <Foto url={p.imagenUrl} nombre={p.nombre} tamano="h-24 w-24" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Insignia tono={TONO_CLASE[p.clase]}>Rotación {p.clase}</Insignia>
            <AvisoMargen producto={p} />
          </div>
          <h1 className="mt-1.5 break-words text-2xl font-bold leading-tight text-neutro-900 sm:text-3xl">{p.nombre}</h1>
          <p className="mt-0.5 text-sm text-neutro-500">
            {p.referencia ? `Ref. ${p.referencia} · ` : ''}{p.categoria}{p.subcategoria ? ` · ${p.subcategoria}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato titulo="Precio con IVA" valor={p.precioConIva !== null ? colonesExactos(p.precioConIva) : '—'}
          pie={`${colonesExactos(p.precio)} sin IVA${p.tarifa !== null ? ` · IVA ${p.tarifa} %` : ''}`} />
        <Dato titulo="Costo sin IVA" valor={p.costoSinIva !== null ? colonesExactos(p.costoSinIva) : '—'}
          pie={p.origenCosto === 'facturas' ? 'De las facturas del proveedor' : p.origenCosto === 'alegra' ? 'El registrado en el producto' : 'No hay costo registrado'} />
        <Dato titulo="Margen hoy" valor={porcentaje(p.margen)}
          tono={p.margen === null ? 'alerta' : p.margen < 0 ? 'peligro' : 'neutro'}
          pie="Precio de hoy contra costo de hoy" />
        <Dato titulo="Dejó en 3 meses" valor={p.ganancia !== null ? colonesCorto(p.ganancia) : '—'}
          tono={p.ganancia !== null && p.ganancia < 0 ? 'peligro' : 'neutro'}
          pie={`De ${colonesCorto(p.ventas)} vendidos · estimado con el costo de hoy`} />
        <Dato titulo="Rotación mensual" valor={`${unidades(p.unidadesMes)} u. / mes`} pie="Últimos 30 días" />
        <Dato titulo="Facturas" valor={p.facturas} pie={`${p.clientes} ${p.clientes === 1 ? 'cliente distinto' : 'clientes distintos'} · 3 meses`} />
        <Dato titulo="Última venta" valor={fechaCorta(p.ultimaVenta)} />
        <Dato titulo="Rotación" valor={`Clase ${p.clase}`}
          pie={p.clase === 'A' ? 'De lo que más se vende (80 % de las unidades)' : p.clase === 'B' ? 'Se vende bien (el siguiente 15 %)' : 'Se vende poco o nada'} />
      </div>

      {error && <p className="rounded-xl bg-peligro-50 px-4 py-3 text-sm text-peligro-800">{error}</p>}
      {cargando && !detalle && (
        <div className="flex items-center justify-center gap-2 py-10 text-neutro-500">
          <Loader2 size={18} className="animate-spin" /> Calculando cuándo se vende…
        </div>
      )}
      {detalle && <CuandoSeVende series={detalle.series} medida="unidades" titulo="Cuánto se vende de este producto" />}
    </div>
  )
}

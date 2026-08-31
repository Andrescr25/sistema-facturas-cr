import { TrendingDown, TrendingUp, Camera, Minus } from 'lucide-react'
import { formatCurrency, margenLabel } from '../../utils/rentabilidadUtils'

/**
 * Monitoreo de márgenes: cómo evoluciona el margen del catálogo entre fotos
 * semanales, y qué productos se deterioraron sin que nadie los tocara.
 *
 * El margen "ponderado" pesa cada producto por su facturación: es la salud
 * real del negocio. El "mediana" es el producto típico. Cuando el ponderado
 * está muy por debajo de la mediana significa que lo que más vendés deja
 * menos margen que el resto — que es justo lo que hay que saber.
 */
export default function MonitoreoMargenes({ tendencia, deterioro, loading }) {
  if (loading) {
    return <div className="card p-8 text-center text-neutro-400">Cargando monitoreo...</div>
  }

  const serie = tendencia?.serie || []
  if (serie.length === 0) {
    return (
      <div className="card p-8 text-center text-neutro-500">
        <Camera size={28} className="mx-auto text-neutro-300 mb-2" />
        <p className="text-sm">Todavía no hay ninguna foto del margen.</p>
        <p className="text-xs text-neutro-400 mt-1">Se toma sola cada semana.</p>
      </div>
    )
  }

  const ultima = serie[serie.length - 1]
  const previa = serie.length > 1 ? serie[serie.length - 2] : null
  const delta = previa ? ultima.margenPonderado - previa.margenPonderado : null

  const fecha = (f) => new Date(f).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })
  const maxMargen = Math.max(...serie.map(s => s.margenPonderado || 0), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-neutro-500">Margen ponderado por facturación</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-semibold text-neutro-900">{margenLabel(ultima.margenPonderado)}</p>
            {delta !== null && (
              <span className={`text-xs font-semibold flex items-center gap-0.5 ${
                delta > 0.1 ? 'text-exito-600' : delta < -0.1 ? 'text-peligro-600' : 'text-neutro-400'
              }`}>
                {delta > 0.1 ? <TrendingUp size={13} /> : delta < -0.1 ? <TrendingDown size={13} /> : <Minus size={13} />}
                {delta > 0 ? '+' : ''}{delta.toFixed(2)} pts
              </span>
            )}
          </div>
          <p className="text-xs text-neutro-400 mt-0.5">Lo que de verdad ganás, pesando cada producto por lo que factura</p>
        </div>

        <div className="card">
          <p className="text-sm text-neutro-500">Margen del producto típico</p>
          <p className="text-2xl font-semibold text-neutro-900 mt-1">{margenLabel(ultima.margenMediana)}</p>
          <p className="text-xs text-neutro-400 mt-0.5">Mediana del catálogo</p>
        </div>

        <div className="card">
          <p className="text-sm text-neutro-500">Cobertura del dato</p>
          <p className="text-2xl font-semibold text-neutro-900 mt-1">
            {ultima.conCosto}<span className="text-base text-neutro-400"> / {ultima.productos}</span>
          </p>
          <p className="text-xs text-neutro-400 mt-0.5">
            {ultima.sinCosto} sin costo · {ultima.margenNegativo} en negativo
          </p>
        </div>
      </div>

      {/* Serie histórica. Con una sola foto no hay curva que mostrar todavía. */}
      <div className="card">
        <h3 className="text-sm font-semibold text-neutro-900 mb-3">Evolución</h3>
        {serie.length === 1 ? (
          <p className="text-sm text-neutro-500">
            Esta es la primera foto ({fecha(ultima.fecha)}). La curva aparece a partir de la segunda,
            la semana que viene.
          </p>
        ) : (
          <div className="flex items-end gap-2 h-32">
            {serie.map((s) => (
              <div key={s.fecha} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${fecha(s.fecha)}: ${margenLabel(s.margenPonderado)}`}>
                <span className="text-[10px] text-neutro-500">{s.margenPonderado}</span>
                <div
                  className="w-full bg-primario-500/80 rounded-t"
                  style={{ height: `${Math.max((s.margenPonderado / maxMargen) * 100, 3)}%` }}
                />
                <span className="text-[10px] text-neutro-400 truncate w-full text-center">{fecha(s.fecha)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lo accionable: qué perdió margen solo. */}
      <div className="card">
        <h3 className="text-sm font-semibold text-neutro-900 mb-1">Perdieron margen</h3>
        <p className="text-xs text-neutro-400 mb-3">
          Productos cuyo margen bajó sin que nadie cambiara el precio — casi siempre el proveedor subió el costo.
        </p>
        {deterioro?.sinComparacion ? (
          <p className="text-sm text-neutro-500">
            Hace falta al menos una segunda foto para comparar.
          </p>
        ) : !deterioro?.productos?.length ? (
          <p className="text-sm text-neutro-500">Ningún producto perdió margen entre las dos fotos. </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutro-400 uppercase border-b border-neutro-100">
                  <th className="py-2 text-left font-medium">Producto</th>
                  <th className="py-2 text-right font-medium">Antes</th>
                  <th className="py-2 text-right font-medium">Ahora</th>
                  <th className="py-2 text-right font-medium">Caída</th>
                  <th className="py-2 text-right font-medium">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutro-50">
                {deterioro.productos.map((p) => (
                  <tr key={p.alegraItemId}>
                    <td className="py-2 pr-3">
                      <p className="text-neutro-800 truncate max-w-[18rem]" title={p.nombre}>{p.nombre}</p>
                      <p className="text-xs text-neutro-400">{p.categoria}</p>
                    </td>
                    <td className="py-2 text-right text-neutro-500">{margenLabel(p.margenAntes)}</td>
                    <td className="py-2 text-right font-medium text-neutro-900">{margenLabel(p.margenAhora)}</td>
                    <td className="py-2 text-right font-semibold text-peligro-600">−{p.caida} pts</td>
                    <td className="py-2 text-right text-xs text-neutro-500">
                      {formatCurrency(p.costoAntes)} → {formatCurrency(p.costoAhora)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

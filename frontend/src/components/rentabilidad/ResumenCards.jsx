import { Store, Package } from 'lucide-react'
import { CLASIFICACION_INFO } from '../../utils/rentabilidadUtils'

/**
 * Salud del catálogo de un vistazo. Antes eran 6 tarjetas con un número
 * cada una: para saber "¿qué tan mal estoy?" había que leerlas todas y
 * hacer la proporción de cabeza. Una barra apilada responde eso sin leer
 * ningún número, y los números quedan igual en la leyenda.
 *
 * Cada segmento y cada chip filtra la lista de productos de abajo — mismo
 * comportamiento que tenían las tarjetas.
 */

const SEGMENTOS = [
  { key: 'OK', color: 'bg-green-500', texto: 'text-green-600', punto: 'bg-green-500' },
  { key: 'SIN_COSTO', color: 'bg-gray-300', texto: 'text-gray-600', punto: 'bg-gray-300' },
  { key: 'UNIDAD_SOSPECHOSA', color: 'bg-orange-400', texto: 'text-orange-600', punto: 'bg-orange-400' },
  { key: 'MARGEN_NEGATIVO', color: 'bg-red-500', texto: 'text-red-600', punto: 'bg-red-500' }
]

export default function ResumenCards({ resumen, filtros, setFiltros }) {
  if (!resumen) return null

  const total = resumen.totalProductos || 1
  const pct = (n) => (n / total) * 100

  const toggle = (clasificacion) => {
    setFiltros((prev) => ({ ...prev, clasificacion: prev.clasificacion === clasificacion ? 'todas' : clasificacion }))
  }

  const toggleSuperaTecho = () => {
    setFiltros((prev) => ({ ...prev, superaTecho: !prev.superaTecho }))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card lg:col-span-2">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Calidad del costo</h2>
          <span className="text-sm text-gray-500 flex items-center gap-1.5">
            <Package size={14} />
            {resumen.totalProductos} productos activos
          </span>
        </div>

        <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-3">
          {SEGMENTOS.map(({ key, color }) => {
            const n = resumen.porClasificacion[key]
            if (!n) return null
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                title={`${CLASIFICACION_INFO[key].label}: ${n}`}
                style={{ width: `${pct(n)}%` }}
                className={`${color} transition-opacity hover:opacity-75 ${
                  filtros.clasificacion !== 'todas' && filtros.clasificacion !== key ? 'opacity-30' : ''
                }`}
              />
            )
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {SEGMENTOS.map(({ key, texto, punto }) => {
            const n = resumen.porClasificacion[key]
            const activo = filtros.clasificacion === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                className={`flex items-center gap-1.5 text-sm rounded-lg px-1.5 py-0.5 -mx-1.5 transition ${
                  activo ? 'bg-gray-100 ring-1 ring-gray-300' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${punto}`} />
                <span className="text-gray-600">{CLASIFICACION_INFO[key].label}</span>
                <span className={`font-semibold ${texto}`}>{n}</span>
                <span className="text-xs text-gray-400">{pct(n).toFixed(0)}%</span>
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={toggleSuperaTecho}
        className={`card text-left transition hover:shadow-md hover:border-blue-300 ${filtros.superaTecho ? 'ring-2 ring-blue-400 border-blue-300' : ''}`}
      >
        <p className="text-sm text-gray-500 flex items-center gap-1.5">
          <Store size={14} className="text-blue-500" />
          Competencia
        </p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-2xl font-semibold text-blue-600">{resumen.competencia?.superanTecho ?? 0}</span>
          <span className="text-sm text-gray-500">sobre el techo</span>
        </div>
        <span className="text-xs text-gray-400">
          de {resumen.competencia?.conDato ?? 0} con dato · Click para filtrar
        </span>
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import apiPortal from '../../services/apiPortal'
import { formatearColones } from '../../utils/catalogoClientesUtils'

/**
 * "Se lleva junto con" — la recomendación por co-ocurrencia.
 *
 * Sale de las 5.261 facturas de venta_historico: cuántas veces esos dos
 * productos estuvieron en la misma factura. En ferretería los complementos
 * son físicamente necesarios (un codo de ½ necesita uniones y pegamento), y
 * eso hace que la sugerencia acierte mucho más que en un rubro cualquiera.
 *
 * Se muestra el número de coincidencias porque es lo que la vuelve creíble:
 * "491 clientes lo llevaron junto" pesa más que una sugerencia sin respaldo.
 */
export default function SugerenciasJuntoCon({ ids, titulo = 'Se lleva junto con', onAgregar, compacto = false }) {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!ids || ids.length === 0) { setProductos([]); return }

    let vigente = true
    setCargando(true)
    apiPortal.get('/portal/junto-con', { params: { ids: ids.join(',') } })
      .then(({ data }) => { if (vigente) setProductos(data.data) })
      .catch(() => { if (vigente) setProductos([]) })
      .finally(() => { if (vigente) setCargando(false) })

    return () => { vigente = false }
  }, [ids?.join(',')])

  if (cargando || productos.length === 0) return null

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Sparkles size={14} className="text-emerald-600" />
        <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-wide">{titulo}</h3>
      </div>

      <div className={compacto ? 'space-y-2' : 'grid grid-cols-2 sm:grid-cols-4 gap-2.5'}>
        {productos.map(p => (
          <div
            key={p.id}
            className={compacto
              ? 'flex items-center gap-2.5 bg-gray-50 rounded-xl p-2'
              : 'bg-white border border-gray-150 rounded-xl p-2.5 flex flex-col gap-1.5'}
          >
            {p.imagen && (
              <img
                src={p.imagen}
                alt=""
                loading="lazy"
                className={compacto ? 'w-10 h-10 object-contain rounded-lg shrink-0' : 'w-full aspect-square object-contain'}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-gray-900 leading-tight line-clamp-2">{p.nombre}</p>
              <p className="text-[10px] text-gray-400">{p.juntos} clientes lo llevaron junto</p>
              <p className="text-xs font-extrabold text-emerald-700 mt-0.5">{formatearColones(p.precio)}</p>
            </div>
            <button
              type="button"
              onClick={() => onAgregar(p, 1)}
              aria-label={`Agregar ${p.nombre}`}
              className="shrink-0 h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 transition-colors"
            >
              <Plus size={12} />
              {compacto ? '' : 'Agregar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

import { Plus, Pencil, Trash2, Power, Loader2, Landmark } from 'lucide-react'
import { formatCurrency, categoriaInfo, FRECUENCIA_LABEL, mesNombre } from '../../utils/pagosRecurrentesUtils'

/**
 * Las plantillas de gasto fijo. De acá sale todo lo demás: cada gasto activo
 * genera su pago en los meses que le tocan.
 *
 * "Desactivar" y "eliminar" son cosas distintas a propósito: desactivar deja
 * de generar períodos nuevos pero conserva el historial (útil cuando cambiás
 * de proveedor de internet y querés seguir viendo lo que pagaste); eliminar
 * borra todo y el backend lo niega si ya tiene pagos registrados.
 */
export default function ListaGastos({ gastos, loading, onNuevo, onEditar, onCambiarActivo, onEliminar }) {
  const activos = gastos.filter(g => g.activo)
  const inactivos = gastos.filter(g => !g.activo)

  const Fila = ({ g }) => {
    const info = categoriaInfo(g.categoria)
    return (
      <div className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${!g.activo ? 'opacity-60' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-neutro-900 text-sm">{g.nombre}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${info.estilo}`}>{info.label}</span>
            {!g.activo && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-neutro-200 text-neutro-600">Inactivo</span>
            )}
          </div>
          <p className="text-xs text-neutro-500 mt-0.5">
            {g.proveedor && <>{g.proveedor} · </>}
            {FRECUENCIA_LABEL[g.frecuencia] || g.frecuencia}
            {g.mesReferencia && <> en <span className="capitalize">{mesNombre(g.mesReferencia)}</span></>}
            {g.diaVencimiento && <> · vence el {g.diaVencimiento}</>}
            {g.totalPagos > 0 && <> · {g.totalPagos} período(s)</>}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Con consulta automática manda el último recibo real, no el
              estimado: ese es un número tecleado una vez que envejece (el agua
              decía ₡4.000 cuando sus recibos venían en ₡3.823). Sin recibo
              todavía, se dice en palabras en vez de mostrar un ₡0. */}
          <div className="w-32 text-right">
            {g.fuenteAuto ? (
              g.ultimoMonto != null ? (
                <>
                  <p className="font-bold text-neutro-900 text-sm">{formatCurrency(g.ultimoMonto)}</p>
                  <p className="text-[10px] text-neutro-400">último recibo · {g.ultimoPeriodo}</p>
                </>
              ) : (
                <p className="text-xs text-alerta-600">Sin recibo aún</p>
              )
            ) : (
              <p className="font-bold text-neutro-900 text-sm">{formatCurrency(g.montoEstimado)}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onEditar(g)} title="Editar" className="p-2 text-neutro-400 hover:text-primario-600 transition-colors">
              <Pencil size={15} />
            </button>
            <button
              onClick={() => onCambiarActivo(g)}
              title={g.activo ? 'Desactivar (deja de generar pagos)' : 'Activar'}
              className={`p-2 transition-colors ${g.activo ? 'text-neutro-400 hover:text-alerta-600' : 'text-alerta-500 hover:text-exito-600'}`}
            >
              <Power size={15} />
            </button>
            <button onClick={() => onEliminar(g)} title="Eliminar" className="p-2 text-neutro-300 hover:text-peligro-600 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-neutro-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-neutro-900 flex items-center gap-2">
            Gastos fijos
            {loading && <Loader2 size={15} className="animate-spin text-primario-500" />}
          </h3>
          <p className="text-xs text-neutro-500">{activos.length} activo(s) generando pagos cada mes</p>
        </div>
        <button onClick={onNuevo} className="btn btn-primary !py-2 !px-3.5 flex items-center gap-1.5 text-sm">
          <Plus size={15} /> Nuevo gasto
        </button>
      </div>

      {!loading && gastos.length === 0 ? (
        <div className="p-12 text-center text-neutro-400 flex flex-col items-center gap-3">
          <Landmark size={40} className="text-neutro-300" />
          <div>
            <p className="font-semibold text-neutro-600">Todavía no hay gastos fijos</p>
            <p className="text-sm mt-1">Agregá la luz, el agua, el internet, el alquiler — lo que sale todos los meses.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="divide-y divide-neutro-100">
            {activos.map(g => <Fila key={g.id} g={g} />)}
          </div>
          {inactivos.length > 0 && (
            <>
              <div className="px-5 py-2 bg-neutro-50 border-y border-neutro-100">
                <p className="text-xs font-semibold text-neutro-500 uppercase tracking-wide">Inactivos ({inactivos.length})</p>
              </div>
              <div className="divide-y divide-neutro-100">
                {inactivos.map(g => <Fila key={g.id} g={g} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

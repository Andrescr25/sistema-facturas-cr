import { ChevronLeft, ChevronRight, Loader2, PackageSearch } from 'lucide-react'
import ImagenProducto from './competencia/ImagenProducto'
import { formatCurrency, CLASIFICACION_INFO, ESTILO_CLASIFICACION, ESTILO_CLASE_ROTACION } from '../../utils/rentabilidadUtils'

function BadgeClasificacion({ clasificacion }) {
  const info = CLASIFICACION_INFO[clasificacion]
  if (!info) return null
  return (
    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${ESTILO_CLASIFICACION[clasificacion]}`}>
      {info.label}
    </span>
  )
}

function BadgeRotacion({ clase }) {
  if (!clase) return <span className="text-xs text-gray-400">sin datos</span>
  return (
    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${ESTILO_CLASE_ROTACION[clase]}`}>
      {clase}
    </span>
  )
}

/**
 * Costo del producto. Alegra tiene el costo vacío en ~660 productos, pero de
 * un tercio de ellos sí lo sabemos por sus facturas de proveedor — mostrar
 * ₡0 ahí escondía un dato que sí tenemos. Se marca el origen para no dar a
 * entender que Alegra está al día cuando no lo está.
 */
function Costo({ p }) {
  if (!p.costoEfectivo) return <span className="text-gray-300">—</span>
  return (
    <div className="flex flex-col items-end">
      <span className="text-gray-700">{formatCurrency(p.costoEfectivo)}</span>
      {p.origenCosto === 'facturas' && (
        <span className="text-[10px] text-amber-600" title="Alegra no tiene costo; este sale de la última factura del proveedor">
          de facturas
        </span>
      )}
    </div>
  )
}

function MargenEfectivo({ p }) {
  if (p.margenEfectivo === null || p.margenEfectivo === undefined) {
    return <span className="text-gray-300">—</span>
  }
  const negativo = p.margenEfectivo < 0
  return (
    <span className={`font-medium ${negativo ? 'text-red-600' : 'text-gray-800'} ${p.origenCosto === 'facturas' ? 'italic' : ''}`}>
      {p.margenEfectivo.toFixed(1)}%
    </span>
  )
}

function Competencia({ p }) {
  if (p.techoCompetencia === null) return <span className="text-xs text-gray-300">—</span>
  return (
    <div className="flex flex-col">
      <span className={`text-sm font-medium ${p.superaTechoCompetencia ? 'text-red-600' : 'text-gray-700'}`}>
        techo {formatCurrency(p.techoCompetencia)}
      </span>
      <span className="text-[11px] text-gray-400">{p.fuenteCompetencia} a {formatCurrency(p.precioCompetencia)}</span>
    </div>
  )
}

export default function TablaProductos({ productos, total, filtros, setPagina, loading }) {
  const totalPaginas = Math.max(1, Math.ceil(total / filtros.pageSize))
  const desde = total === 0 ? 0 : (filtros.page - 1) * filtros.pageSize + 1
  const hasta = Math.min(filtros.page * filtros.pageSize, total)

  return (
    <div className="card overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          Productos {total > 0 && <span className="text-gray-400 font-normal">({desde}–{hasta} de {total})</span>}
        </h2>
        {loading && <Loader2 size={16} className="animate-spin text-purple-500" />}
      </div>

      {!loading && productos.length === 0 ? (
        <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-3">
          <PackageSearch size={40} className="text-gray-300" />
          <p>No hay productos con estos filtros.</p>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="block sm:hidden divide-y divide-gray-100">
            {productos.map((p) => (
              <div key={p.alegraItemId} className="p-4 flex flex-col gap-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ImagenProducto src={p.imagenUrl} alt={p.nombre} tamano="h-11 w-11" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{p.nombre}</p>
                      <p className="text-xs text-gray-400">{p.categoria}</p>
                    </div>
                  </div>
                  <BadgeClasificacion clasificacion={p.clasificacionCosto} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400">Precio</p>
                    <p className="font-medium text-gray-800">{formatCurrency(p.precio)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Costo</p>
                    <div className="font-medium text-gray-800"><Costo p={p} /></div>
                  </div>
                  <div>
                    <p className="text-gray-400">Margen real</p>
                    <div className="font-medium"><MargenEfectivo p={p} /></div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-gray-500">Rotación: <BadgeRotacion clase={p.claseRotacion} /></span>
                  {p.clientesDistintos > 0 && <span className="text-gray-400">{p.clientesDistintos} clientes</span>}
                </div>
                {p.techoCompetencia !== null && (
                  <div className="pt-1 border-t border-gray-50">
                    <Competencia p={p} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Precio</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3 text-right">Margen real</th>
                  <th className="px-4 py-3">Rotación</th>
                  <th className="px-4 py-3">Competencia</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {productos.map((p) => (
                  <tr key={p.alegraItemId} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <ImagenProducto src={p.imagenUrl} alt={p.nombre} tamano="h-10 w-10" />
                        <span className="font-medium text-gray-800 max-w-[16rem] truncate" title={p.nombre}>{p.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.categoria}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(p.precio)}</td>
                    <td className="px-4 py-3 text-right"><Costo p={p} /></td>
                    <td className="px-4 py-3 text-right"><MargenEfectivo p={p} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <BadgeRotacion clase={p.claseRotacion} />
                        {p.clientesDistintos > 0 && <span className="text-xs text-gray-400">{p.clientesDistintos} cli.</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><Competencia p={p} /></td>
                    <td className="px-4 py-3"><BadgeClasificacion clasificacion={p.clasificacionCosto} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {totalPaginas > 1 && (
        <div className="px-4 sm:px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={() => setPagina(Math.max(1, filtros.page - 1))}
            disabled={filtros.page <= 1}
            className="btn btn-outline !py-1.5 !px-3 flex items-center gap-1 disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <span className="text-xs text-gray-500">Página {filtros.page} de {totalPaginas}</span>
          <button
            onClick={() => setPagina(Math.min(totalPaginas, filtros.page + 1))}
            disabled={filtros.page >= totalPaginas}
            className="btn btn-outline !py-1.5 !px-3 flex items-center gap-1 disabled:opacity-40"
          >
            Siguiente <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

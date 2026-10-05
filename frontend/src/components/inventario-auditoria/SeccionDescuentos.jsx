import { useMemo, useState } from 'react'
import { Percent, Search, Trash2, Loader2, RefreshCw, Eye, EyeOff, Check, Plus } from 'lucide-react'

/**
 * Descuentos por exceso: la lista que alimenta el catálogo público. Se
 * puede editar el porcentaje, sacar un producto, o meter uno que la
 * detección automática nunca marcó.
 *
 * Lo importante que muestra esta pantalla es `visibleEnCatalogo`. Un
 * descuento NO se ve solo por existir: catalogo-agente.service.js exige
 * además que el producto se haya empacado en alguna tanda y que le quede
 * stock. Sin decirlo, alguien pone un 40%, no pasa nada en el catálogo, y
 * parece que el sistema está roto.
 */
export default function SeccionDescuentos({
  descuentos,
  loading,
  onRefresh,
  onGuardar,
  onEliminar,
  busquedaProducto,
  setBusquedaProducto,
  resultadosProducto,
  buscandoProducto,
  onAgregarProducto
}) {
  const [filtro, setFiltro] = useState('')
  const [soloVisibles, setSoloVisibles] = useState(false)
  const [editando, setEditando] = useState({}) // { productoId: valor }
  const [mostrarBuscador, setMostrarBuscador] = useState(false)

  const visibles = useMemo(() => {
    const termino = filtro.trim().toLowerCase()
    return descuentos.filter(d => {
      if (soloVisibles && !d.visibleEnCatalogo) return false
      if (!termino) return true
      return d.nombreProducto.toLowerCase().includes(termino)
    })
  }, [descuentos, filtro, soloVisibles])

  const totalVisibles = descuentos.filter(d => d.visibleEnCatalogo).length

  const guardar = (d) => {
    const valor = Number(editando[d.productoId])
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) return
    onGuardar(d.productoId, valor, d.nombreProducto)
    setEditando(prev => { const next = { ...prev }; delete next[d.productoId]; return next })
  }

  return (
    <div className="bg-white rounded-3xl border border-neutro-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-neutro-100 flex justify-between items-center bg-neutro-50/50 gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-neutro-900 flex items-center gap-2">
            <Percent className="text-exito-600" size={20} />
            Descuentos del catálogo
          </h2>
          <p className="text-xs text-neutro-500 mt-0.5">
            {descuentos.length} producto(s) con descuento · <strong className="text-exito-700">{totalVisibles} visibles</strong> para el cliente
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setMostrarBuscador(v => !v)}
            className="bg-white border border-exito-200 hover:bg-exito-50 text-exito-700 text-xs font-bold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            <Plus size={14} /> Agregar producto
          </button>
          <button onClick={onRefresh} className="p-2 text-neutro-400 hover:text-exito-600 transition-colors" title="Recargar">
            <RefreshCw size={18} className={loading ? 'animate-spin text-exito-600' : ''} />
          </button>
        </div>
      </div>

      {mostrarBuscador && (
        <div className="p-5 border-b border-neutro-100 bg-exito-50/30 space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutro-400" />
            <input
              type="text"
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
              placeholder="Buscar producto del catálogo para ponerle descuento..."
              className="input w-full pl-10 py-2.5 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl text-sm"
            />
            {buscandoProducto && (
              <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-exito-600 animate-spin" />
            )}
          </div>

          {busquedaProducto.length >= 2 && (
            <div className="divide-y divide-neutro-100 max-h-64 overflow-y-auto bg-white rounded-xl border border-neutro-100">
              {!buscandoProducto && resultadosProducto.length === 0 ? (
                <p className="text-sm text-neutro-400 text-center py-5">Sin resultados para "{busquedaProducto}"</p>
              ) : (
                resultadosProducto.map(p => (
                  <div key={p.productoId} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-neutro-900 text-sm truncate">{p.nombre}</p>
                      <p className="text-xs text-neutro-400">Ref: {p.referencia || 'N/A'}</p>
                    </div>
                    <button
                      onClick={() => onAgregarProducto(p)}
                      className="bg-primario-800 hover:bg-primario-900 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0"
                    >
                      Poner 40%
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-5 py-3 border-b border-neutro-100 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por nombre..."
            className="input w-full pl-9 py-2 px-3 border border-neutro-200 focus:border-primario-500 rounded-xl text-sm"
          />
        </div>
        <button
          onClick={() => setSoloVisibles(v => !v)}
          className={`text-xs font-bold py-2 px-3.5 rounded-xl border transition-all flex items-center gap-1.5 whitespace-nowrap ${
            soloVisibles ? 'bg-exito-50 border-exito-200 text-exito-700' : 'bg-white border-neutro-200 text-neutro-500'
          }`}
        >
          {soloVisibles ? <Eye size={14} /> : <EyeOff size={14} />}
          Solo visibles
        </button>
      </div>

      {loading && descuentos.length === 0 ? (
        <div className="p-12 text-center text-neutro-400 flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-exito-600" size={28} />
          <span>Cargando descuentos...</span>
        </div>
      ) : visibles.length === 0 ? (
        <div className="p-12 text-center text-neutro-400">
          <p>{descuentos.length === 0 ? 'No hay productos con descuento.' : 'Ninguno coincide con el filtro.'}</p>
        </div>
      ) : (
        <div className="divide-y divide-neutro-100 max-h-[32rem] overflow-y-auto">
          {visibles.map(d => {
            const enEdicion = editando[d.productoId] !== undefined
            return (
              <div key={d.productoId} className="p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-neutro-900 text-sm truncate">{d.nombreProducto}</p>
                  <p className="text-xs mt-0.5 flex items-center gap-1.5">
                    {d.visibleEnCatalogo ? (
                      <span className="text-exito-600 font-semibold flex items-center gap-1">
                        <Eye size={11} /> Visible en el catálogo
                      </span>
                    ) : (
                      <span className="text-neutro-400 flex items-center gap-1">
                        <EyeOff size={11} /> {d.motivoNoVisible}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={enEdicion ? editando[d.productoId] : d.descuentoPorcentaje}
                      onChange={(e) => setEditando(prev => ({ ...prev, [d.productoId]: e.target.value }))}
                      className={`w-20 text-center py-1.5 pr-6 pl-2 border-2 rounded-xl font-extrabold text-sm focus:outline-none ${
                        enEdicion ? 'border-exito-500 bg-exito-50' : 'border-neutro-200 bg-white'
                      }`}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutro-400 font-bold">%</span>
                  </div>

                  {enEdicion && (
                    <button
                      onClick={() => guardar(d)}
                      title="Guardar descuento"
                      className="bg-primario-800 hover:bg-primario-900 text-white p-2 rounded-lg transition-colors"
                    >
                      <Check size={15} />
                    </button>
                  )}

                  <button
                    onClick={() => onEliminar(d.productoId, d.nombreProducto)}
                    title="Quitar descuento"
                    className="p-2 text-neutro-300 hover:text-peligro-600 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

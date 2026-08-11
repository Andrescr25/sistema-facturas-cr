import { useState } from 'react'
import { LayoutGrid, Store } from 'lucide-react'
import { useRentabilidad } from '../hooks/useRentabilidad'
import { useCompetencia } from '../hooks/useCompetencia'
import ResumenCards from '../components/rentabilidad/ResumenCards'
import TablaCategorias from '../components/rentabilidad/TablaCategorias'
import FiltrosProductos from '../components/rentabilidad/FiltrosProductos'
import TablaProductos from '../components/rentabilidad/TablaProductos'
import TabCompetencia from '../components/rentabilidad/competencia/TabCompetencia'

/**
 * Tablero de Rentabilidad — estrategia de precios completa. Pestaña
 * Catálogo (Fase 1-2: calidad de costo y margen real) y pestaña
 * Competencia (Fase 3: precios de EPA/Walmart/Mas x Menos y el techo que
 * derivan). Una sola pantalla a propósito — ver plan en
 * /Users/joseandres/.claude/plans/ok-ya-lo-vi-adaptive-sky.md.
 */
export default function Rentabilidad() {
  const [tab, setTab] = useState('catalogo')

  const {
    resumen,
    loadingResumen,
    filtros,
    setFiltros,
    setPagina,
    resetFiltros,
    productos,
    totalProductos,
    loadingProductos,
    error
  } = useRentabilidad()

  const competencia = useCompetencia()

  const tabs = [
    { key: 'catalogo', label: 'Catálogo', icon: LayoutGrid },
    { key: 'competencia', label: 'Competencia', icon: Store, count: competencia.pendientes.length }
  ]

  return (
    <div className="max-w-7xl mx-auto pb-24 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Rentabilidad</h1>
        <p className="text-gray-600 mt-1">Margen real por producto, calidad del costo registrado, rotación y techo de precio según la competencia.</p>
      </div>

      <div className="flex bg-gray-100 p-1.5 rounded-2xl max-w-md">
        {tabs.map((t) => {
          const Icon = t.icon
          const isCurrent = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-center text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 ${
                isCurrent ? 'bg-white text-purple-600 shadow-md ring-1 ring-black/5' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon size={16} />
              <span>{t.label}</span>
              {t.count > 0 && (
                <span className={`text-xxs px-2 py-0.5 rounded-full ${isCurrent ? 'bg-purple-100 text-purple-800' : 'bg-gray-200 text-gray-700'}`}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'catalogo' ? (
        <>
          {error && (
            <div className="card bg-red-50 border-red-200 text-red-700 p-4">
              <p>{error}</p>
            </div>
          )}

          {loadingResumen && !resumen ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="card h-28 animate-pulse bg-gray-50 lg:col-span-2" />
              <div className="card h-28 animate-pulse bg-gray-50" />
            </div>
          ) : (
            <>
              <ResumenCards resumen={resumen} filtros={filtros} setFiltros={setFiltros} />
              <TablaCategorias categorias={resumen?.categorias} filtros={filtros} setFiltros={setFiltros} />
            </>
          )}

          <FiltrosProductos filtros={filtros} setFiltros={setFiltros} resetFiltros={resetFiltros} categorias={resumen?.categorias || []} />

          <TablaProductos
            productos={productos}
            total={totalProductos}
            filtros={filtros}
            setPagina={setPagina}
            loading={loadingProductos}
          />
        </>
      ) : (
        <TabCompetencia categorias={resumen?.categorias || []} {...competencia} />
      )}
    </div>
  )
}

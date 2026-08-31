import { useState } from 'react'
import { LayoutGrid, Store, Activity } from 'lucide-react'
import { useRentabilidad } from '../hooks/useRentabilidad'
import { useCompetencia } from '../hooks/useCompetencia'
import ResumenCards from '../components/rentabilidad/ResumenCards'
import TablaCategorias from '../components/rentabilidad/TablaCategorias'
import FiltrosProductos from '../components/rentabilidad/FiltrosProductos'
import TablaProductos from '../components/rentabilidad/TablaProductos'
import TabCompetencia from '../components/rentabilidad/competencia/TabCompetencia'
import MonitoreoMargenes from '../components/rentabilidad/MonitoreoMargenes'

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
    error,
    tendencia,
    deterioro,
    loadingMonitoreo
  } = useRentabilidad()

  const competencia = useCompetencia()

  const tabs = [
    { key: 'catalogo', label: 'Catálogo', icon: LayoutGrid },
    { key: 'margenes', label: 'Márgenes', icon: Activity },
    { key: 'competencia', label: 'Competencia', icon: Store, count: competencia.pendientes.length }
  ]

  return (
    <div className="max-w-7xl mx-auto pb-24 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutro-900">Rentabilidad</h1>
        <p className="text-neutro-600 mt-1">Margen real por producto, calidad del costo registrado, rotación y techo de precio según la competencia.</p>
      </div>

      <div className="flex bg-neutro-100 p-1.5 rounded-2xl max-w-md">
        {tabs.map((t) => {
          const Icon = t.icon
          const isCurrent = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-center text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 ${
                isCurrent ? 'bg-white text-nota-600 shadow-md ring-1 ring-black/5' : 'text-neutro-600 hover:text-neutro-900'
              }`}
            >
              <Icon size={16} />
              <span>{t.label}</span>
              {t.count > 0 && (
                <span className={`text-xxs px-2 py-0.5 rounded-full ${isCurrent ? 'bg-nota-100 text-nota-800' : 'bg-neutro-200 text-neutro-700'}`}>
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
            <div className="card bg-peligro-50 border-peligro-200 text-peligro-700 p-4">
              <p>{error}</p>
            </div>
          )}

          {loadingResumen && !resumen ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="card h-28 animate-pulse bg-neutro-50 lg:col-span-2" />
              <div className="card h-28 animate-pulse bg-neutro-50" />
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
      ) : tab === 'margenes' ? (
        <MonitoreoMargenes tendencia={tendencia} deterioro={deterioro} loading={loadingMonitoreo} />
      ) : (
        <TabCompetencia categorias={resumen?.categorias || []} {...competencia} />
      )}
    </div>
  )
}

import { Inbox, CheckCircle } from 'lucide-react'

/**
 * Selector segmentado de pestañas (pendientes / procesadas) con contador.
 * Extraído de Impresion.jsx.
 */
export default function TabsImpresion({ activeTab, setActiveTab, countPendientes, countProcesadas }) {
  const tabs = [
    { key: 'pendientes', label: 'Por Impresión', icon: Inbox, count: countPendientes },
    { key: 'procesadas', label: 'Historial 7 días', icon: CheckCircle, count: countProcesadas }
  ]

  return (
    <div className="flex bg-neutro-100 p-1.5 rounded-2xl max-w-md">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isCurrent = activeTab === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-center text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 ${
              isCurrent
                ? 'bg-white text-primario-600 shadow-md ring-1 ring-black/5'
                : 'text-neutro-600 hover:text-neutro-900'
            }`}
          >
            <Icon size={16} />
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={`text-xxs px-2 py-0.5 rounded-full ${
                isCurrent ? 'bg-primario-100 text-primario-800' : 'bg-neutro-200 text-neutro-700'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

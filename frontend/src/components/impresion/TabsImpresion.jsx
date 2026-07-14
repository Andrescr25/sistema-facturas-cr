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
    <div className="flex bg-gray-100 p-1.5 rounded-2xl max-w-md">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isCurrent = activeTab === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-center text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 ${
              isCurrent
                ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/5'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon size={16} />
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={`text-xxs px-2 py-0.5 rounded-full ${
                isCurrent ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-700'
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

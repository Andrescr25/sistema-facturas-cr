import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Pantalla mostrada cuando una auditoría lleva más de 24h sin finalizar:
 * hay que re-sincronizar los stocks del inventario propio antes de continuar.
 * Extraído de InventarioAuditoria.jsx.
 */
export default function AuditoriaExpirada({ loading, onResync, onVolver }) {
  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-neutro-100 shadow-lg text-center space-y-6 mt-12">
      <div className="w-16 h-16 bg-alerta-50 rounded-2xl flex items-center justify-center text-alerta-500 mx-auto">
        <AlertTriangle size={32} />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-neutro-950">Auditoría Expirada</h2>
        <p className="text-sm text-neutro-500 leading-relaxed">
          Esta sesión de auditoría fue creada hace más de 24 horas y no fue finalizada. Los stocks en el inventario propio pueden estar desactualizados.
        </p>
        <p className="text-xs text-alerta-600 font-bold bg-alerta-50 py-2 px-3 rounded-xl inline-block mt-2">
          Debe volver a sincronizar la auditoría con los stocks actuales para poder acceder.
        </p>
      </div>
      <div className="pt-2 flex flex-col gap-2">
        <button
          onClick={onResync}
          disabled={loading}
          className="w-full bg-primario-800 hover:bg-primario-900 text-white font-extrabold py-3.5 px-6 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:bg-exito-400"
        >
          {loading ? <RefreshCw className="animate-spin" size={20} /> : <RefreshCw size={20} />}
          Re-sincronizar Stocks del inventario propio
        </button>
        <button
          onClick={onVolver}
          className="w-full bg-white hover:bg-neutro-50 text-neutro-700 font-bold border border-neutro-200 py-3 px-6 rounded-2xl transition-all active:scale-95"
        >
          Volver al Inicio
        </button>
      </div>
    </div>
  )
}

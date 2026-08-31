import { useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

export default function Toast({ message, type = 'info', onClose, duration = 5000 }) {
  useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const icons = {
    success: <CheckCircle className="text-exito-500" size={24} />,
    error: <XCircle className="text-peligro-500" size={24} />,
    warning: <AlertCircle className="text-alerta-500" size={24} />,
    info: <Info className="text-primario-500" size={24} />,
    loading: (
      <div className="spinner-small text-primario-500" style={{ width: 24, height: 24 }}>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primario-500"></div>
      </div>
    )
  }

  const backgrounds = {
    success: 'bg-exito-50 border-exito-200',
    error: 'bg-peligro-50 border-peligro-200',
    warning: 'bg-alerta-50 border-alerta-200',
    info: 'bg-primario-50 border-primario-200',
    loading: 'bg-primario-50 border-primario-200'
  }

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-md ${backgrounds[type]} border-2 rounded-lg shadow-2xl p-4 animate-slide-in-right`}
      style={{
        animation: 'slideInRight 0.3s ease-out'
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {icons[type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutro-900 whitespace-pre-wrap">
            {message}
          </p>
        </div>
        {type !== 'loading' && (
          <button
            onClick={onClose}
            className="flex-shrink-0 text-neutro-400 hover:text-neutro-600 transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  )
}



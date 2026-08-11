import { useState, useEffect } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'

/**
 * Modal de confirmación/entrada de texto, reemplazo de window.confirm y
 * window.prompt. Se usa a través del hook useDialog() — no se renderiza
 * directamente con estado propio de negocio, solo recibe las props que
 * useDialog() calcula.
 */
export default function ConfirmModal({
  isOpen,
  mode = 'confirm', // 'confirm' | 'prompt'
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default', // 'default' | 'danger'
  inputPlaceholder = '',
  inputDefaultValue = '',
  onConfirm,
  onCancel
}) {
  const [inputValue, setInputValue] = useState(inputDefaultValue)

  useEffect(() => {
    if (isOpen) setInputValue(inputDefaultValue)
  }, [isOpen, inputDefaultValue])

  if (!isOpen) return null

  const handleConfirm = () => {
    onConfirm(mode === 'prompt' ? inputValue : true)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-1">
          <div className={`p-2 rounded-full flex-shrink-0 ${variant === 'danger' ? 'bg-red-100' : 'bg-purple-100'}`}>
            {variant === 'danger'
              ? <AlertTriangle className="text-red-600" size={20} />
              : <HelpCircle className="text-purple-600" size={20} />}
          </div>
          <div className="flex-1 pt-1">
            {title && <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>}
            {message && <p className="text-sm text-gray-600 whitespace-pre-wrap">{message}</p>}
          </div>
        </div>

        {mode === 'prompt' && (
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={inputPlaceholder}
            className="input w-full mt-4"
            rows={3}
            autoFocus
          />
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="btn btn-outline">{cancelLabel}</button>
          <button
            onClick={handleConfirm}
            className={`btn ${variant === 'danger' ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

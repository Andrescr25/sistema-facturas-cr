import { useState, useCallback } from 'react'

/**
 * Notificaciones tipo toast. Extraído del patrón showToast/toasts/removeToast
 * ya repetido en RevisionPrecios.jsx e InventarioAuditoria.jsx.
 * Renderizar <ToastContainer toasts={toasts} onRemove={removeToast} /> una
 * vez en la página que use este hook.
 */
export function useToast() {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, showToast, removeToast }
}

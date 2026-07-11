import { useState, useCallback } from 'react'

/**
 * Diálogos de confirmación/entrada de texto basados en promesas, para
 * reemplazar window.confirm/window.prompt por el modal propio (ConfirmModal).
 * Renderizar <ConfirmModal {...dialogProps} /> una vez en la página que use
 * este hook.
 *
 * Uso:
 *   const ok = await confirm('¿Seguro?', { title: 'Confirmar', variant: 'danger' })
 *   const texto = await prompt('Notas (opcional):', { inputPlaceholder: '...' })
 */
export function useDialog() {
  const [dialogState, setDialogState] = useState(null)

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setDialogState({ mode: 'confirm', message, resolve, ...options })
    })
  }, [])

  const prompt = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setDialogState({ mode: 'prompt', message, resolve, ...options })
    })
  }, [])

  const handleConfirm = useCallback((value) => {
    setDialogState((current) => {
      current?.resolve(current.mode === 'prompt' ? (value || null) : true)
      return null
    })
  }, [])

  const handleCancel = useCallback(() => {
    setDialogState((current) => {
      current?.resolve(current?.mode === 'prompt' ? null : false)
      return null
    })
  }, [])

  const dialogProps = {
    isOpen: !!dialogState,
    mode: dialogState?.mode || 'confirm',
    title: dialogState?.title,
    message: dialogState?.message,
    confirmLabel: dialogState?.confirmLabel,
    cancelLabel: dialogState?.cancelLabel,
    variant: dialogState?.variant,
    inputPlaceholder: dialogState?.inputPlaceholder,
    inputDefaultValue: dialogState?.inputDefaultValue,
    onConfirm: handleConfirm,
    onCancel: handleCancel
  }

  return { confirm, prompt, dialogProps }
}

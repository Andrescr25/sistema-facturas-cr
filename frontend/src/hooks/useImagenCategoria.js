import { useEffect, useState } from 'react'

/** Selección y envío; el componente solo dibuja el modal y su vista previa. */
export default function useImagenCategoria({ onGuardar, onQuitar, onGuardada }) {
  const [abierta, setAbierta] = useState(false)
  const [archivo, setArchivo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!archivo) { setPreview(null); return }
    const url = URL.createObjectURL(archivo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  const abrir = () => setAbierta(true)
  const cerrar = () => { if (!guardando) { setAbierta(false); setArchivo(null); setError(null) } }
  const elegir = e => {
    const elegido = e.target.files?.[0]
    e.target.value = ''
    if (!elegido) return
    if (!['image/jpeg','image/png','image/webp'].includes(elegido.type)) { setError('Elegí una imagen JPG, PNG o WebP.'); return }
    if (elegido.size > 8 * 1024 * 1024) { setError('La imagen pesa más de 8 MB.'); return }
    setArchivo(elegido); setError(null)
  }
  const guardar = async quitar => {
    setGuardando(true); setError(null)
    try {
      if (quitar) await onQuitar()
      else await onGuardar(archivo)
      setAbierta(false); setArchivo(null)
      onGuardada?.(quitar ? 'Imagen de categoría quitada.' : 'Imagen de categoría guardada.')
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'No se pudo guardar la imagen.')
    } finally { setGuardando(false) }
  }

  return { abierta, archivo, preview, guardando, error, abrir, cerrar, elegir, guardar }
}

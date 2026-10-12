import { useEffect, useState } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import IntroduccionCategoria from '../catalogo-agente/IntroduccionCategoria'

/** Se abre junto al lápiz del nombre, en la cabecera de la categoría. */
export default function ImagenCategoria({ categoria, onGuardar, onQuitar, onGuardada }) {
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

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} aria-label={`Imagen de ${categoria.nombreVisible}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutro-200 px-2.5 py-2 text-sm font-semibold text-neutro-600 hover:border-primario-300 hover:bg-primario-50 hover:text-primario-700">
        <ImagePlus size={17} /> Imagen
      </button>
      {abierta && (
        <Modal titulo={`Imagen de ${categoria.nombreVisible}`} onCerrar={cerrar} ancho="lg" pie={
          <div className="flex flex-wrap justify-between gap-2">
            {categoria.imagen?.url && <Boton variante="peligro" icono={Trash2} disabled={guardando} onClick={() => guardar(true)}>Quitar imagen</Boton>}
            <div className="ml-auto flex gap-2">
              <Boton variante="secundario" disabled={guardando} onClick={cerrar}>Cancelar</Boton>
              <Boton cargando={guardando} disabled={!archivo || guardando} onClick={() => guardar(false)}>Guardar imagen</Boton>
            </div>
          </div>
        }>
          <div className="space-y-4 p-5">
            <p className="text-sm text-neutro-600">Elegí una foto horizontal que represente esta categoría. Así se verá antes de sus productos en el catálogo del agente.</p>
            <IntroduccionCategoria nombre={categoria.nombreVisible} cantidad={categoria.total}
              imagen={preview ? { url:preview } : categoria.imagen} animar={false} />
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primario-300 bg-primario-50 px-4 py-4 font-semibold text-primario-700 ${guardando ? 'pointer-events-none opacity-50' : 'hover:bg-primario-100'}`}>
              <Upload size={18} /> {archivo || categoria.imagen?.url ? 'Elegir otra foto' : 'Elegir foto'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={elegir} disabled={guardando}
                aria-label="Elegir imagen de categoría" className="sr-only" />
            </label>
            <p className="text-xs text-neutro-500">JPG, PNG o WebP · hasta 8 MB{archivo && <span className="mt-1 block truncate font-semibold">{archivo.name}</span>}</p>
            {error && <p role="alert" className="rounded-xl bg-peligro-50 p-3 text-sm text-peligro-700">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

import { ImagePlus, Trash2, Upload } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import IntroduccionCategoria from '../catalogo-agente/IntroduccionCategoria'
import useImagenCategoria from '../../hooks/useImagenCategoria'

/** Se abre junto al lápiz del nombre, en la cabecera de la categoría. */
export default function ImagenCategoria({ categoria, onGuardar, onQuitar, onGuardada }) {
  const { abierta, archivo, preview, medidas, guardando, error, abrir, cerrar, elegir, guardar } =
    useImagenCategoria({ onGuardar, onQuitar, onGuardada })

  return (
    <>
      <button type="button" onClick={abrir} aria-label={`Imagen de ${categoria.nombreVisible}`}
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
            <p className="text-sm text-neutro-600">Elegí una foto nítida que represente esta categoría. Se muestra completa, con su propia proporción (solo se recorta si es muy alta o cuadrada). El nombre de la categoría va sobre el lado izquierdo, que se oscurece: dejá ahí lo menos importante y el motivo principal a la derecha.</p>
            <IntroduccionCategoria nombre={categoria.nombreVisible} cantidad={categoria.total}
              imagen={preview ? { url:preview, ...medidas } : categoria.imagen} animar={false} />
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primario-300 bg-primario-50 px-4 py-4 font-semibold text-primario-700 ${guardando ? 'pointer-events-none opacity-50' : 'hover:bg-primario-100'}`}>
              <Upload size={18} /> {archivo || categoria.imagen?.url ? 'Elegir otra foto' : 'Elegir foto'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={elegir} disabled={guardando}
                aria-label="Elegir imagen de categoría" className="sr-only" />
            </label>
            <p className="text-xs text-neutro-500">JPG, PNG o WebP · hasta 8 MB · ideal: horizontal, de 1920 px de ancho o más{archivo && <span className="mt-1 block truncate font-semibold">{archivo.name}</span>}</p>
            {error && <p role="alert" className="rounded-xl bg-peligro-50 p-3 text-sm text-peligro-700">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

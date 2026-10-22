import { useState } from 'react'
import { ArrowLeft, ImagePlus, Loader2, Package, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { useMarcasCatalogo } from '../../hooks/useMarcasCatalogo'
import { urlArchivo } from '../../utils/urlArchivo'

export default function ModalMarcasCatalogo({ subcategoria, onCerrar }) {
  const e = useMarcasCatalogo(subcategoria.id)
  const [confirmando, setConfirmando] = useState(false)
  return <Modal titulo={`Marcas · ${subcategoria.nombre}`} ancho="xl" onCerrar={e.ocupado ? undefined : onCerrar}>
    <div className="space-y-4 p-5">
      <p className="text-sm text-neutro-500">Una foto general y una lista de presentaciones en el catálogo del agente. Cada producto conserva su foto y precio.</p>
      {e.error && <p role="alert" className="rounded-xl bg-peligro-50 p-3 text-sm text-peligro-700">{e.error}</p>}
      {e.aviso && <p role="status" className="rounded-xl bg-exito-50 p-3 text-sm text-exito-700">{e.aviso}</p>}
      {e.cargando ? <p className="flex gap-2 py-8 text-neutro-500"><Loader2 size={18} className="animate-spin" />Cargando marcas…</p>
        : !e.edicion ? <>
          <Boton icono={Plus} onClick={() => { setConfirmando(false); e.editar(null) }}>Nueva marca</Boton>
          {e.marcas.length === 0 && <p className="rounded-xl bg-neutro-50 p-5 text-sm text-neutro-500">Todavía no hay marcas. Creá una y elegí sus productos.</p>}
          <div className="space-y-2">{e.marcas.map(m => <button type="button" key={m.id} onClick={() => { setConfirmando(false); e.editar(m) }}
            className="flex w-full items-center gap-4 rounded-xl border border-neutro-200 p-3 text-left hover:border-primario-300 hover:bg-primario-50">
            {m.imagen?.url ? <img src={urlArchivo(m.imagen.url)} alt="" loading="lazy" className="h-14 w-14 rounded-lg object-contain" /> : <Package size={36} className="m-2 text-neutro-300" />}
            <span className="min-w-0 flex-1"><span className="block font-bold text-neutro-900">{m.nombre}</span><span className="text-sm text-neutro-500">{m.productos} presentaciones</span></span><Pencil size={16} className="text-neutro-400" />
          </button>)}</div>
        </> : <>
          <Boton variante="fantasma" icono={ArrowLeft} disabled={e.ocupado} onClick={e.volver}>Volver a marcas</Boton>
          <label className="block text-sm font-bold text-neutro-700">Nombre de la marca
            <input value={e.nombre} maxLength={80} onChange={ev => e.setNombre(ev.target.value)} placeholder="Ej. Tricicle"
              className="mt-1 w-full rounded-xl border border-neutro-300 px-3 py-3 font-normal" disabled={e.ocupado} />
          </label>
          {e.edicion.id ? <div className="flex flex-wrap items-center gap-4 rounded-xl border border-neutro-200 p-3">
            {e.edicion.imagen?.url ? <img src={urlArchivo(e.edicion.imagen.url)} alt={`Foto general de ${e.nombre}`} className="h-24 w-24 object-contain" /> : <Package size={40} className="m-5 text-neutro-300" />}
            <div className="space-y-2"><p className="text-sm font-semibold text-neutro-700">Foto general de la marca</p>
              <label className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-primario-50 px-3 py-2 text-sm font-bold text-primario-700 ${e.ocupado ? 'opacity-50' : 'cursor-pointer hover:bg-primario-100'}`}>
                <ImagePlus size={17} />{e.edicion.imagen ? 'Cambiar imagen' : 'Subir imagen'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={e.ocupado}
                  onChange={ev => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) e.subirImagen(f) }} />
              </label>
              {e.edicion.imagen && <Boton variante="fantasma" tamano="sm" disabled={e.ocupado} onClick={e.quitarImagen}>Quitar foto</Boton>}
              <p className="text-xs text-neutro-500">JPG, PNG o WebP, hasta 8 MB.</p>
            </div>
          </div> : <p className="rounded-xl bg-neutro-50 p-3 text-xs text-neutro-500">Guardá la marca para subir su foto general.</p>}
          <div className="space-y-2"><p className="text-sm font-bold text-neutro-700">Presentaciones · {e.seleccionados.size} seleccionadas</p>
            <input aria-label="Buscar presentaciones" value={e.busqueda} onChange={ev => e.setBusqueda(ev.target.value)} placeholder="Buscar por nombre o código…" className="w-full rounded-xl border border-neutro-200 px-3 py-2.5 text-sm" />
            <div className="max-h-64 divide-y divide-neutro-100 overflow-y-auto rounded-xl border border-neutro-200">
              {e.visibles.map(p => {
                const otra = e.marcas.find(m => m.id === p.marca_catalogo_id && m.id !== e.edicion.id)
                return <label key={p.id} className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutro-50">
                  <input type="checkbox" checked={e.seleccionados.has(p.id)} disabled={e.ocupado} onChange={() => e.alternar(p.id)} className="h-5 w-5 shrink-0 rounded border-neutro-300 text-primario-600" />
                  <span className="min-w-0 text-sm text-neutro-800"><span className="block font-semibold">{p.nombre}</span><span className="text-xs text-neutro-500">{p.referencia || 'Sin código'}{otra ? ` · Marca actual: ${otra.nombre}` : ''}{!p.activo ? ' · Inactivo' : p.oculto ? ' · Oculto' : ''}</span></span>
                </label>
              })}
              {e.visibles.length === 0 && <p className="p-4 text-sm text-neutro-500">No hay productos con esa búsqueda.</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutro-100 pt-4">
            {e.edicion.id ? <Boton variante="fantasma" icono={Trash2} disabled={e.ocupado} onClick={() => setConfirmando(v => !v)}>Retirar marca</Boton> : <span />}
            <Boton icono={Save} cargando={e.ocupado} disabled={!e.nombre.trim()} onClick={e.guardar}>Guardar marca</Boton>
          </div>
          {confirmando && <div className="space-y-2 rounded-xl bg-alerta-50 p-3"><p className="text-sm text-alerta-800">Se retira la agrupación y su foto general. Los productos se conservan.</p><Boton variante="peligro" disabled={e.ocupado} onClick={e.eliminar}>Confirmar retiro</Boton></div>}
        </>}
    </div>
  </Modal>
}

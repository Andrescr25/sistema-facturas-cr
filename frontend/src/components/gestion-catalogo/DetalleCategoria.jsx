import { useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, Check, Loader2, PackageSearch, Pencil, Plus, Search, Tag, X } from 'lucide-react'
import Boton from '../ui/Boton'
import SeccionSubcategoria from './SeccionSubcategoria'

function Ficha({ activa, alerta = false, onClick, children, cantidad }) {
  const estilo = activa
    ? (alerta ? 'bg-alerta-500 text-white border-alerta-500 shadow-sm' : 'bg-primario-600 text-white border-primario-600 shadow-sm')
    : (alerta ? 'bg-alerta-50 text-alerta-700 border-alerta-200 hover:bg-alerta-100' : 'bg-white text-neutro-700 border-neutro-200 hover:border-primario-300 hover:text-primario-700')
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${estilo}`}
    >
      {children}
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${activa ? 'bg-white/20' : 'bg-neutro-100 text-neutro-500'}`}>{cantidad}</span>
    </button>
  )
}

/**
 * Adentro de una categoría: su cabecera (con sus números y el nombre que ve
 * el agente), las fichas para saltar a una subcategoría, y una tarjeta por
 * subcategoría con sus productos — en el orden del agente, "Sin clasificar"
 * al final.
 */
export default function DetalleCategoria({
  categoria,
  subsOrdenadas,
  secciones,
  loading,
  subFoco,
  filtroTexto, setFiltroTexto,
  soloSinImagen, setSoloSinImagen,
  hayFiltro,
  otrasCategorias,
  alternar,
  estaSeleccionado,
  seleccionarTodos,
  deseleccionarTodos,
  onVolver,
  onEnfocar,
  onRenombrarCategoria,
  onCrearSub,
  onRenombrarSub,
  onReordenarSub,
  onEliminarSub,
  onMoverSub,
  onEditar,
  onSugerirFoto,
  onDuplicar
}) {
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [nombreVisible, setNombreVisible] = useState(categoria.nombreVisible)
  const [nuevaSub, setNuevaSub] = useState('')
  const [creandoSub, setCreandoSub] = useState(false)
  const [errorSub, setErrorSub] = useState(null)

  // Shift-clic selecciona el rango contra el orden en que están dibujadas.
  const ordenPlano = useMemo(() => secciones.flatMap((s) => s.productos.map((p) => p.alegraId)), [secciones])
  const manejarAlternar = (alegraId, nativeEvent) => alternar(alegraId, { rango: !!nativeEvent?.shiftKey, ordenPlano })

  const idsOrdenados = subsOrdenadas.map((s) => s.id)
  const moverSub = (id, delta) => {
    const ids = [...idsOrdenados]
    const i = ids.indexOf(id)
    const j = i + delta
    if (i === -1 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    onReordenarSub(ids)
  }

  const guardarNombre = () => {
    const limpio = nombreVisible.trim()
    if (limpio && limpio !== categoria.nombreVisible) onRenombrarCategoria(limpio)
    setEditandoNombre(false)
  }

  const crearSub = async () => {
    const limpio = nuevaSub.trim()
    if (!limpio) return
    setCreandoSub(true); setErrorSub(null)
    try {
      await onCrearSub(limpio)
      setNuevaSub('')
    } catch (e) {
      setErrorSub(e?.response?.data?.message || 'No se pudo crear la subcategoría.')
    } finally {
      setCreandoSub(false)
    }
  }

  const clasificados = categoria.total > 0
    ? Math.round(((categoria.total - categoria.sinClasificar) / categoria.total) * 100)
    : null

  return (
    <div className="animate-fade-in-up space-y-5">
      <button onClick={onVolver} className="flex items-center text-base text-neutro-500 transition-colors hover:text-primario-600">
        <ArrowLeft className="mr-2" size={20} /> Volver a categorías
      </button>

      <div className="flex flex-col justify-between gap-6 rounded-xl border border-neutro-100 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-5">
          <div className="shrink-0 rounded-xl bg-primario-100 p-4">
            <Tag className="text-primario-600" size={32} />
          </div>
          <div className="min-w-0">
            {editandoNombre ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nombreVisible}
                  onChange={(e) => setNombreVisible(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') guardarNombre(); if (e.key === 'Escape') setEditandoNombre(false) }}
                  className="min-w-0 rounded-lg border border-primario-300 px-3 py-2 text-2xl font-bold text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500/30"
                />
                <button type="button" onClick={guardarNombre} className="rounded-lg bg-exito-600 p-2.5 text-white hover:bg-exito-700" title="Guardar">
                  <Check size={20} />
                </button>
                <button type="button" onClick={() => setEditandoNombre(false)} className="rounded-lg border border-neutro-200 p-2.5 text-neutro-500 hover:text-neutro-800" title="Cancelar">
                  <X size={20} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="break-words text-2xl font-bold text-neutro-900 sm:text-3xl">{categoria.nombreVisible}</h1>
                <button
                  type="button"
                  onClick={() => { setNombreVisible(categoria.nombreVisible); setEditandoNombre(true) }}
                  title="Cambiar el nombre que ve el agente (en Alegra no cambia)"
                  className="shrink-0 rounded-lg p-2 text-neutro-400 hover:bg-neutro-100 hover:text-primario-700"
                >
                  <Pencil size={18} />
                </button>
              </div>
            )}
            <p className="mt-0.5 text-sm text-neutro-500">
              {categoria.nombreVisible !== categoria.name && <>En Alegra: {categoria.name} · </>}
              {subsOrdenadas.length} subcategoría{subsOrdenadas.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 self-start divide-x divide-neutro-200 rounded-xl bg-neutro-50 p-4 lg:self-auto">
          <div className="px-5 text-center">
            <p className="text-sm font-medium text-neutro-500">Productos</p>
            <p className="text-2xl font-bold text-neutro-900">{categoria.total}</p>
          </div>
          <div className="px-5 text-center">
            <p className="text-sm font-medium text-neutro-500">Clasificados</p>
            <p className="text-2xl font-bold text-primario-600">{clasificados === null ? '—' : `${clasificados}%`}</p>
          </div>
          <div className="px-5 text-center">
            <p className="text-sm font-medium text-neutro-500">Sin foto</p>
            <p className={`text-2xl font-bold ${categoria.sinImagen > 0 ? 'text-peligro-600' : 'text-neutro-900'}`}>{categoria.sinImagen}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Ficha activa={subFoco === null} onClick={() => onEnfocar(null)} cantidad={categoria.total}>Todas</Ficha>
        {subsOrdenadas.map((s) => (
          <Ficha key={s.id} activa={subFoco === s.id} onClick={() => onEnfocar(s.id)} cantidad={s.productos}>{s.nombre}</Ficha>
        ))}
        {categoria.sinClasificar > 0 && (
          <Ficha alerta activa={subFoco === 'sin'} onClick={() => onEnfocar('sin')} cantidad={categoria.sinClasificar}>Sin clasificar</Ficha>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-neutro-100 bg-white p-4 shadow-sm xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            placeholder={`Buscar en ${categoria.nombreVisible} por nombre o referencia…`}
            className="w-full rounded-xl border border-neutro-200 bg-neutro-50 py-2.5 pl-10 pr-3 text-base text-neutro-900 focus:border-primario-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primario-500/30"
          />
        </div>

        <label className="flex shrink-0 cursor-pointer select-none items-center gap-3">
          <input type="checkbox" checked={soloSinImagen} onChange={(e) => setSoloSinImagen(e.target.checked)} className="peer sr-only" />
          <div className="relative h-6 w-11 rounded-full bg-neutro-200 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-primario-600 peer-checked:after:translate-x-full" />
          <span className="flex items-center gap-1.5 text-sm font-semibold text-neutro-700">
            <AlertCircle size={16} className="text-alerta-500" /> Solo sin foto
          </span>
        </label>

        <div className="flex shrink-0 flex-col gap-1">
          <div className="flex gap-2">
            <input
              value={nuevaSub}
              onChange={(e) => setNuevaSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') crearSub() }}
              placeholder="Nueva subcategoría"
              maxLength={80}
              className="w-52 rounded-xl border border-neutro-200 bg-neutro-50 px-3 py-2.5 text-sm text-neutro-900 focus:border-primario-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primario-500/30"
            />
            <Boton icono={Plus} onClick={crearSub} cargando={creandoSub} disabled={!nuevaSub.trim()}>Crear</Boton>
          </div>
          {errorSub && <p className="text-xs font-semibold text-peligro-600">{errorSub}</p>}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center gap-3 rounded-xl border border-neutro-100 bg-white shadow-sm">
          <Loader2 size={24} className="animate-spin text-primario-600" />
          <span className="text-base font-semibold text-neutro-500">Cargando productos…</span>
        </div>
      ) : secciones.length === 0 ? (
        <div className="rounded-xl border border-neutro-100 bg-white py-16 text-center shadow-sm">
          <PackageSearch className="mx-auto mb-4 text-neutro-300" size={56} />
          <h3 className="mb-1 text-xl font-bold text-neutro-900">
            {hayFiltro ? 'Nada coincide' : 'Esta categoría está vacía'}
          </h3>
          <p className="text-neutro-500">
            {hayFiltro ? 'Probá con otro texto o apagá "Solo sin foto".' : 'Creá una subcategoría o traé productos desde otra categoría.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {secciones.map((s) => {
            const posicion = s.sub ? idsOrdenados.indexOf(s.sub.id) : -1
            return (
              <SeccionSubcategoria
                key={s.clave}
                seccion={s}
                otrasCategorias={otrasCategorias}
                esPrimera={posicion <= 0}
                esUltima={posicion === -1 || posicion === idsOrdenados.length - 1}
                estaSeleccionado={estaSeleccionado}
                onAlternar={manejarAlternar}
                seleccionarTodos={seleccionarTodos}
                deseleccionarTodos={deseleccionarTodos}
                onSubir={() => moverSub(s.sub.id, -1)}
                onBajar={() => moverSub(s.sub.id, 1)}
                onRenombrar={onRenombrarSub}
                onEliminar={onEliminarSub}
                onMoverACategoria={onMoverSub}
                onEditar={onEditar}
                onSugerirFoto={onSugerirFoto}
                onDuplicar={onDuplicar}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

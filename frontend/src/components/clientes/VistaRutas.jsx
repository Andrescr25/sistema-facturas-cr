import { useState, useEffect } from 'react'
import { ArrowUp, ArrowDown, GripVertical, Plus, Save, Loader2, Pencil, Map, UserPlus } from 'lucide-react'
import Boton from '../ui/Boton'
import HojaModal from '../pagos/HojaModal'
import UbicacionCliente from './UbicacionCliente'
import AsignarClientesRuta from './AsignarClientesRuta'


export default function VistaRutas({ modelo: m, confirm, onAbrirCliente, onEnfoque }) {
  const [edicion, setEdicion] = useState(null), [nombre, setNombre] = useState(''), [activo, setActivo] = useState(true)
  const [orden, setOrden] = useState([]), [arrastrado, setArrastrado] = useState(null)
  // La ruta cuyos clientes se están eligiendo. Antes "Asignar clientes" mandaba
  // al directorio filtrado por "sin ruta", a editar ficha por ficha.
  const [asignando, setAsignando] = useState(null)
  // Mientras se eligen clientes, la página suelta su cabecera y sus pestañas
  // (igual que al abrir una ficha): la lista es larga y es lo único que se usa.
  useEffect(() => { onEnfoque?.(Boolean(asignando)); return () => onEnfoque?.(false) }, [asignando, onEnfoque])
  useEffect(() => { setOrden(m.ruta?.clientes || []) }, [m.ruta])
  const abrirEdicion = r => { setEdicion(r || {}); setNombre(r?.nombre || ''); setActivo(r?.activo ?? true) }
  const guardarRuta = async e => {
    e.preventDefault()
    const r = await m.ejecutar(() => edicion.id ? m.editar(edicion.id, { nombre, activo }) : m.crear({ nombre }), 'Ruta guardada')
    if (r) { setEdicion(null); m.setSeleccion(String(r.id)) }
  }
  const mover = (desde, hasta) => {
    if (desde === null || desde === hasta || desde < 0 || hasta < 0 || hasta >= orden.length) return
    setOrden(prev => { const lista = [...prev]; const [c] = lista.splice(desde, 1); lista.splice(hasta, 0, c); return lista })
  }
  const cambio = m.ruta && orden.some((c, i) => c.id !== m.ruta.clientes[i]?.id)
  if (asignando) return <AsignarClientesRuta key={asignando.id} ruta={asignando} modelo={m} confirm={confirm} onVolver={() => setAsignando(null)} />
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <div><h2 className="text-xl font-extrabold text-neutro-900">Rutas</h2>
        <p className="text-sm text-neutro-500">Organizá los clientes y el orden de visita de cada ruta.</p></div>
      <Boton onClick={() => abrirEdicion(null)}><Plus size={16} />Nueva ruta</Boton>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Elegir ruta">
      {m.rutas.map(r => <button key={r.id} type="button" data-ruta={r.id} aria-pressed={String(r.id) === m.seleccion}
        onClick={() => m.setSeleccion(String(r.id))}
        className={`flex items-center gap-4 rounded-2xl border-2 bg-white p-5 text-left ${String(r.id) === m.seleccion ? 'border-primario-700' : 'border-neutro-200 hover:border-primario-300'}`}>
        <span className="rounded-xl bg-primario-50 p-3 text-primario-800"><Map size={24} /></span>
        <span><span className="block text-lg font-bold text-neutro-900">{r.nombre}</span>
          <span className="mt-1 block text-sm text-neutro-500">{r.clientes_activos} {Number(r.clientes_activos) === 1 ? 'cliente' : 'clientes'}{!r.activo && ' · Inactiva'}</span></span>
      </button>)}
    </div>
    {m.rutas.length === 0 && <div className="rounded-2xl border border-neutro-200 bg-white p-8 text-center">
      <Map size={40} className="mx-auto mb-3 text-neutro-300" /><h3 className="text-lg font-bold">Empezá por crear una ruta</h3>
      <p className="mt-2 text-base text-neutro-500">Después tocá «Asignar clientes» para elegir quiénes van en ella y definí el orden de visita.</p>
    </div>}
    {m.cargando && <Loader2 className="animate-spin" aria-label="Cargando ruta" />}
    {m.ruta && <section className="space-y-4 rounded-2xl border border-neutro-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="text-lg font-bold">{m.ruta.nombre}{!m.ruta.activo && ' · Inactiva'}</h3>
        <div className="flex flex-wrap gap-2"><Boton variante="secundario" onClick={() => abrirEdicion(m.ruta)}><Pencil size={14} />Editar ruta</Boton>
          <Boton variante={orden.length ? 'secundario' : 'primario'} disabled={cambio} onClick={() => setAsignando(m.ruta)}><UserPlus size={14} />Asignar clientes</Boton></div>
      </div>
      <p className="text-sm text-neutro-500">Arrastrá los clientes o usá las flechas. Guardá el orden al terminar.</p>
      <ol className="space-y-2">{orden.map((c, i) => <li key={c.id} data-ruta-cliente={c.id}
        draggable={!m.guardando} onDragStart={e => { setArrastrado(i); e.dataTransfer.setData('text/plain', String(c.id)); e.dataTransfer.effectAllowed = 'move' }}
        onDragOver={e => e.preventDefault()} onDragEnd={() => setArrastrado(null)} onDrop={e => { e.preventDefault(); mover(arrastrado, i); setArrastrado(null) }}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutro-200 p-4">
        <div className="flex items-center gap-2 min-w-0"><GripVertical size={16} className="text-neutro-400 shrink-0" /><span className="font-bold text-neutro-400">{i + 1}.</span>
          <button className="text-left font-bold" onClick={() => onAbrirCliente(c.id)}>{c.nombre}</button>{!c.activo && <span className="text-xs text-neutro-400">Inactivo</span>}</div>
        <div className="flex items-center gap-2"><UbicacionCliente enlace={c.ubicacion_maps} />
          <Boton variante="secundario" disabled={i === 0 || m.guardando} onClick={() => mover(i, i - 1)} aria-label={`Subir ${c.nombre}`}><ArrowUp size={16} /></Boton>
          <Boton variante="secundario" disabled={i === orden.length - 1 || m.guardando} onClick={() => mover(i, i + 1)} aria-label={`Bajar ${c.nombre}`}><ArrowDown size={16} /></Boton>
        </div>
      </li>)}</ol>
      {!orden.length && <p className="text-base text-neutro-500">Esta ruta todavía no tiene clientes. Tocá «Asignar clientes» para elegirlos de la lista.</p>}
      {cambio && <div className="flex flex-wrap gap-2"><Boton cargando={m.guardando} onClick={() => m.ejecutar(() => m.ordenar(m.ruta.id, orden.map(c => c.id), m.ruta.version), 'Orden de visita guardado')}><Save size={16} />Guardar orden</Boton>
        <Boton variante="secundario" onClick={() => setOrden(m.ruta.clientes)}>Descartar cambios</Boton></div>}
    </section>}
    {edicion && <HojaModal titulo={edicion.id ? 'Editar ruta' : 'Nueva ruta'} onCerrar={() => setEdicion(null)} ancho="sm:max-w-lg">
      <form onSubmit={guardarRuta} className="space-y-4">
        <label className="block text-sm font-bold">Nombre de ruta<input required maxLength={120} className="input min-h-11 w-full mt-1" value={nombre} onChange={e => setNombre(e.target.value)} /></label>
        {edicion.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />Ruta activa</label>}
        <Boton type="submit" cargando={m.guardando}>Guardar ruta</Boton>
      </form>
    </HojaModal>}
  </div>
}

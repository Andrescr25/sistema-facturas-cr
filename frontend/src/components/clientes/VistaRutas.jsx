import { useState, useEffect } from 'react'
import { ArrowUp, ArrowDown, GripVertical, Plus, Save, Loader2, Pencil, ArrowLeft } from 'lucide-react'
import Boton from '../ui/Boton'
import HojaModal from '../pagos/HojaModal'
import UbicacionCliente from './UbicacionCliente'
import ModalPreventa from './ModalPreventa'
import { rutasService } from '../../services/rutasService'

const ESTADOS = { preventa: 'Preventa', preparacion: 'Preparación', entrega: 'Entrega', cerrado: 'Cerrado', cancelado: 'Cancelado' }
const ACCIONES = { preventa: ['preparacion', 'cancelado'], preparacion: ['entrega', 'cancelado'], entrega: ['cerrado'] }
const fecha = s => s?.split('-').reverse().join('/') || '—'

export default function VistaRutas({ modelo: m, confirm, onAbrirCliente, onAsignarClientes }) {
  const [edicion, setEdicion] = useState(null), [nombre, setNombre] = useState(''), [activo, setActivo] = useState(true)
  const [orden, setOrden] = useState([]), [arrastrado, setArrastrado] = useState(null)
  const [semana, setSemana] = useState(''), [detalle, setDetalle] = useState(null)
  const [preventa, setPreventa] = useState(null)
  useEffect(() => { setOrden(m.ruta?.clientes || []) }, [m.ruta])
  const abrirEdicion = r => { setEdicion(r || {}); setNombre(r?.nombre || ''); setActivo(r?.activo ?? true) }
  const guardarRuta = async e => {
    e.preventDefault()
    const r = await m.ejecutar(() => edicion.id ? rutasService.editar(edicion.id, { nombre, activo }) : rutasService.crear({ nombre }), 'Ruta guardada')
    if (r) { setEdicion(null); m.setSeleccion(String(r.id)) }
  }
  const mover = (desde, hasta) => {
    if (desde === null || desde === hasta || desde < 0 || hasta < 0 || hasta >= orden.length) return
    setOrden(prev => { const lista = [...prev]; const [c] = lista.splice(desde, 1); lista.splice(hasta, 0, c); return lista })
  }
  const cambio = m.ruta && orden.some((c, i) => c.id !== m.ruta.clientes[i]?.id)
  const crearCiclo = async e => {
    e.preventDefault()
    if (await m.ejecutar(() => rutasService.crearCiclo(m.ruta.id, semana), 'Ciclo creado con su recorrido')) setSemana('')
  }
  const cambiarEstado = async (c, estado) => {
    const ok = await confirm(`El ciclo ${c.ruta_nombre} · semana ${fecha(c.semana)} pasará a ${ESTADOS[estado].toLowerCase()}.`,
      { title: 'Cambiar ciclo', confirmLabel: 'Continuar', variant: estado === 'cancelado' ? 'danger' : 'default' })
    if (ok) await m.ejecutar(() => rutasService.estadoCiclo(c, estado), 'Estado del ciclo actualizado')
  }
  if (detalle) return <div className="space-y-4">
    <Boton variante="secundario" onClick={() => setDetalle(null)}><ArrowLeft size={16} />Volver a rutas</Boton>
    <h2 className="text-xl font-extrabold">{detalle.ruta_nombre} · semana {fecha(detalle.semana)}</h2>
    <p className="text-sm text-neutro-500">{ESTADOS[detalle.estado]} · Recorrido guardado para este ciclo.</p>
    <ol className="space-y-2">{detalle.clientes.map(c => <li key={c.id} className="rounded-2xl border bg-white p-4 flex flex-wrap items-center justify-between gap-3">
      <span className="font-bold">{c.orden}. {c.cliente_nombre}</span>
      <div className="flex flex-wrap gap-2"><UbicacionCliente enlace={c.ubicacion_maps} />
        {detalle.estado === 'preventa' && <Boton variante="secundario" onClick={() => setPreventa(c.cliente_id)}>Preparar catálogo</Boton>}</div>
    </li>)}</ol>
    {detalle.estado === 'preventa' && <p className="text-sm text-neutro-600">Elegí cada cliente para preparar su enlace. Copiar o preparar no manda mensajes; revisá el número antes de enviarlos.</p>}
    {preventa && <ModalPreventa key={`${detalle.id}:${preventa}`} clienteId={preventa} cicloId={detalle.id} onCerrar={() => setPreventa(null)} />}
  </div>
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <div><h2 className="text-xl font-extrabold text-neutro-900">Rutas y semanas</h2>
        <p className="text-sm text-neutro-500">Organizá las visitas y guardá un recorrido para cada semana.</p></div>
      <Boton onClick={() => abrirEdicion(null)}><Plus size={16} />Nueva ruta</Boton>
    </div>
    <select aria-label="Seleccionar ruta" className="input min-h-11 w-full sm:w-80" value={m.seleccion} onChange={e => m.setSeleccion(e.target.value)}>
      <option value="">Elegí una ruta</option>{m.rutas.map(r => <option key={r.id} value={r.id}>{r.nombre} · {r.clientes_activos} clientes{r.activo ? '' : ' · inactiva'}</option>)}
    </select>
    {m.rutas.length === 0 && <div className="rounded-2xl border bg-white p-6 text-neutro-600">Creá la primera ruta y asigná sus clientes desde sus fichas.</div>}
    {m.cargando && <Loader2 className="animate-spin" aria-label="Cargando ruta" />}
    {m.ruta && <section className="space-y-3 rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="text-lg font-bold">{m.ruta.nombre}{!m.ruta.activo && ' · Inactiva'}</h3>
        <div className="flex flex-wrap gap-2"><Boton variante="secundario" onClick={() => abrirEdicion(m.ruta)}><Pencil size={14} />Editar ruta</Boton>
          <Boton variante="secundario" onClick={onAsignarClientes}>Asignar clientes</Boton></div>
      </div>
      <p className="text-sm text-neutro-500">Arrastrá los clientes o usá las flechas. Guardá el orden al terminar.</p>
      <ol className="space-y-2">{orden.map((c, i) => <li key={c.id} data-ruta-cliente={c.id}
        draggable={!m.guardando} onDragStart={e => { setArrastrado(i); e.dataTransfer.setData('text/plain', String(c.id)); e.dataTransfer.effectAllowed = 'move' }}
        onDragOver={e => e.preventDefault()} onDragEnd={() => setArrastrado(null)} onDrop={e => { e.preventDefault(); mover(arrastrado, i); setArrastrado(null) }}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutro-200 p-3">
        <div className="flex items-center gap-2 min-w-0"><GripVertical size={16} className="text-neutro-400 shrink-0" /><span className="font-bold text-neutro-400">{i + 1}.</span>
          <button className="text-left font-bold" onClick={() => onAbrirCliente(c.id)}>{c.nombre}</button>{!c.activo && <span className="text-xs text-neutro-400">Inactivo</span>}</div>
        <div className="flex items-center gap-2"><UbicacionCliente enlace={c.ubicacion_maps} />
          <Boton variante="secundario" disabled={i === 0 || m.guardando} onClick={() => mover(i, i - 1)} aria-label={`Subir ${c.nombre}`}><ArrowUp size={16} /></Boton>
          <Boton variante="secundario" disabled={i === orden.length - 1 || m.guardando} onClick={() => mover(i, i + 1)} aria-label={`Bajar ${c.nombre}`}><ArrowDown size={16} /></Boton>
        </div>
      </li>)}</ol>
      {!orden.length && <p className="text-sm text-neutro-400">Sin clientes asignados.</p>}
      {cambio && <div className="flex flex-wrap gap-2"><Boton cargando={m.guardando} onClick={() => m.ejecutar(() => rutasService.ordenar(m.ruta.id, orden.map(c => c.id), m.ruta.version), 'Orden de visita guardado')}><Save size={16} />Guardar orden</Boton>
        <Boton variante="secundario" onClick={() => setOrden(m.ruta.clientes)}>Descartar cambios</Boton></div>}
      <form onSubmit={crearCiclo} className="flex flex-wrap items-end gap-3 border-t pt-4">
        <label className="text-sm font-semibold">Semana que empieza el lunes<input required type="date" aria-label="Semana del ciclo" className="input relative min-h-11 mt-1 block" value={semana} onChange={e => setSemana(e.target.value)} /></label>
        <Boton type="submit" disabled={!m.ruta.activo || !orden.some(c => c.activo) || cambio} cargando={m.guardando}>Crear ciclo en preventa</Boton>
      </form>
    </section>}
    <section className="space-y-3"><h3 className="text-lg font-bold">Ciclos de ruta</h3>
      {!m.ciclos.length && <p className="text-sm text-neutro-400">Todavía no hay ciclos. Cada semana tendrá su propio recorrido.</p>}
      {m.ciclos.map(c => <article key={c.id} className="rounded-2xl border bg-white p-4 flex flex-wrap justify-between items-center gap-3">
        <div><p className="font-bold">{c.ruta_nombre} · semana {fecha(c.semana)}</p><p className="text-sm text-neutro-500">{c.estado === 'preventa' ? 'Preventa anticipada' : ESTADOS[c.estado]} · {c.clientes} clientes{['preparacion','entrega'].includes(c.estado) && ' · Ruta actual'}</p></div>
        <div className="flex flex-wrap gap-2"><Boton variante="secundario" cargando={m.guardando} onClick={async () => { const r = await m.ejecutar(() => rutasService.ciclo(c.id)); if (r) setDetalle(r) }}>Ver recorrido</Boton>
          {(ACCIONES[c.estado] || []).map(estado => <Boton key={estado} variante={estado === 'cancelado' ? 'fantasma' : 'secundario'} disabled={m.guardando} onClick={() => cambiarEstado(c, estado)}>{ESTADOS[estado]}</Boton>)}
        </div>
      </article>)}
    </section>
    {edicion && <HojaModal titulo={edicion.id ? 'Editar ruta' : 'Nueva ruta'} onCerrar={() => setEdicion(null)} ancho="sm:max-w-lg">
      <form onSubmit={guardarRuta} className="space-y-4">
        <label className="block text-sm font-bold">Nombre de ruta<input required maxLength={120} className="input min-h-11 w-full mt-1" value={nombre} onChange={e => setNombre(e.target.value)} /></label>
        {edicion.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />Ruta activa</label>}
        <Boton type="submit" cargando={m.guardando}>Guardar ruta</Boton>
      </form>
    </HojaModal>}
  </div>
}

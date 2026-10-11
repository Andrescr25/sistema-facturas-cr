import { useState, useEffect } from 'react'
import { ArrowUp, ArrowDown, GripVertical, Plus, Save, Loader2, Pencil, ArrowLeft, Map, CalendarDays, UserPlus } from 'lucide-react'
import Boton from '../ui/Boton'
import HojaModal from '../pagos/HojaModal'
import UbicacionCliente from './UbicacionCliente'
import ModalPreventa from './ModalPreventa'
import AsignarClientesRuta from './AsignarClientesRuta'
import { rutasService } from '../../services/rutasService'

const ESTADOS = { preventa: 'Preventa', preparacion: 'Preparación', entrega: 'Entrega', cerrado: 'Cerrado', cancelado: 'Cancelado' }
const ACCIONES = { preventa: ['preparacion', 'cancelado'], preparacion: ['entrega', 'cancelado'], entrega: ['cerrado'] }
const fecha = s => s?.split('-').reverse().join('/') || '—'

export default function VistaRutas({ modelo: m, confirm, onAbrirCliente, onEnfoque }) {
  const [edicion, setEdicion] = useState(null), [nombre, setNombre] = useState(''), [activo, setActivo] = useState(true)
  const [orden, setOrden] = useState([]), [arrastrado, setArrastrado] = useState(null)
  const [semana, setSemana] = useState(''), [detalle, setDetalle] = useState(null)
  const [preventa, setPreventa] = useState(null)
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
  if (asignando) return <AsignarClientesRuta key={asignando.id} ruta={asignando} modelo={m} confirm={confirm} onVolver={() => setAsignando(null)} />
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
      {cambio && <div className="flex flex-wrap gap-2"><Boton cargando={m.guardando} onClick={() => m.ejecutar(() => rutasService.ordenar(m.ruta.id, orden.map(c => c.id), m.ruta.version), 'Orden de visita guardado')}><Save size={16} />Guardar orden</Boton>
        <Boton variante="secundario" onClick={() => setOrden(m.ruta.clientes)}>Descartar cambios</Boton></div>}
      <form onSubmit={crearCiclo} className="flex flex-wrap items-end gap-3 border-t pt-4">
        <label className="text-sm font-semibold">Semana que empieza el lunes<input required type="date" aria-label="Semana del ciclo" className="input relative min-h-11 mt-1 block" value={semana} onChange={e => setSemana(e.target.value)} /></label>
        <Boton type="submit" disabled={!m.ruta.activo || !orden.some(c => c.activo) || cambio} cargando={m.guardando}>Crear ciclo en preventa</Boton>
      </form>
    </section>}
    <section className="space-y-4">
      <div className="flex items-center gap-2"><CalendarDays size={22} className="text-primario-700" /><h3 className="text-xl font-bold">Semanas de trabajo</h3></div>
      <p className="text-base text-neutro-500">Separá la preparación actual de la preventa de las próximas semanas.</p>
      {m.ciclos.filter(c => !['cerrado','cancelado'].includes(c.estado)).length === 0 &&
        <div className="rounded-2xl border border-neutro-200 bg-white p-6 text-neutro-500">No hay semanas en curso. Seleccioná una ruta para crear su próximo ciclo.</div>}
      {m.ciclos.filter(c => !['cerrado','cancelado'].includes(c.estado)).map(c =>
        <TarjetaCiclo key={c.id} ciclo={c} guardando={m.guardando} onEstado={cambiarEstado}
          onRecorrido={async () => { const r = await m.ejecutar(() => rutasService.ciclo(c.id)); if (r) setDetalle(r) }} />)}
      {m.ciclos.some(c => ['cerrado','cancelado'].includes(c.estado)) &&
        <details className="rounded-2xl border border-neutro-200 bg-white p-5">
          <summary className="cursor-pointer text-base font-bold text-neutro-700">Historial de semanas cerradas y canceladas</summary>
          <div className="mt-4 space-y-3">{m.ciclos.filter(c => ['cerrado','cancelado'].includes(c.estado)).map(c =>
            <TarjetaCiclo key={c.id} ciclo={c} guardando={m.guardando} onEstado={cambiarEstado}
              onRecorrido={async () => { const r = await m.ejecutar(() => rutasService.ciclo(c.id)); if (r) setDetalle(r) }} />)}</div>
        </details>}
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


function TarjetaCiclo({ ciclo: c, guardando, onEstado, onRecorrido }) {
  return <article className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutro-200 bg-white p-5">
    <div><p className="text-lg font-bold text-neutro-900">{c.ruta_nombre}</p>
      <p className="mt-1 text-base text-neutro-600">Semana {fecha(c.semana)}</p>
      <p className="mt-2 text-sm text-neutro-500">{c.estado === 'preventa' ? 'Preventa anticipada' : ESTADOS[c.estado]} · {c.clientes} {Number(c.clientes) === 1 ? 'cliente' : 'clientes'}{['preparacion','entrega'].includes(c.estado) && ' · Ruta actual'}</p>
    </div>
    <div className="flex flex-wrap gap-2"><Boton variante="secundario" cargando={guardando} onClick={onRecorrido}>Ver recorrido</Boton>
      {(ACCIONES[c.estado] || []).map(estado => <Boton key={estado} variante={estado === 'cancelado' ? 'fantasma' : 'secundario'} disabled={guardando} onClick={() => onEstado(c, estado)}>{ESTADOS[estado]}</Boton>)}
    </div>
  </article>
}

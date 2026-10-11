import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { ArrowLeft, Check, Loader2, Map as IconoRuta, MapPin, RefreshCw, Save, Search, UserCheck, UserPlus, Users, X } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import TarjetasResumen from '../pagos/TarjetasResumen'
import { rutasService } from '../../services/rutasService'
import {
  estadoDe, lugarDe, coincide, alternar, quedaEnRuta, marcarTodos, porMarcar,
  cambiosDe, marcasVigentes, resumenDe, hechoDe
} from '../../utils/asignacionRuta'

const iniciales = nombre => String(nombre || '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('')

/**
 * Elegir, de una vez, qué clientes van en una ruta.
 *
 * QUÉ REEMPLAZA (2026-10-11). "Asignar clientes" mandaba al directorio
 * filtrado por "sin ruta": había que abrir la ficha de cada cliente, editarla
 * y volver. El usuario va a poner a alguien que se sabe las rutas a
 * asignarlas, con 248 clientes sin ruta, y pidió que la ruta «me traiga una
 * lista de esos clientes donde puedo darle click y poner un check».
 *
 * CÓMO SE USA
 *   · Abre en "Sin ruta", que es a quien hay que ubicar.
 *   · El buscador mira el nombre Y el lugar: quien arma las rutas las conoce
 *     por cantón y distrito, así que tecleando "orotina" quedan los de ahí, y
 *     se pueden marcar todos juntos.
 *   · Tocar una tarjeta la marca; tocarla de nuevo deshace el toque.
 *
 * POR QUÉ SE GUARDA AL FINAL Y NO EN CADA TOQUE. Sacar a un cliente de una
 * ruta le hace perder su puesto en el recorrido, y traerlo de otra ruta lo
 * saca de allá: con guardado inmediato, un toque de más ya hizo ese daño.
 * Así un error se arregla tocando otra vez, lo que cambia se ve antes de
 * confirmarlo (la barra de abajo lo cuenta) y todo entra en una sola
 * operación: o se guarda entero o no se guarda. Es la misma costumbre del
 * orden de visita de esta pantalla, que también se guarda al terminar.
 */
export default function AsignarClientesRuta({ ruta, modelo: m, confirm, onVolver }) {
  const [clientes, setClientes] = useState(null)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState({ estado: 'sin-ruta', dias: 'todos' })
  // id → de qué ruta lo vi al tocarlo, en el orden de los toques.
  const [marcas, setMarcas] = useState(() => new Map())
  const peticion = useRef(0)

  const cargar = useCallback(async ({ conservar = false } = {}) => {
    const mia = ++peticion.current
    setError('')
    try {
      const r = await rutasService.candidatos(ruta.id)
      if (mia !== peticion.current) return
      setClientes(r.clientes)
      setMarcas(prev => (conservar ? marcasVigentes(prev, r.clientes) : new Map()))
      // Sin nadie por ubicar, la lista útil es la de todos.
      if (!conservar && !r.clientes.some(c => estadoDe(c, ruta.id) === 'sin-ruta')) setFiltros({ estado: 'todos', dias: 'todos' })
    } catch (e) {
      if (mia === peticion.current) setError(e.response?.data?.message || 'No se pudo cargar la lista de clientes.')
    }
  }, [ruta.id])
  useEffect(() => { cargar() }, [cargar])

  const cuenta = useMemo(() => {
    const c = { 'sin-ruta': 0, esta: 0, otra: 0 }
    for (const cliente of clientes || []) c[estadoDe(cliente, ruta.id)]++
    return c
  }, [clientes, ruta.id])

  const visibles = useMemo(() => (clientes || []).filter(c =>
    (filtros.estado === 'todos' || estadoDe(c, ruta.id) === filtros.estado) && coincide(c, busqueda)
  ), [clientes, filtros.estado, busqueda, ruta.id])

  const cambios = useMemo(() => cambiosDe(marcas, clientes || [], ruta.id), [marcas, clientes, ruta.id])
  const faltanMarcar = porMarcar(marcas, visibles, ruta.id)

  const volver = async () => {
    if (cambios.total > 0) {
      const ok = await confirm(
        `Hay ${cambios.total} ${cambios.total === 1 ? 'cambio' : 'cambios'} sin guardar en ${ruta.nombre}. Si salís ahora se pierden.`,
        { title: 'Salir sin guardar', confirmLabel: 'Salir sin guardar', variant: 'danger' })
      if (!ok) return
    }
    onVolver()
  }

  const guardar = async () => {
    // Traer a alguien de otra ruta lo saca de allá: eso se dice antes.
    if (cambios.movidos.length > 0) {
      const nombres = cambios.movidos.slice(0, 4).map(c => `${c.nombre} (${c.ruta_nombre})`).join(', ')
      const resto = cambios.movidos.length > 4 ? ` y ${cambios.movidos.length - 4} más` : ''
      const ok = await confirm(
        `${cambios.movidos.length === 1 ? 'Este cliente deja' : `Estos ${cambios.movidos.length} clientes dejan`} la ruta en la que ${cambios.movidos.length === 1 ? 'está' : 'están'} y ${cambios.movidos.length === 1 ? 'pasa' : 'pasan'} a ${ruta.nombre}: ${nombres}${resto}.`,
        { title: 'Cambiar de ruta', confirmLabel: 'Sí, pasarlos' })
      if (!ok) return
    }
    const r = await m.ejecutar(
      () => rutasService.asignar(ruta.id, { agregar: cambios.agregar, quitar: cambios.quitar }),
      `${ruta.nombre}: ${hechoDe(cambios)}`)
    // Si falló (alguien movió a un cliente mientras tanto), se relee y quedan
    // solo las marcas que siguen diciendo lo que se vio.
    await cargar({ conservar: !r })
  }

  const tarjetas = [
    { clave: 'sin-ruta', titulo: 'Sin ruta', icono: UserPlus, valor: cuenta['sin-ruta'], tono: cuenta['sin-ruta'] ? 'alerta' : 'neutro', filtro: { estado: 'sin-ruta' } },
    { clave: 'esta', titulo: 'En esta ruta', icono: UserCheck, valor: cuenta.esta, tono: 'exito', filtro: { estado: 'esta' } },
    { clave: 'otra', titulo: 'En otra ruta', icono: IconoRuta, valor: cuenta.otra, tono: 'neutro', filtro: { estado: 'otra' } }
  ]

  return (
    <div className="space-y-5">
      <Boton variante="secundario" onClick={volver}><ArrowLeft size={16} />Volver a rutas</Boton>
      <div>
        <h2 className="text-xl font-extrabold text-neutro-900">Clientes de {ruta.nombre}</h2>
        <p className="mt-1 text-base text-neutro-500">Tocá cada cliente que va en esta ruta. Nada cambia hasta que guardés.</p>
      </div>

      {!ruta.activo && <p className="rounded-2xl border border-alerta-200 bg-alerta-50 px-4 py-3 text-sm text-alerta-800">
        Esta ruta está inactiva: se le pueden quitar clientes, pero no agregar.
      </p>}

      {error ? (
        <div className="rounded-2xl border border-peligro-200 bg-white p-8 text-center" role="alert">
          <p className="text-base font-semibold text-peligro-700">{error}</p>
          <Boton variante="secundario" className="mt-4" onClick={() => cargar()}><RefreshCw size={17} />Reintentar</Boton>
        </div>
      ) : clientes === null ? (
        <div className="flex min-h-56 items-center justify-center gap-3 text-neutro-500" role="status"><Loader2 size={25} className="animate-spin" />Cargando clientes…</div>
      ) : <>
        <TarjetasResumen tarjetas={tarjetas} filtros={filtros} setFiltros={setFiltros} compacta />

        <div className="rounded-2xl border border-neutro-200 bg-white p-4 sm:p-5">
          <label className="block text-sm font-semibold text-neutro-700">
            Buscar por nombre o por lugar
            <div className="relative mt-2">
              <Search size={19} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" aria-hidden="true" />
              <input type="search" aria-label="Buscar clientes para la ruta" value={busqueda}
                onChange={e => setBusqueda(e.target.value)} placeholder="Nombre, cantón, distrito o señas"
                className="input min-h-12 w-full pl-10 text-base" />
            </div>
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutro-100 pt-4">
            <p className="text-sm text-neutro-600" aria-live="polite">
              <strong className="text-neutro-900">{visibles.length}</strong> {visibles.length === 1 ? 'cliente' : 'clientes'} en esta lista
            </p>
            <div className="flex flex-wrap gap-2">
              {(busqueda || filtros.estado !== 'todos') && <button type="button" onClick={() => { setBusqueda(''); setFiltros({ estado: 'todos', dias: 'todos' }) }}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primario-700"><X size={16} />Ver todos</button>}
              {/* El atajo que hace rápido el trabajo: buscar un lugar y marcar
                  a todos los de ahí. No guarda nada: solo marca. */}
              {ruta.activo && faltanMarcar > 1 && <Boton variante="secundario" onClick={() => setMarcas(prev => marcarTodos(prev, visibles, ruta.id))}>
                <Users size={16} />Marcar los {faltanMarcar} de esta lista
              </Boton>}
            </div>
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="rounded-2xl border border-neutro-200 bg-white px-6 py-14 text-center">
            <Users size={44} className="mx-auto mb-4 text-neutro-300" />
            <h3 className="text-lg font-bold text-neutro-900">{busqueda ? 'No encontramos clientes' : filtros.estado === 'sin-ruta' ? 'Todos los clientes ya tienen ruta' : 'No hay clientes en esta lista'}</h3>
            <p className="mx-auto mt-2 max-w-md text-base text-neutro-500">{busqueda ? 'Probá otro nombre u otro lugar.' : 'Elegí otra de las tarjetas de arriba para ver más clientes.'}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={`Clientes para ${ruta.nombre}`}>
            {visibles.map(c => <TarjetaCliente key={c.id} cliente={c} rutaId={ruta.id} rutaActiva={ruta.activo}
              marcado={marcas.has(c.id)} queda={quedaEnRuta(marcas, c, ruta.id)}
              ocupado={m.guardando} onTocar={() => setMarcas(prev => alternar(prev, c))} />)}
          </div>
        )}

        {/* Siempre a la vista mientras haya algo sin guardar: es lo que evita
            irse creyendo que ya quedó. */}
        {cambios.total > 0 && <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-primario-700 bg-white p-4 shadow-xl" role="status">
          <div>
            <p className="text-base font-extrabold text-neutro-900">{resumenDe(cambios)}</p>
            <p className="text-sm text-neutro-500">Todavía no se guardó.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton variante="fantasma" tamano="lg" disabled={m.guardando} onClick={() => setMarcas(new Map())}>Descartar</Boton>
            <Boton tamano="lg" cargando={m.guardando} onClick={guardar}><Save size={18} />Guardar cambios</Boton>
          </div>
        </div>}
      </>}
    </div>
  )
}

/** Una tarjeta grande y entera tocable: el check es toda la tarjeta, no una casilla chica. */
function TarjetaCliente({ cliente: c, rutaId, rutaActiva, marcado, queda, ocupado, onTocar }) {
  const estado = estadoDe(c, rutaId)
  const seQuita = estado === 'esta' && marcado
  const lugar = lugarDe(c)
  // A una ruta inactiva no se le agrega nadie: la tarjeta no se ofrece.
  const bloqueada = ocupado || (!rutaActiva && estado !== 'esta')
  const borde = seQuita ? 'border-alerta-400 bg-alerta-50/50'
    : queda ? 'border-primario-700 bg-primario-50/50'
    : 'border-neutro-200 bg-white hover:border-primario-300'

  return (
    <button type="button" data-cliente={c.id} aria-pressed={queda} disabled={bloqueada} onClick={onTocar}
      aria-label={`${queda ? 'Quitar' : 'Agregar'} ${c.nombre}`}
      className={`flex w-full min-w-0 items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primario-500 disabled:cursor-not-allowed disabled:opacity-60 ${borde}`}>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primario-50 text-lg font-extrabold text-primario-800" aria-hidden="true">{iniciales(c.nombre)}</span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-lg font-bold leading-snug text-neutro-900">{c.nombre}</span>
        <span className="mt-1 flex items-start gap-1.5 text-sm text-neutro-600">
          <MapPin size={16} className="mt-0.5 shrink-0 text-neutro-400" aria-hidden="true" />
          <span className="break-words">{lugar || 'Sin dirección'}</span>
        </span>
        {c.otras_senas && <span className="mt-0.5 block truncate pl-[1.375rem] text-sm text-neutro-500">{c.otras_senas}</span>}
        <span className="mt-2 flex flex-wrap gap-1.5">
          {seQuita ? <Insignia tono="alerta">Se quita de la ruta</Insignia>
            : estado === 'esta' ? <Insignia tono="exito">En esta ruta{c.orden_ruta ? ` · visita ${c.orden_ruta}` : ''}</Insignia>
            : estado === 'otra' && marcado ? <Insignia tono="alerta">Pasa desde {c.ruta_nombre}</Insignia>
            : estado === 'otra' ? <Insignia tono="neutro">En {c.ruta_nombre}</Insignia>
            : marcado ? <Insignia tono="activo">Se agrega</Insignia>
            : null}
          {!c.activo && <Insignia tono="neutro">Inactivo</Insignia>}
        </span>
      </span>
      <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 ${queda ? 'border-primario-800 bg-primario-800 text-white' : 'border-neutro-300 bg-white text-transparent'}`}>
        <Check size={24} strokeWidth={3} />
      </span>
    </button>
  )
}

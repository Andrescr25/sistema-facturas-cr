import { useEffect, useMemo, useState } from 'react'
import { Search, X, Users, Check, UserPlus } from 'lucide-react'
import { filtrarClientes, normalizarTexto, CLIENTE_NUEVO } from '../../utils/catalogoAgentePersonalizacion'

/**
 * Elegir a quién se está visitando.
 *
 * ANTES ESTABA ESCONDIDO TRAS UN LONG-PRESS EN EL LOGO. La idea era que la
 * lista de clientes —con cuánto compra cada uno— no quedara a la vista de
 * cualquiera que abriera la dirección. Con el catálogo ya abierto sin sesión
 * (2026-09-04) esa protección dejó de proteger: quien quiera la lista la pide
 * al endpoint, que también quedó público.
 *
 * Lo que sí queda en pie es el otro riesgo, que es real: el cliente que está
 * parado al lado del agente no tiene por qué ver los nombres de los demás.
 * Por eso la lista vive en una hoja que se abre a propósito y se cierra al
 * elegir — no en la pantalla principal.
 *
 * "CLIENTE NUEVO" VA SIEMPRE ARRIBA (y aparece al buscarlo): no es alguien de
 * la lista sino el catálogo para salir a buscar clientes — oferta y lo que
 * más se vende. Tiene que estar aunque la tablet todavía no tenga clientes.
 */
export default function SelectorCliente({ isOpen, onClose, clientes, clienteActivoId, onSeleccionar }) {
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => { if (isOpen) setBusqueda('') }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const alTeclado = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', alTeclado)
    return () => document.removeEventListener('keydown', alTeclado)
  }, [isOpen, onClose])

  const clientesFiltrados = useMemo(() => {
    const ordenados = [...clientes].sort((a, b) => (a.n || '').localeCompare(b.n || ''))
    return filtrarClientes(ordenados, busqueda)
  }, [clientes, busqueda])

  const t = normalizarTexto(busqueda)
  const muestraNuevo = !t || normalizarTexto(CLIENTE_NUEVO.n).includes(t)
  const nuevoActivo = clienteActivoId === CLIENTE_NUEVO.id

  if (!isOpen) return null

  const elegir = (id) => { onSeleccionar(id); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}>
      <div className="absolute inset-0 bg-primario-950/50 backdrop-blur-sm" />

      <div onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutro-100 px-4 py-3">
          <h3 className="text-sm font-extrabold text-neutro-900">¿A quién estás visitando?</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutro-400 hover:bg-neutro-100">
            <X size={17} />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
            <input
              type="text" value={busqueda} autoFocus
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente…"
              aria-label="Buscar cliente"
              className="h-10 w-full rounded-xl bg-neutro-100 pl-9 pr-3 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-acento-400"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {muestraNuevo && (
            <button type="button" onClick={() => elegir(CLIENTE_NUEVO.id)}
              className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ring-1 transition-colors ${
                nuevoActivo ? 'bg-exito-50 ring-exito-200' : 'bg-acento-50 ring-acento-200 hover:bg-acento-100'
              }`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-acento-600">
                <UserPlus size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-extrabold text-neutro-900">{CLIENTE_NUEVO.n}</span>
                <span className="text-[11px] text-neutro-500">Ofertas y lo que más se vende</span>
              </span>
              {nuevoActivo && <Check size={16} className="shrink-0 text-exito-600" />}
            </button>
          )}
          {clientes.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Users size={30} className="mx-auto text-neutro-200" />
              <p className="mt-3 text-sm font-semibold text-neutro-700">No hay clientes en esta tablet.</p>
              <p className="mt-1 text-xs text-neutro-400">
                Con internet, tocá el botón de actualizar arriba a la derecha.
              </p>
            </div>
          ) : clientesFiltrados.length === 0 ? (
            !muestraNuevo && (
              <p className="px-4 py-10 text-center text-sm text-neutro-400">
                Nadie con ese nombre.
              </p>
            )
          ) : (
            <div className="space-y-1">
              {clientesFiltrados.map((c) => {
                const activo = c.id === clienteActivoId
                return (
                  <button key={c.id} type="button" onClick={() => elegir(c.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      activo ? 'bg-exito-50 ring-1 ring-exito-200' : 'hover:bg-neutro-100'
                    }`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-neutro-900">
                        {c.n || 'Cliente sin nombre'}
                      </span>
                      <span className="text-[11px] text-neutro-400">
                        {c.p?.length || 0} producto{(c.p?.length || 0) === 1 ? '' : 's'} que suele llevar
                      </span>
                    </span>
                    {activo && <Check size={16} className="shrink-0 text-exito-600" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

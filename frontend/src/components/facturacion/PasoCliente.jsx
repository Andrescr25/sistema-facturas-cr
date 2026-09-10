import { User, Search, X, ChevronRight } from 'lucide-react'

/**
 * Paso 1: a quién se le factura.
 *
 * Es la primera pantalla que ve quien va a facturar, así que el buscador
 * manda y nada más compite con él. Los resultados son filas de toque grande
 * —se usa de pie, en el mostrador— con el nombre completo sin recortar: dos
 * clientes del mismo comercio se distinguen justo por el final del nombre.
 */
export default function PasoCliente({
  cardRef,
  busquedaCliente,
  onBusquedaClienteChange,
  onFocusBusqueda,
  onLimpiarBusqueda,
  clientesEncontrados,
  totalClientesEncontrados = 0,
  onSeleccionarCliente
}) {
  const ocultos = Math.max(0, totalClientesEncontrados - clientesEncontrados.length)
  return (
    <div ref={cardRef} className="mx-auto w-full max-w-2xl">
      <div className="card rounded-2xl p-5 shadow-sm md:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primario-50 text-primario-600">
            <User size={24} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-neutro-900 md:text-xl">¿A quién se le factura?</h2>
            <p className="text-sm text-neutro-500">Buscá el cliente para empezar</p>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutro-400" size={20} />
          <input
            type="text"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            value={busquedaCliente}
            onChange={(e) => onBusquedaClienteChange(e.target.value)}
            onFocus={onFocusBusqueda}
            placeholder="Nombre o cédula del cliente…"
            /* 16px como mínimo: por debajo de eso, Safari en iPhone hace
               zoom al enfocar el campo y descuadra la pantalla. */
            className="input h-14 w-full rounded-xl border-2 border-neutro-300 pl-12 pr-12 text-base focus:border-primario-500"
            autoFocus
          />
          {busquedaCliente && (
            <button
              type="button"
              onClick={onLimpiarBusqueda}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutro-400 hover:bg-neutro-100 hover:text-neutro-700"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {clientesEncontrados.length > 0 && (
          <div className="mt-4 max-h-[60vh] divide-y divide-neutro-100 overflow-y-auto overscroll-contain rounded-xl border border-neutro-200 sm:max-h-[28rem]">
            {clientesEncontrados.map((cliente) => (
              <button
                key={cliente.id}
                onClick={() => onSeleccionarCliente(cliente)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-primario-50 active:bg-primario-100"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-snug text-neutro-900">{cliente.name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutro-500">
                    {cliente.identification && <span>Cédula {cliente.identification}</span>}
                    {cliente.email && <span className="truncate">{cliente.email}</span>}
                  </div>
                </div>
                <ChevronRight size={20} className="shrink-0 text-neutro-300" />
              </button>
            ))}
          </div>
        )}

        {clientesEncontrados.length > 0 && ocultos > 0 && (
          <p className="mt-2 px-1 text-xs text-neutro-500">
            Mostrando {clientesEncontrados.length} de {totalClientesEncontrados}. Escribí un poco más para acortar la lista.
          </p>
        )}

        {busquedaCliente && clientesEncontrados.length === 0 && (
          <p className="mt-4 rounded-xl bg-neutro-50 px-4 py-3 text-center text-sm text-neutro-500">
            Ningún cliente coincide con «{busquedaCliente}».
          </p>
        )}
      </div>
    </div>
  )
}

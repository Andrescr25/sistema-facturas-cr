import { Search, X, UserCheck, UserPlus, WifiOff } from 'lucide-react'
import BotonSincronizar from './BotonSincronizar'

/**
 * La barra de arriba del catálogo del agente.
 *
 * QUÉ SE GANÓ
 * Antes eran tres filas apiladas —logo grande, botón "Actualizar Catálogo"
 * centrado, estado de conexión, y recién después el buscador— que se comían
 * 330 de los 768 píxeles de alto de la tablet. Casi media pantalla antes de
 * ver un producto.
 *
 * Ahora es una sola fila fija: el buscador manda porque es lo que más se usa,
 * y sincronizar pasó a ser un botón de icono. Sincronizar se hace una vez al
 * día; buscar, cien veces.
 *
 * El cliente activo va acá y no en un banner aparte: saber a quién se le está
 * vendiendo tiene que estar siempre a la vista, no en algo que se scrollea.
 */
export default function BarraSuperior({
  busqueda, onBuscar,
  sincronizando, ultimaSync, enLinea, onSincronizar,
  clienteActivo, onElegirCliente, onSalirDeCliente
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-neutro-200 bg-white/95 backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-2">
        <img src="/tachi-logo.png" alt="Tachi Distribuidora"
          className="hidden h-7 w-auto shrink-0 sm:block" />

        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
          <input
            /* type="text", no "search": Chrome le agrega su propia X a los
               campos de búsqueda y quedaban dos, una al lado de la otra.
               inputMode deja el teclado del celular igual que antes. */
            type="text"
            inputMode="search"
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
            placeholder="Buscar por nombre o referencia…"
            aria-label="Buscar producto"
            className="h-10 w-full rounded-xl bg-neutro-100 pl-9 pr-9 text-sm font-semibold text-neutro-900 placeholder:font-normal placeholder:text-neutro-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-acento-400"
          />
          {busqueda && (
            <button type="button" onClick={() => onBuscar('')} aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-neutro-400 hover:bg-neutro-200">
              <X size={14} />
            </button>
          )}
        </div>

        {/* El cliente activo. El nombre se muestra SIEMPRE: antes se ocultaba
            en pantallas angostas y en la tablet quedaban solo el icono y la
            equis, así que no había forma de saber a quién se le estaba
            vendiendo. Si no cabe se corta, pero se ve. */}
        {clienteActivo ? (
          <div className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-exito-50 pl-2.5 pr-1 ring-1 ring-exito-200">
            <UserCheck size={15} className="shrink-0 text-exito-600" />
            <span className="max-w-[6rem] truncate text-xs font-bold text-exito-800 sm:max-w-[10rem] sm:text-sm">
              {clienteActivo.n || 'Cliente'}
            </span>
            <button type="button" onClick={onSalirDeCliente} aria-label="Dejar de atender a este cliente"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-exito-600 hover:bg-exito-100">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onElegirCliente} aria-label="Elegir cliente"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primario-800 px-3 text-xs font-bold text-white active:scale-95">
            <UserPlus size={15} />
            <span className="hidden sm:inline">Elegir cliente</span>
          </button>
        )}

        {/* Se mantiene apretado tres segundos: la sincronización tarda,
            ocupa la pantalla y no se puede cancelar a la mitad. En una tablet
            que se usa de pie, un roce del pulgar la arrancaba sin querer. */}
        <BotonSincronizar
          sincronizando={sincronizando}
          ultimaSync={ultimaSync}
          onSincronizar={onSincronizar}
        />
      </div>

      {/* Sin señal se avisa una vez, en una línea, y no se repite en cada
          pantalla: el catálogo sigue sirviendo igual con lo descargado. */}
      {!enLinea && (
        <div className="flex items-center justify-center gap-1.5 bg-alerta-50 px-3 py-1 text-[11px] font-bold text-alerta-800">
          <WifiOff size={12} />
          Sin señal — se está usando el catálogo guardado en la tablet
        </div>
      )}
    </header>
  )
}

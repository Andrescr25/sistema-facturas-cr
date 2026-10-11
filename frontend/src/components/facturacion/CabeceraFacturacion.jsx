import { FileText, Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react'

/**
 * La cabecera de Facturación.
 *
 * QUÉ SE ARREGLÓ
 * La versión anterior recibía `isMobile` y devolvía dos árboles distintos:
 * uno con el título grande y el estado de conexión en texto, otro con el
 * título chico y un emoji de semáforo. Como `isMobile` arranca en `false`,
 * el teléfono pintaba primero la variante de escritorio y saltaba a la otra
 * al montar — el parpadeo que se veía al entrar.
 *
 * Ahora es un solo árbol y las diferencias las hace CSS, así que no hay
 * salto y el tamaño intermedio (tableta) deja de quedar en tierra de nadie.
 *
 * Se queda pegada arriba en cualquier ancho: en el mostrador se factura con
 * la lista larga y el estado de conexión es justo lo que hay que poder mirar
 * sin volver al inicio de la página.
 */
export default function CabeceraFacturacion({
  isOnline, facturasPendientesCount, syncingCache, onActualizarCache, onVerPendientes
}) {
  return (
    /* top-16 y no top-0: en pantalla angosta el sistema ya tiene su propia
       barra pegada de 64px de alto, y con top-0 esta cabecera quedaba
       escondida detrás de ella. De `lg` para arriba esa barra no existe
       —el menú es la columna lateral— así que vuelve a pegarse arriba. */
    <header className="sticky top-16 z-30 -mx-4 mb-4 border-b border-neutro-200 bg-white/95 px-4 py-3 backdrop-blur lg:top-0 md:mb-6">
      <div className="flex items-center gap-3">
        <FileText className="hidden shrink-0 text-primario-600 sm:block" size={28} />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-neutro-900 md:text-2xl">Facturación</h1>
          <p className="hidden text-sm text-neutro-500 md:block">Funciona sin internet; lo pendiente se sincroniza solo.</p>
        </div>

        {/* Estado de conexión. En pantalla angosta queda el punto y la
            palabra desaparece: el color ya dice lo mismo y el espacio hace
            falta para el botón. */}
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold sm:px-3 ${
            isOnline ? 'bg-exito-100 text-exito-800' : 'bg-alerta-100 text-alerta-800'
          }`}
          title={isOnline ? 'Con conexión' : 'Sin conexión — se guarda local'}
        >
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="hidden sm:inline">{isOnline ? 'En línea' : 'Sin conexión'}</span>
        </span>

        {facturasPendientesCount > 0 && (
          /* Es un botón: el número solo decía que había algo esperando,
             sin llevar a verlo. */
          <button
            type="button"
            onClick={onVerPendientes}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-alerta-100 px-2 py-1.5 text-xs font-bold text-alerta-800 hover:bg-alerta-200"
            title={`${facturasPendientesCount} factura(s) esperando subir: tocá para verlas`}
            aria-label={`${facturasPendientesCount} factura(s) esperando subir: ver`}
          >
            <AlertCircle size={14} />
            {facturasPendientesCount}
          </button>
        )}

        <button
          onClick={onActualizarCache}
          disabled={!isOnline || syncingCache}
          className="btn btn-outline btn-sm flex shrink-0 items-center gap-1.5 disabled:opacity-50"
          title="Actualizar catálogo de productos y clientes"
        >
          <RefreshCw size={14} className={syncingCache ? 'animate-spin' : ''} />
          <span className="hidden md:inline">{syncingCache ? 'Actualizando…' : 'Actualizar'}</span>
        </button>
      </div>
    </header>
  )
}

import { X } from 'lucide-react'
import { useModal } from '../../hooks/useModal'

/**
 * El caparazón de los modales de pago, compartido por cobrar y por pagar.
 *
 * De dónde sale: es el modal de Cuentas por Cobrar, que es el que se quiso
 * para los dos. Sube desde abajo como hoja en pantalla angosta y es un
 * diálogo centrado en grande — no por gusto, sino porque estos modales se
 * abren de pie en el mostrador tanto como sentado en la oficina.
 *
 * `ancho` deja que cada uno pida lo que necesita: cobrar es un formulario
 * corto y se ve mejor angosto; pagar trae la tabla de productos y necesita
 * lugar.
 */
export default function HojaModal({
  titulo, subtitulo, ancho = 'sm:max-w-md', onCerrar, children
}) {
  useModal(onCerrar)

  return (
    <div role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined} className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl ${ancho}`}>
        {/* Agarradera: solo tiene sentido en la hoja que sube. */}
        <div className="pb-1 pt-3 sm:hidden">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-neutro-300" />
        </div>

        <div className="flex items-center justify-between border-b border-neutro-100 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            {subtitulo && <p className="text-[13px] font-medium text-neutro-400">{subtitulo}</p>}
            <h3 className="truncate text-lg font-bold text-neutro-900">{titulo}</h3>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="ml-3 shrink-0 rounded-xl p-2.5 text-neutro-400 transition-colors hover:bg-neutro-100 hover:text-neutro-600"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  )
}

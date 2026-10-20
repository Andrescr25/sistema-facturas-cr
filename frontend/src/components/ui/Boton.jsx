import { Loader2 } from 'lucide-react'

/**
 * El botón del sistema.
 *
 * POR QUÉ EXISTE
 * Había seis combinaciones distintas para el MISMO papel de "acción
 * principal" —bg-emerald-600, bg-blue-600, bg-slate-900, bg-green-600,
 * bg-indigo-600...— según el módulo. Con la paleta ya unificada quedaba
 * pendiente lo otro: la altura, el redondeo y el grosor de letra también
 * cambiaban de pantalla en pantalla.
 *
 * Acá el que escribe elige QUÉ HACE el botón, no cómo se pinta:
 *
 *   primario     la acción de la pantalla. Uno por pantalla, idealmente.
 *   secundario   alternativa clara, sin competir con el primario.
 *   peligro      borra, anula, revoca. Algo que cuesta deshacer.
 *   fantasma     terciario: cancelar, cerrar, volver.
 *
 * Y con color suave, por significado, los mismos tonos de ui/Insignia: para
 * una barra donde cada botón hace algo distinto y conviene reconocerlo de un
 * vistazo (la factura abierta, pedido del usuario el 2026-10-19: «ponle
 * color a estos btn»).
 *
 *   activo       azul: abrir, consultar, mandar por correo.
 *   exito        verde: mandar al cliente por WhatsApp.
 *   alerta       ámbar: corregir algo ya hecho (editar).
 *   nota         morado: notas de crédito y rectificaciones.
 *   acento       naranja de la marca: el documento impreso (PDF).
 *
 * `cargando` bloquea el botón y muestra la rueda. Se hace acá porque el
 * doble clic en "Guardar" —que en este sistema puede significar dos facturas
 * en Alegra— es demasiado fácil de olvidar en cada pantalla.
 */

/** Lo común de las variantes con color suave: borde fino del mismo tono y apagado igual que el resto. */
const SUAVE = 'ring-1 ring-inset disabled:bg-neutro-50 disabled:text-neutro-300 disabled:ring-neutro-100'

const VARIANTES = {
  primario: 'bg-primario-800 text-white hover:bg-primario-900 disabled:bg-neutro-200 disabled:text-neutro-400',
  secundario: 'bg-neutro-100 text-neutro-800 hover:bg-neutro-200 disabled:bg-neutro-50 disabled:text-neutro-300',
  peligro: 'bg-peligro-600 text-white hover:bg-peligro-700 disabled:bg-neutro-200 disabled:text-neutro-400',
  fantasma: 'bg-transparent text-neutro-500 hover:bg-neutro-100 hover:text-neutro-900 disabled:text-neutro-300',
  cliente: 'bg-cliente-600 text-white hover:bg-cliente-700 disabled:bg-neutro-200 disabled:text-neutro-400',
  activo: `bg-primario-50 text-primario-700 ring-primario-200 hover:bg-primario-100 ${SUAVE}`,
  exito: `bg-exito-50 text-exito-700 ring-exito-200 hover:bg-exito-100 ${SUAVE}`,
  alerta: `bg-alerta-50 text-alerta-800 ring-alerta-200 hover:bg-alerta-100 ${SUAVE}`,
  nota: `bg-nota-50 text-nota-700 ring-nota-200 hover:bg-nota-100 ${SUAVE}`,
  acento: `bg-acento-50 text-acento-700 ring-acento-200 hover:bg-acento-100 ${SUAVE}`,
}

const TAMANOS = {
  sm: 'h-8 px-3 text-xs gap-1',
  md: 'h-10 px-4 text-sm gap-1.5',
  lg: 'h-12 px-5 text-[15px] gap-2',
}

export default function Boton({
  variante = 'primario',
  tamano = 'md',
  cargando = false,
  icono: Icono,
  ancho = false,
  children,
  className = '',
  disabled,
  ...resto
}) {
  return (
    <button
      type="button"
      disabled={disabled || cargando}
      className={`inline-flex items-center justify-center rounded-xl font-bold transition-colors disabled:cursor-not-allowed ${
        VARIANTES[variante] || VARIANTES.primario
      } ${TAMANOS[tamano] || TAMANOS.md} ${ancho ? 'w-full' : ''} ${className}`}
      {...resto}
    >
      {cargando
        ? <Loader2 size={tamano === 'sm' ? 13 : 16} className="animate-spin" />
        : Icono && <Icono size={tamano === 'sm' ? 13 : 16} />}
      {children}
    </button>
  )
}

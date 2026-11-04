import { Package } from 'lucide-react'
import { urlArchivo } from '../../utils/urlArchivo'
import { esMarcaExtensa } from '../../utils/marcasCatalogo'

/** La lista nunca determina el alto de la foto. En marcas largas, foto y
 * título forman una cabecera; las presentaciones usan todo el ancho debajo. */
export default function PortadaMarca({ marca, cantidad, children, className = '' }) {
  const foto = urlArchivo(marca.imagen?.url)
  const ancho = marca.imagen?.ancho || 2
  const alto = marca.imagen?.alto || 3
  const extensa = esMarcaExtensa(cantidad)
  const portada = foto ? (
    <div className={`min-w-0 self-start overflow-hidden bg-neutro-50 ${extensa ? 'w-[var(--ancho-portada)] max-w-[40%] shrink-0 sm:w-[var(--ancho-portada-sm)]' : 'w-full'}`}
      style={extensa ? { '--ancho-portada': `${ancho / alto * 14}rem`, '--ancho-portada-sm': `${ancho / alto * 18}rem` } : undefined}>
      <img src={foto} alt={marca.nombre} width={ancho} height={alto} loading="lazy" decoding="async"
        className="block h-auto w-full" />
    </div>
  ) : (
    <div className={`flex min-h-[8rem] flex-col items-center justify-center gap-2 bg-gradient-to-br from-primario-700 to-primario-950 px-4 py-6 text-center ${extensa ? 'w-[35%] shrink-0' : 'sm:min-h-[12rem]'}`}>
      <Package size={28} className="text-white/40" aria-hidden="true" />
      <p className="max-w-full break-words text-xl font-extrabold leading-tight tracking-tight text-white">{marca.nombre}</p>
    </div>
  )
  const titulo = (
    <header className={`min-w-0 px-4 pb-3 pt-4 sm:px-5 sm:pt-5 ${extensa ? 'flex-1 self-center pb-4 sm:pb-5' : ''}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-primario-600">Marca</p>
      <h3 className="break-words text-lg font-bold leading-snug tracking-tight text-neutro-900 sm:text-xl">{marca.nombre}</h3>
      <p className="mt-0.5 text-xs text-neutro-500">{cantidad} {cantidad === 1 ? 'presentación' : 'presentaciones'} · precios con IVA</p>
    </header>
  )
  const presentaciones = <>
    {children}
    <p className="mt-auto border-t border-neutro-100 px-4 py-3 text-[11px] font-medium text-neutro-500 sm:px-5">Tocá una presentación para ver su foto · IVA incluido</p>
  </>
  return (
    <article className={`grid min-w-0 self-start overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutro-200 ${extensa ? '' : 'sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'} ${className}`}>
      {extensa ? <>
        <div className="flex min-w-0 items-start">{portada}{titulo}</div>
        <div className="flex min-w-0 flex-col">{presentaciones}</div>
      </> : <>
        {portada}
        <div className="flex min-w-0 flex-col">{titulo}{presentaciones}</div>
      </>}
    </article>
  )
}

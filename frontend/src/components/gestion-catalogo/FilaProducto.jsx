import { Camera, Copy, Pencil } from 'lucide-react'
import Insignia from '../ui/Insignia'
import VistaPreviaImagen from './VistaPreviaImagen'
import { formatCRC } from '../../utils/gestionCatalogoUtils'
import { unidades } from '../../utils/rentabilidadFormato'

function Dato({ etiqueta, children, pie }) {
  return (
    <div className="min-w-[5.5rem] text-left lg:text-right">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutro-400">{etiqueta}</p>
      <div className="text-base font-bold text-neutro-900">{children}</div>
      {pie && <p className="text-xs text-neutro-400">{pie}</p>}
    </div>
  )
}

function TonoMargen({ margen }) {
  if (margen === null || margen === undefined) return <span className="text-neutro-300">—</span>
  const tono = margen < 0 ? 'peligro' : margen < 10 ? 'alerta' : 'exito'
  return <Insignia tono={tono}>{margen.toFixed(0)}%</Insignia>
}

function Accion({ icono: Icono, texto, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={texto}
      className="inline-flex items-center gap-1.5 rounded-lg border border-neutro-200 bg-white px-3 py-2 text-sm font-semibold text-neutro-600 transition-colors hover:border-primario-300 hover:bg-primario-50 hover:text-primario-700"
    >
      <Icono size={17} />
      <span className="md:inline lg:hidden xl:inline">{texto}</span>
    </button>
  )
}

/**
 * Un producto: foto (con vista grande al pasar el mouse), nombre, lo que
 * cuesta y cuánto deja, cuánto se mueve, y las tres acciones siempre a la
 * vista — no escondidas tras un hover, que en la tablet del mostrador no
 * existe.
 */
export default function FilaProducto({
  producto,
  seleccionado,
  onAlternarSeleccion,
  mostrarCategoria = false,
  onEditar,
  onSugerirFoto,
  onDuplicar
}) {
  const p = producto
  const detalle = [p.reference ? `Ref. ${p.reference}` : 'Sin referencia', p.proveedor?.nombre].filter(Boolean).join(' · ')

  return (
    // En fila recién desde lg: en una tablet (768–1023) los números y los
    // botones se comían el nombre del producto.
    <div className={`flex flex-col gap-4 px-5 py-4 transition-colors lg:flex-row lg:items-center ${
      seleccionado ? 'bg-primario-50/70' : 'hover:bg-neutro-50'
    }`}>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <input
          type="checkbox"
          checked={seleccionado}
          onChange={(e) => onAlternarSeleccion(p.id, e.nativeEvent)}
          className="h-5 w-5 shrink-0 cursor-pointer rounded border-neutro-300 text-primario-600 focus:ring-primario-500"
        />
        <VistaPreviaImagen src={p.imageUrl} nombre={p.name} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-neutro-900" title={p.name}>{p.name}</p>
          <p className="truncate text-sm text-neutro-500" title={detalle}>{detalle}</p>
          {mostrarCategoria && (
            <p className="truncate text-xs font-semibold text-primario-600">
              {p.category || 'Sin categoría'}{p.subcategoria ? ` · ${p.subcategoria.nombre}` : ' · Sin clasificar'}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pl-9 lg:flex-nowrap lg:pl-0">
        <Dato etiqueta="Precio" pie={`costo ${formatCRC(p.cost)}`}>
          {p.precioConIva != null ? formatCRC(p.precioConIva) : '—'}
        </Dato>
        <Dato etiqueta="Margen"><TonoMargen margen={p.margenReal} /></Dato>
        <Dato etiqueta="Rotación" pie="Últimos 30 días">
          {p.unidadesMes != null ? <>{unidades(p.unidadesMes)}<span className="text-xs font-semibold text-neutro-400">/mes</span></> : '—'}
        </Dato>
        <div className="flex items-center gap-2">
          <Accion icono={Camera} texto="Foto" onClick={() => onSugerirFoto(p)} />
          <Accion icono={Copy} texto="Marca" onClick={() => onDuplicar(p)} />
          <Accion icono={Pencil} texto="Editar" onClick={() => onEditar(p)} />
        </div>
      </div>
    </div>
  )
}

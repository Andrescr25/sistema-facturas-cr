import { Camera, Copy, Pencil } from 'lucide-react'
import Insignia from '../ui/Insignia'
import VistaPreviaImagen from './VistaPreviaImagen'
import { formatCRC } from '../../utils/gestionCatalogoUtils'
import { unidades, pieRotacion } from '../../utils/rentabilidadFormato'
import { formatCantidad } from '../../utils/inventarioAuditoriaUtils'

function Dato({ etiqueta, children, pie }) {
  return (
    <div className="min-w-[5.5rem] text-left xl:text-right">
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

/**
 * Cuántas hay: la existencia del kardex (`inventario_saldo`), la misma cifra
 * de Inventario → Existencias. Negativa en rojo (salió más de lo que entró).
 * Con `onVerMovimientos`, tocarla abre de dónde sale.
 */
function Cantidad({ producto, onVerMovimientos }) {
  if (producto.existencia == null) return <span className="text-neutro-300" title="No lleva inventario">—</span>
  const texto = formatCantidad(producto.existencia)
  const tono = producto.existencia < 0 ? 'text-peligro-700' : 'text-neutro-900'
  if (!onVerMovimientos) return <span className={tono}>{texto}</span>
  return (
    <button type="button" onClick={() => onVerMovimientos(producto)} title="Ver de dónde sale esta cantidad"
      className={`${tono} underline decoration-neutro-300 decoration-dotted underline-offset-4 hover:decoration-primario-500`}>
      {texto}
    </button>
  )
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
      <span className="md:inline xl:hidden 2xl:inline">{texto}</span>
    </button>
  )
}

/**
 * Un producto: foto (con vista grande al pasar el mouse), nombre, lo que
 * cuesta y cuánto deja, cuántas hay, cuánto se mueve, y las tres acciones siempre a la
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
  onDuplicar,
  onVerMovimientos
}) {
  const p = producto
  const detalle = [p.reference ? `Ref. ${p.reference}` : 'Sin referencia', p.proveedor?.nombre].filter(Boolean).join(' · ')

  return (
    // En fila recién desde xl, y con las acciones solo en ícono hasta 2xl: más
    // angosto, los números y los botones se comían el nombre del producto
    // (los del proveedor son largos y no cabían ni en 2 renglones).
    <div className={`flex flex-col gap-4 px-5 py-4 transition-colors xl:flex-row xl:items-center ${
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
          {/* Los nombres del proveedor son largos («ANZUELO P/PESCA NO.10 MUSTAD 2330DT CAJA 100 PZAS») y
              lo que los distingue suele ir al medio: letra un poco más chica y, si no cabe, 2 renglones
              (3 en el teléfono, donde en 2 no cabe). */}
          <p className="line-clamp-3 text-sm font-semibold leading-snug text-neutro-900 sm:line-clamp-2" title={p.name}>{p.name}</p>
          <p className="truncate text-sm text-neutro-500" title={detalle}>{detalle}</p>
          {mostrarCategoria && (
            <p className="truncate text-xs font-semibold text-primario-600">
              {p.category || 'Sin categoría'}{p.subcategoria ? ` · ${p.subcategoria.nombre}` : ' · Sin clasificar'}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pl-9 xl:flex-nowrap xl:pl-0">
        <Dato etiqueta="Precio" pie={`costo ${formatCRC(p.cost)}`}>
          {p.precioConIva != null ? formatCRC(p.precioConIva) : '—'}
        </Dato>
        <Dato etiqueta="Margen"><TonoMargen margen={p.margenReal} /></Dato>
        <Dato etiqueta="Cantidad"><Cantidad producto={p} onVerMovimientos={onVerMovimientos} /></Dato>
        <Dato etiqueta="Rotación" pie={pieRotacion(p.diasRotacion)}>
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

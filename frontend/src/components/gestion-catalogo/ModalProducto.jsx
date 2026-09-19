import { useEffect, useMemo, useState } from 'react'
import { Loader2, Package, Plus, Tag, Trash2, Truck } from 'lucide-react'
import HojaModal from '../pagos/HojaModal'
import Pestanas from '../ui/Pestanas'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import api from '../../services/api'
import { formatCRC } from '../../utils/gestionCatalogoUtils'

/**
 * La ficha de un producto: acá se gestiona todo lo suyo.
 *
 * ANTES ERAN DOS PANTALLAS. Para cambiarle el precio a algo se entraba por
 * Gestión de Catálogo; para ver a cuánto lo vende cada proveedor había que
 * irse a Gestionar Relaciones y buscarlo de nuevo por nombre. Las dos
 * preguntas se hacen en el mismo momento —"¿a cómo lo pongo?" no se contesta
 * sin "¿a cómo me cuesta?"—, así que ahora viven en la misma ficha.
 *
 * DOS PESTAÑAS Y NO UNA SOLA COLUMNA. Los proveedores se piden al servidor
 * aparte; ponerlos arriba haría esperar a quien solo viene a corregir un
 * nombre, que es la mayoría de las veces. Se cargan al abrir, en segundo
 * plano, y el número sale en la pestaña para no tener que entrar a mirar si
 * hay algo.
 *
 * LAS DOS CIFRAS NO ESTÁN EN LA MISMA BASE, y la pantalla lo dice: el precio
 * se escribe SIN IVA y el costo CON IVA. De ₡5.625 contra ₡4.764,64 se leía
 * un margen del 15% cuando el real es 25%. El margen se calcula como en
 * Revisión de Precios: los dos lados sin IVA.
 *
 * LA SUBCATEGORÍA NO VA A ALEGRA: es nuestra, se guarda aparte y por eso se
 * aplica al elegirla y no al guardar. Si esperara al botón, cambiarla
 * obligaría a mandarle también el nombre y el precio a Alegra sin necesidad.
 */

const CAMPO = 'w-full rounded-xl border border-neutro-200 bg-neutro-50 px-3 py-2.5 text-sm text-neutro-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primario-500'

function Etiqueta({ children, nota }) {
  return (
    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-500">
      {children}
      {nota && <span className="ml-1 font-semibold normal-case tracking-normal text-neutro-400">{nota}</span>}
    </label>
  )
}

/** Margen sobre el precio, con los dos lados sin IVA. */
function margenDe(precioSinIva, costoConIva, iva) {
  const p = Number(precioSinIva)
  const c = Number(costoConIva)
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(c) || c <= 0 || iva === null) return null
  const costoSinIva = c / (1 + iva / 100)
  return ((p - costoSinIva) / p) * 100
}

function TonoMargen({ margen }) {
  if (margen === null) return <span className="text-neutro-400">—</span>
  const tono = margen < 0 ? 'peligro' : margen < 10 ? 'alerta' : 'exito'
  return <Insignia tono={tono}>{margen.toFixed(1)}%</Insignia>
}

/** Quién me lo vende y a cuánto. Ordenado del más barato al más caro. */
function Proveedores({ relaciones, cargando, error, precioSinIva, iva }) {
  if (cargando) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-neutro-400">
        <Loader2 size={16} className="animate-spin" /> Buscando proveedores…
      </p>
    )
  }
  if (error) {
    return <p className="py-10 text-center text-sm font-semibold text-peligro-600">{error}</p>
  }
  if (relaciones.length === 0) {
    return (
      <div className="py-10 text-center">
        <Truck size={28} className="mx-auto mb-2 text-neutro-300" />
        <p className="text-sm font-bold text-neutro-600">Ningún proveedor relacionado</p>
        <p className="mt-1 text-xs text-neutro-400">
          Las relaciones se crean al revisar una factura de compra.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-neutro-500">
        {relaciones.length === 1 ? 'Un proveedor' : `${relaciones.length} proveedores`}, del más barato al más caro.
        El costo es por <strong>una unidad mía</strong>, con descuento e IVA.
      </p>

      {relaciones.map((r, i) => {
        const margen = margenDe(precioSinIva, r.precio, iva)
        return (
          <div
            key={r.mapeoId}
            className={`rounded-xl border p-3 ${i === 0 ? 'border-exito-200 bg-exito-50/40' : 'border-neutro-200 bg-white'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-neutro-900">{r.proveedor?.nombre || 'Sin nombre'}</p>
                {r.descripcionProveedor && (
                  <p className="truncate text-xs text-neutro-500" title={r.descripcionProveedor}>
                    {r.descripcionProveedor}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-neutro-900">
                  {r.precio != null ? formatCRC(r.precio) : '—'}
                </p>
                {i === 0 && relaciones.length > 1 && (
                  <span className="text-[10px] font-bold uppercase text-exito-700">Más barato</span>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutro-500">
              {r.codigoProveedor && <span className="font-mono">Cód. {r.codigoProveedor}</span>}
              {/* Solo cuando el proveedor NO factura en mi unidad: si el factor
                  es 1 el dato no agrega nada y ensucia la línea. */}
              {r.factorConversion !== 1 && (
                <span>
                  factor {r.factorConversion} · su unidad {r.precioProveedor != null ? formatCRC(r.precioProveedor) : '—'}
                </span>
              )}
              {r.vecesUsado > 0 && <span>comprado {r.vecesUsado}×</span>}
              <span className="ml-auto flex items-center gap-1">
                margen <TonoMargen margen={margen} />
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ModalProducto({
  editName, setEditName,
  editRef, setEditRef,
  editPrice, setEditPrice,
  editCost, setEditCost,
  editCategoria, setEditCategoria,
  categorias,
  producto,
  subcategorias = [],
  onCrearSubcategoria,
  onAsignarSubcategoria,
  taxPercentage,
  savingEdit,
  confirmDelete,
  deletingProduct,
  onSubmit,
  onEliminar,
  onCerrar
}) {
  const [pestana, setPestana] = useState('datos')

  // Los proveedores se piden acá y no en la página: es la ficha la que
  // necesita saberlos, y bajarlos desde arriba obligaría a pasar tres props
  // más por una pantalla que ya pasa veinte.
  const [relaciones, setRelaciones] = useState([])
  const [cargandoRel, setCargandoRel] = useState(true)
  const [errorRel, setErrorRel] = useState(null)

  const alegraId = producto?.alegraId

  useEffect(() => {
    if (!alegraId) return
    let vigente = true
    setCargandoRel(true); setErrorRel(null)
    api.get(`/productos-revision/producto/${alegraId}/relaciones`)
      .then(({ data }) => {
        if (!vigente) return
        setRelaciones(data?.relaciones || [])
      })
      .catch(() => {
        if (!vigente) return
        // Que no se puedan ver los proveedores no impide corregir un precio.
        setErrorRel('No se pudieron cargar los proveedores.')
      })
      .finally(() => { if (vigente) setCargandoRel(false) })
    return () => { vigente = false }
  }, [alegraId])

  // null/undefined es "todavía no se sincronizó el impuesto de este
  // producto", que no es lo mismo que exento: ahí no se muestra un número
  // inventado.
  const iva = taxPercentage === null || taxPercentage === undefined ? null : Number(taxPercentage)
  const precioNum = parseFloat(editPrice)
  const precioConIva = iva !== null && Number.isFinite(precioNum)
    ? Math.round(precioNum * (1 + iva / 100) * 100) / 100
    : null
  const margen = useMemo(() => margenDe(editPrice, editCost, iva), [editPrice, editCost, iva])

  const categoriaDelProducto = producto?.category || ''
  const suyas = subcategorias.filter(s => s.categoria === categoriaDelProducto && s.activo)

  const [nueva, setNueva] = useState('')
  const [creando, setCreando] = useState(false)
  const [errorSub, setErrorSub] = useState(null)

  const crearSub = async () => {
    const nombre = nueva.trim()
    if (!nombre) return
    setCreando(true); setErrorSub(null)
    try {
      const s = await onCrearSubcategoria(categoriaDelProducto, nombre)
      await onAsignarSubcategoria(alegraId, s.id)
      setNueva('')
    } catch (e) {
      setErrorSub(e?.response?.data?.message || 'No se pudo crear.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <HojaModal
      titulo={producto?.name || 'Producto'}
      subtitulo={producto?.reference ? `Ref. ${producto.reference}` : 'Sin referencia'}
      ancho="sm:max-w-2xl"
      onCerrar={onCerrar}
    >
      {/* Lo que identifica al producto, de un vistazo y sin entrar a nada. */}
      <div className="flex flex-wrap items-center gap-2">
        {producto?.category && <Insignia tono="activo" icono={Tag}>{producto.category}</Insignia>}
        {producto?.subcategoria && <Insignia tono="neutro">{producto.subcategoria.nombre}</Insignia>}
        <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-neutro-500">
          Margen <TonoMargen margen={margen} />
        </span>
      </div>

      <Pestanas
        activa={pestana}
        onCambiar={setPestana}
        pestanas={[
          { clave: 'datos', texto: 'Datos', icono: Package },
          {
            clave: 'proveedores',
            texto: 'Proveedores',
            icono: Truck,
            // El número va en la pestaña para no tener que entrar a ver si hay
            // algo: la respuesta "ninguno" también sirve.
            contador: cargandoRel ? 0 : relaciones.length
          }
        ]}
      />

      {pestana === 'datos' ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Etiqueta>Nombre</Etiqueta>
            <input
              type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              required placeholder="Ej: Coca Cola Sabor Original 350ml" className={CAMPO}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Etiqueta nota="código de barras o interno">Referencia</Etiqueta>
              <input
                type="text" value={editRef} onChange={(e) => setEditRef(e.target.value)}
                required placeholder="Ej: 744100123456" className={CAMPO}
              />
            </div>
            <div>
              <Etiqueta>Categoría</Etiqueta>
              <select value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)} className={CAMPO}>
                <option value="">Sin cambios</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {categoriaDelProducto && onAsignarSubcategoria && (
            <div>
              <Etiqueta nota={`dentro de ${categoriaDelProducto}`}>Subcategoría</Etiqueta>
              <select
                value={producto?.subcategoria?.id ? String(producto.subcategoria.id) : ''}
                onChange={(e) => onAsignarSubcategoria(alegraId, e.target.value || null)}
                className={CAMPO}
              >
                <option value="">Sin clasificar</option>
                {suyas.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
              </select>

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text" value={nueva} onChange={(e) => setNueva(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearSub() } }}
                  placeholder={`Nueva subcategoría en ${categoriaDelProducto}`} maxLength={80}
                  className="flex-1 rounded-xl border border-neutro-200 bg-white px-3 py-2 text-xs text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500"
                />
                <Boton
                  tamano="sm" variante="secundario" icono={Plus}
                  onClick={crearSub} cargando={creando} disabled={!nueva.trim()}
                >
                  Crear
                </Boton>
              </div>
              {errorSub && <p className="mt-1 text-xs font-semibold text-peligro-600">{errorSub}</p>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Etiqueta nota="sin IVA">Precio de venta</Etiqueta>
              <input
                type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                required className={CAMPO}
              />
              <p className="mt-1 text-[11px] text-neutro-500">
                {precioConIva !== null
                  ? <>Con IVA ({iva}%): <span className="font-bold text-neutro-800">{formatCRC(precioConIva)}</span></>
                  : 'Sin dato de impuesto todavía: sincronizá el catálogo.'}
              </p>
            </div>
            <div>
              <Etiqueta nota="con IVA">Costo unitario</Etiqueta>
              <input
                type="number" step="0.01" value={editCost} onChange={(e) => setEditCost(e.target.value)}
                className={CAMPO}
              />
              <p className="mt-1 text-[11px] text-neutro-500">
                {relaciones.length > 0 && relaciones[0].precio != null
                  ? <>Más barato hoy: <span className="font-bold text-neutro-800">{formatCRC(relaciones[0].precio)}</span></>
                  : ' '}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-neutro-100 pt-4">
            {/* Sin confirmar es "fantasma" y confirmando es "peligro": el
                botón se pone rojo entero recién cuando el siguiente clic
                borra de verdad. Mezclar las dos variantes con `className` no
                serviría —en Tailwind gana el orden del CSS, no el del
                atributo— y el botón quedaría rojo desde el principio. */}
            <Boton
              variante={confirmDelete ? 'peligro' : 'fantasma'} tamano="sm" icono={Trash2}
              onClick={onEliminar} cargando={deletingProduct} disabled={savingEdit}
            >
              {confirmDelete ? '¿Confirmar?' : 'Eliminar'}
            </Boton>

            <div className="flex gap-2">
              <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
              <Boton type="submit" cargando={savingEdit}>Guardar cambios</Boton>
            </div>
          </div>
        </form>
      ) : (
        <Proveedores
          relaciones={relaciones}
          cargando={cargandoRel}
          error={errorRel}
          precioSinIva={editPrice}
          iva={iva}
        />
      )}
    </HojaModal>
  )
}

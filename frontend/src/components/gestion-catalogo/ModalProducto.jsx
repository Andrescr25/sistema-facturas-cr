import { useMemo, useState } from 'react'
import { AlertTriangle, EyeOff, Eye, Power, Save, FileText, Truck } from 'lucide-react'
import HojaModal from '../pagos/HojaModal'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import Pestanas from '../ui/Pestanas'
import ProveedoresProducto from './ProveedoresProducto'
import { useProveedoresProducto } from '../../hooks/useProveedoresProducto'

/**
 * Crear o editar un producto con TODOS sus datos.
 *
 * Antes solo se podían cambiar nombre, referencia, precio, costo y
 * categoría; el CABYS, el impuesto, la unidad y los datos de medicamento
 * había que ir a cambiarlos a Alegra.
 *
 * Los dos números no están en la misma base y la pantalla lo dice: el precio
 * se escribe SIN IVA y el costo CON IVA. El margen se calcula igual que en
 * Revisión de Precios (precio sin IVA contra costo sin IVA).
 *
 * No hay "Eliminar": un producto se desactiva (sale de la venta) o se oculta
 * (sale de los catálogos que ven los clientes). Las facturas viejas lo
 * siguen mostrando.
 *
 * Al editar se manda solo lo que cambió. Si el servidor rechaza, la hoja
 * queda abierta con lo tipeado.
 */

const CAMPOS = [
  'nombre', 'referencia', 'descripcion', 'categoria_id', 'unidad', 'impuesto_id', 'cabys',
  'precio_sin_iva', 'costo_con_iva', 'inventariable', 'es_medicamento', 'forma_farmaceutica', 'registro_sanitario'
]
const NUMERICOS = new Set(['categoria_id', 'impuesto_id', 'precio_sin_iva', 'costo_con_iva'])
const BOOLEANOS = new Set(['inventariable', 'es_medicamento'])
const CLASE_CAMPO = 'input h-11 w-full rounded-xl border border-neutro-300'
const colones = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 2 })

function valoresDe(p) {
  return Object.fromEntries(CAMPOS.map(c => {
    const v = p?.[c]
    if (BOOLEANOS.has(c)) return [c, c === 'inventariable' ? v !== false : Boolean(v)]
    return [c, v === null || v === undefined ? '' : String(v)]
  }))
}

function listo(campo, v) {
  if (BOOLEANOS.has(campo)) return Boolean(v)
  if (NUMERICOS.has(campo)) return v === '' ? null : Number(v)
  return String(v).trim() === '' ? null : String(v).trim()
}

function Etiqueta({ htmlFor, children, requerido }) {
  return (
    <label htmlFor={htmlFor} className="label mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-500">
      {children}{requerido && ' *'}
    </label>
  )
}

function Aviso({ children }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-alerta-700">
      <AlertTriangle size={12} className="shrink-0" />{children}
    </p>
  )
}

export default function ModalProducto({
  producto, plantilla, categorias, impuestos, guardando,
  onGuardar, onCambiarEstado, onCerrar
}) {
  const editando = Boolean(producto)
  const [pestana, setPestana] = useState('datos')
  const proveedores = useProveedoresProducto(producto?.id, pestana === 'proveedores')
  const base = useMemo(() => valoresDe(producto || plantilla), [producto, plantilla])
  const [valores, setValores] = useState(base)
  const cambiar = (campo) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setValores(prev => ({ ...prev, [campo]: v }))
  }

  const impuesto = impuestos.find(i => String(i.id) === String(valores.impuesto_id))
  const tarifa = impuesto ? Number(impuesto.tarifa) : null
  const precio = Number(valores.precio_sin_iva)
  const costo = Number(valores.costo_con_iva)
  const precioConIva = tarifa !== null && valores.precio_sin_iva !== '' ? Math.round(precio * (1 + tarifa / 100) * 100) / 100 : null
  const costoSinIva = tarifa !== null && valores.costo_con_iva !== '' ? costo / (1 + tarifa / 100) : null
  const margen = costoSinIva !== null && precio > 0 ? ((precio - costoSinIva) / precio) * 100 : null

  const cabys = String(valores.cabys).replace(/\D/g, '')
  const avisoCabys = valores.cabys && cabys.length !== 13 ? `El CABYS tiene 13 dígitos; este tiene ${cabys.length}.` : null
  const avisoMedicamento = valores.es_medicamento && (!valores.forma_farmaceutica || !valores.registro_sanitario)
    ? 'Un medicamento necesita forma farmacéutica y registro sanitario.'
    : null

  // Una categoría inactiva que ya tiene el producto se sigue mostrando.
  const opcionesCategoria = categorias.filter(c => c.activo || String(c.id) === String(base.categoria_id))

  const cambios = useMemo(() => Object.fromEntries(
    CAMPOS.filter(c => valores[c] !== base[c]).map(c => [c, listo(c, valores[c])])
  ), [valores, base])
  const hayCambios = Object.keys(cambios).length > 0

  const enviar = async (e) => {
    e.preventDefault()
    const datos = editando ? cambios : Object.fromEntries(CAMPOS.map(c => [c, listo(c, valores[c])]))
    if (editando && !hayCambios) { onCerrar(); return }
    if (!editando && datos.unidad === null) delete datos.unidad
    if (await onGuardar(datos)) onCerrar()
  }

  return (
    <HojaModal
      titulo={editando ? 'Editar producto' : (plantilla ? 'Agregar otra marca' : 'Nuevo producto')}
      subtitulo={editando ? producto.nombre : (plantilla ? `A partir de ${plantilla.nombreOriginal}` : undefined)}
      ancho="sm:max-w-2xl"
      onCerrar={onCerrar}
    >
      {editando && (
        <Pestanas activa={pestana} onCambiar={setPestana} className="mb-5" pestanas={[
          { clave: 'datos', texto: 'Datos del producto', icono: FileText },
          { clave: 'proveedores', texto: 'Proveedores', icono: Truck }
        ]} />
      )}
      {pestana === 'proveedores' ? (
        <ProveedoresProducto {...proveedores} />
      ) : (
        <form onSubmit={enviar} className="space-y-5">
          {editando && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutro-200 bg-neutro-50 p-3">
              <Insignia tono={producto.activo ? 'exito' : 'neutro'}>{producto.activo ? 'Activo' : 'Inactivo'}</Insignia>
              {producto.oculto && <Insignia tono="alerta">Oculto en los catálogos</Insignia>}
              <div className="ml-auto flex flex-wrap gap-1.5">
                <Boton type="button" variante="fantasma" tamano="sm" disabled={guardando}
                  onClick={() => onCambiarEstado({ oculto: !producto.oculto })}>
                  {producto.oculto ? <Eye size={14} /> : <EyeOff size={14} />} {producto.oculto ? 'Mostrar' : 'Ocultar'}
                </Boton>
                <Boton type="button" variante="secundario" tamano="sm" disabled={guardando}
                  onClick={() => onCambiarEstado({ activo: !producto.activo })}>
                  <Power size={14} /> {producto.activo ? 'Desactivar' : 'Activar'}
                </Boton>
              </div>
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Etiqueta htmlFor="producto-nombre" requerido>Nombre</Etiqueta>
              <input id="producto-nombre" className={CLASE_CAMPO} value={valores.nombre} onChange={cambiar('nombre')} maxLength={250} required />
            </div>
            <div>
              <Etiqueta htmlFor="producto-referencia">Referencia</Etiqueta>
              <input id="producto-referencia" className={CLASE_CAMPO} value={valores.referencia} onChange={cambiar('referencia')} maxLength={100} />
            </div>
            <div>
              <Etiqueta htmlFor="producto-categoria_id">Categoría</Etiqueta>
              <select id="producto-categoria_id" className={CLASE_CAMPO} value={valores.categoria_id} onChange={cambiar('categoria_id')}>
                <option value="">Sin categoría</option>
                {opcionesCategoria.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}{c.activo ? '' : ' (inactiva)'}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Etiqueta htmlFor="producto-descripcion">Descripción</Etiqueta>
              <textarea id="producto-descripcion" rows={2} className="input w-full rounded-xl border border-neutro-300 py-2.5" value={valores.descripcion} onChange={cambiar('descripcion')} maxLength={2000} />
            </div>
          </section>

          <section className="grid gap-4 rounded-xl border border-neutro-200 p-4 sm:grid-cols-3">
            <div>
              <Etiqueta htmlFor="producto-impuesto_id" requerido>Impuesto</Etiqueta>
              <select id="producto-impuesto_id" className={CLASE_CAMPO} value={valores.impuesto_id} onChange={cambiar('impuesto_id')} required>
                <option value="" disabled>Elegir…</option>
                {impuestos.map(i => <option key={i.id} value={String(i.id)}>{i.nombre}</option>)}
              </select>
              {editando && !valores.impuesto_id && <Aviso>Este producto no tiene impuesto: no se puede facturar.</Aviso>}
            </div>
            <div>
              <Etiqueta htmlFor="producto-cabys" requerido>CABYS</Etiqueta>
              <input id="producto-cabys" className={CLASE_CAMPO} inputMode="numeric" value={valores.cabys} onChange={cambiar('cabys')} maxLength={13} required />
              {avisoCabys && <Aviso>{avisoCabys}</Aviso>}
            </div>
            <div>
              <Etiqueta htmlFor="producto-unidad">Unidad</Etiqueta>
              <input id="producto-unidad" className={CLASE_CAMPO} value={valores.unidad} onChange={cambiar('unidad')} maxLength={20} placeholder="Unid" />
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <Etiqueta htmlFor="producto-precio_sin_iva" requerido>Precio de venta, sin IVA</Etiqueta>
              <input id="producto-precio_sin_iva" type="number" step="0.01" min="0" inputMode="decimal" className={CLASE_CAMPO} value={valores.precio_sin_iva} onChange={cambiar('precio_sin_iva')} required />
              <p className="mt-1 text-xs text-neutro-500">
                {precioConIva !== null
                  ? <>Con IVA ({tarifa} %): <span className="font-bold text-neutro-800">{colones.format(precioConIva)}</span></>
                  : 'Elija el impuesto para ver el precio con IVA.'}
              </p>
            </div>
            <div>
              <Etiqueta htmlFor="producto-costo_con_iva">Costo unitario, con IVA</Etiqueta>
              <input id="producto-costo_con_iva" type="number" step="0.01" min="0" inputMode="decimal" className={CLASE_CAMPO} value={valores.costo_con_iva} onChange={cambiar('costo_con_iva')} />
              <p className="mt-1 text-xs text-neutro-500">
                {margen !== null
                  ? <>Margen: <span className={`font-bold ${margen < 15 ? 'text-peligro-700' : margen < 20 ? 'text-alerta-700' : 'text-exito-700'}`}>{margen.toFixed(1)} %</span> (sobre el precio sin IVA)</>
                  : 'Con precio, costo e impuesto se calcula el margen.'}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <label className="flex items-center gap-3 text-sm font-medium text-neutro-800">
              <input id="producto-inventariable" type="checkbox" className="h-4 w-4" checked={valores.inventariable} onChange={cambiar('inventariable')} />
              Lleva inventario
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-neutro-800">
              <input id="producto-es_medicamento" type="checkbox" className="h-4 w-4" checked={valores.es_medicamento} onChange={cambiar('es_medicamento')} />
              Es medicamento
            </label>
            {valores.es_medicamento && (
              <div className="grid gap-4 rounded-xl border border-neutro-200 p-4 sm:grid-cols-2">
                <div>
                  <Etiqueta htmlFor="producto-forma_farmaceutica" requerido>Forma farmacéutica (código)</Etiqueta>
                  <input id="producto-forma_farmaceutica" className={CLASE_CAMPO} inputMode="numeric" value={valores.forma_farmaceutica} onChange={cambiar('forma_farmaceutica')} maxLength={3} />
                </div>
                <div>
                  <Etiqueta htmlFor="producto-registro_sanitario" requerido>Registro sanitario</Etiqueta>
                  <input id="producto-registro_sanitario" className={CLASE_CAMPO} value={valores.registro_sanitario} onChange={cambiar('registro_sanitario')} maxLength={60} />
                </div>
                {avisoMedicamento && <div className="sm:col-span-2"><Aviso>{avisoMedicamento}</Aviso></div>}
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutro-100 pt-4">
            {editando && hayCambios && <span className="mr-auto text-sm text-neutro-500">{Object.keys(cambios).length} cambios sin guardar</span>}
            <Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton>
            <Boton type="submit" cargando={guardando} disabled={editando && !hayCambios}>
              <Save size={16} /> {editando ? 'Guardar cambios' : 'Crear producto'}
            </Boton>
          </div>
        </form>
      )}
    </HojaModal>
  )
}

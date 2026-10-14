import { useMemo, useState } from 'react'
import { AlertTriangle, Save, Package, Receipt, Plus, Trash2 } from 'lucide-react'
import HojaModal from '../pagos/HojaModal'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { fechaCorta } from '../../utils/fechaCR'
import { useTelefonosProveedor } from '../../hooks/useTelefonosProveedor'
import { filasTelefonosProveedor, revisarTelefonosProveedor, MAX_TELEFONOS_PROVEEDOR } from '../../utils/telefonosProveedor'

/**
 * La ficha de un proveedor: quién es y qué le compramos.
 *
 * Arriba, lo que se edita. Abajo, lo que NO se edita acá porque viene de otro
 * lado: las últimas facturas suyas que entraron por el buzón y los productos
 * que le compramos según el mapeo. Están a la vista porque son la razón por
 * la que alguien abre esta hoja.
 *
 * Cada WhatsApp se registra en su propia fila. El destino de una orden se
 * elige después en el modal de envío; guardar la ficha no manda mensajes.
 */

const CAMPOS = [
  'nombre', 'tipo_identificacion', 'identificacion', 'correo',
  'telefono', 'telefono_whatsapp', 'plazo_credito_id', 'observaciones'
]
const NUMERICOS = new Set(['plazo_credito_id'])
const CLASE_CAMPO = 'input h-11 w-full rounded-xl border border-neutro-300'
const colones = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 })

const TIPOS = [
  { valor: 'CJ', texto: 'Cédula jurídica', digitos: [10] },
  { valor: 'CF', texto: 'Cédula física', digitos: [9] },
  { valor: 'DIMEX', texto: 'DIMEX', digitos: [11, 12] },
  { valor: 'NITE', texto: 'NITE', digitos: [10] },
  { valor: 'EXTRANJERO', texto: 'Pasaporte', digitos: null },
  { valor: 'NO_CONTRIBUYENTE', texto: 'No contribuyente', digitos: null }
]

function valoresDe(p) {
  return Object.fromEntries(CAMPOS.map(campo => {
    const revisados = campo === 'telefono_whatsapp' && revisarTelefonosProveedor(filasTelefonosProveedor(p?.[campo]))
    const v = revisados && !revisados.error ? revisados.valor : p?.[campo]
    return [campo, v === null || v === undefined ? '' : String(v)]
  }))
}

function listo(campo, v) {
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


export default function ModalFichaProveedor({ proveedor, plazos, guardando, onGuardar, onCerrar }) {
  const editando = Boolean(proveedor?.id)
  const base = useMemo(() => valoresDe(proveedor), [proveedor])
  const [valores, setValores] = useState(base)
  const telefonos = useTelefonosProveedor(base.telefono_whatsapp)
  const valoresActuales = { ...valores, telefono_whatsapp: telefonos.valor || '' }
  const cambiar = (campo) => (e) => setValores(prev => ({ ...prev, [campo]: e.target.value }))

  const tipo = TIPOS.find(t => t.valor === valores.tipo_identificacion)
  const digitos = String(valores.identificacion).replace(/[\s-]/g, '').length
  const avisoCedula = tipo?.digitos && valores.identificacion && !tipo.digitos.includes(digitos)
    ? `Una ${tipo.texto.toLowerCase()} tiene ${tipo.digitos.join(' o ')} dígitos; esta tiene ${digitos}.`
    : null
  const avisoSinCedula = editando && !valores.identificacion
    ? 'Sin cédula no se le pueden enlazar sus compras ni sus productos: las dos cosas se buscan por cédula.'
    : null

  const opcionesPlazo = plazos.filter(p => p.activo || String(p.id) === String(base.plazo_credito_id))

  const cambios = useMemo(() => Object.fromEntries(
    CAMPOS.filter(c => valoresActuales[c] !== base[c]).map(c => [c, listo(c, valoresActuales[c])])
  ), [valores, base, telefonos.valor])
  const hayCambios = Object.keys(cambios).length > 0

  const enviar = async (e) => {
    e.preventDefault()
    if (telefonos.error) return
    if (editando && !hayCambios) { onCerrar(); return }
    const datos = editando ? cambios : Object.fromEntries(CAMPOS.map(c => [c, listo(c, valoresActuales[c])]))
    if (await onGuardar(datos)) onCerrar()
  }

  const compras = proveedor?.ultimasCompras || []
  const productos = proveedor?.productosQueVende || []

  return (
    <HojaModal
      titulo={editando ? 'Ficha del proveedor' : 'Nuevo proveedor'}
      subtitulo={editando ? proveedor.nombre : undefined}
      ancho="sm:max-w-2xl"
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-5">
        {editando && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutro-200 bg-neutro-50 p-3">
            <Insignia tono={proveedor.activo ? 'exito' : 'neutro'}>{proveedor.activo ? 'Activo' : 'Inactivo'}</Insignia>
            {proveedor.productos > 0 && <Insignia tono="neutro">{proveedor.productos} producto(s)</Insignia>}
            {proveedor.compras > 0 && <Insignia tono="neutro">{proveedor.compras} compra(s)</Insignia>}
            {proveedor.ultima_compra && (
              <span className="text-xs text-neutro-400">Última compra: {fechaCorta(proveedor.ultima_compra)}</span>
            )}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Etiqueta htmlFor="proveedor-nombre" requerido>Nombre</Etiqueta>
            <input id="proveedor-nombre" className={CLASE_CAMPO} value={valores.nombre} onChange={cambiar('nombre')} maxLength={200} required />
          </div>
          <div>
            <Etiqueta htmlFor="proveedor-tipo_identificacion">Tipo de identificación</Etiqueta>
            <select id="proveedor-tipo_identificacion" className={CLASE_CAMPO} value={valores.tipo_identificacion} onChange={cambiar('tipo_identificacion')}>
              <option value="">Sin definir</option>
              {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
            </select>
          </div>
          <div>
            <Etiqueta htmlFor="proveedor-identificacion">Cédula</Etiqueta>
            <input id="proveedor-identificacion" className={CLASE_CAMPO} value={valores.identificacion} onChange={cambiar('identificacion')} maxLength={20} />
            {avisoCedula && <Aviso>{avisoCedula}</Aviso>}
            {!avisoCedula && avisoSinCedula && <Aviso>{avisoSinCedula}</Aviso>}
          </div>
        </section>

        <section className="grid gap-4 rounded-xl border border-neutro-200 p-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-500">WhatsApp para pedidos</p>
            {telefonos.filas.map((numero, i) => (
              <div key={i}>
                <Etiqueta htmlFor={`proveedor-whatsapp-${i}`}>Número {i + 1}</Etiqueta>
                <div className="flex items-center gap-2">
                  <input id={`proveedor-whatsapp-${i}`} type="tel" className={CLASE_CAMPO} value={numero}
                    onChange={e => telefonos.cambiar(i, e.target.value)} maxLength={30} placeholder="8827 2453" disabled={guardando}
                    aria-invalid={Boolean(telefonos.errores[i])} aria-describedby={telefonos.errores[i] ? `proveedor-whatsapp-aviso-${i}` : undefined} />
                  <Boton variante="secundario" onClick={() => telefonos.quitar(i)} disabled={guardando}
                    aria-label={`Quitar número ${i + 1}`} className="shrink-0"><Trash2 size={16} /></Boton>
                </div>
                {telefonos.errores[i] && <div id={`proveedor-whatsapp-aviso-${i}`}><Aviso>{telefonos.errores[i]}</Aviso></div>}
              </div>
            ))}
            <Boton variante="secundario" onClick={telefonos.agregar} disabled={guardando || telefonos.filas.length >= MAX_TELEFONOS_PROVEEDOR}>
              <Plus size={15} /> Agregar número
            </Boton>
            <p className="text-xs text-neutro-500">Al enviar un pedido podrás elegir uno de estos números.</p>
          </div>
          <div>
            <Etiqueta htmlFor="proveedor-telefono">Teléfono</Etiqueta>
            <input id="proveedor-telefono" className={CLASE_CAMPO} inputMode="tel" value={valores.telefono} onChange={cambiar('telefono')} maxLength={60} />
          </div>
          <div>
            <Etiqueta htmlFor="proveedor-correo">Correo</Etiqueta>
            <input id="proveedor-correo" type="email" className={CLASE_CAMPO} value={valores.correo} onChange={cambiar('correo')} maxLength={160} />
          </div>
          <div>
            <Etiqueta htmlFor="proveedor-plazo_credito_id">Plazo de crédito</Etiqueta>
            <select id="proveedor-plazo_credito_id" className={CLASE_CAMPO} value={valores.plazo_credito_id} onChange={cambiar('plazo_credito_id')}>
              <option value="">Sin plazo</option>
              {opcionesPlazo.map(p => <option key={p.id} value={String(p.id)}>{p.nombre}{p.activo ? '' : ' (inactivo)'}</option>)}
            </select>
          </div>
        </section>

        <section>
          <Etiqueta htmlFor="proveedor-observaciones">Observaciones</Etiqueta>
          <textarea id="proveedor-observaciones" rows={2} className="input w-full rounded-xl border border-neutro-300 py-2.5" value={valores.observaciones} onChange={cambiar('observaciones')} maxLength={2000} />
        </section>

        {editando && (compras.length > 0 || productos.length > 0) && (
          <section className="grid gap-4 sm:grid-cols-2">
            {compras.length > 0 && (
              <div className="rounded-xl border border-neutro-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutro-500">
                  <Receipt size={12} /> Últimas facturas suyas
                </p>
                <ul className="space-y-1 text-xs text-neutro-600">
                  {compras.slice(0, 5).map(c => (
                    <li key={c.numero_consecutivo} className="flex justify-between gap-2">
                      <span className="truncate">{fechaCorta(c.fecha_emision)} · {c.numero_consecutivo}</span>
                      <span className="font-bold text-neutro-800 shrink-0">{colones.format(c.total_factura)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {productos.length > 0 && (
              <div className="rounded-xl border border-neutro-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutro-500">
                  <Package size={12} /> Lo que más le compramos
                </p>
                <ul className="space-y-1 text-xs text-neutro-600">
                  {productos.slice(0, 5).map(p => (
                    <li key={p.id} className="truncate">{p.nombre}{p.referencia ? ` · ${p.referencia}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutro-100 pt-4">
          {editando && hayCambios && <span className="mr-auto text-sm text-neutro-500">{Object.keys(cambios).length} cambios sin guardar</span>}
          <Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={guardando} disabled={Boolean(telefonos.error) || (editando && !hayCambios)}>
            <Save size={16} /> {editando ? 'Guardar cambios' : 'Crear proveedor'}
          </Boton>
        </div>
      </form>
    </HojaModal>
  )
}

import { useMemo, useState } from 'react'
import { AlertTriangle, Save, Package, Receipt } from 'lucide-react'
import HojaModal from '../pagos/HojaModal'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'

/**
 * La ficha de un proveedor: quién es y qué le compramos.
 *
 * Arriba, lo que se edita. Abajo, lo que NO se edita acá porque viene de otro
 * lado: las últimas facturas suyas que entraron por el buzón y los productos
 * que le compramos según el mapeo. Están a la vista porque son la razón por
 * la que alguien abre esta hoja.
 *
 * El WhatsApp es el número al que sale la orden de compra, así que se valida
 * como teléfono de verdad y no como texto libre.
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
    const v = p?.[campo]
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

const fecha = (valor) => (valor ? String(valor).slice(0, 10).split('-').reverse().join('/') : '—')

export default function ModalFichaProveedor({ proveedor, plazos, guardando, onGuardar, onCerrar }) {
  const editando = Boolean(proveedor?.id)
  const base = useMemo(() => valoresDe(proveedor), [proveedor])
  const [valores, setValores] = useState(base)
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
    CAMPOS.filter(c => valores[c] !== base[c]).map(c => [c, listo(c, valores[c])])
  ), [valores, base])
  const hayCambios = Object.keys(cambios).length > 0

  const enviar = async (e) => {
    e.preventDefault()
    if (editando && !hayCambios) { onCerrar(); return }
    const datos = editando ? cambios : Object.fromEntries(CAMPOS.map(c => [c, listo(c, valores[c])]))
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
              <span className="text-xs text-neutro-400">Última compra: {fecha(proveedor.ultima_compra)}</span>
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
          <div>
            <Etiqueta htmlFor="proveedor-telefono_whatsapp">WhatsApp (para la orden de compra)</Etiqueta>
            <input id="proveedor-telefono_whatsapp" className={CLASE_CAMPO} inputMode="tel" value={valores.telefono_whatsapp} onChange={cambiar('telefono_whatsapp')} maxLength={30} placeholder="8827 2453" />
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
                      <span className="truncate">{fecha(c.fecha_emision)} · {c.numero_consecutivo}</span>
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
          <Boton type="submit" cargando={guardando} disabled={editando && !hayCambios}>
            <Save size={16} /> {editando ? 'Guardar cambios' : 'Crear proveedor'}
          </Boton>
        </div>
      </form>
    </HojaModal>
  )
}

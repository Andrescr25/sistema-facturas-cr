import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Save } from 'lucide-react'
import HojaModal from '../pagos/HojaModal'
import { clientesService } from '../../services/clientesService'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'

/**
 * Crear o editar la ficha de un cliente.
 *
 * Hasta ahora no existía: las fichas se creaban en Alegra y acá solo se
 * consultaban. Los datos que Hacienda exige para facturar —identificación con
 * su tipo, correo y actividad económica— se piden acá, y lo que falta se
 * avisa a la vista en vez de descubrirse al emitir la factura.
 *
 * Al editar se manda solo lo que cambió. Si el servidor rechaza, la hoja
 * queda abierta con lo tipeado: su mensaje dice qué corregir.
 *
 * No hay "Eliminar": un cliente se desactiva y conserva sus facturas, saldos
 * y pedidos.
 */

const CAMPOS = [
  'nombre', 'tipo_identificacion', 'identificacion', 'correo', 'correos_adicionales',
  'telefono', 'telefono_secundario', 'celular',
  'provincia', 'canton', 'distrito', 'barrio', 'otras_senas',
  'actividad_economica', 'plazo_credito_id', 'limite_credito', 'observaciones'
]
const NUMERICOS = new Set(['plazo_credito_id', 'limite_credito'])
const CLASE_CAMPO = 'input h-11 w-full rounded-xl border border-neutro-300'

// Las mismas reglas que `backend/src/modules/clientes/identificacion.js`. No se
// valida el primer dígito de una cédula física: las cargadas empiezan con 1,
// 2, 4, 5, 6, 8 y 9, así que "provincia del 1 al 7" dejaría fuera a ocho
// clientes de verdad.
const TIPOS = [
  { valor: 'CF', texto: 'Cédula física', digitos: [9], soloNumeros: true },
  { valor: 'CJ', texto: 'Cédula jurídica', digitos: [10], soloNumeros: true, empiezaCon: '3' },
  { valor: 'DIMEX', texto: 'DIMEX', digitos: [11, 12], soloNumeros: true },
  { valor: 'NITE', texto: 'NITE', digitos: [10], soloNumeros: true },
  { valor: 'EXTRANJERO', texto: 'Pasaporte', digitos: null },
  { valor: 'NO_CONTRIBUYENTE', texto: 'No contribuyente', digitos: null }
]

/** Los correos adicionales se escriben separados por coma y viajan como lista. */
const aTexto = (v) => (Array.isArray(v) ? v.join(', ') : '')
const aLista = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean)

function valoresDe(c) {
  return Object.fromEntries(CAMPOS.map(campo => {
    const v = c?.[campo]
    if (campo === 'correos_adicionales') return [campo, aTexto(v)]
    return [campo, v === null || v === undefined ? '' : String(v)]
  }))
}

function listo(campo, v) {
  if (campo === 'correos_adicionales') return aLista(v)
  if (NUMERICOS.has(campo)) return v === '' ? null : Number(v)
  return String(v).trim() === '' ? null : String(v).trim()
}

/**
 * Lo mismo que revisa el servidor, dicho antes de apretar Guardar. Está
 * escrito dos veces a propósito: el servidor es el que manda —una pantalla no
 * protege una base de datos— y esto es solo para no hacer ir y volver.
 */
function avisoDe(tipo, identificacion) {
  if (!tipo || !identificacion) return null
  if (tipo.soloNumeros && !/^\d+$/.test(identificacion)) {
    return `Una ${tipo.texto.toLowerCase()} son solo números.`
  }
  if (tipo.digitos && !tipo.digitos.includes(identificacion.length)) {
    return `Una ${tipo.texto.toLowerCase()} tiene ${tipo.digitos.join(' o ')} dígitos; esta tiene ${identificacion.length}.`
  }
  if (tipo.empiezaCon && !identificacion.startsWith(tipo.empiezaCon)) {
    return `Una ${tipo.texto.toLowerCase()} empieza con ${tipo.empiezaCon}.`
  }
  return null
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

export default function ModalCliente({ cliente, plazos, guardando, onGuardar, onCerrar }) {
  const editando = Boolean(cliente?.id)
  const base = useMemo(() => valoresDe(cliente), [cliente])
  const [valores, setValores] = useState(base)
  const cambiar = (campo) => (e) => setValores(prev => ({ ...prev, [campo]: e.target.value }))

  const tipo = TIPOS.find(t => t.valor === valores.tipo_identificacion)
  const identificacion = String(valores.identificacion).replace(/[\s-]/g, '')
  const avisoIdentificacion = avisoDe(tipo, identificacion)

  // Con qué otras fichas choca esa identificación. NO impide guardar: el
  // número del cliente de mostrador lo comparten 139 fichas a propósito. Pero
  // cuando es una cédula de verdad, ver el choque es lo que evita la segunda
  // ficha del mismo negocio —hay dos de WILBERTH BUZANO y dos de OG PWR HOUSE—.
  const [choque, setChoque] = useState(null)
  useEffect(() => {
    if (identificacion.length < 9) { setChoque(null); return }
    let vigente = true
    // Medio segundo: se consulta cuando la persona deja de escribir, no por
    // cada tecla.
    const t = setTimeout(async () => {
      try {
        const r = await clientesService.coincidencias(identificacion, cliente?.id)
        if (vigente) setChoque(r?.total ? r : null)
      } catch { if (vigente) setChoque(null) }
    }, 500)
    return () => { vigente = false; clearTimeout(t) }
  }, [identificacion, cliente?.id])
  const avisoActividad = editando && !valores.actividad_economica
    ? 'Sin actividad económica no se puede emitir una factura electrónica a nombre de este cliente.'
    : null

  // Un plazo inactivo que el cliente ya tiene se sigue mostrando.
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

  return (
    <HojaModal
      titulo={editando ? 'Editar cliente' : 'Nuevo cliente'}
      subtitulo={editando ? cliente.nombre : undefined}
      ancho="sm:max-w-2xl"
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-5">
        {editando && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutro-200 bg-neutro-50 p-3">
            <Insignia tono={cliente.activo ? 'exito' : 'neutro'}>{cliente.activo ? 'Activo' : 'Inactivo'}</Insignia>
            {cliente.alegra_id && <span className="text-xs text-neutro-400">Venía de Alegra (#{cliente.alegra_id})</span>}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Etiqueta htmlFor="cliente-nombre" requerido>Nombre</Etiqueta>
            <input id="cliente-nombre" className={CLASE_CAMPO} value={valores.nombre} onChange={cambiar('nombre')} maxLength={200} required />
          </div>
          <div>
            <Etiqueta htmlFor="cliente-tipo_identificacion">Tipo de identificación</Etiqueta>
            <select id="cliente-tipo_identificacion" className={CLASE_CAMPO} value={valores.tipo_identificacion} onChange={cambiar('tipo_identificacion')}>
              <option value="">Sin definir</option>
              {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
            </select>
          </div>
          <div>
            <Etiqueta htmlFor="cliente-identificacion">Identificación</Etiqueta>
            <input id="cliente-identificacion" className={CLASE_CAMPO} value={valores.identificacion} onChange={cambiar('identificacion')} maxLength={20} />
            {avisoIdentificacion && <Aviso>{avisoIdentificacion}</Aviso>}
            {choque && (
              <p className="mt-1 text-xs text-neutro-600">
                Ya {choque.total === 1 ? 'hay otra ficha' : `hay ${choque.total} fichas`} con esa identificación:{' '}
                <span className="font-semibold text-neutro-800">
                  {choque.fichas.map(f => f.nombre).join(', ')}{choque.total > choque.fichas.length && '…'}
                </span>
                . Se puede guardar igual.
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-4 rounded-xl border border-neutro-200 p-4 sm:grid-cols-2">
          <div>
            <Etiqueta htmlFor="cliente-correo">Correo</Etiqueta>
            <input id="cliente-correo" type="email" className={CLASE_CAMPO} value={valores.correo} onChange={cambiar('correo')} maxLength={160} />
          </div>
          <div>
            <Etiqueta htmlFor="cliente-correos_adicionales">Otros correos</Etiqueta>
            <input id="cliente-correos_adicionales" className={CLASE_CAMPO} value={valores.correos_adicionales} onChange={cambiar('correos_adicionales')} placeholder="separados por coma" />
          </div>
          <div>
            <Etiqueta htmlFor="cliente-celular">Celular</Etiqueta>
            <input id="cliente-celular" className={CLASE_CAMPO} inputMode="tel" value={valores.celular} onChange={cambiar('celular')} maxLength={60} placeholder="8827 2453" />
          </div>
          <div>
            <Etiqueta htmlFor="cliente-telefono">Teléfono</Etiqueta>
            <input id="cliente-telefono" className={CLASE_CAMPO} inputMode="tel" value={valores.telefono} onChange={cambiar('telefono')} maxLength={60} />
          </div>
          <div>
            <Etiqueta htmlFor="cliente-telefono_secundario">Otro teléfono</Etiqueta>
            <input id="cliente-telefono_secundario" className={CLASE_CAMPO} inputMode="tel" value={valores.telefono_secundario} onChange={cambiar('telefono_secundario')} maxLength={60} />
          </div>
          <div>
            <Etiqueta htmlFor="cliente-actividad_economica">Actividad económica</Etiqueta>
            <input id="cliente-actividad_economica" className={CLASE_CAMPO} inputMode="numeric" value={valores.actividad_economica} onChange={cambiar('actividad_economica')} maxLength={10} placeholder="523402" />
            {avisoActividad && <Aviso>{avisoActividad}</Aviso>}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div>
            <Etiqueta htmlFor="cliente-provincia">Provincia</Etiqueta>
            <input id="cliente-provincia" className={CLASE_CAMPO} value={valores.provincia} onChange={cambiar('provincia')} maxLength={40} />
          </div>
          <div>
            <Etiqueta htmlFor="cliente-canton">Cantón</Etiqueta>
            <input id="cliente-canton" className={CLASE_CAMPO} value={valores.canton} onChange={cambiar('canton')} maxLength={60} />
          </div>
          <div>
            <Etiqueta htmlFor="cliente-distrito">Distrito</Etiqueta>
            <input id="cliente-distrito" className={CLASE_CAMPO} value={valores.distrito} onChange={cambiar('distrito')} maxLength={60} />
          </div>
          <div>
            <Etiqueta htmlFor="cliente-barrio">Barrio</Etiqueta>
            <input id="cliente-barrio" className={CLASE_CAMPO} value={valores.barrio} onChange={cambiar('barrio')} maxLength={80} />
          </div>
          <div className="sm:col-span-2">
            <Etiqueta htmlFor="cliente-otras_senas">Otras señas</Etiqueta>
            <input id="cliente-otras_senas" className={CLASE_CAMPO} value={valores.otras_senas} onChange={cambiar('otras_senas')} maxLength={2000} placeholder="100 m norte de la iglesia" />
          </div>
        </section>

        <section className="grid gap-4 rounded-xl border border-neutro-200 p-4 sm:grid-cols-2">
          <div>
            <Etiqueta htmlFor="cliente-plazo_credito_id">Plazo de crédito</Etiqueta>
            <select id="cliente-plazo_credito_id" className={CLASE_CAMPO} value={valores.plazo_credito_id} onChange={cambiar('plazo_credito_id')}>
              <option value="">Sin plazo</option>
              {opcionesPlazo.map(p => <option key={p.id} value={String(p.id)}>{p.nombre}{p.activo ? '' : ' (inactivo)'}</option>)}
            </select>
          </div>
          <div>
            <Etiqueta htmlFor="cliente-limite_credito">Límite de crédito</Etiqueta>
            <input id="cliente-limite_credito" type="number" step="1" min="0" inputMode="decimal" className={CLASE_CAMPO} value={valores.limite_credito} onChange={cambiar('limite_credito')} />
            <p className="mt-1 text-xs text-neutro-500">En blanco: sin tope definido.</p>
          </div>
        </section>

        <section>
          <Etiqueta htmlFor="cliente-observaciones">Observaciones</Etiqueta>
          <textarea id="cliente-observaciones" rows={2} className="input w-full rounded-xl border border-neutro-300 py-2.5" value={valores.observaciones} onChange={cambiar('observaciones')} maxLength={2000} placeholder="Entregar antes de las 10" />
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutro-100 pt-4">
          {editando && hayCambios && <span className="mr-auto text-sm text-neutro-500">{Object.keys(cambios).length} cambios sin guardar</span>}
          <Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={guardando} disabled={editando && !hayCambios}>
            <Save size={16} /> {editando ? 'Guardar cambios' : 'Crear cliente'}
          </Boton>
        </div>
      </form>
    </HojaModal>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Save } from 'lucide-react'
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
  'actividad_economica', 'plazo_credito_id', 'limite_credito', 'observaciones',
  'ruta_id', 'orden_ruta', 'ubicacion_maps', 'dia_visita', 'dia_entrega'
]
const NUMERICOS = new Set(['plazo_credito_id', 'limite_credito', 'ruta_id', 'orden_ruta', 'dia_visita', 'dia_entrega'])
const CLASE_CAMPO = 'input min-h-12 w-full rounded-xl border border-neutro-300 text-base'

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
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-neutro-700">
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

const SECCIONES = [
  ['general', 'Información general'], ['contacto', 'Contacto y datos fiscales'],
  ['ruta', 'Ruta y visitas'], ['direccion', 'Dirección'], ['credito', 'Crédito'], ['notas', 'Notas']
]

/** Los campos siguen juntos para que la validación nativa pueda enfocarlos.
 * El guardado conserva el envío de diferencias. */
function SeccionFormulario({ id, titulo, columnas = 'sm:grid-cols-2', children }) {
  return <section className="overflow-hidden rounded-2xl border border-neutro-200">
    <h2 data-seccion={id} tabIndex={-1} className="scroll-mt-4 border-b border-neutro-100 bg-neutro-50 px-5 py-4 text-base font-bold text-neutro-800">{titulo}</h2>
    <div className={`grid gap-5 p-5 ${columnas}`}>{children}</div>
  </section>
}

export default function ModalCliente({ cliente, plazos, rutas = [], guardando, onGuardar, onCerrar }) {
  const formulario = useRef(null)
  const irA = id => {
    const titulo = formulario.current?.querySelector(`[data-seccion="${id}"]`)
    titulo?.focus({ preventScroll: true })
    titulo?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
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
  // Lo que Hacienda dice de esa cédula. De las 247 fichas cargadas, 245 no
  // tienen actividad económica. Es un dato opcional: desde el 2026-10-11 la
  // factura electrónica se emite sin ella (antes se exigía, y la ficha
  // avisaba que sin ese dato no se podía). Se PROPONE: el nombre legal casi nunca
  // es el que usa la casa —"OG PWR HOUSE SOCIEDAD DE RESPONSABILIDAD
  // LIMITADA" contra "OG PWR HOUSE …-GYM Palmares"— y pisarlo dejaría fichas
  // que nadie reconoce.
  const [hacienda, setHacienda] = useState(null)
  const [consultando, setConsultando] = useState(false)
  const [falloHacienda, setFalloHacienda] = useState(null)

  const consultarHacienda = async () => {
    setConsultando(true); setFalloHacienda(null); setHacienda(null)
    try {
      const r = await clientesService.hacienda(identificacion)
      setHacienda(r)
      // El tipo sí se pone solo cuando está vacío: no hay nada que pisar y
      // Hacienda es la fuente de esa respuesta.
      if (!valores.tipo_identificacion && r.tipoIdentificacion) {
        setValores(prev => ({ ...prev, tipo_identificacion: r.tipoIdentificacion }))
      }
    } catch (e) {
      setFalloHacienda(e?.response?.data?.message || 'No se pudo consultar a Hacienda.')
    } finally {
      setConsultando(false)
    }
  }

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
      <form ref={formulario} onSubmit={enviar} className="space-y-5">
        <nav aria-label="Ir a una sección del formulario" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SECCIONES.map(([id, titulo]) => <button key={id} type="button" onClick={() => irA(id)}
            className="min-h-11 rounded-xl border border-neutro-200 px-3 py-2 text-sm font-semibold text-neutro-600 hover:bg-neutro-50">{titulo}</button>)}
        </nav>
        {editando && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutro-200 bg-neutro-50 p-3">
            <Insignia tono={cliente.activo ? 'exito' : 'neutro'}>{cliente.activo ? 'Activo' : 'Inactivo'}</Insignia>
            {cliente.alegra_id && <span className="text-xs text-neutro-400">Venía de Alegra (#{cliente.alegra_id})</span>}
          </div>
        )}

        <SeccionFormulario id="general" titulo="Información general" columnas="sm:grid-cols-2">
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
            <button
              type="button"
              onClick={consultarHacienda}
              disabled={consultando || identificacion.length < 9}
              title={identificacion.length < 9
                ? 'Escribí la cédula completa para consultarla'
                : 'Traer de Hacienda el nombre, el tipo y las actividades económicas'}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-neutro-300 px-2.5 py-1 text-xs font-semibold text-neutro-700 disabled:opacity-40"
            >
              <Download size={12} />{consultando ? 'Consultando…' : 'Consultar en Hacienda'}
            </button>
            {falloHacienda && <Aviso>{falloHacienda}</Aviso>}
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
        </SeccionFormulario>

        <SeccionFormulario id="contacto" titulo="Contacto y datos fiscales" columnas="sm:grid-cols-2">
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
          </div>

          {hacienda && (
            <div className="sm:col-span-2 rounded-xl border border-neutro-200 bg-neutro-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-500">Según Hacienda</p>
              <p className="mt-1 text-sm font-semibold text-neutro-900">{hacienda.nombre}</p>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutro-600">
                <span>{hacienda.situacion.estado}{hacienda.regimen && ` · ${hacienda.regimen}`}</span>
                {/* Moroso u omiso no impide facturarle, pero sí es algo que
                    quien da crédito querría saber antes de dárselo. */}
                {hacienda.situacion.moroso && <Insignia tono="peligro">Moroso</Insignia>}
                {hacienda.situacion.omiso && <Insignia tono="alerta">Omiso</Insignia>}
              </div>

              {hacienda.nombre !== valores.nombre && (
                <button
                  type="button"
                  onClick={() => setValores(prev => ({ ...prev, nombre: hacienda.nombre }))}
                  className="mt-2 rounded-lg border border-neutro-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutro-700"
                >
                  Usar este nombre
                </button>
              )}

              {hacienda.actividades.length === 0 ? (
                <p className="mt-2 text-xs text-neutro-600">No tiene actividades activas inscritas.</p>
              ) : (
                <>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-neutro-500">
                    Actividades — tocá una para ponerla
                  </p>
                  <ul className="mt-1 space-y-1">
                    {hacienda.actividades.map(a => (
                      <li key={a.codigo}>
                        <button
                          type="button"
                          onClick={() => setValores(prev => ({ ...prev, actividad_economica: a.codigo }))}
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs ${
                            valores.actividad_economica === a.codigo
                              ? 'border-exito-300 bg-exito-50 text-exito-800'
                              : 'border-neutro-200 bg-white text-neutro-700'}`}
                        >
                          <span className="font-semibold">{a.codigo}</span> · {a.descripcion}
                          {a.principal && <span className="ml-1 text-neutro-500">(principal)</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </SeccionFormulario>

        <SeccionFormulario id="ruta" titulo="Ruta y visitas" columnas="sm:grid-cols-2">
          <div><Etiqueta htmlFor="cliente-ruta_id">Ruta</Etiqueta>
            <select id="cliente-ruta_id" className={CLASE_CAMPO} value={valores.ruta_id} onChange={e => setValores(v => ({ ...v, ruta_id: e.target.value, orden_ruta: '' }))}>
              <option value="">Sin ruta</option>{rutas.filter(r => r.activo || String(r.id) === base.ruta_id).map(r => <option key={r.id} value={r.id}>{r.nombre}{r.activo ? '' : ' · inactiva'}</option>)}
            </select></div>
          <div><Etiqueta htmlFor="cliente-orden_ruta">Orden de visita</Etiqueta>
            <input id="cliente-orden_ruta" type="number" min="1" step="1" disabled={!valores.ruta_id} className={CLASE_CAMPO} value={valores.orden_ruta} onChange={cambiar('orden_ruta')} placeholder="Al final de la ruta" />
            <p className="text-xs text-neutro-500 mt-1">En blanco: al final al asignar una ruta.</p></div>
          {['dia_visita', 'dia_entrega'].map(campo => <div key={campo}><Etiqueta htmlFor={`cliente-${campo}`}>{campo === 'dia_visita' ? 'Día habitual de visita' : 'Día habitual de entrega'}</Etiqueta>
            <select id={`cliente-${campo}`} className={CLASE_CAMPO} value={valores[campo]} onChange={cambiar(campo)}><option value="">Sin definir</option>
              {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((dia, i) => <option key={dia} value={i + 1}>{dia}</option>)}
            </select></div>)}
          <div className="sm:col-span-2"><Etiqueta htmlFor="cliente-ubicacion_maps">Ubicación de Google Maps</Etiqueta>
            <input id="cliente-ubicacion_maps" type="url" className={CLASE_CAMPO} value={valores.ubicacion_maps} onChange={cambiar('ubicacion_maps')} maxLength={2000} placeholder="https://maps.app.goo.gl/..." />
            <p className="text-xs text-neutro-500 mt-1">Pegá el enlace que comparte Google Maps.</p></div>
        </SeccionFormulario>
        <SeccionFormulario id="direccion" titulo="Dirección" columnas="sm:grid-cols-3">
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
        </SeccionFormulario>

        <SeccionFormulario id="credito" titulo="Crédito">
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
        </SeccionFormulario>

        <SeccionFormulario id="notas" titulo="Notas" columnas="">
          <div>
            <Etiqueta htmlFor="cliente-observaciones">Observaciones</Etiqueta>
            <textarea id="cliente-observaciones" rows={2} className="input w-full rounded-xl border border-neutro-300 py-2.5" value={valores.observaciones} onChange={cambiar('observaciones')} maxLength={2000} placeholder="Entregar antes de las 10" />
          </div>
        </SeccionFormulario>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutro-100 pt-4">
          {editando && hayCambios && <span className="mr-auto text-sm text-neutro-500">{Object.keys(cambios).length} cambios sin guardar</span>}
          <Boton type="button" variante="secundario" tamano="lg" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" tamano="lg" cargando={guardando} disabled={editando && !hayCambios}>
            <Save size={16} /> {editando ? 'Guardar cambios' : 'Crear cliente'}
          </Boton>
        </div>
      </form>
    </HojaModal>
  )
}

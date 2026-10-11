import { useState, useEffect, useMemo } from 'react'
import { Save, Undo2, AlertTriangle } from 'lucide-react'
import Boton from '../ui/Boton'

/**
 * Datos legales de la empresa.
 *
 * Antes esta pantalla los guardaba en el localStorage del navegador y nada
 * los leía: cambiarlos no tenía ningún efecto. Ahora van a la base y son los
 * que usan las facturas y las cotizaciones.
 *
 * Se manda solo lo que cambió: si dos personas editan a la vez, cada una
 * pisa únicamente el campo que tocó.
 */

const PROVINCIAS = ['San José', 'Alajuela', 'Cartago', 'Heredia', 'Guanacaste', 'Puntarenas', 'Limón']

const TIPOS_IDENTIFICACION = [
  { valor: 'CF', texto: 'Cédula física', largos: [9] },
  { valor: 'CJ', texto: 'Cédula jurídica', largos: [10] },
  { valor: 'DIMEX', texto: 'DIMEX', largos: [11, 12] },
  { valor: 'NITE', texto: 'NITE', largos: [10] }
]

const CAMPOS = [
  'nombre', 'nombre_comercial', 'tipo_identificacion', 'identificacion', 'actividad_economica', 'regimen',
  'actividad_economica_nombre', 'terminos_pago',
  'telefono', 'correo', 'provincia', 'canton', 'distrito', 'barrio', 'otras_senas', 'decimales'
]

const CLASE_CAMPO = 'input h-11 w-full rounded-xl border border-neutro-300'

function valoresDe(empresa) {
  return Object.fromEntries(CAMPOS.map(c => {
    const v = empresa?.[c]
    return [c, v === null || v === undefined ? (c === 'decimales' ? '0' : '') : String(v)]
  }))
}

function Seccion({ titulo, descripcion, children }) {
  return (
    <section className="rounded-2xl border border-neutro-200 bg-white p-4 sm:p-6">
      <h2 className="font-bold text-neutro-900">{titulo}</h2>
      {descripcion && <p className="text-sm text-neutro-500">{descripcion}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Campo({ id, etiqueta, requerido, ayuda, aviso, className = '', children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-500">
        {etiqueta}{requerido && ' *'}
      </label>
      {children}
      {aviso ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-alerta-700">
          <AlertTriangle size={12} className="shrink-0" />{aviso}
        </p>
      ) : ayuda && <p className="mt-1 text-xs text-neutro-400">{ayuda}</p>}
    </div>
  )
}

export default function FormularioEmpresa({ empresa, guardando, onGuardar }) {
  const base = useMemo(() => valoresDe(empresa), [empresa])
  const [valores, setValores] = useState(base)
  useEffect(() => { setValores(base) }, [base])

  const cambios = useMemo(() => Object.fromEntries(
    CAMPOS.filter(c => valores[c] !== base[c]).map(c => [
      c,
      c === 'decimales' ? Number(valores[c] || 0) : (valores[c].trim() === '' ? null : valores[c].trim())
    ])
  ), [valores, base])
  const hayCambios = Object.keys(cambios).length > 0

  const cambiar = (campo) => (e) => setValores(v => ({ ...v, [campo]: e.target.value }))

  const tipo = TIPOS_IDENTIFICACION.find(t => t.valor === valores.tipo_identificacion)
  const digitos = valores.identificacion.replace(/[\s-]/g, '')
  const avisoIdentificacion = tipo && digitos && !tipo.largos.includes(digitos.length)
    ? `Una ${tipo.texto.toLowerCase()} tiene ${tipo.largos.join(' o ')} dígitos; esta tiene ${digitos.length}.`
    : null

  // Una provincia escrita de otra forma en los datos viejos no se pierde al abrir la lista.
  const provincias = valores.provincia && !PROVINCIAS.includes(valores.provincia)
    ? [valores.provincia, ...PROVINCIAS]
    : PROVINCIAS

  const enviar = async (e) => {
    e.preventDefault()
    if (hayCambios) await onGuardar(cambios)
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {!empresa && (
        <p className="rounded-xl border border-alerta-200 bg-alerta-50 p-3 text-sm text-alerta-800">
          Todavía no hay datos de la empresa guardados. Complete los obligatorios (*) y guarde.
        </p>
      )}

      <Seccion titulo="Identificación" descripcion="Así aparece la empresa en las facturas y cotizaciones.">
        <Campo id="empresa-nombre" etiqueta="Nombre" requerido className="sm:col-span-2">
          <input id="empresa-nombre" className={CLASE_CAMPO} value={valores.nombre} onChange={cambiar('nombre')} maxLength={160} />
        </Campo>
        <Campo id="empresa-nombre_comercial" etiqueta="Nombre comercial">
          <input id="empresa-nombre_comercial" className={CLASE_CAMPO} value={valores.nombre_comercial} onChange={cambiar('nombre_comercial')} maxLength={160} />
        </Campo>
        <Campo id="empresa-regimen" etiqueta="Régimen">
          <input id="empresa-regimen" className={CLASE_CAMPO} value={valores.regimen} onChange={cambiar('regimen')} maxLength={40} />
        </Campo>
        <Campo id="empresa-tipo_identificacion" etiqueta="Tipo de identificación" requerido>
          <select id="empresa-tipo_identificacion" className={CLASE_CAMPO} value={valores.tipo_identificacion} onChange={cambiar('tipo_identificacion')}>
            <option value="" disabled>Elegir…</option>
            {TIPOS_IDENTIFICACION.map(t => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
          </select>
        </Campo>
        <Campo id="empresa-identificacion" etiqueta="Identificación" requerido aviso={avisoIdentificacion} ayuda="Sin guiones: se limpian al guardar.">
          <input id="empresa-identificacion" className={CLASE_CAMPO} inputMode="numeric" value={valores.identificacion} onChange={cambiar('identificacion')} maxLength={16} />
        </Campo>
        <Campo id="empresa-actividad_economica" etiqueta="Actividad económica" ayuda="Código de Hacienda. El que sale hoy en las facturas es 4752.1">
          <input id="empresa-actividad_economica" className={CLASE_CAMPO} value={valores.actividad_economica} onChange={cambiar('actividad_economica')} maxLength={10} />
        </Campo>
      </Seccion>

      <Seccion titulo="Contacto">
        <Campo id="empresa-telefono" etiqueta="Teléfono">
          <input id="empresa-telefono" type="tel" className={CLASE_CAMPO} value={valores.telefono} onChange={cambiar('telefono')} maxLength={30} />
        </Campo>
        <Campo id="empresa-correo" etiqueta="Correo">
          <input id="empresa-correo" type="email" className={CLASE_CAMPO} value={valores.correo} onChange={cambiar('correo')} maxLength={160} />
        </Campo>
      </Seccion>

      <Seccion titulo="Dirección">
        <Campo id="empresa-provincia" etiqueta="Provincia">
          <select id="empresa-provincia" className={CLASE_CAMPO} value={valores.provincia} onChange={cambiar('provincia')}>
            <option value="">Sin indicar</option>
            {provincias.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Campo>
        <Campo id="empresa-canton" etiqueta="Cantón">
          <input id="empresa-canton" className={CLASE_CAMPO} value={valores.canton} onChange={cambiar('canton')} maxLength={60} />
        </Campo>
        <Campo id="empresa-distrito" etiqueta="Distrito">
          <input id="empresa-distrito" className={CLASE_CAMPO} value={valores.distrito} onChange={cambiar('distrito')} maxLength={60} />
        </Campo>
        <Campo id="empresa-barrio" etiqueta="Barrio">
          <input id="empresa-barrio" className={CLASE_CAMPO} value={valores.barrio} onChange={cambiar('barrio')} maxLength={80} />
        </Campo>
        {/* Va impreso en la factura debajo del código: el número solo no le
            dice nada a quien recibe el documento. */}
        <Campo
          id="empresa-actividad_economica_nombre"
          etiqueta="Descripción de la actividad"
          ayuda="Se imprime en la factura junto al código"
          className="sm:col-span-2"
        >
          <input
            id="empresa-actividad_economica_nombre"
            className={CLASE_CAMPO}
            value={valores.actividad_economica_nombre}
            onChange={cambiar('actividad_economica_nombre')}
            maxLength={200}
          />
        </Campo>

        {/* POR DÓNDE LE PAGAN A LA EMPRESA. Sin esto el papel no sirve para
            cobrar, y un número de cuenta cambia sin que nadie deba tocar
            código. */}
        <Campo
          id="empresa-terminos_pago"
          etiqueta="Términos y condiciones"
          ayuda="Cuentas de SINPE y banco. Salen al pie de cada factura; una por línea"
          className="sm:col-span-2"
        >
          <textarea
            id="empresa-terminos_pago"
            rows={3}
            className="input w-full rounded-xl border border-neutro-300 py-2.5 font-mono text-sm"
            value={valores.terminos_pago}
            onChange={cambiar('terminos_pago')}
            maxLength={1000}
          />
        </Campo>

        <Campo id="empresa-otras_senas" etiqueta="Otras señas" className="sm:col-span-2">
          <textarea id="empresa-otras_senas" rows={2} className="input w-full rounded-xl border border-neutro-300 py-2.5" value={valores.otras_senas} onChange={cambiar('otras_senas')} maxLength={500} />
        </Campo>
      </Seccion>

      <Seccion titulo="Facturas">
        <Campo id="empresa-decimales" etiqueta="Decimales en los montos" ayuda="En colones lo normal es 0.">
          <select id="empresa-decimales" className={CLASE_CAMPO} value={valores.decimales} onChange={cambiar('decimales')}>
            {[0, 1, 2].map(n => <option key={n} value={String(n)}>{n}</option>)}
          </select>
        </Campo>
      </Seccion>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {hayCambios && <span className="mr-auto text-sm text-neutro-500">{Object.keys(cambios).length} cambios sin guardar</span>}
        <Boton type="button" variante="secundario" disabled={!hayCambios || guardando} onClick={() => setValores(base)}>
          <Undo2 size={16} /> Deshacer
        </Boton>
        <Boton type="submit" disabled={!hayCambios} cargando={guardando}>
          <Save size={16} /> Guardar cambios
        </Boton>
      </div>
    </form>
  )
}

import { useState } from 'react'
import HojaModal from '../pagos/HojaModal'
import Boton from '../ui/Boton'

/**
 * Agregar o editar un elemento de cualquier catálogo de Configuración.
 *
 * Los campos salen de la descripción del catálogo (catalogos.js). Al editar
 * se manda solo lo que cambió. Si el servidor rechaza (tarifa fuera de rango,
 * plazo repetido) la hoja queda abierta con lo tipeado, para corregir sin
 * volver a escribir todo.
 */

const CLASE_CAMPO = 'input h-11 w-full rounded-xl border border-neutro-300'

function valorInicial(campo, fila, nuevo) {
  const v = fila ? fila[campo.campo] : nuevo[campo.campo]
  if (campo.tipo === 'si_no') return Boolean(v)
  return v === null || v === undefined ? '' : String(v)
}

function listoParaEnviar(campo, v) {
  if (campo.tipo === 'numero') return v === '' ? null : Number(v)
  if (campo.tipo === 'si_no') return Boolean(v)
  return String(v).trim() === '' ? null : String(v).trim()
}

export default function ModalElementoCatalogo({ definicion, fila, guardando, onGuardar, onCerrar }) {
  const [valores, setValores] = useState(() =>
    Object.fromEntries(definicion.campos.map(c => [c.campo, valorInicial(c, fila, definicion.nuevo)]))
  )
  const cambiar = (campo, v) => setValores(prev => ({ ...prev, [campo]: v }))

  const enviar = async (e) => {
    e.preventDefault()
    const listos = Object.fromEntries(definicion.campos.map(c => [c.campo, listoParaEnviar(c, valores[c.campo])]))
    const aEnviar = fila
      ? Object.fromEntries(Object.entries(listos).filter(([k, v]) => String(v ?? '') !== String(fila[k] ?? '')))
      : listos
    if (fila && Object.keys(aEnviar).length === 0) {
      onCerrar()
      return
    }
    if (await onGuardar(aEnviar)) onCerrar()
  }

  return (
    <HojaModal
      titulo={fila ? `Editar ${definicion.singular}` : `Agregar ${definicion.singular}`}
      subtitulo={fila?.nombre}
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        {definicion.campos.map(c => (
          <div key={c.campo}>
            {c.tipo === 'si_no' ? (
              <label className="flex items-center gap-3 rounded-xl border border-neutro-200 p-3 text-sm font-medium text-neutro-800">
                <input
                  id={`campo-${c.campo}`}
                  type="checkbox"
                  checked={valores[c.campo]}
                  onChange={e => cambiar(c.campo, e.target.checked)}
                  className="h-4 w-4"
                />
                {c.etiqueta}
              </label>
            ) : (
              <>
                <label htmlFor={`campo-${c.campo}`} className="label mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-500">
                  {c.etiqueta}{c.requerido && ' *'}
                </label>
                {c.tipo === 'opcion' ? (
                  <select
                    id={`campo-${c.campo}`}
                    className={CLASE_CAMPO}
                    value={valores[c.campo]}
                    onChange={e => cambiar(c.campo, e.target.value)}
                    required={c.requerido}
                  >
                    {c.opciones.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                  </select>
                ) : (
                  <input
                    id={`campo-${c.campo}`}
                    type={c.tipo === 'numero' ? 'number' : 'text'}
                    inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                    step={c.tipo === 'numero' ? c.paso : undefined}
                    min={c.tipo === 'numero' ? c.min : undefined}
                    max={c.tipo === 'numero' ? c.max : undefined}
                    maxLength={c.tipo === 'texto' ? c.max : undefined}
                    required={c.requerido}
                    className={CLASE_CAMPO}
                    value={valores[c.campo]}
                    onChange={e => cambiar(c.campo, e.target.value)}
                  />
                )}
                {c.ayuda && <p className="mt-1 text-xs text-neutro-400">{c.ayuda}</p>}
              </>
            )}
          </div>
        ))}
        <div className="flex gap-3 pt-1">
          <Boton type="button" variante="secundario" ancho onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" ancho cargando={guardando}>{fila ? 'Guardar' : 'Agregar'}</Boton>
        </div>
      </form>
    </HojaModal>
  )
}

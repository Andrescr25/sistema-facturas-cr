import { ROTACIONES_COMUNES, ROTACION_MAXIMA, avisoDeRotacion } from '../../utils/rotacionTexto'

/**
 * Cada cuántos días se visita a ESTE cliente.
 *
 * Las frecuencias de siempre van a un toque (7, 15, 22, 30) y cualquier otra
 * se escribe. No se guarda ninguna fecha: la próxima visita la calcula el
 * servidor con la última factura del cliente, así que facturarle la mueve
 * sola y nadie tiene que acordarse de actualizarla.
 */
export default function CampoRotacion({ valor, onCambiar, claseCampo }) {
  const aviso = avisoDeRotacion(valor)
  return (
    <div className="sm:col-span-2">
      <label htmlFor="cliente-rotacion_dias" className="mb-2 block text-sm font-semibold text-neutro-700">Rotación: cada cuántos días se le visita</label>
      <div className="flex flex-wrap items-center gap-2">
        {ROTACIONES_COMUNES.map(dias => {
          const elegido = String(valor) === String(dias)
          return (
            <button key={dias} type="button" aria-pressed={elegido} onClick={() => onCambiar(elegido ? '' : String(dias))}
              className={`min-h-12 rounded-xl border px-4 text-base font-bold ${elegido ? 'border-primario-800 bg-primario-800 text-white' : 'border-neutro-300 bg-white text-neutro-700 hover:border-primario-400'}`}>
              {dias} días
            </button>
          )
        })}
        <input id="cliente-rotacion_dias" type="number" inputMode="numeric" min="1" max={ROTACION_MAXIMA} step="1"
          className={`${claseCampo} sm:max-w-44`} value={valor} onChange={e => onCambiar(e.target.value)}
          placeholder="Otra cantidad" aria-describedby="cliente-rotacion_dias-ayuda" />
      </div>
      {aviso
        ? <p role="alert" className="mt-1 text-xs font-medium text-alerta-700">{aviso}</p>
        : <p id="cliente-rotacion_dias-ayuda" className="mt-1 text-xs text-neutro-500">La próxima visita se calcula sola: la fecha de su última factura más estos días. En blanco: sin rotación.</p>}
    </div>
  )
}

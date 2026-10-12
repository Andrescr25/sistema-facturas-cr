import { useState } from 'react'
import { Hash, Loader2 } from 'lucide-react'
import useNumeracionHacienda from '../../hooks/useNumeracionHacienda'
import { avisoDeUsados, numeroEscrito } from '../../utils/numeracionTexto'

/**
 * Con qué número sale el próximo comprobante, y dónde se cambia.
 *
 * POR QUÉ EXISTE (2026-10-11). El número de la próxima factura electrónica
 * vivía solo dentro de la base. Alegra dejó dos facturas con los números 4902
 * y 4946 cuando su serie iba por el 2480, y la primera factura propia salió
 * con el 4947. El usuario decidió seguir desde el 2481: es una decisión
 * fiscal suya, así que se toma acá, a la vista, y queda en la bitácora.
 *
 * Los números ya usados se saltan solos (ver numeracion.js en el servidor):
 * acá se dicen, para que no sorprenda el salto cuando llegue. Los textos
 * están en utils/numeracionTexto.js y el estado en hooks/useNumeracionHacienda.js.
 */
const INPUT = 'mt-1 w-full rounded-lg border border-neutro-200 px-3 py-2 text-sm'

function Tipo({ t, ocupado, onCambiar }) {
  const [valor, setValor] = useState('')
  const [aviso, setAviso] = useState('')
  const usados = avisoDeUsados(t)

  const cambiar = async (e) => {
    e.preventDefault()
    const falta = numeroEscrito(valor, t.proximo)
    if (falta) return setAviso(falta)
    setAviso('')
    if (await onCambiar(t, valor.trim())) setValor('')
  }

  return (
    <form onSubmit={cambiar} data-numeracion={t.tipo} className="rounded-xl border border-neutro-200 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutro-500">{t.nombre}</p>
      <p className="mt-1 text-sm text-neutro-600">La próxima sale con el</p>
      <p data-proximo className="text-3xl font-extrabold text-primario-600">{t.proximo}</p>
      {usados && <p className="mt-1 text-xs text-neutro-500">{usados}</p>}
      <label className="mt-3 block text-sm">
        Cambiar por
        <input
          className={INPUT}
          inputMode="numeric"
          maxLength={10}
          value={valor}
          disabled={ocupado}
          onChange={(e) => { setAviso(''); setValor(e.target.value) }}
          placeholder="Otro número"
        />
      </label>
      {aviso && <p role="alert" className="mt-1 text-xs text-peligro-700">{aviso}</p>}
      <button type="submit" disabled={ocupado || !valor.trim()} className="btn btn-outline mt-3 disabled:opacity-50">
        Cambiar número
      </button>
    </form>
  )
}

export default function NumeracionHacienda({ ambiente }) {
  // Lo que habla con el servidor está en el gancho; acá solo se dibuja.
  const { tipos, ocupado, error, mensaje, cambiar } = useNumeracionHacienda(ambiente)

  return (
    <div data-numeracion-hacienda className="rounded-2xl border border-neutro-200 bg-white p-5">
      <h3 className="flex items-center gap-2 font-bold">
        <Hash size={18} /> Numeración de {ambiente === 'pruebas' ? 'pruebas' : 'producción'}
      </h3>
      <p className="mt-2 text-sm text-neutro-600">
        Con este número sale el próximo comprobante de cada tipo. Un número que ya se usó no se repite: se salta solo.
      </p>
      {ambiente === 'produccion' && (
        <p className="mt-3 rounded-lg bg-alerta-50 p-3 text-sm">
          Cambiarlo es una decisión fiscal. Si volvés a emitir desde Alegra, hacelo con una numeración distinta a esta:
          Hacienda rechaza un número repetido.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-peligro-700">{error}</p>}
      {mensaje && <p role="status" className="mt-3 text-sm text-exito-700">{mensaje}</p>}
      {!tipos && !error && (
        <p className="mt-4 flex items-center gap-2 text-sm text-neutro-500">
          <Loader2 size={16} className="animate-spin" /> Leyendo la numeración…
        </p>
      )}
      {tipos && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {tipos.map((t) => <Tipo key={t.tipo} t={t} ocupado={ocupado} onCambiar={cambiar} />)}
        </div>
      )}
    </div>
  )
}

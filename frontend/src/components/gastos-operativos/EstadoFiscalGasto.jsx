import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { estadoFiscalGasto } from '../../utils/gastosOperativos'

export default function EstadoFiscalGasto({ gasto, fiscal, ocupado, onResponder }) {
  const c = fiscal?.comprobante
  const estado = estadoFiscalGasto(gasto, c?.estado)
  return (
    <section className="rounded-2xl border border-neutro-200 bg-white p-5">
      <h2 className="mb-3 font-bold text-neutro-900">Hacienda</h2>
      <Insignia tono={estado.tono}>{estado.texto}</Insignia>
      {c?.mensaje && <p className="mt-2 text-sm text-neutro-500">{c.mensaje}</p>}
      {fiscal?.motivoNoEmitible && <p className="mt-2 text-sm text-alerta-700">{fiscal.motivoNoEmitible}</p>}
      {!['aceptada', 'recibida', 'procesando'].includes(c?.estado) && gasto.compra_id && <Boton className="mt-3" variante="secundario" onClick={onResponder} disabled={Boolean(ocupado)}>Reintentar respuesta a Hacienda</Boton>}
    </section>
  )
}

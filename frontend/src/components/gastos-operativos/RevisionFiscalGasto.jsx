import { useEffect, useState } from 'react'
import { Save, Send, ShieldCheck } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { camposFiscalesGasto, RESPUESTAS_GASTO } from '../../utils/gastosOperativos'
import { formatearMoneda } from '../../utils/moneda'

const ESTADOS = { preparada: 'Preparada', recibida: 'Recibida por Hacienda', procesando: 'En proceso', aceptada: 'Respuesta aceptada por Hacienda', rechazada: 'Respuesta rechazada por Hacienda', error: 'Pendiente de reintento' }

export default function RevisionFiscalGasto({ gasto: g, fiscal, ocupado, onGuardar, onResponder }) {
  const [datos, setDatos] = useState(() => camposFiscalesGasto(g))
  useEffect(() => setDatos(camposFiscalesGasto(g)), [g])
  const cambiar = campo => e => setDatos(d => ({ ...d, [campo]: e.target.value }))
  const c = fiscal?.comprobante
  const habilitado = g.validacion === 'validado' && !g.fiscal_reservada
  return (
    <details className="rounded-2xl border border-neutro-200 bg-white p-5">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-bold text-neutro-900"><ShieldCheck size={18} /> Tratamiento tributario <Insignia tono={g.revisado_en ? 'neutro' : 'alerta'}>{g.revisado_en ? 'Revisado' : 'Por revisar'}</Insignia></summary>
      <p className="mt-3 text-sm text-neutro-500">La factura respalda el gasto. La deducción para renta y el crédito de IVA se revisan según su uso empresarial.</p>
      <form onSubmit={e => { e.preventDefault(); onGuardar({ fiscal: datos }) }} className="mt-4 space-y-4">
        <fieldset disabled={!habilitado || Boolean(ocupado)} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2">
          <label className="text-sm font-semibold text-neutro-700">Deducción para renta<select className="input mt-1 h-11 w-full" aria-label="Deducción para renta" value={datos.renta} onChange={cambiar('renta')}><option value="pendiente">Por revisar</option><option value="deducible">Deducible</option><option value="parcial">Parcialmente deducible</option><option value="no_deducible">No deducible</option></select></label>
          <label className="text-sm font-semibold text-neutro-700">Crédito de IVA<select className="input mt-1 h-11 w-full" aria-label="Crédito de IVA" value={datos.iva} onChange={cambiar('iva')}><option value="pendiente">Por revisar</option><option value="sin_credito">Sin derecho a crédito</option><option value="total">IVA aplicable en su totalidad</option><option value="parcial">IVA parcialmente acreditable</option></select><span className="mt-1 block text-xs font-normal text-neutro-500">IVA identificado en el XML: {formatearMoneda(g.iva_maximo, g.moneda)}</span></label>
          {datos.iva === 'parcial' && <label className="text-sm font-semibold text-neutro-700">IVA a acreditar<input className="input mt-1 h-11 w-full" type="number" inputMode="decimal" min="0" max={g.iva_maximo} step="0.00001" value={datos.iva_credito} onChange={cambiar('iva_credito')} required /></label>}
          {datos.renta === 'parcial' && <label className="text-sm font-semibold text-neutro-700">Gasto deducible<input className="input mt-1 h-11 w-full" type="number" inputMode="decimal" min="0" max={g.total_factura} step="0.00001" value={datos.gasto_deducible} onChange={cambiar('gasto_deducible')} required /></label>}
          <label className="text-sm font-semibold text-neutro-700 sm:col-span-2">Respuesta al comprobante<select className="input mt-1 h-11 w-full" aria-label="Respuesta al comprobante" value={datos.respuesta} onChange={cambiar('respuesta')}><option value="">Sin decidir</option>{RESPUESTAS_GASTO.map(r => <option key={r.valor} value={r.valor}>{r.texto}</option>)}</select></label>
          <label className="text-sm font-semibold text-neutro-700 sm:col-span-2">Justificación y uso empresarial<textarea className="input mt-1 w-full" rows={2} maxLength={160} aria-label="Justificación y uso empresarial" value={datos.motivo_fiscal} onChange={cambiar('motivo_fiscal')} placeholder="Jornada o reparto al que corresponde; fundamento de la decisión tributaria" /></label>
          <div className="flex justify-end sm:col-span-2"><Boton type="submit" cargando={ocupado === 'guardar'}><Save size={16} /> Guardar revisión</Boton></div>
        </fieldset>
      </form>
      <div className="mt-4 space-y-3 border-t border-neutro-100 pt-4">
        <p className="text-sm text-neutro-700">Confirmación del receptor: <strong>{ESTADOS[c?.estado] || 'Sin enviar'}</strong></p>
        {g.revisado_en && <p className="text-sm text-neutro-500">IVA a acreditar {formatearMoneda(g.iva_credito, g.moneda)} · gasto aplicable {formatearMoneda(g.gasto_deducible, g.moneda)}</p>}
        {fiscal?.motivoNoEmitible && <p className="text-sm text-alerta-700">{fiscal.motivoNoEmitible}</p>}
        {g.revisado_en && fiscal && !fiscal.motivoNoEmitible && !['aceptada', 'rechazada', 'recibida', 'procesando'].includes(c?.estado) && <Boton onClick={onResponder} disabled={Boolean(ocupado)} cargando={ocupado === 'hacienda'}><Send size={16} /> {c ? 'Reintentar respuesta' : 'Enviar respuesta a Hacienda'}</Boton>}
        {g.fiscal_reservada && <p className="text-xs text-neutro-500">Se conservan la clasificación y los importes de la respuesta preparada.</p>}
      </div>
    </details>
  )
}

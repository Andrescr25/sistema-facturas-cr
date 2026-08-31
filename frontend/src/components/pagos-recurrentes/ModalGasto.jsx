import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { CATEGORIA_INFO, FRECUENCIA_LABEL, mesNombre } from '../../utils/pagosRecurrentesUtils'
import ConfigConsultaAuto from './ConfigConsultaAuto'

// Frecuencias que no caen todos los meses y necesitan saber en cuál toca.
const NECESITA_MES = ['bimensual', 'trimestral', 'semestral', 'anual']

const VACIO = {
  nombre: '',
  categoria: 'servicios',
  proveedor: '',
  montoEstimado: '',
  frecuencia: 'mensual',
  mesReferencia: '',
  diaVencimiento: '',
  notas: '',
  fuenteAuto: null,
  configAuto: null
}

/**
 * Alta/edición de un gasto fijo. El campo "mes de referencia" solo aparece
 * para frecuencias que no son mensuales — para la luz no tiene sentido
 * preguntarlo, y para el marchamo es imprescindible saber que va en diciembre.
 */
export default function ModalGasto({ gasto, categorias, frecuencias, fuentesAuto = [], guardando, onGuardar, onCerrar }) {
  const [form, setForm] = useState(gasto ? {
    nombre: gasto.nombre || '',
    categoria: gasto.categoria || 'servicios',
    proveedor: gasto.proveedor || '',
    montoEstimado: gasto.montoEstimado ?? '',
    frecuencia: gasto.frecuencia || 'mensual',
    mesReferencia: gasto.mesReferencia ?? '',
    diaVencimiento: gasto.diaVencimiento ?? '',
    notas: gasto.notas || '',
    fuenteAuto: gasto.fuenteAuto || null,
    configAuto: gasto.configAuto || null
  } : VACIO)

  const set = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }))
  const necesitaMes = NECESITA_MES.includes(form.frecuencia)
  const puedeGuardar = form.nombre.trim() && !guardando

  const submit = async (e) => {
    e.preventDefault()
    if (!puedeGuardar) return
    const ok = await onGuardar({
      ...form,
      montoEstimado: Number(form.montoEstimado) || 0,
      mesReferencia: necesitaMes && form.mesReferencia ? Number(form.mesReferencia) : null,
      diaVencimiento: form.diaVencimiento ? Number(form.diaVencimiento) : null
    }, gasto?.id)
    if (ok) onCerrar()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-neutro-100 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl">
          <h3 className="text-lg font-bold text-neutro-900">{gasto ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</h3>
          <button onClick={onCerrar} className="text-neutro-400 hover:text-neutro-600"><X size={20} /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutro-600 mb-1">Nombre *</label>
            <input
              type="text" autoFocus value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              placeholder="Ej: Luz, Agua, Internet, Alquiler local"
              className="input w-full !py-2.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutro-600 mb-1">Categoría</label>
              <select className="input w-full !py-2.5" value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
                {(categorias.length ? categorias : Object.keys(CATEGORIA_INFO)).map(c => (
                  <option key={c} value={c}>{CATEGORIA_INFO[c]?.label || c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutro-600 mb-1">Quién cobra</label>
              <input
                type="text" value={form.proveedor}
                onChange={(e) => set('proveedor', e.target.value)}
                placeholder="ICE, AyA, Kolbi..."
                className="input w-full !py-2.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutro-600 mb-1">Monto estimado</label>
              <input
                type="number" min="0" step="100" value={form.montoEstimado}
                onChange={(e) => set('montoEstimado', e.target.value)}
                placeholder="0"
                className="input w-full !py-2.5"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutro-600 mb-1">Frecuencia</label>
              <select className="input w-full !py-2.5" value={form.frecuencia} onChange={(e) => set('frecuencia', e.target.value)}>
                {(frecuencias.length ? frecuencias : Object.keys(FRECUENCIA_LABEL)).map(f => (
                  <option key={f} value={f}>{FRECUENCIA_LABEL[f] || f}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {necesitaMes && (
              <div>
                <label className="block text-xs font-semibold text-neutro-600 mb-1">¿En qué mes toca?</label>
                <select className="input w-full !py-2.5" value={form.mesReferencia} onChange={(e) => set('mesReferencia', e.target.value)}>
                  <option value="">Elegí un mes</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m} className="capitalize">{mesNombre(m)}</option>
                  ))}
                </select>
              </div>
            )}
            {form.frecuencia !== 'quincenal' && (
              <div>
                <label className="block text-xs font-semibold text-neutro-600 mb-1">Día de vencimiento</label>
                <input
                  type="number" min="1" max="31" value={form.diaVencimiento}
                  onChange={(e) => set('diaVencimiento', e.target.value)}
                  placeholder="Ej: 15"
                  className="input w-full !py-2.5"
                />
              </div>
            )}
          </div>

          {form.frecuencia === 'quincenal' && (
            <p className="text-xs text-neutro-500 bg-neutro-50 rounded-xl p-3">
              Los quincenales generan dos pagos por mes: uno al 15 y otro al último día.
            </p>
          )}

          <ConfigConsultaAuto
            fuentes={fuentesAuto}
            fuenteAuto={form.fuenteAuto}
            configAuto={form.configAuto}
            onChange={(fuente, config) => setForm(prev => ({ ...prev, fuenteAuto: fuente, configAuto: config }))}
          />

          <div>
            <label className="block text-xs font-semibold text-neutro-600 mb-1">Notas</label>
            <textarea
              rows={2} value={form.notas}
              onChange={(e) => set('notas', e.target.value)}
              placeholder="Nº de cuenta, medidor, referencia de pago..."
              className="input w-full"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCerrar} className="btn btn-outline flex-1">Cancelar</button>
            <button type="submit" disabled={!puedeGuardar} className="btn btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              {guardando && <Loader2 size={16} className="animate-spin" />}
              {gasto ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

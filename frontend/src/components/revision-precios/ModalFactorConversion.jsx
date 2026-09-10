import { Loader2, ArrowRight } from 'lucide-react'
import { calcularFactorConversion } from '../../utils/revisionPreciosUtils'
import HojaModal from '../pagos/HojaModal'

/**
 * Cuántas unidades tuyas trae una unidad del proveedor.
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE
 * Sin este factor el sistema asume 1 a 1, y cada vez que el proveedor
 * factura por caja lo que se vende por unidad, el costo unitario queda
 * inflado y el margen sale falso. De 2.049 relaciones producto-proveedor
 * solo 93 tienen un factor declarado; el resto se está calculando 1 a 1.
 *
 * Por eso la pantalla muestra el ejemplo en vivo: la equivalencia se
 * entiende mejor viendo qué pasa con diez unidades que leyendo un número.
 *
 * Usa la hoja compartida de components/pagos/: sube desde abajo en el
 * teléfono y es diálogo centrado en grande, igual que los modales de cobrar
 * y pagar. Antes armaba su propio caparazón, y dos de sus etiquetas pedían
 * `text-xxs`, que no existe en la configuración — salían del tamaño
 * heredado.
 */
export default function ModalFactorConversion({
  producto, cantidadProveedor, setCantidadProveedor,
  cantidadMia, setCantidadMia, guardando, onGuardar, onCerrar
}) {
  const cantProv = parseFloat(cantidadProveedor) || 1
  const cantMia = parseFloat(cantidadMia) || 1
  const factor = calcularFactorConversion(cantProv, cantMia)
  const EJEMPLO = 10
  const resultado = (EJEMPLO * factor).toFixed(2)

  return (
    <HojaModal
      titulo="Factor de conversión"
      subtitulo={producto.descripcion}
      onCerrar={onCerrar}
    >
      <div className="rounded-xl border border-neutro-200 bg-neutro-50 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-400">Relacionado con</p>
        <p className="mt-0.5 font-semibold text-neutro-900">
          {producto.mapeo?.alegraName || producto.alegraName}
        </p>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-neutro-700">Definí la equivalencia</p>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="label mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-500">
              El proveedor factura
            </label>
            <input
              type="number"
              value={cantidadProveedor}
              onChange={(e) => setCantidadProveedor(e.target.value)}
              step="1"
              min="1"
              placeholder="24"
              className="input h-12 w-full rounded-xl border border-neutro-300 text-center text-lg font-bold focus:border-primario-500"
            />
          </div>

          <span className="flex h-12 shrink-0 items-center text-neutro-400">
            <ArrowRight size={18} />
          </span>

          <div className="min-w-0 flex-1">
            <label className="label mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-500">
              Vos registrás
            </label>
            <input
              type="number"
              value={cantidadMia}
              onChange={(e) => setCantidadMia(e.target.value)}
              step="1"
              min="1"
              placeholder="12"
              className="input h-12 w-full rounded-xl border border-neutro-300 text-center text-lg font-bold focus:border-primario-500"
            />
          </div>
        </div>
      </div>

      {/* El ejemplo en vivo: es lo que hace entender la equivalencia. */}
      <div className="rounded-xl border border-primario-200 bg-primario-50 p-3 text-sm text-primario-900">
        Si el proveedor factura <strong>{EJEMPLO}</strong>, en tu sistema entran{' '}
        <strong>{resultado}</strong>.
      </div>

      <div className="flex gap-3">
        <button onClick={onCerrar} className="btn btn-outline flex-1 py-3">
          Cancelar
        </button>
        <button
          onClick={onGuardar}
          disabled={guardando}
          className="btn btn-primary flex flex-1 items-center justify-center gap-2 py-3 font-bold disabled:opacity-50"
        >
          {guardando && <Loader2 size={16} className="animate-spin" />}
          {guardando ? 'Guardando…' : 'Guardar factor'}
        </button>
      </div>
    </HojaModal>
  )
}

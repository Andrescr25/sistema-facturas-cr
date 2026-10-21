import Modal from '../ui/Modal'
import { formatearMoneda } from '../../utils/moneda'
import { fechaCorta } from '../../utils/fechaCR'
export default function DetalleMovimiento({ documento: d, onCerrar }) {
  if (!d) return null
  const dinero = (n) => (n == null ? 'Por revisar' : formatearMoneda(n, d.moneda))
  return (
    <Modal titulo={d.categoria_texto || d.tipo} onCerrar={onCerrar} ancho="xl">
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-xl font-bold text-neutro-900">{d.contraparte}</h3>
          <p className="mt-1 break-all text-sm text-neutro-500">
            {d.numero} · {fechaCorta(d.fecha)}
          </p>
          <p className="mt-2 text-2xl font-extrabold text-neutro-900">{dinero(d.total)}</p>
        </div>
        {d.categoria ? (
          <>
            <p className="text-sm text-neutro-700">{d.descripcion}</p>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {[
                ['Revisión', d.revision],
                [
                  'Validación local',
                  d.validacion === 'validado' ? 'Validado' : d.motivo_validacion
                ],
                ['Gasto deducible revisado', dinero(d.gasto_deducible)],
                ['IVA acreditable revisado', dinero(d.iva_credito)],
                ['Respuesta a Hacienda', d.estado_hacienda || 'Sin enviar'],
                ['Saldo pendiente', d.saldo == null ? 'Por validar' : dinero(d.saldo)],
                ['Pagado', dinero(d.pagado)],
                ['Métodos de pago', d.metodos || 'Sin pago registrado'],
                ['Responsable', d.empleado || 'Sin asignar'],
                ['Placa', d.placa || 'Sin asignar']
              ].map(([titulo, valor]) => (
                <div key={titulo}>
                  <dt className="text-neutro-500">{titulo}</dt>
                  <dd className="mt-1 font-semibold text-neutro-800">{valor}</dd>
                </div>
              ))}
            </dl>
            {d.motivo_fiscal && (
              <p className="rounded-xl bg-neutro-50 p-3 text-sm text-neutro-600">
                {d.motivo_fiscal}
              </p>
            )}
            <p className="text-xs text-neutro-500">
              XML: {d.tiene_xml ? 'Conservado' : 'Falta adjuntar'} · PDF:{' '}
              {d.tiene_pdf ? 'Conservado' : 'Sin adjunto'}. Los originales disponibles van en el
              respaldo del mes.
            </p>
          </>
        ) : (
          <div className="divide-y divide-neutro-100">
            {d.lineas.map((l, i) => (
              <div key={i} className="flex justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-neutro-800">{l.descripcion}</p>
                  <p className="mt-1 text-neutro-500">
                    {l.cantidad} unidades · impuestos{' '}
                    {l.impuestos == null ? 'sin desglose' : dinero(l.impuestos)}
                  </p>
                </div>
                <span className="shrink-0 font-bold text-neutro-800">
                  {l.total == null ? 'Sin total de línea' : dinero(l.total)}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="break-all text-xs text-neutro-400">
          Clave: {d.clave || 'Sin clave electrónica'}
        </p>
      </div>
    </Modal>
  )
}

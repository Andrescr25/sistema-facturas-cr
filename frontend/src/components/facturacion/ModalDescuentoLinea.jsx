import { useState } from 'react'
import { Percent } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { colones, colonesExacto } from '../../utils/colones'
import { num, totalDeLinea } from '../../utils/facturaVista'

/**
 * Cambiar SOLO el descuento de un producto de la factura (2026-11-11). El
 * usuario: «que no me deje modificar cantidad ni nada, pero sí editar el
 * descuento». La cantidad y el precio se ven, no se escriben. Antes de guardar
 * se ve cómo quedan la línea y la factura; manda lo que responda el servidor.
 */
export default function ModalDescuentoLinea({ factura, linea, onGuardar, onCerrar }) {
  const [porcentaje, setPorcentaje] = useState(String(num(linea.descuentoPorcentaje)))
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const valido = porcentaje.trim() !== '' && num(porcentaje) >= 0 && num(porcentaje) <= 100
  const antes = totalDeLinea(linea)
  const despues = valido ? totalDeLinea({ ...linea, descuentoPorcentaje: num(porcentaje) }) : antes
  const totalFactura = num(factura.total) - antes + despues

  const guardar = async () => {
    if (!valido) return setError('El descuento va de 0 a 100 %.')
    setGuardando(true); setError('')
    try {
      await onGuardar(linea.numeroLinea, { descuentoPorcentaje: num(porcentaje), motivo: motivo.trim() })
      onCerrar()
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo aplicar el descuento.')
      setGuardando(false)
    }
  }

  return (
    <Modal onCerrar={onCerrar} titulo="Descuento del producto" ancho="md" hoja={false}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-semibold text-neutro-900">{linea.nombre}</p>
          <p className="text-sm text-neutro-500">
            {linea.cantidad} × {colonesExacto(linea.precioUnitario)} · la cantidad y el precio no cambian
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-neutro-700">Descuento</span>
          <span className="mt-1 flex items-center gap-2">
            <input type="number" min="0" max="100" step="0.01" inputMode="decimal" autoFocus value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)} aria-label={`Descuento de ${linea.nombre}`}
              className="input w-32 text-right text-lg font-bold" />
            <span className="text-lg font-bold text-neutro-500">%</span>
          </span>
        </label>

        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-neutro-50 p-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-neutro-500">Total del producto</dt>
            <dd className="font-bold text-neutro-900">{colones(antes)} → {colones(despues)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neutro-500">Total de la factura</dt>
            <dd className="font-bold text-neutro-900">{colones(num(factura.total))} → {colones(totalFactura)}</dd>
          </div>
        </dl>

        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 200))}
          placeholder="Motivo (opcional): queda en la bitácora" className="input w-full" />

        {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
        <div className="flex gap-2">
          <Boton variante="secundario" tamano="lg" ancho onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="alerta" tamano="lg" ancho icono={Percent} cargando={guardando} disabled={!valido} onClick={guardar}>
            Aplicar
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

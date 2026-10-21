import { useState } from 'react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { CATEGORIAS_GASTO } from '../../utils/gastosOperativos'

export default function ModalProcesarGasto({ estado: e }) {
  const [categoria, setCategoria] = useState('combustible')
  const [guardarPreferencia, setGuardarPreferencia] = useState(false)
  return (
    <Modal titulo="Procesar factura como gasto operativo" ancho="lg" onCerrar={e.cerrar} pie={<div className="flex justify-end gap-2"><Boton variante="secundario" disabled={e.guardando} onClick={e.cerrar}>Cancelar</Boton><Boton cargando={e.guardando} onClick={() => e.procesar({ categoria, guardarPreferencia })}>Registrar gasto</Boton></div>}>
      <div className="space-y-4 p-5">
        <p className="break-words font-bold text-neutro-900">{e.factura.proveedorNombre}</p>
        <p className="break-all text-sm text-neutro-500">Factura {e.factura.numeroConsecutivo}</p>
        <label className="block text-sm font-semibold text-neutro-700">Categoría<select aria-label="Categoría del nuevo gasto" className="input mt-2 h-12 w-full" value={categoria} onChange={ev => setCategoria(ev.target.value)} disabled={e.guardando}>{CATEGORIAS_GASTO.map(c => <option key={c.valor} value={c.valor}>{c.texto}</option>)}</select></label>
        <label className="flex items-start gap-3 text-sm text-neutro-700"><input type="checkbox" className="mt-1" checked={guardarPreferencia} onChange={ev => setGuardarPreferencia(ev.target.checked)} disabled={e.guardando} /><span>Guardar esta preferencia en el proveedor para sus próximas facturas.</span></label>
        <p className="rounded-xl bg-neutro-50 p-3 text-sm text-neutro-600">Se conserva el detalle del comprobante como respaldo. No modifica productos ni existencias. El pago y la respuesta a Hacienda se revisan en la ficha del gasto.</p>
        {e.error && <p role="alert" className="text-sm text-peligro-700">{e.error}</p>}
      </div>
    </Modal>
  )
}

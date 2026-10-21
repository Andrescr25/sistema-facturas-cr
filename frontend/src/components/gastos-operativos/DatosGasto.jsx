import { useState } from 'react'
import { Save } from 'lucide-react'
import Boton from '../ui/Boton'
import { CATEGORIAS_GASTO, camposGeneralesGasto } from '../../utils/gastosOperativos'

export default function DatosGasto({ gasto, ocupado, onGuardar }) {
  const [datos, setDatos] = useState(() => camposGeneralesGasto(gasto))
  const [motivo, setMotivo] = useState('')
  const cambiar = campo => e => setDatos(d => ({ ...d, [campo]: e.target.value }))
  const reclasificando = datos.categoria !== gasto.categoria
  return (
    <form onSubmit={e => { e.preventDefault(); onGuardar({ ...datos, motivo }) }} className="space-y-4 rounded-2xl border border-neutro-200 bg-white p-5">
      <h2 className="font-bold text-neutro-900">Datos del gasto</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-neutro-700">Categoría<select className="input mt-1 h-11 w-full" value={datos.categoria} onChange={cambiar('categoria')} disabled={gasto.fiscal_reservada}>{CATEGORIAS_GASTO.map(c => <option key={c.valor} value={c.valor}>{c.texto}</option>)}</select></label>
        <label className="text-sm font-semibold text-neutro-700">Empleado responsable <span className="font-normal text-neutro-400">(opcional)</span><input className="input mt-1 h-11 w-full" maxLength={160} value={datos.empleado} onChange={cambiar('empleado')} /></label>
        {datos.categoria === 'combustible' && <label className="text-sm font-semibold text-neutro-700">Vehículo o placa <span className="font-normal text-neutro-400">(opcional)</span><input className="input mt-1 h-11 w-full" maxLength={30} value={datos.placa} onChange={cambiar('placa')} /></label>}
        <label className="text-sm font-semibold text-neutro-700 sm:col-span-2">Descripción<textarea className="input mt-1 w-full" rows={2} maxLength={2000} required value={datos.descripcion} onChange={cambiar('descripcion')} /></label>
        {reclasificando && <label className="text-sm font-semibold text-neutro-700 sm:col-span-2">Motivo de la reclasificación<input className="input mt-1 h-11 w-full" maxLength={500} required value={motivo} onChange={e => setMotivo(e.target.value)} /></label>}
      </div>
      <div className="flex justify-end"><Boton type="submit" disabled={Boolean(ocupado)} cargando={ocupado === 'guardar'}><Save size={16} /> Guardar datos</Boton></div>
    </form>
  )
}

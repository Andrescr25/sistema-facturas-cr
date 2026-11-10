import { TIPOS_PERSONAL } from '../../utils/ingresosTexto'

// Los campos de cada tipo de personal. Bodega: horas y horas extra; el agente, lo demás.
const CAMPOS = [
  { clave: 'pagoHora', nombre: 'Pago por hora', prefijo: '₡', ayuda: 'Lo que gana por cada hora entre «Iniciar» y «Terminar jornada».', tipos: ['ventas', 'bodega'] },
  { clave: 'horasJornada', nombre: 'Horas de la jornada', sufijo: 'h', ayuda: 'Lo que pase de estas horas en un día es hora extra, a tiempo y medio.', tipos: ['bodega'] },
  { clave: 'comisionPorcentaje', nombre: 'Comisión', sufijo: '%', ayuda: 'Sobre sus ventas netas del mes: sin IVA y menos devoluciones.', tipos: ['ventas'] },
  { clave: 'incentivoClienteNuevo', nombre: 'Por cliente nuevo', prefijo: '₡', ayuda: 'Cuando el cliente que registró hace su primera compra.', tipos: ['ventas'] },
  { clave: 'gasolinaDiaria', nombre: 'Gasolina por día', prefijo: '₡', ayuda: 'Por cada día que marcó jornada.', tipos: ['ventas'] }
]

/**
 * El tipo de personal y sus tarifas (2026-11-09). Lo usan la ficha en
 * «Empleados» y Usuarios y permisos; con `conNinguno`, se puede elegir que no
 * lleve planilla.
 */
export default function CamposPlanilla({ valores, onCambiar, conNinguno = false, deshabilitado = false }) {
  const cambiar = (clave, valor) => onCambiar({ ...valores, [clave]: valor })
  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-semibold text-neutro-700">Tipo de personal</span>
        <select aria-label="Tipo de personal" value={valores.tipo} disabled={deshabilitado}
          onChange={e => cambiar('tipo', e.target.value)} className="input w-full">
          {conNinguno && <option value="ninguno">No lleva planilla</option>}
          {Object.entries(TIPOS_PERSONAL).map(([clave, nombre]) => <option key={clave} value={clave}>{nombre}</option>)}
        </select>
        <span className="block text-xs text-neutro-500">
          {valores.tipo === 'bodega' ? 'Marca su jornada y gana horas y horas extra.'
            : valores.tipo === 'ventas' ? 'Marca su jornada y gana horas, comisión, clientes nuevos y gasolina.'
              : 'No marca jornada ni aparece en Empleados.'}
        </span>
      </label>
      {CAMPOS.filter(c => c.tipos.includes(valores.tipo)).map(c => (
        <label key={c.clave} className="block space-y-1">
          <span className="text-sm font-semibold text-neutro-700">{c.nombre}</span>
          <span className="flex items-center gap-2">
            {c.prefijo && <span className="font-bold text-neutro-500">{c.prefijo}</span>}
            <input type="number" inputMode="decimal" min="0" step="any" aria-label={c.nombre} value={valores[c.clave]} disabled={deshabilitado}
              onChange={e => cambiar(c.clave, e.target.value === '' ? '' : Number(e.target.value))} className="input w-full" />
            {c.sufijo && <span className="font-bold text-neutro-500">{c.sufijo}</span>}
          </span>
          <span className="block text-xs text-neutro-500">{c.ayuda}</span>
        </label>
      ))}
    </div>
  )
}

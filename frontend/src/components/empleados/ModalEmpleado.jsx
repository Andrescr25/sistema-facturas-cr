import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'

// Lo que decidió el usuario (2026-10-30): 2 % de comisión, ₡2.000 por cliente
// nuevo y ₡5.000 de gasolina por día trabajado. Se pueden cambiar por empleado.
const POR_OMISION = { pagoHora: '', comisionPorcentaje: 2, incentivoClienteNuevo: 2000, gasolinaDiaria: 5000 }

const CAMPOS = [
  { clave: 'pagoHora', nombre: 'Pago por hora', prefijo: '₡', ayuda: 'Lo que gana por cada hora entre «Iniciar» y «Terminar jornada».' },
  { clave: 'comisionPorcentaje', nombre: 'Comisión', sufijo: '%', ayuda: 'Sobre sus ventas netas del mes: sin IVA y menos devoluciones.' },
  { clave: 'incentivoClienteNuevo', nombre: 'Por cliente nuevo', prefijo: '₡', ayuda: 'Cuando el cliente que registró hace su primera compra.' },
  { clave: 'gasolinaDiaria', nombre: 'Gasolina por día', prefijo: '₡', ayuda: 'Por cada día que marcó jornada.' }
]

/** Alta de un empleado o cambio de sus tarifas. Con `ficha`, edita; sin ella, elige el usuario. */
export default function ModalEmpleado({ ficha, usuariosSinFicha, guardar, onCerrar }) {
  const [usuarios, setUsuarios] = useState(null)
  const [usuarioId, setUsuarioId] = useState('')
  const [valores, setValores] = useState(ficha ? ficha.tarifas : POR_OMISION)
  const [activo, setActivo] = useState(ficha ? ficha.activo : true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (ficha) return
    usuariosSinFicha().then(setUsuarios).catch(() => setError('No se pudieron consultar los usuarios.'))
  }, [ficha, usuariosSinFicha])

  const confirmar = async () => {
    setGuardando(true); setError('')
    try {
      await guardar(ficha, { ...valores, ...(ficha ? { activo } : { usuarioId: Number(usuarioId) }) })
      onCerrar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal titulo={ficha ? `Tarifas · ${ficha.nombre}` : 'Agregar empleado'} onCerrar={guardando ? () => {} : onCerrar} pie={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        <Boton icono={Save} onClick={confirmar} cargando={guardando} disabled={(!ficha && !usuarioId) || valores.pagoHora === ''}>Guardar</Boton>
      </div>
    )}>
      <div className="space-y-4 p-4 sm:p-5">
        {!ficha && (
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-neutro-700">Usuario</span>
            <select aria-label="Usuario" value={usuarioId} onChange={e => setUsuarioId(e.target.value)} className="input w-full" disabled={!usuarios}>
              <option value="">{usuarios ? 'Elegí el usuario' : 'Cargando…'}</option>
              {(usuarios || []).map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.usuario})</option>)}
            </select>
            {usuarios?.length === 0 && <span className="text-xs text-neutro-500">Todos los usuarios activos ya son empleados: creá el usuario en Usuarios y permisos.</span>}
          </label>
        )}
        {CAMPOS.map(c => (
          <label key={c.clave} className="block space-y-1">
            <span className="text-sm font-semibold text-neutro-700">{c.nombre}</span>
            <span className="flex items-center gap-2">
              {c.prefijo && <span className="font-bold text-neutro-500">{c.prefijo}</span>}
              <input type="number" inputMode="decimal" min="0" step="any" aria-label={c.nombre} value={valores[c.clave]}
                onChange={e => setValores(v => ({ ...v, [c.clave]: e.target.value === '' ? '' : Number(e.target.value) }))} className="input w-full" />
              {c.sufijo && <span className="font-bold text-neutro-500">{c.sufijo}</span>}
            </span>
            <span className="block text-xs text-neutro-500">{c.ayuda}</span>
          </label>
        ))}
        {ficha && (
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-neutro-700">
            <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} className="h-5 w-5" />
            Activo (si no, ya no marca jornada; lo de antes se sigue viendo)
          </label>
        )}
        {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
      </div>
    </Modal>
  )
}

import { useEffect, useState } from 'react'
import { Loader2, Globe, AlertTriangle } from 'lucide-react'
import { getOpcionesFuente } from '../../services/pagosRecurrentesService'

/**
 * Configura la consulta automática de recibos de un gasto.
 *
 * Los desplegables se llenan consultando el sitio del proveedor en vivo (no
 * hay catálogo local), y la cascada importa: hay que elegir provincia para
 * que carguen los ~200 acueductos de esa provincia. Se pide así en vez de
 * hacer escribir códigos porque nadie sabe de memoria que "Rincón de
 * Zaragoza" es el 108.
 */
export default function ConfigConsultaAuto({ fuentes, fuenteAuto, configAuto, onChange }) {
  const [provincias, setProvincias] = useState([])
  const [acueductos, setAcueductos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  const config = configAuto || {}
  const esAcueductos = fuenteAuto === 'acueductoscr'
  // La fuente elegida describe sus propios campos (camposInfo), así que
  // agregar una nueva no obliga a tocar esta pantalla. El acueducto es la
  // excepción: necesita desplegables en cascada y tiene formulario a medida.
  const fuenteSeleccionada = fuentes.find(f => f.clave === fuenteAuto) || null
  const camposGenericos = fuenteSeleccionada && !fuenteSeleccionada.formularioPropio
    ? (fuenteSeleccionada.campos || [])
    : []

  // Provincias: una sola vez al elegir la fuente
  useEffect(() => {
    if (!esAcueductos) return
    setCargando(true)
    setError(null)
    getOpcionesFuente('acueductoscr')
      .then(d => { if (d.success) setProvincias(d.provincias || []) })
      .catch(() => setError('No se pudo consultar el sitio de acueductos.'))
      .finally(() => setCargando(false))
  }, [esAcueductos])

  // Acueductos: cada vez que cambia la provincia
  useEffect(() => {
    if (!esAcueductos || !config.provincia) { setAcueductos([]); return }
    setCargando(true)
    setError(null)
    getOpcionesFuente('acueductoscr', { provincia: config.provincia })
      .then(d => { if (d.success) setAcueductos(d.acueductos || []) })
      .catch(() => setError('No se pudieron cargar los acueductos de esa provincia.'))
      .finally(() => setCargando(false))
  }, [esAcueductos, config.provincia])

  const setCampo = (campo, valor) => {
    const siguiente = { ...config, [campo]: valor }
    // Cambiar de provincia invalida el acueducto elegido.
    if (campo === 'provincia') delete siguiente.acueducto
    onChange(fuenteAuto, siguiente)
  }

  return (
    <div className="border border-neutro-200 rounded-2xl p-4 space-y-3 bg-neutro-50/50">
      <div className="flex items-center gap-2">
        <Globe size={15} className="text-primario-600" />
        <h4 className="text-sm font-bold text-neutro-800">Consulta automática</h4>
        {cargando && <Loader2 size={14} className="animate-spin text-primario-500" />}
      </div>
      <p className="text-xs text-neutro-500 -mt-1">
        Trae el monto y la fecha de vencimiento del recibo real, así aparece solo cuando toca pagarlo.
      </p>

      <select
        className="input w-full !py-2.5"
        value={fuenteAuto || ''}
        onChange={(e) => onChange(e.target.value || null, e.target.value ? {} : null)}
      >
        <option value="">Sin consulta automática (monto manual)</option>
        {fuentes.map(f => <option key={f.clave} value={f.clave}>{f.label}</option>)}
      </select>

      {error && (
        <p className="text-xs text-peligro-600 flex items-center gap-1.5">
          <AlertTriangle size={13} /> {error}
        </p>
      )}

      {/* Campos de texto de cualquier fuente que no tenga formulario propio
          (ICE, facturas por correo). Antes solo se dibujaban los del
          acueducto, así que esas fuentes se podían elegir pero no configurar. */}
      {camposGenericos.length > 0 && (
        <div className="space-y-3">
          {camposGenericos.map(campo => {
            const info = fuenteSeleccionada.camposInfo?.[campo] || {}
            return (
              <div key={campo}>
                <label className="block text-xs font-semibold text-neutro-600 mb-1">
                  {info.label || campo}
                </label>
                <input
                  type="text"
                  className="input w-full !py-2.5"
                  placeholder={info.placeholder || ''}
                  value={config[campo] || ''}
                  onChange={(e) => setCampo(campo, e.target.value)}
                />
                {info.ayuda && (
                  <p className="text-[11px] text-neutro-400 mt-1">{info.ayuda}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {esAcueductos && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-neutro-600 mb-1">Provincia</label>
            <select
              className="input w-full !py-2.5"
              value={config.provincia || ''}
              onChange={(e) => setCampo('provincia', e.target.value)}
            >
              <option value="">Elegí una provincia</option>
              {provincias.map(p => <option key={p.valor} value={p.valor}>{p.nombre}</option>)}
            </select>
          </div>

          {config.provincia && (
            <div>
              <label className="block text-xs font-semibold text-neutro-600 mb-1">
                Acueducto {acueductos.length > 0 && <span className="text-neutro-400 font-normal">({acueductos.length})</span>}
              </label>
              <select
                className="input w-full !py-2.5"
                value={config.acueducto || ''}
                onChange={(e) => setCampo('acueducto', e.target.value)}
                disabled={acueductos.length === 0}
              >
                <option value="">Elegí un acueducto</option>
                {acueductos.map(a => <option key={a.valor} value={a.valor}>{a.nombre}</option>)}
              </select>
            </div>
          )}

          {config.acueducto && (
            <div>
              <label className="block text-xs font-semibold text-neutro-600 mb-1"># Paja</label>
              <input
                type="text"
                className="input w-full !py-2.5"
                placeholder="Ej: 1573"
                value={config.medidor || ''}
                onChange={(e) => setCampo('medidor', e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

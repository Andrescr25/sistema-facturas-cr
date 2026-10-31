import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import ElegirPunto from './ElegirPunto'
import ElegirRotacion from './ElegirRotacion'
import { useClienteNuevo } from '../../hooks/useClienteNuevo'
import { TIPOS_IDENTIFICACION, avisoIdentificacion } from '../../utils/identificacionCliente'

// Los que sirven para un cliente que se consigue en la calle: con cédula.
const TIPOS = TIPOS_IDENTIFICACION.filter(t => t.valor !== 'NO_CONTRIBUYENTE')
const CAMPO = 'input min-h-12 w-full text-base'
const ETIQUETA = 'text-sm font-semibold text-neutro-700'

/**
 * «Cliente nuevo» (E2 de la planilla, 2026-10-30): el agente registra un
 * negocio que encontró en su ruta. Queda al final de la ruta y a su nombre:
 * cuando haga su primera compra, cuenta como cliente nuevo suyo. Por eso pide
 * la cédula de verdad (el servidor rechaza la genérica y la que ya tiene ficha).
 */
export default function ModalClienteNuevo({ ruta, onCerrar, onGuardado }) {
  const [v, setV] = useState({ nombre: '', tipoIdentificacion: 'CF', identificacion: '', celular: '', correo: '', otrasSenas: '' })
  const [rotacion, setRotacion] = useState('15')
  const [punto, setPunto] = useState(null)
  const { guardar, guardando, error } = useClienteNuevo()
  const campo = (clave) => ({ value: v[clave], onChange: (e) => setV(x => ({ ...x, [clave]: e.target.value })) })
  const identificacion = v.identificacion.replace(/[\s-]/g, '')
  const aviso = avisoIdentificacion(TIPOS.find(t => t.valor === v.tipoIdentificacion), identificacion)

  const confirmar = async () => {
    const cliente = await guardar({
      ...v, rutaId: ruta.id, rotacionDias: rotacion,
      ubicacion: punto ? { latitud: punto.lat, longitud: punto.lng } : undefined
    })
    if (cliente) onGuardado(cliente)
  }

  return (
    <Modal titulo={`Cliente nuevo · ${ruta.nombre}`} ancho="lg" onCerrar={guardando ? () => {} : onCerrar} pie={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        <Boton icono={UserPlus} onClick={confirmar} cargando={guardando} disabled={!v.nombre.trim() || !identificacion || Boolean(aviso)}>Registrar cliente</Boton>
      </div>
    )}>
      <div className="space-y-5 p-4 sm:p-5">
        <label className="block space-y-1">
          <span className={ETIQUETA}>Nombre del negocio o del cliente *</span>
          <input aria-label="Nombre" autoComplete="off" className={CAMPO} {...campo('nombre')} />
        </label>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <label className="block space-y-1">
            <span className={ETIQUETA}>Tipo</span>
            <select aria-label="Tipo de identificación" className={CAMPO} {...campo('tipoIdentificacion')}>
              {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={ETIQUETA}>Identificación *</span>
            <input aria-label="Identificación" inputMode={v.tipoIdentificacion === 'EXTRANJERO' ? 'text' : 'numeric'} autoComplete="off" className={CAMPO} {...campo('identificacion')} />
          </label>
        </div>
        {aviso && <p className="rounded-xl bg-alerta-50 px-3 py-2 text-sm text-alerta-800">{aviso}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={ETIQUETA}>Celular (WhatsApp)</span>
            <input aria-label="Celular" type="tel" inputMode="tel" className={CAMPO} {...campo('celular')} />
          </label>
          <label className="block space-y-1">
            <span className={ETIQUETA}>Correo (para la factura electrónica)</span>
            <input aria-label="Correo" type="email" inputMode="email" className={CAMPO} {...campo('correo')} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className={ETIQUETA}>Otras señas</span>
          <textarea aria-label="Otras señas" rows={2} maxLength={2000} className="input w-full text-sm" placeholder="Ej.: 100 m al sur de la iglesia, portón verde" {...campo('otrasSenas')} />
        </label>
        <fieldset className="space-y-2">
          <legend className={`${ETIQUETA} mb-2`}>¿Cada cuántos días se le visita?</legend>
          <ElegirRotacion dias={rotacion} onCambiar={setRotacion} />
        </fieldset>
        <fieldset className="space-y-2">
          <legend className={`${ETIQUETA} mb-2`}>Ubicación del local</legend>
          <ElegirPunto punto={punto} onCambiar={setPunto} alto="h-[38vh] min-h-[240px]" />
        </fieldset>
        {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
        <p className="text-xs text-neutro-500">Queda al final de la ruta y a tu nombre: cuando haga su primera compra, cuenta como cliente nuevo tuyo.</p>
      </div>
    </Modal>
  )
}

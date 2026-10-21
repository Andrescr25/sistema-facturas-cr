import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
/** Reutiliza la libreta y el envío del reporte; el correo sale por acción explícita. */
export default function ModalEnviarContador({ estado: e }) {
  const [id, setId] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (e.modal) {
      setId((v) => v || String(e.contactos[0]?.id || ''))
      setError('')
    }
  }, [e.modal, e.contactos])
  if (!e.modal) return null
  const guardar = async (ev) => {
    ev.preventDefault()
    setGuardando(true)
    const r = await e.crearContacto({ nombre, email })
    setGuardando(false)
    if (r.ok) {
      setId(String(r.contacto.id))
      setNuevo(false)
      setNombre('')
      setEmail('')
    } else setError(r.mensaje)
  }
  const enviar = async () => {
    if ((await e.enviar(id)).ok) e.setModal(false)
  }
  const contacto = e.contactos.find((c) => String(c.id) === id)
  return (
    <Modal
      titulo="Enviar al contador"
      onCerrar={() => {
        if (!e.ocupado) e.setModal(false)
      }}
      pie={
        <div className="flex justify-end gap-2">
          <Boton
            variante="secundario"
            disabled={Boolean(e.ocupado)}
            onClick={() => e.setModal(false)}
          >
            Cancelar
          </Boton>
          <Boton
            onClick={enviar}
            cargando={e.ocupado === 'enviar'}
            disabled={!contacto || !e.envioDisponible || guardando || Boolean(e.ocupado)}
          >
            Enviar reporte mensual
          </Boton>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-sm text-neutro-600">
          Mes {e.datos.etiqueta}: Excel con ventas, notas de crédito, compras y gastos operativos.
          Incluye un ZIP con los XML/PDF disponibles de los gastos y la lista de respaldos
          faltantes.
        </p>
        {!e.datos.finalizado && (
          <p className="text-sm text-alerta-700">
            El mes sigue en curso; las cifras son provisionales.
          </p>
        )}
        <label className="block text-sm font-bold text-neutro-700">
          Enviar a
          <select
            aria-label="Contacto del contador"
            className="input mt-1 h-11 w-full"
            value={id}
            onChange={(ev) => setId(ev.target.value)}
          >
            <option value="">Elegí un contacto</option>
            {e.contactos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {c.email}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={() => setNuevo((v) => !v)}>
            Agregar contacto
          </Boton>
          {contacto && (
            <Boton variante="fantasma" onClick={() => e.eliminarContacto(contacto)}>
              Eliminar contacto
            </Boton>
          )}
        </div>
        {nuevo && (
          <form onSubmit={guardar} className="space-y-3 rounded-xl bg-neutro-50 p-3">
            <input
              aria-label="Nombre del contacto"
              className="input w-full"
              required
              maxLength={150}
              placeholder="Nombre"
              value={nombre}
              onChange={(ev) => setNombre(ev.target.value)}
            />
            <input
              aria-label="Correo del contacto"
              className="input w-full"
              type="email"
              required
              maxLength={200}
              placeholder="Correo"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
            <Boton type="submit" cargando={guardando}>
              Guardar contacto
            </Boton>
          </form>
        )}
        {!e.envioDisponible && (
          <p className="text-sm text-alerta-700">
            El envío de correo no está configurado. Podés descargar los archivos desde el reporte.
          </p>
        )}
        {(error || e.error) && (
          <p role="alert" className="text-sm text-peligro-700">
            {error || e.error}
          </p>
        )}
      </div>
    </Modal>
  )
}

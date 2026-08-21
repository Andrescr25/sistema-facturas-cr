import { UserCheck, X } from 'lucide-react'

/**
 * Única señal visible de que hay un cliente seleccionado — el catálogo
 * personalizado no se distingue de otra forma para no filtrar quién es
 * cliente frecuente frente a cualquiera que mire la pantalla.
 */
export default function ClienteActivoBanner({ clienteActivo, onSalir }) {
  if (!clienteActivo) return null

  return (
    <div className="cliente-activo-banner">
      <div className="cliente-activo-info">
        <UserCheck size={16} />
        <span>
          Atendiendo a <strong>{clienteActivo.n || 'este cliente'}</strong>
        </span>
      </div>
      <button className="cliente-activo-salir" onClick={onSalir} aria-label="Dejar de atender a este cliente">
        <X size={16} />
      </button>
    </div>
  )
}

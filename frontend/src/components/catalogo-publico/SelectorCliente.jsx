import { useEffect, useMemo, useState } from 'react'
import { Search, X, User } from 'lucide-react'
import { filtrarClientes } from '../../utils/catalogoClienteUtils'

/**
 * Sheet oculto para elegir el cliente que se está visitando. Se abre solo
 * con el long-press en el logo (ver HeaderCatalogo.jsx) — el catálogo
 * es público y sin login, así que la lista completa de clientes (y cuánto
 * compra cada uno) no puede quedar a la vista de cualquiera que abra la URL.
 */
export default function SelectorCliente({ isOpen, onClose, clientes, clienteActivoId, onSeleccionar }) {
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (isOpen) setBusqueda('')
  }, [isOpen])

  const clientesFiltrados = useMemo(() => {
    const ordenados = [...clientes].sort((a, b) => (a.n || '').localeCompare(b.n || ''))
    return filtrarClientes(ordenados, busqueda)
  }, [clientes, busqueda])

  if (!isOpen) return null

  const elegir = (id) => {
    onSeleccionar(id)
    onClose()
  }

  return (
    <div className="selector-cliente-backdrop" onClick={onClose}>
      <div className="selector-cliente-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="selector-cliente-handle" />
        <div className="selector-cliente-header">
          <h3>¿A quién estás visitando?</h3>
          <button className="selector-cliente-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="selector-cliente-search">
          <div className="search-box">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              className="search-input"
              placeholder="Buscar cliente..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="selector-cliente-lista">
          {clientes.length === 0 ? (
            <div className="selector-cliente-vacio">
              <User size={32} />
              <p>Sincronizá el catálogo para cargar clientes.</p>
              <p className="selector-cliente-vacio-hint">Mantené presionado el logo, con internet, para actualizar.</p>
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="selector-cliente-vacio">
              <p>No encontramos a "{busqueda}".</p>
            </div>
          ) : (
            clientesFiltrados.map((cliente) => (
              <button
                key={cliente.id}
                className={`selector-cliente-item ${cliente.id === clienteActivoId ? 'selector-cliente-item-activo' : ''}`}
                onClick={() => elegir(cliente.id)}
              >
                <span className="selector-cliente-nombre">{cliente.n || 'Cliente sin nombre'}</span>
                <span className="selector-cliente-count">{cliente.p?.length || 0} productos</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

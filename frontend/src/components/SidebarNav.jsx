import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Navegación del sidebar, compartida por la versión móvil y la de escritorio
 * (antes el mismo <nav> estaba copiado dos veces en Layout.jsx, así que
 * agregar un submenú habría significado mantener la misma lógica duplicada).
 *
 * Un ítem con `children` es un grupo desplegable; arranca abierto si la ruta
 * actual está adentro, para que nunca haya que abrir un menú a mano para ver
 * dónde estás parado.
 */
function ItemGrupo({ item, isActive, onNavigate }) {
  const Icon = item.icon
  const hayHijoActivo = item.children.some(child => isActive(child.href))
  const [abierto, setAbierto] = useState(hayHijoActivo)

  return (
    <div className="mb-1">
      <button
        onClick={() => setAbierto(v => !v)}
        className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          hayHijoActivo && !abierto ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <Icon size={20} className="mr-3 shrink-0" />
        <span className="flex-1 text-left">{item.name}</span>
        {abierto ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>

      {abierto && (
        <div className="mt-1 ml-4 pl-3 border-l border-gray-200 space-y-1">
          {item.children.map(child => {
            const ChildIcon = child.icon
            return (
              <Link
                key={child.name}
                to={child.href}
                onClick={onNavigate}
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                  isActive(child.href) ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ChildIcon size={17} className="mr-2.5 shrink-0" />
                {child.name}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SidebarNav({ navigation, isActive, onNavigate }) {
  return (
    <nav className="flex-1 px-4 py-4">
      {navigation.map((item) => {
        if (item.children) {
          return <ItemGrupo key={item.name} item={item} isActive={isActive} onNavigate={onNavigate} />
        }

        const Icon = item.icon
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavigate}
            className={`flex items-center px-4 py-2 text-sm font-medium rounded-md mb-1 ${
              isActive(item.href) ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon size={20} className="mr-3 shrink-0" />
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}

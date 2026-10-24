import { useMemo } from 'react'
import { gruposCatalogoClientes } from '../../utils/gruposCatalogoClientes'
import TarjetaProducto from './TarjetaProducto'
import MarcaProductos from './MarcaProductos'

export default function GruposProductos({ productos, carrito, onCambiar, onAbrir }) {
  const grupos = useMemo(() => gruposCatalogoClientes(productos), [productos])
  return grupos.map(categoria => (
    <section key={categoria.nombre} aria-label={categoria.nombreVisible} className="mb-8 space-y-4">
      <h2 className="border-b border-neutro-200 pb-2 text-lg font-bold tracking-tight text-neutro-900">{categoria.nombreVisible}</h2>
      {categoria.subcategorias.map(sub => (
        <section key={sub.id} aria-label={sub.nombre || categoria.nombreVisible} className="space-y-3">
          {sub.nombre && <h3 className="text-sm font-semibold text-neutro-600">{sub.nombre}</h3>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sub.items.map(item => item.esMarca ? (
              <MarcaProductos key={item.id} grupo={item} carrito={carrito} onCambiar={onCambiar} onAbrir={onAbrir} />
            ) : (
              <TarjetaProducto key={item.id} producto={item} cantidad={carrito[item.id]?.cantidad || 0}
                onCambiar={onCambiar} onAbrir={() => onAbrir(item.id, item)} />
            ))}
          </div>
        </section>
      ))}
    </section>
  ))
}

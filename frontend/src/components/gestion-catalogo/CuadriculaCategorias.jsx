import { useState } from 'react'
import { FolderPlus, Move, PackageSearch } from 'lucide-react'
import Boton from '../ui/Boton'
import TarjetaCategoria from './TarjetaCategoria'

function NuevaCategoria({ onCrear }) {
  const [nombre, setNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState(null)

  const crear = async () => {
    const limpio = nombre.trim()
    if (!limpio) return
    setCreando(true); setError(null)
    try {
      await onCrear(limpio)
      setNombre('')
    } catch (e) {
      setError(e?.response?.data?.message || 'No se pudo crear la categoría.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="flex flex-col justify-center gap-4 rounded-xl border-2 border-dashed border-neutro-200 bg-neutro-50/60 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-white p-3 ring-1 ring-neutro-200">
          <FolderPlus size={24} className="text-neutro-500" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-neutro-800">Nueva categoría</h3>
          <p className="text-sm text-neutro-500">Queda al final; después se puede mover.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') crear() }}
          placeholder="Nombre de la categoría"
          className="min-w-0 flex-1 rounded-xl border border-neutro-200 bg-white px-3 py-2.5 text-sm text-neutro-900 focus:border-primario-400 focus:outline-none focus:ring-2 focus:ring-primario-500/30"
        />
        <Boton onClick={crear} cargando={creando} disabled={!nombre.trim()}>Crear</Boton>
      </div>
      {error && <p className="text-sm font-semibold text-peligro-600">{error}</p>}
    </div>
  )
}

/**
 * La entrada de Gestión de Catálogo: una tarjeta grande por categoría, en el
 * orden en que las ve el agente. Mientras se arrastra una subcategoría, un
 * aviso arriba explica qué va a pasar al soltarla.
 */
export default function CuadriculaCategorias({
  categorias,
  filtrada,
  puedeCrear = true,
  onEntrar,
  onReordenar,
  onSoltarSubcategoria,
  onCrearCategoria
}) {
  const [arrastrando, setArrastrando] = useState(null)

  const mover = (nombre, delta) => {
    const orden = categorias.map((c) => c.name)
    const i = orden.indexOf(nombre)
    const j = i + delta
    if (i === -1 || j < 0 || j >= orden.length) return
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
    onReordenar(orden)
  }

  if (filtrada && categorias.length === 0) {
    return (
      <div className="rounded-xl border border-neutro-100 bg-white py-16 text-center shadow-sm">
        <PackageSearch className="mx-auto mb-4 text-neutro-300" size={64} />
        <h3 className="mb-2 text-xl font-bold text-neutro-900">Nada pendiente acá</h3>
        <p className="text-neutro-500">Ninguna categoría tiene productos en esa situación. Tocá la tarjeta de arriba otra vez para ver todas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {arrastrando && (
        <div className="flex items-center gap-3 rounded-xl border border-primario-200 bg-primario-50 px-5 py-4 text-primario-800">
          <Move size={22} className="shrink-0" />
          <p className="text-base">
            Soltá <strong>"{arrastrando.nombre}"</strong> sobre la categoría a la que se va.
            Sus {arrastrando.productos} producto{arrastrando.productos === 1 ? '' : 's'} cambian de categoría.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {categorias.map((c, i) => (
          <TarjetaCategoria
            key={c.name}
            categoria={c}
            arrastrando={arrastrando}
            puedeReordenar={!filtrada && !arrastrando}
            esPrimera={i === 0}
            esUltima={i === categorias.length - 1}
            onEntrar={onEntrar}
            onArrastrarSub={setArrastrando}
            onTerminarArrastre={() => setArrastrando(null)}
            onSoltarSubcategoria={(sub, destino) => { setArrastrando(null); onSoltarSubcategoria(sub, destino) }}
            onSubir={() => mover(c.name, -1)}
            onBajar={() => mover(c.name, 1)}
          />
        ))}
        {!filtrada && puedeCrear && <NuevaCategoria onCrear={onCrearCategoria} />}
      </div>
    </div>
  )
}

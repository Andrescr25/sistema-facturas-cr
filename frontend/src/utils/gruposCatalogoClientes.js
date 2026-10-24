import { agruparMarcasCatalogo } from './marcasCatalogo.js'

/** Agrupa solo lo recibido. Al sumar páginas continúa la marca anterior;
 * no descarga el catálogo completo ni trae variantes excluidas por el filtro. */
export function gruposCatalogoClientes(productos) {
  const categorias = new Map()
  for (const producto of productos) {
    const nombre = producto.categoria || 'Sin categoría'
    if (!categorias.has(nombre)) categorias.set(nombre, {
      nombre, nombreVisible: producto.categoriaVisible || nombre, subcategorias: new Map()
    })
    const categoria = categorias.get(nombre)
    const id = producto.subcategoria?.id || 'otros'
    if (!categoria.subcategorias.has(id)) categoria.subcategorias.set(id, {
      id, nombre: producto.subcategoria?.nombre || 'Otros', productos: []
    })
    categoria.subcategorias.get(id).productos.push(producto)
  }
  return [...categorias.values()].map(categoria => ({
    ...categoria,
    subcategorias: [...categoria.subcategorias.values()].map(sub => ({
      id: sub.id,
      nombre: sub.id === 'otros' && categoria.subcategorias.size === 1 ? '' : sub.nombre,
      items: agruparMarcasCatalogo(sub.productos)
    }))
  }))
}

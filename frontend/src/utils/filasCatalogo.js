/** Conserva el orden y llena las filas incluso si cambia la subcategoría. */
export function filasDelCatalogo(productos, familias, columnas) {
  const grupos = familias?.filter(f => f.productos.length) || []
  const lista = familias
    ? grupos.flatMap((f, familia) => f.productos.map(producto => ({ producto, familia })))
    : productos.map(producto => ({ producto, familia: null }))
  const filas = []
  const vistas = new Set()
  const inicioPorFamilia = new Map()
  for (let i = 0; i < lista.length; i += columnas) {
    const fichas = lista.slice(i, i + columnas)
    const indices = [...new Set(fichas.map(f => f.familia).filter(f => f !== null))]
    const comienzaFamilia = indices.some(f => !vistas.has(f))
    for (const f of indices) {
      if (!vistas.has(f)) inicioPorFamilia.set(f, filas.length)
      vistas.add(f)
    }
    filas.push({ productos: fichas.map(f => f.producto), familias: comienzaFamilia ? indices : [] })
  }
  return { filas, grupos, inicioPorFamilia }
}

export function nombreDeFamilia(familia) {
  return familia.sinClasificar ? 'Sin subcategoría' : familia.nombre
}

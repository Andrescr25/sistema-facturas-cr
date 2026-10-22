/**
 * La portada de una marca ocupa dos casillas (la fila entera en tablet y
 * teléfono): es la presentación de sus productos, no una tarjeta más
 * (pedido del usuario, 2026-10-22). Las demás fichas, una.
 */
export const anchoEnFila = (producto, columnas) => (producto?.esMarca ? Math.min(2, columnas) : 1)

/**
 * Conserva el orden y llena las filas incluso si cambia la subcategoría
 * (pedido del usuario, 2026-10-07: «llenar las filas»).
 *
 * Cuando la portada que sigue no cabe en lo que queda de la fila, la fila se
 * completa con la siguiente ficha suelta DE LA MISMA SUBCATEGORÍA, que se
 * adelanta a la portada. Solo queda una casilla libre si no hay ninguna.
 */
export function filasDelCatalogo(productos, familias, columnas) {
  const grupos = familias?.filter(f => f.productos.length) || []
  const pendientes = familias
    ? grupos.flatMap((f, familia) => f.productos.map(producto => ({ producto, familia })))
    : productos.map(producto => ({ producto, familia: null }))
  const ancho = f => anchoEnFila(f.producto, columnas)
  const filas = []
  const vistas = new Set()
  const inicioPorFamilia = new Map()
  while (pendientes.length) {
    const fichas = []
    let ocupadas = 0
    while (pendientes.length && ocupadas + ancho(pendientes[0]) <= columnas) {
      ocupadas += ancho(pendientes[0])
      fichas.push(pendientes.shift())
    }
    for (let k = 0; ocupadas < columnas && k < pendientes.length && pendientes[k].familia === pendientes[0].familia; k++) {
      if (ancho(pendientes[k]) > columnas - ocupadas) continue
      ocupadas += ancho(pendientes[k])
      fichas.push(...pendientes.splice(k--, 1))
    }
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

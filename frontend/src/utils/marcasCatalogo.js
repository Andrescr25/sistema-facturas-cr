/** Una marca solo reúne las presentaciones recibidas: respeta filtros/ofertas. */
export function agruparMarcasCatalogo(productos) {
  const resultado = []
  const grupos = new Map()
  for (const p of productos) {
    if (!p.marca?.id) { resultado.push(p); continue }
    // El id identifica la marca EN su subcategoría; el nombre no es identidad.
    const clave = String(p.marca.id)
    if (!grupos.has(clave)) {
      const grupo = { id: `marca-${clave}`, esMarca: true, marca: p.marca, presentaciones: [] }
      grupos.set(clave, grupo)
      resultado.push(grupo)
    }
    grupos.get(clave).presentaciones.push(p)
  }
  for (const grupo of grupos.values()) {
    grupo.presentaciones.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { numeric: true }) || String(a.id).localeCompare(String(b.id)))
  }
  return resultado
}

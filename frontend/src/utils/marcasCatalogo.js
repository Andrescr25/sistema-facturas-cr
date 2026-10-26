const alfabeto = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
const nombreDe = p => String(p.name || p.nombre || '').trim().normalize('NFC')

function partesDe(nombre) {
  return (nombre.match(/\d+(?:[.,]\d+)?(?:\s+\d+\/\d+|\/\d+)?|[^\d]+/g) || []).map(parte => {
    if (!/^\d/.test(parte)) return parte
    const fraccion = parte.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/)
    if (fraccion && Number(fraccion[3])) return Number(fraccion[1] || 0) + Number(fraccion[2]) / Number(fraccion[3])
    return Number(parte.replace(',', '.'))
  })
}

/** Alfabético español, con medidas reales: 1/2, 3/4, 1, 1 1/4, 1 1/2, 2. */
export function compararPresentaciones(a, b) {
  const nombreA = nombreDe(a), nombreB = nombreDe(b)
  const partesA = partesDe(nombreA), partesB = partesDe(nombreB)
  for (let i = 0; i < Math.min(partesA.length, partesB.length); i++) {
    const x = partesA[i], y = partesB[i]
    const diferencia = typeof x === 'number' && typeof y === 'number' ? x - y : alfabeto.compare(String(x), String(y))
    if (diferencia) return diferencia
  }
  return partesA.length - partesB.length || alfabeto.compare(nombreA, nombreB) || alfabeto.compare(String(a.id), String(b.id))
}

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
    grupo.presentaciones.sort(compararPresentaciones)
  }
  return resultado
}

/** Gestión conserva sus filas: sólo intercambia presentaciones de una misma marca. */
export function ordenarPresentacionesMarcadas(productos) {
  const grupos = new Map(agruparMarcasCatalogo(productos).filter(g => g.esMarca)
    .map(g => [String(g.marca.id), { lista: g.presentaciones, indice: 0 }]))
  return productos.map(p => {
    if (!p.marca?.id) return p
    const grupo = grupos.get(String(p.marca.id))
    return grupo.lista[grupo.indice++]
  })
}

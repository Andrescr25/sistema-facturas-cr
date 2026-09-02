/**
 * La búsqueda del catálogo del agente.
 *
 * CÓMO SE USA DE VERDAD
 * El agente está de pie, con el cliente enfrente, y el cliente le dice un
 * código o media palabra. Necesita que lo que busca aparezca PRIMERO, no que
 * aparezca en algún lugar de una lista.
 *
 * Antes era un `includes` sobre nombre o referencia, y los resultados salían
 * ordenados alfabéticamente por categoría. Escribir la referencia exacta
 * "167" devolvía también "1670", "2167" y cualquier producto con 167 en el
 * nombre, todos mezclados: el que se buscaba podía quedar en el medio.
 *
 * LAS REGLAS, EN ORDEN
 *
 *   1. referencia exacta        el agente escribió el código completo
 *   2. referencia empieza con   está escribiendo el código
 *   3. referencia contiene
 *   4. nombre empieza con
 *   5. nombre contiene todas las palabras
 *
 * Y si lo que se escribe son SOLO dígitos, es casi seguro un código: ahí la
 * referencia pesa todavía más y las coincidencias por nombre bajan.
 *
 * Vive fuera del hook para poder probarla sin navegador. Es la lógica que
 * decide qué ve el agente, y equivocarse acá se paga con tiempo delante del
 * cliente.
 */

/**
 * Minúsculas y sin tildes.
 *
 * Sin esto "CAÑA" no encuentra "caña" ni "cana": el agente teclea rápido y en
 * una tablet las tildes son un estorbo. La ñ se conserva —es otra letra, no
 * una n con adorno— salvo que se escriba sin ella, caso que cubre el
 * reemplazo explícito de abajo.
 */
export function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u0302\u0304-\u036f]/g, '')  // acentos sí; la tilde de la ñ (U+0303) no
    .normalize('NFC')   // se recompone: si no, la ñ queda como n + tilde suelta
    .trim()
}

/** Igual que normalizar, pero además convierte ñ en n. */
function sinEnie(texto) {
  return normalizar(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const PUNTAJE = {
  REFERENCIA_EXACTA: 1000,
  REFERENCIA_EMPIEZA: 800,
  REFERENCIA_CONTIENE: 600,
  NOMBRE_EMPIEZA: 400,
  NOMBRE_PALABRA_EXACTA: 300,
  NOMBRE_CONTIENE: 200,
}

/**
 * Puntúa un producto contra lo que se escribió. 0 = no aparece.
 *
 * Exportada para poder probar el criterio en sí, no solo el resultado final.
 */
export function puntuar(producto, termino) {
  const t = normalizar(termino)
  if (!t) return 0

  const ref = normalizar(producto.reference?.reference ?? producto.reference ?? '')
  const nombre = normalizar(producto.name ?? producto.nombre ?? '')
  const soloDigitos = /^\d+$/.test(t)

  if (ref && ref === t) return PUNTAJE.REFERENCIA_EXACTA
  if (ref && ref.startsWith(t)) return PUNTAJE.REFERENCIA_EMPIEZA
  if (ref && ref.includes(t)) return PUNTAJE.REFERENCIA_CONTIENE

  // Un código no se busca por nombre. Si se escribieron solo dígitos y la
  // referencia no coincidió, que "500" aparezca porque el nombre dice "500ML"
  // es ruido justo cuando el agente quiere precisión.
  if (soloDigitos) {
    return nombre.includes(t) ? PUNTAJE.NOMBRE_CONTIENE / 2 : 0
  }

  const nombreSinEnie = sinEnie(nombre)
  const tSinEnie = sinEnie(t)

  if (nombre.startsWith(t) || nombreSinEnie.startsWith(tSinEnie)) return PUNTAJE.NOMBRE_EMPIEZA

  // Varias palabras: tienen que estar TODAS, en cualquier orden. Así
  // "aceite motor" encuentra "ACEITE 20W-50 P/ MOTOR" sin exigir que se
  // escriba igual que el catálogo.
  const palabras = tSinEnie.split(/\s+/).filter(Boolean)
  if (palabras.length > 1) {
    const todas = palabras.every(p => nombreSinEnie.includes(p))
    return todas ? PUNTAJE.NOMBRE_CONTIENE : 0
  }

  // Una palabra suelta que calza entera dentro del nombre vale más que
  // encontrarla a mitad de otra: "gas" antes que "desgastado".
  if (new RegExp(`(^|\\s)${tSinEnie.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(nombreSinEnie)) {
    return PUNTAJE.NOMBRE_PALABRA_EXACTA
  }

  return nombreSinEnie.includes(tSinEnie) ? PUNTAJE.NOMBRE_CONTIENE : 0
}

/**
 * Los productos que coinciden, del más parecido al menos.
 *
 * Con el mismo puntaje decide el nombre más corto: entre "ACEITE" y "ACEITE
 * PARA MOTOR DIESEL 20 LITROS", el primero es casi siempre el que se busca.
 */
export function buscarProductos(productos, termino) {
  const t = normalizar(termino)
  if (!t) return productos

  const conPuntaje = []
  for (const p of productos) {
    const puntos = puntuar(p, t)
    if (puntos > 0) conPuntaje.push({ p, puntos })
  }

  conPuntaje.sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos
    const largoA = (a.p.name || '').length
    const largoB = (b.p.name || '').length
    if (largoA !== largoB) return largoA - largoB
    return String(a.p.name || '').localeCompare(String(b.p.name || ''))
  })

  return conPuntaje.map(x => x.p)
}

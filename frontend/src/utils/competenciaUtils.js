/**
 * Utilidades puras de la pestaña Competencia (Fase 3 de la estrategia de
 * precios). Sin estado ni llamadas de red — se puede razonar y probar cada
 * función sola.
 */

export const FUENTES_INFO = {
  epa: { label: 'EPA', estilo: 'bg-yellow-100 text-yellow-700' },
  walmart: { label: 'Walmart', estilo: 'bg-blue-100 text-blue-700' },
  masxmenos: { label: 'Mas x Menos', estilo: 'bg-emerald-100 text-emerald-700' }
}

export function fuenteLabel(fuente) {
  return FUENTES_INFO[fuente]?.label || fuente
}

export function fuenteEstilo(fuente) {
  return FUENTES_INFO[fuente]?.estilo || 'bg-gray-100 text-gray-600'
}

/**
 * Color del score de similitud. A propósito ninguno dice "confiable": el
 * score ordena la cola de revisión, no decide. Probando contra datos reales
 * hubo pares al 100% que eran productos distintos ("ACEITE 3 EN 1 MD" con
 * "Aromatizante Glade"), por eso la comparación se hace con la foto.
 */
export function estiloScore(score) {
  if (score >= 80) return 'bg-purple-100 text-purple-700'
  if (score >= 60) return 'bg-blue-50 text-blue-600'
  return 'bg-gray-100 text-gray-500'
}

const RE_URL = /^https?:\/\//i

/**
 * Normaliza un precio escrito por una persona o pegado de Excel: "₡2 150,00",
 * "2.150,00", "1,890.50", "2150" — todos son el mismo número.
 *
 * La regla: si hay dos separadores distintos, el ÚLTIMO es el decimal. Si hay
 * uno solo y separa exactamente 3 dígitos al final, es de miles (₡2.150 en
 * Costa Rica es dos mil ciento cincuenta, no 2,15).
 */
export function parsearPrecio(texto) {
  const limpio = String(texto ?? '').replace(/[^\d.,-]/g, '').trim()
  if (!limpio) return 0

  const ultimaComa = limpio.lastIndexOf(',')
  const ultimoPunto = limpio.lastIndexOf('.')

  let normalizado
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const decimal = ultimaComa > ultimoPunto ? ',' : '.'
    const miles = decimal === ',' ? '.' : ','
    normalizado = limpio.split(miles).join('').replace(decimal, '.')
  } else if (ultimaComa >= 0 || ultimoPunto >= 0) {
    const sep = ultimaComa >= 0 ? ',' : '.'
    const idx = ultimaComa >= 0 ? ultimaComa : ultimoPunto
    const decimales = limpio.length - idx - 1
    // 3 dígitos después del separador y algo antes => separador de miles
    normalizado = decimales === 3 && idx > 0
      ? limpio.split(sep).join('')
      : limpio.replace(sep, '.')
  } else {
    normalizado = limpio
  }

  const n = Number(normalizado)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function separarCampos(linea) {
  if (linea.includes('\t')) return linea.split('\t')
  if (linea.includes(';')) return linea.split(';')
  return linea.split(',')
}

/**
 * Convierte el texto pegado en filas {nombre, precio, imagenUrl}. Acepta lo
 * que la gente realmente pega: coma, punto y coma, o TAB (copiar/pegar
 * directo desde Excel). La imagen es una tercera columna opcional.
 *
 * Devuelve también las líneas que NO se pudieron leer, con el motivo — sin
 * eso el usuario pega 40 filas, se importan 37 y no tiene forma de saber
 * cuáles se perdieron ni por qué.
 *
 * @returns {{filas: Array<{nombre,precio,imagenUrl,linea}>, errores: Array<{linea,texto,motivo}>}}
 */
export function parsearListaManual(texto) {
  const filas = []
  const errores = []

  String(texto ?? '').split('\n').forEach((crudo, i) => {
    const linea = crudo.trim()
    if (!linea) return

    const numeroLinea = i + 1
    const campos = separarCampos(linea).map(c => c.trim()).filter(c => c !== '')

    if (campos.length < 2) {
      errores.push({ linea: numeroLinea, texto: linea, motivo: 'Falta el precio (usá coma, punto y coma o TAB)' })
      return
    }

    // La imagen, si viene, es el último campo y es una URL.
    let imagenUrl = ''
    let resto = campos
    if (campos.length >= 3 && RE_URL.test(campos[campos.length - 1])) {
      imagenUrl = campos[campos.length - 1]
      resto = campos.slice(0, -1)
    }

    const precio = parsearPrecio(resto[resto.length - 1])
    const nombre = resto.slice(0, -1).join(' ').trim()

    if (!precio) {
      errores.push({ linea: numeroLinea, texto: linea, motivo: `"${resto[resto.length - 1]}" no es un precio válido` })
      return
    }
    if (!nombre) {
      errores.push({ linea: numeroLinea, texto: linea, motivo: 'Falta el nombre del producto' })
      return
    }

    filas.push({ nombre, precio, imagenUrl, linea: numeroLinea })
  })

  return { filas, errores }
}

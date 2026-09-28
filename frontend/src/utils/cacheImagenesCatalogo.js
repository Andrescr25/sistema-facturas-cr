/**
 * Las fotos del catálogo del agente guardadas en la tablet, para verlas sin
 * señal. SIN IMPORTS: backend/tests/cacheImagenesCatalogo.test.js carga este
 * archivo con `new Function`.
 *
 * LO QUE SE APRENDIÓ (2026-09-27, medido)
 *  1. Alegra firma cada URL de foto (`?Expires=…&Signature=…`) y la firma
 *     CAMBIA EN CADA PEDIDO. La caché guardaba con la URL completa: después
 *     de cada actualización ninguna foto coincidía, se bajaban todas otra vez
 *     y las copias viejas se quedaban para siempre. La llave ahora es la foto
 *     (origen + ruta, que ya lleva un hash del archivo), no la firma.
 *  2. El CDN de Alegra no manda CORS: cada foto guardada es una respuesta
 *     "opaca", y Chrome le cobra a cada una ~14,7 MB de cuota aunque pese
 *     14 KB. Las ~1.900 fotos no caben en ninguna tablet, y cuando la cuota
 *     se llena también falla guardar el catálogo en IndexedDB (comparten el
 *     espacio). Por eso se guardan en el orden en que se ven, y se para con
 *     un 20 % de la cuota libre: lo demás se ve con internet.
 *
 * El nombre de la caché es el mismo que usa public/sw.js, que es quien las
 * sirve. No se cambia: ver el comentario de allá.
 */

export const CACHE_IMAGENES = 'catalogo-publico-imagenes-v1'
const CONCURRENCIA = 8
const RESERVA_CUOTA = 0.2

/** La foto, sin la firma: origen + ruta. */
export function llaveImagen(url) {
  const u = new URL(url)
  return u.origin + u.pathname
}

/**
 * ¿La firma todavía sirve? Una URL vencida devuelve un error que, por ser
 * opaco, no se puede distinguir de una foto: guardarlo bajo la llave estable
 * dejaría esa foto rota para siempre. Un minuto de margen.
 */
export function firmaVigente(url, ahora = Date.now()) {
  const vence = Number(new URL(url).searchParams.get('Expires'))
  return !vence || vence * 1000 > ahora + 60000
}

/** La foto que muestra la tarjeta: la favorita, o la primera. */
export function fotoDe(producto) {
  const imagenes = producto?.images || []
  const foto = imagenes.find((i) => i.favorite === true) || imagenes[0]
  return foto?.url || null
}

/** Una URL por foto (la primera vez que aparece), en el orden dado. */
export function fotosEnOrden(productos) {
  const porLlave = new Map()
  for (const p of productos) {
    const url = fotoDe(p)
    if (!url) continue
    let llave
    try { llave = llaveImagen(url) } catch { continue }
    if (!porLlave.has(llave)) porLlave.set(llave, url)
  }
  return porLlave
}

async function cuotaCasiLlena() {
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return quota > 0 && usage > quota * (1 - RESERVA_CUOTA)
  } catch {
    return false
  }
}

/**
 * Deja en la caché exactamente las fotos del catálogo actual, en el orden en
 * que se ven, hasta donde alcance el espacio.
 *
 *  1. Lo que ya hay: las entradas viejas (guardadas con la firma) pasan a su
 *     llave estable si su firma sigue vigente, y se borra todo lo que no es
 *     del catálogo actual. Eso libera la cuota que se comían los duplicados.
 *  2. Baja lo que falta, de a CONCURRENCIA, y para al acercarse a la cuota.
 *
 * `porLlave` es lo que devuelve fotosEnOrden. Devuelve { yaEstaban, nuevas,
 * sinLugar, borradas }.
 */
export async function guardarFotosDelCatalogo(porLlave, onProgreso = () => {}) {
  const total = porLlave.size
  if (typeof caches === 'undefined') {
    // Sin Cache API (sitio sin https): solo se calienta la caché del navegador.
    let hechas = 0
    for (const url of porLlave.values()) {
      await new Promise((resolve) => { const img = new Image(); img.onload = resolve; img.onerror = resolve; img.src = url })
      onProgreso(++hechas, total)
    }
    return { yaEstaban: 0, nuevas: hechas, sinLugar: 0, borradas: 0 }
  }

  try { await navigator.storage?.persist?.() } catch { /* sin permiso: sigue igual */ }
  const cache = await caches.open(CACHE_IMAGENES)
  const guardadas = new Set()
  let borradas = 0

  for (const req of await cache.keys()) {
    let u
    try { u = new URL(req.url) } catch { await cache.delete(req); borradas++; continue }
    const llave = u.origin + u.pathname
    if (!u.search) {
      if (porLlave.has(llave)) guardadas.add(llave)
      else { await cache.delete(req); borradas++ }
      continue
    }
    if (porLlave.has(llave) && !guardadas.has(llave) && firmaVigente(req.url)) {
      try {
        const resp = await cache.match(req)
        if (resp) { await cache.put(llave, resp); guardadas.add(llave) }
      } catch { /* sin lugar: se baja de nuevo abajo si entra */ }
    }
    await cache.delete(req)
    borradas++
  }

  const yaEstaban = guardadas.size
  const faltan = [...porLlave].filter(([llave]) => !guardadas.has(llave))
  let nuevas = 0
  let lleno = false
  onProgreso(yaEstaban, total)

  for (let i = 0; i < faltan.length && !lleno; i += CONCURRENCIA) {
    if (await cuotaCasiLlena()) { lleno = true; break }
    await Promise.all(faltan.slice(i, i + CONCURRENCIA).map(async ([llave, url]) => {
      if (!firmaVigente(url)) return
      try {
        const resp = await fetch(url, { mode: 'no-cors' })
        await cache.put(llave, resp)
        nuevas++
      } catch (e) {
        if (e?.name === 'QuotaExceededError') lleno = true
      }
    }))
    onProgreso(yaEstaban + nuevas, total)
  }

  return { yaEstaban, nuevas, sinLugar: total - yaEstaban - nuevas, borradas }
}

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
 * LO QUE CAMBIÓ CON LAS FOTOS PROPIAS (2026-10-11)
 *  3. Desde el corte las fotos son nuestras: la base guarda una RUTA
 *     ("/archivos/productos/7-….jpg") y las sirve el backend, que en Render
 *     es otro dominio que la web. Acá se descartaba toda dirección que no
 *     fuera completa, y el worker solo servía las del CDN de Alegra: el día
 *     del corte ninguna foto quedó guardada y el catálogo sin señal salía sin
 *     fotos. Ahora la ruta se completa con la MISMA función que usa la
 *     tarjeta (`completar`, que es urlArchivo): si las dos no arman la misma
 *     dirección, lo guardado no se encuentra.
 *  4. Nuestro backend SÍ manda CORS. Una foto propia se pide legible, no
 *     opaca: pesa lo que pesa (≈130 KB, no 14,7 MB) y entran todas. Y como
 *     se puede leer la respuesta, un 404 no se guarda como si fuera la foto.
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

/**
 * ¿Viene del CDN de Alegra? Esas no mandan CORS y solo se pueden guardar
 * opacas. Es la misma pregunta que hace public/sw.js para servirlas.
 */
export function esDeAlegra(url) {
  try {
    const { hostname } = new URL(url)
    return hostname.endsWith('.alegra.com') && hostname.startsWith('cdn')
  } catch {
    return false
  }
}

/**
 * La dirección completa de una foto, o null si no se puede armar. `completar`
 * convierte la ruta propia en dirección (urlArchivo); si aun así queda
 * relativa —la web y la API en el mismo dominio— se completa con el de la
 * página, que es a donde la va a pedir el <img>.
 */
function direccionCompleta(url, completar) {
  const armada = completar ? completar(url) : url
  if (!armada) return null
  try { return new URL(armada).href } catch { /* es una ruta: sigue abajo */ }
  try { return new URL(armada, location.origin).href } catch { return null }
}

/** La foto que muestra la tarjeta: la favorita, o la primera. */
export function fotoDe(producto) {
  const imagenes = producto?.images || []
  const foto = imagenes.find((i) => i.favorite === true) || imagenes[0]
  return foto?.url || null
}

/**
 * Una URL por foto (la primera vez que aparece), en el orden dado.
 *
 * `completar` es la función con la que la TARJETA arma la dirección de una
 * foto propia (urlArchivo). Tiene que ser la misma: la llave de lo guardado
 * es esa dirección, y el worker busca por la que pide el <img>.
 */
export function fotosEnOrden(productos, completar = null, configCatalogo = null) {
  const porLlave = new Map()
  for (const p of productos) {
    // La foto general y la individual deben sobrevivir sin señal: la segunda
    // se pide al abrir la vista previa, aunque no aparezca en la lista.
    for (const ruta of [p.marca?.imagen?.url, fotoDe(p)]) {
      const url = direccionCompleta(ruta, completar)
      if (!url) continue
      const llave = llaveImagen(url)
      if (!porLlave.has(llave)) porLlave.set(llave, url)
    }
  }
  // Ambas versiones deben seguir dentro de esta MISMA caché: su renovación
  // borra lo ajeno al conjunto. Un teléfono usa la vertical y una tablet puede
  // cambiar de orientación sin depender de volver a tener señal.
  for (const categoria of configCatalogo?.categorias || []) {
    for (const ruta of [categoria.imagen?.urlMovil, categoria.imagen?.url]) {
      const url = direccionCompleta(ruta, completar)
      if (!url) continue
      const llave = llaveImagen(url)
      if (!porLlave.has(llave)) porLlave.set(llave, url)
    }
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
 * sinLugar, fallidas, borradas }. `sinLugar` son las que no entraron por
 * espacio; `fallidas`, las que no se pudieron bajar (sin señal a la mitad,
 * el archivo no está, o una firma de Alegra ya vencida): se arreglan
 * actualizando de nuevo, no liberando lugar.
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
    return { yaEstaban: 0, nuevas: hechas, sinLugar: 0, fallidas: 0, borradas: 0 }
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
  let fallidas = 0
  let lleno = false
  onProgreso(yaEstaban, total)

  for (let i = 0; i < faltan.length && !lleno; i += CONCURRENCIA) {
    if (await cuotaCasiLlena()) { lleno = true; break }
    await Promise.all(faltan.slice(i, i + CONCURRENCIA).map(async ([llave, url]) => {
      // Una firma vencida de Alegra tampoco es falta de lugar: se arregla
      // actualizando (el servidor firma de nuevo), no liberando espacio.
      if (!firmaVigente(url)) { fallidas++; return }
      const propia = !esDeAlegra(url)
      try {
        // La propia se pide legible (nuestro backend manda CORS): pesa lo que
        // pesa y se puede ver si de verdad llegó una foto. La de Alegra solo
        // se deja pedir a ciegas.
        const resp = await fetch(url, propia ? { mode: 'cors', credentials: 'omit' } : { mode: 'no-cors' })
        // Un 404 guardado bajo la llave de la foto la dejaría rota sin señal
        // y nunca se volvería a bajar.
        if (propia && !resp.ok) { fallidas++; return }
        await cache.put(llave, resp)
        nuevas++
      } catch (e) {
        if (e?.name === 'QuotaExceededError') lleno = true
        else fallidas++
      }
    }))
    onProgreso(yaEstaban + nuevas, total)
  }

  return { yaEstaban, nuevas, sinLugar: total - yaEstaban - nuevas - fallidas, fallidas, borradas }
}

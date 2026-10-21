/**
 * La dirección del portal de clientes: catálogo, pedidos, facturas y
 * cotizaciones del cliente.
 *
 * POR QUÉ. El 2026-10-20 el usuario pidió separar los sistemas: «no quiero
 * que los clientes puedan llegar al sistema interno». El portal se publica
 * como otro sitio (`npm run build:portal`, otro servicio en Render) y todo
 * enlace que se le manda a un cliente apunta allá, con VITE_PORTAL_URL.
 * Mientras ese sitio no esté configurado, las páginas del cliente siguen en
 * esta misma dirección, como antes: publicar esto no cambia nada hasta que se
 * ponga la variable.
 *
 * Sin imports a propósito: las pruebas lo leen tal cual, pasando la
 * configuración y el origen en vez de depender del navegador.
 */
const sinBarraFinal = (texto) => String(texto || '').replace(/\/+$/, '')

/** El origen del portal: el configurado o, si no hay, el que está abierto. */
export function basePortal(configurada = import.meta.env?.VITE_PORTAL_URL, actual = globalThis.location?.origin) {
  return sinBarraFinal(configurada || actual)
}

/** El enlace completo a una página del portal. */
export function urlPortal(ruta = '/catalogo', base = basePortal()) {
  return `${sinBarraFinal(base)}${ruta.startsWith('/') ? '' : '/'}${ruta}`
}

/** Si el portal vive en otro sitio que el que está abierto ahora. */
export function portalEnOtroSitio(configurada = import.meta.env?.VITE_PORTAL_URL, actual = globalThis.location?.origin) {
  return Boolean(configurada) && sinBarraFinal(configurada) !== sinBarraFinal(actual)
}

/*
 * LA SESIÓN SE MUDA CON EL CLIENTE. El navegador guarda la sesión por sitio:
 * sin esto, el cliente que llegaba al portal por un enlace viejo aparecía
 * «afuera» y tenía que volver a ingresar (el usuario pidió evitarlo el
 * 2026-10-20). Viaja en el fragmento (#sesion=…), que nunca llega a un
 * servidor, y el portal la borra de la dirección al recibirla.
 */
const FRAGMENTO = /^#sesion=([^&#]+)$/

/** La dirección del portal con la sesión del cliente en el fragmento. */
export function conSesion(url, token) {
  return token ? `${String(url).split('#')[0]}#sesion=${encodeURIComponent(token)}` : url
}

/** Si la dirección trae una sesión traspasada (válida o no): hay que borrarla. */
export const traeSesion = (hash) => String(hash || '').startsWith('#sesion=')

/**
 * La sesión traspasada, solo si llega desde el sitio de siempre: así nadie
 * puede armar un enlace que meta a un cliente en una cuenta ajena. Cualquier
 * otra cosa da null y el cliente ingresa como siempre.
 */
export function sesionTraspasada(hash, referente, origenSistema) {
  const m = FRAGMENTO.exec(String(hash || ''))
  if (!m) return null
  const origen = (texto) => { try { return new URL(texto).origin } catch { return null } }
  const desde = origen(referente)
  if (!desde || desde !== origen(origenSistema)) return null
  try { return decodeURIComponent(m[1]) } catch { return null }
}

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

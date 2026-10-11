// Solo se construyen destinos internos. El parámetro no concede acceso: el
// servidor lo valida con la sesión del cliente, también al enviar el pedido.
export const tokenPreventa = search => new URLSearchParams(search).get('preventa')
export const destinoCatalogo = search => {
  const token = tokenPreventa(search)
  return token === null ? '/catalogo' : `/catalogo?preventa=${encodeURIComponent(token)}`
}
export const ingresoPreventa = search => {
  const token = tokenPreventa(search)
  return token === null ? '/portal/ingresar' : `/portal/ingresar?preventa=${encodeURIComponent(token)}`
}

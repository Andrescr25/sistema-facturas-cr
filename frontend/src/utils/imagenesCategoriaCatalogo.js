import { fotoDe } from './cacheImagenesCatalogo.js'

/** La foto elegida en Gestión gana; sin ella se aprovecha una del catálogo. */
export function imagenDeCategoria(nombre, configCatalogo, productos = []) {
  const elegida = configCatalogo?.categorias?.find(c => c.name === nombre)?.imagen
  if (elegida?.url) return elegida
  const producto = productos.find(p => fotoDe(p))
  const url = fotoDe(producto)
  return url ? { url, esProducto:true } : null
}

import api from '../services/api'

// Varias fuentes de miniaturas (el CDN de Brave, sitios de origen) bloquean la
// carga directa (hotlinking) desde otro dominio. Se pasan por el proxy del
// backend, que las descarga server-side y evita ese bloqueo. Se conserva la
// miniatura original (sin proxear) en thumbnailOriginal: sirve de respaldo si
// la imagen de tamaño completo (img.url) falla al descargarse en el backend
// (downloadAndUploadProductImage reintenta con ella antes de rendirse).
// Compartido entre Gestión de Catálogo y la creación de producto nuevo en
// Relacionar Productos — ambas reusan el mismo ModalSugerirImagen.
export function conMiniaturasProxeadas(images) {
  return images.map(img => ({
    ...img,
    thumbnailOriginal: img.thumbnail,
    thumbnail: `${api.defaults.baseURL}/alegra/catalog/image-proxy?url=${encodeURIComponent(img.thumbnail)}`
  }))
}

// La foto de una categoría se muestra COMPLETA, con su propia proporción
// (2026-10-25). Antes el banner era una franja fija de 168 a 216 px y de la foto
// se veía el pedazo del medio. Sin imports: lo usan la cabecera, el caché sin
// señal y la vista previa de Gestión.

const medida = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null)

/** ancho / alto de la foto, o null si no se conoce (foto de producto de respaldo, copias viejas). */
export function relacionDeImagen(imagen) {
  const ancho = medida(imagen?.ancho)
  const alto = medida(imagen?.alto)
  return ancho && alto ? ancho / alto : null
}

// Margen para el redondeo de las dos variantes (960 de 1870 de ancho, etc.).
const TOLERANCIA = 0.04

/**
 * La copia liviana del teléfono, solo si es la MISMA foto que la grande.
 *
 * Las que se subieron antes de este cambio se guardaron recortadas al centro
 * (una columna vertical): la de Línea Eléctrica llegaba con el bombillo
 * partido por la mitad. Esas se ignoran y el teléfono usa la grande, entera.
 * Sin medidas guardadas no hay con qué comparar y se asume que sirve.
 */
export function urlMovilUsable(imagen) {
  if (!imagen?.urlMovil) return null
  const grande = relacionDeImagen(imagen)
  const movil = relacionDeImagen({ ancho: imagen.anchoMovil, alto: imagen.altoMovil })
  if (!grande || !movil) return imagen.urlMovil
  return Math.abs(grande - movil) / grande <= TOLERANCIA ? imagen.urlMovil : null
}

/** La imagen guardada puede tener metadatos internos: se publican solo estos campos. */
function marcaPublica(id, nombre, imagen) {
  if (!id) return null;
  const dimension = n => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
  return {
    id, nombre,
    imagen: typeof imagen?.url === 'string' && imagen.url ? {
      url: imagen.url, ancho: dimension(imagen.ancho), alto: dimension(imagen.alto)
    } : null
  };
}

module.exports = { marcaPublica };

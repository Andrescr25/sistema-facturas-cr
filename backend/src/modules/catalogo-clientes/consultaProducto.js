/**
 * Qué es un producto PARA EL CLIENTE, y cuál se le muestra.
 *
 * VIVE ACÁ, FUERA DE LOS MÓDULOS, porque lo usan cuatro lugares: el catálogo
 * público, el carrito del portal, la portada personalizada y las sugerencias.
 * Hasta ahora cada uno tenía su propia copia de la lista de columnas, del
 * filtro de visibilidad y del armado de la ficha — la misma regla escrita
 * cuatro veces. Basta con que una se quede atrás para que el cliente vea en el
 * carrito un precio distinto al del catálogo, que fue exactamente el problema
 * que ya había con el redondeo.
 *
 * DE DÓNDE SALE: de `producto`, el maestro propio, no de
 * `alegra_products_cache`.
 *
 * EL COSTO NO ESTÁ Y NO PUEDE ESTAR. Las columnas se listan una por una, sin
 * SELECT *, para que agregar mañana una columna sensible al maestro no la
 * publique sin que nadie lo decida.
 *
 * EL ID QUE SE EXPONE ES EL DE ALEGRA. El carrito y el pedido guardan
 * `alegra_item_id`, y los descuentos por exceso y el histórico de ventas se
 * llavean por ese id: cambiarlo rompería los pedidos en curso. Va también
 * `productoId` para cuando eso se migre.
 */

const { precioConImpuesto } = require('./precio');
const { aplicarDescuento } = require('../../utils/descuentosExceso');

const COLUMNAS = `
  p.alegra_id, p.id AS producto_id, p.nombre, p.referencia,
  cat.nombre AS categoria, p.precio_sin_iva, imp.tarifa, p.imagen_url`;

/**
 * El impuesto va con LEFT JOIN, no con JOIN: hay un producto activo sin
 * impuesto asignado, y con un JOIN estricto desaparecería del catálogo sin que
 * nadie se entere. Sin tarifa se muestra el precio tal cual.
 */
const DESDE = `
  FROM producto p
  LEFT JOIN categoria_producto cat ON cat.id = p.categoria_id
  LEFT JOIN impuesto imp ON imp.id = p.impuesto_id`;

const VISIBLE = `p.activo = TRUE AND p.oculto = FALSE AND p.precio_sin_iva > 0`;

/** Quita acentos y pasa a minúsculas, igual en la consulta y en lo buscado. */
const NORMALIZAR_SQL = (expr) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;

function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * La ficha que ve el cliente.
 *
 * Cuando hay descuento se devuelven los dos precios: una oferta sin precio
 * tachado no se lee como oferta. `precio` es SIEMPRE el que se va a cobrar,
 * así que quien lo use no necesita saber si hubo rebaja.
 */
function mapProducto(row, descuentos, extra = {}) {
  const precioLista = precioConImpuesto(row.precio_sin_iva, row.tarifa);
  const descuento = descuentos?.get(String(row.alegra_id)) || 0;

  return {
    id: row.alegra_id,
    productoId: row.producto_id,
    nombre: row.nombre,
    referencia: row.referencia || null,
    categoria: row.categoria || 'Sin categoría',
    precio: aplicarDescuento(precioLista, descuento),
    precioLista: descuento > 0 ? precioLista : null,
    descuento: descuento > 0 ? descuento : null,
    imagen: row.imagen_url || null,
    ...extra
  };
}

module.exports = { COLUMNAS, DESDE, VISIBLE, NORMALIZAR_SQL, normalizar, mapProducto };

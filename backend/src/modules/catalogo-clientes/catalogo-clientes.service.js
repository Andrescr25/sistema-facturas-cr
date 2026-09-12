/**
 * Catálogo para clientes - Service
 *
 * El catálogo que ve el cliente. Es otra cosa que
 * /catalogo-agente: aquel es la herramienta del agente de venta (modo
 * kiosco en tablet, sincroniza todo a caché local para funcionar sin señal
 * en la calle, y se personaliza por cliente). Este es un enlace que abre
 * cualquiera, en su teléfono, con internet.
 *
 * DE DÓNDE SALEN LOS DATOS
 * De `producto`, el maestro propio de esta rama — ya no de
 * `alegra_products_cache`, que era una copia que refrescaba una
 * sincronización cada 6 horas. El catálogo dejó de depender de que esa
 * sincronización haya corrido: lo que se edita en Gestión de Catálogo se ve
 * aquí de inmediato.
 *
 * EL ID QUE SE EXPONE SIGUE SIENDO EL DE ALEGRA, a propósito. El pedido del
 * portal guarda `alegra_item_id`, los descuentos por exceso se llavean por
 * ese id y el histórico de ventas también. Cambiarlo acá rompería los
 * pedidos; se cambia cuando esas tres cosas pasen a `producto.id`, que es su
 * propio punto del checklist. Mientras tanto va también `productoId`, para
 * que quien lo necesite ya lo tenga.
 *
 * QUÉ NO SE EXPONE NUNCA
 * El costo de compra (`costo_con_iva`) no sale de este módulo bajo ninguna
 * circunstancia. Las columnas se listan una por una, sin SELECT *, para que
 * agregar una columna sensible al maestro no la publique sin querer.
 */

const { query } = require('../../../config/database');
const { ofertasPorBajaDePrecio } = require('../precios/ofertasPorBaja');
const { precioConImpuesto } = require('./precio');
const { mapaVigentes, aplicarDescuento } = require('../../utils/descuentosExceso');

const POR_PAGINA = 60;
const MAX_POR_PAGINA = 120;

// Sin el costo, a propósito. Ver el encabezado.
const COLUMNAS = `
  p.alegra_id, p.id AS producto_id, p.nombre, p.referencia,
  cat.nombre AS categoria, p.precio_sin_iva, imp.tarifa, p.imagen_url`;

/**
 * El impuesto va con LEFT JOIN, no con JOIN: hay un producto activo sin
 * impuesto asignado y con un JOIN estricto desaparecería del catálogo sin
 * que nadie se entere. Sin tarifa se muestra el precio tal cual, que es lo
 * que ya hacía `precioConImpuesto` con la tasa en NULL.
 */
const DESDE = `
  FROM producto p
  LEFT JOIN categoria_producto cat ON cat.id = p.categoria_id
  LEFT JOIN impuesto imp ON imp.id = p.impuesto_id`;

/**
 * Un producto se le muestra al cliente si está activo y no fue ocultado a
 * mano desde Gestión de Catálogo, que es el control que ya existía para
 * sacar cosas de la vista sin borrarlas.
 */
const FILTRO_VISIBLE = `p.activo = TRUE AND p.oculto = FALSE AND p.precio_sin_iva > 0`;

/** Quita acentos y pasa a minúsculas, igual en la consulta y en lo buscado. */
const NORMALIZAR_SQL = (expr) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;
function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * `descuentos` es el Map de ofertas vigentes por exceso. Se pasa desde
 * afuera y no se consulta acá adentro para no hacer una consulta por
 * producto: la lista se trae UNA vez por página.
 *
 * Cuando hay descuento se devuelven los dos precios. El cliente tiene que
 * ver de cuánto baja —una oferta sin precio tachado no se lee como oferta—
 * y `precio` sigue siendo siempre el que se va a cobrar, así que el resto
 * del código no necesita saber si hubo rebaja o no.
 */
function mapProducto(row, descuentos) {
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
    imagen: row.imagen_url || null
  };
}

async function listarProductos({ busqueda = '', categoria = '', pagina = 1, porPagina = POR_PAGINA } = {}) {
  const limite = Math.min(parseInt(porPagina, 10) || POR_PAGINA, MAX_POR_PAGINA);
  const numeroPagina = Math.max(parseInt(pagina, 10) || 1, 1);
  const offset = (numeroPagina - 1) * limite;

  const condiciones = [FILTRO_VISIBLE];
  const params = [];

  if (String(busqueda).trim()) {
    params.push(`%${normalizar(busqueda).trim()}%`);
    // Nombre y referencia, que es lo que busca un cliente. Antes esto salía de
    // `search_text`, una columna que llenaba la sincronización; ahora se
    // normaliza en la consulta y no depende de que nadie la haya refrescado.
    condiciones.push(`${NORMALIZAR_SQL("p.nombre || ' ' || COALESCE(p.referencia, '')")} LIKE $${params.length}`);
  }

  if (String(categoria).trim()) {
    params.push(String(categoria).trim());
    condiciones.push(`cat.nombre = $${params.length}`);
  }

  const where = condiciones.join(' AND ');

  const totalRes = await query(`SELECT COUNT(*)::int AS n ${DESDE} WHERE ${where};`, params);
  const total = totalRes.rows[0].n;

  const descuentos = await mapaVigentes();

  params.push(limite, offset);
  const result = await query(`
    SELECT ${COLUMNAS}
    ${DESDE}
    WHERE ${where}
    -- Agrupado por categoría y alfabético dentro de cada una. Antes era
    -- alfabético a secas sobre los 2.000 productos, y "Todo" mezclaba
    -- tornillos con champú en la misma pantalla. Con una categoría elegida
    -- el primer criterio se vuelve constante y queda el orden por nombre.
    --
    -- NULLS LAST manda los productos sin categoría al final: son la excepción
    -- y no deben encabezar el catálogo.
    ORDER BY cat.nombre ASC NULLS LAST, p.nombre ASC
    LIMIT $${params.length - 1} OFFSET $${params.length};
  `, params);

  return {
    productos: result.rows.map(row => mapProducto(row, descuentos)),
    total,
    pagina: numeroPagina,
    porPagina: limite,
    hayMas: offset + result.rows.length < total
  };
}

/**
 * Los productos en oferta, con su ficha completa.
 *
 * listarOfertas del catálogo del agente devuelve solo id, nombre y
 * porcentaje porque ese catálogo ya tiene el producto entero descargado en
 * el dispositivo. Acá hace falta la ficha —foto y los dos precios— porque
 * el cliente no tiene nada descargado.
 */
async function listarOfertas() {
  const descuentos = await mapaVigentes();
  if (descuentos.size === 0) return [];

  const result = await query(`
    SELECT ${COLUMNAS}
    ${DESDE}
    WHERE p.alegra_id = ANY($1::varchar[]) AND ${FILTRO_VISIBLE};
  `, [[...descuentos.keys()]]);

  return result.rows
    .map(row => mapProducto(row, descuentos))
    .sort((a, b) => (b.descuento || 0) - (a.descuento || 0));
}

async function listarCategorias() {
  const result = await query(`
    SELECT cat.nombre AS categoria, COUNT(*)::int AS n
    ${DESDE}
    WHERE ${FILTRO_VISIBLE} AND cat.nombre IS NOT NULL AND cat.nombre <> ''
    GROUP BY cat.nombre
    ORDER BY cat.nombre ASC;
  `);
  return result.rows.map(row => ({ nombre: row.categoria, productos: row.n }));
}

/**
 * Datos del negocio para el encabezado del catálogo.
 *
 * Ya no lleva número de WhatsApp: el pedido dejó de armarse como mensaje y
 * ahora entra al sistema desde el portal (ver el módulo portal-clientes).
 */
function obtenerConfiguracion() {
  return {
    negocio: process.env.CATALOGO_NEGOCIO || 'Distribuidora Tachi'
  };
}

/**
 * Los productos a los que se les bajó el precio resignando margen.
 *
 * Es otra cosa que las ofertas por exceso de inventario: acá no sobra nada,
 * se decidió vender más barato. Se muestran aparte porque el motivo es
 * distinto y el mensaje al cliente también.
 */
async function ofertasPorBaja() {
  return ofertasPorBajaDePrecio();
}

module.exports = {
  ofertasPorBaja, listarProductos, listarOfertas, listarCategorias, obtenerConfiguracion };

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
 * De alegra_products_cache, la copia local que refresca la sincronización
 * cada 6 horas — no de Alegra en vivo. Ese es el punto: el catálogo del
 * agente tiene que paginar Alegra de 30 en 30 (~70 llamadas, minutos) y por
 * eso muestra una pantalla de sincronización. Un cliente no va a esperar
 * eso. Acá la consulta es una sola a Postgres.
 *
 * QUÉ NO SE EXPONE NUNCA
 * `cost` es el costo de compra: no sale de este módulo bajo ninguna
 * circunstancia. Las columnas se listan una por una, sin SELECT *, para que
 * agregar una columna sensible a la caché no la publique sin querer.
 */

const { query } = require('../../../config/database');
const { precioConImpuesto } = require('./precio');
const { mapaVigentes, aplicarDescuento } = require('../../utils/descuentosExceso');

const POR_PAGINA = 60;
const MAX_POR_PAGINA = 120;

// Sin `cost`, a propósito. Ver el encabezado.
const COLUMNAS = `alegra_id, name, reference, category, price, tax_percentage, image_url`;

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
  const precioLista = precioConImpuesto(row.price, row.tax_percentage);
  const descuento = descuentos?.get(String(row.alegra_id)) || 0;

  return {
    id: row.alegra_id,
    nombre: row.name,
    referencia: row.reference || null,
    categoria: row.category || 'Sin categoría',
    precio: aplicarDescuento(precioLista, descuento),
    precioLista: descuento > 0 ? precioLista : null,
    descuento: descuento > 0 ? descuento : null,
    imagen: row.image_url || null
  };
}

/**
 * Un producto se le muestra al cliente solo si está activo en Alegra y no
 * fue ocultado a mano desde Gestión de Catálogo (hidden_locally), que es el
 * control que ya existe para sacar cosas de la vista sin borrarlas.
 */
const FILTRO_VISIBLE = `status = 'active' AND hidden_locally = FALSE AND price > 0`;

async function listarProductos({ busqueda = '', categoria = '', pagina = 1, porPagina = POR_PAGINA } = {}) {
  const limite = Math.min(parseInt(porPagina, 10) || POR_PAGINA, MAX_POR_PAGINA);
  const numeroPagina = Math.max(parseInt(pagina, 10) || 1, 1);
  const offset = (numeroPagina - 1) * limite;

  const condiciones = [FILTRO_VISIBLE];
  const params = [];

  if (String(busqueda).trim()) {
    params.push(`%${String(busqueda).trim().toLowerCase()}%`);
    // search_text ya viene normalizado por la sincronización (nombre +
    // referencia en minúsculas), que es justo lo que busca un cliente.
    condiciones.push(`search_text LIKE $${params.length}`);
  }

  if (String(categoria).trim()) {
    params.push(String(categoria).trim());
    condiciones.push(`category = $${params.length}`);
  }

  const where = condiciones.join(' AND ');

  const totalRes = await query(`SELECT COUNT(*)::int AS n FROM alegra_products_cache WHERE ${where};`, params);
  const total = totalRes.rows[0].n;

  const descuentos = await mapaVigentes();

  params.push(limite, offset);
  const result = await query(`
    SELECT ${COLUMNAS} FROM alegra_products_cache
    WHERE ${where}
    -- Agrupado por categoría y alfabético dentro de cada una. Antes era
    -- alfabético a secas sobre los 2.000 productos, y "Todo" mezclaba
    -- tornillos con champú en la misma pantalla. Con una categoría elegida
    -- el primer criterio se vuelve constante y queda el orden por nombre.
    --
    -- NULLIF manda las categorías vacías al final: son la excepción y no
    -- deben encabezar el catálogo.
    ORDER BY NULLIF(category, '') ASC NULLS LAST, name ASC
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
    SELECT ${COLUMNAS} FROM alegra_products_cache
    WHERE alegra_id = ANY($1::varchar[]) AND ${FILTRO_VISIBLE};
  `, [[...descuentos.keys()]]);

  return result.rows
    .map(row => mapProducto(row, descuentos))
    .sort((a, b) => (b.descuento || 0) - (a.descuento || 0));
}

async function listarCategorias() {
  const result = await query(`
    SELECT category, COUNT(*)::int AS n
    FROM alegra_products_cache
    WHERE ${FILTRO_VISIBLE} AND category IS NOT NULL AND category <> ''
    GROUP BY category
    ORDER BY category ASC;
  `);
  return result.rows.map(row => ({ nombre: row.category, productos: row.n }));
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

module.exports = { listarProductos, listarOfertas, listarCategorias, obtenerConfiguracion };

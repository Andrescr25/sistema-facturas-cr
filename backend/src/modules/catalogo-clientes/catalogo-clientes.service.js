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
 * Los productos se identifican por producto.id, como el carrito y el pedido.
 *
 * QUÉ NO SE EXPONE NUNCA
 * El costo de compra (`costo_con_iva`) no sale de este módulo bajo ninguna
 * circunstancia. Las columnas se listan una por una, sin SELECT *, para que
 * agregar una columna sensible al maestro no la publique sin querer.
 */

const { query } = require('../../../config/database');
const { ofertasPorBajaDePrecio } = require('../precios/ofertasPorBaja');
const { mapaVigentesPropios } = require('../../utils/descuentosExceso');
// Qué es un producto para el cliente y cuál se le muestra: una sola
// definición, compartida con el portal (carrito, portada y sugerencias).
const { COLUMNAS, DESDE, VISIBLE: FILTRO_VISIBLE, NORMALIZAR_SQL, normalizar, mapProducto } = require('./consultaProducto');

const POR_PAGINA = 60;
const MAX_POR_PAGINA = 120;

async function listarProductos({ busqueda = '', categoria = '', pagina = 1, porPagina = POR_PAGINA } = {}) {
  const limite = Math.min(parseInt(porPagina, 10) || POR_PAGINA, MAX_POR_PAGINA);
  const numeroPagina = Math.max(parseInt(pagina, 10) || 1, 1);
  const offset = (numeroPagina - 1) * limite;

  const condiciones = [FILTRO_VISIBLE];
  const params = [];

  if (String(busqueda).trim()) {
    params.push(`%${normalizar(busqueda).trim()}%`);
    // Nombre, referencia, familia y marca. Antes esto salía de
    // `search_text`, una columna que llenaba la sincronización; ahora se
    // normaliza en la consulta y no depende de que nadie la haya refrescado.
    condiciones.push(`${NORMALIZAR_SQL("p.nombre || ' ' || COALESCE(p.referencia, '') || ' ' || COALESCE(sub.nombre, '') || ' ' || COALESCE(marca.nombre, '')")} LIKE $${params.length}`);
  }

  if (String(categoria).trim()) {
    params.push(String(categoria).trim());
    condiciones.push(`cat.nombre = $${params.length}`);
  }

  const where = condiciones.join(' AND ');

  const totalRes = await query(`SELECT COUNT(*)::int AS n ${DESDE} WHERE ${where};`, params);
  const total = totalRes.rows[0].n;

  const descuentos = await mapaVigentesPropios();

  params.push(limite, offset);
  const result = await query(`
    SELECT ${COLUMNAS}
    ${DESDE}
    WHERE ${where}
    -- Clasificación contigua y desempate por id: una marca puede continuar
    -- en la página siguiente sin repetir portada ni perder presentaciones.
    -- Las posiciones manuales son las mismas que guarda Gestión de Catálogo.
    ORDER BY cfg.orden ASC NULLS LAST, cat.nombre ASC NULLS LAST,
             (sub.id IS NULL), sub.orden ASC NULLS LAST, sub.nombre ASC, sub.id,
             (marca.id IS NULL), marca.nombre ASC, marca.id, p.nombre ASC, p.id
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
  const descuentos = await mapaVigentesPropios();
  if (descuentos.size === 0) return [];

  const result = await query(`
    SELECT ${COLUMNAS}
    ${DESDE}
    WHERE p.id = ANY($1::int[]) AND ${FILTRO_VISIBLE};
  `, [[...descuentos.keys()]]);

  return result.rows
    .map(row => mapProducto(row, descuentos))
    .sort((a, b) => (b.descuento || 0) - (a.descuento || 0));
}

async function listarCategorias() {
  const result = await query(`
    SELECT cat.nombre AS categoria, cfg.nombre_visible, cfg.orden, COUNT(*)::int AS n
    ${DESDE}
    WHERE ${FILTRO_VISIBLE} AND cat.nombre IS NOT NULL AND cat.nombre <> ''
    GROUP BY cat.nombre, cfg.nombre_visible, cfg.orden
    ORDER BY cfg.orden ASC NULLS LAST, cat.nombre ASC;
  `);
  return result.rows.map(row => ({ nombre: row.categoria, nombreVisible: row.nombre_visible || row.categoria, productos: row.n }));
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
  const ofertas = await ofertasPorBajaDePrecio();
  return ofertas.map(({ alegraItemId, margenAntes, margenAhora, ...oferta }) => oferta);
}

module.exports = {
  ofertasPorBaja, listarProductos, listarOfertas, listarCategorias, obtenerConfiguracion };

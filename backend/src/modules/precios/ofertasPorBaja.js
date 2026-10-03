/**
 * Los productos a los que se les bajó el precio a propósito.
 *
 * QUÉ CUENTA COMO OFERTA
 * No cualquier precio que bajó. Cuenta el que bajó **sacrificando margen**:
 * un producto que tenía 40% y quedó en 20% es una decisión comercial de
 * promoverlo, y eso es lo que hay que mostrarle al cliente. En cambio, si el
 * precio bajó porque el costo bajó y el margen se mantuvo, no hay ninguna
 * oferta que anunciar — se está ganando lo mismo de siempre.
 *
 * Por eso se piden las dos cosas a la vez: precio más bajo Y margen más bajo.
 *
 * DE DÓNDE SALE EL MARGEN ANTERIOR
 * De `precio_historico`, que guarda cada cambio hecho en Revisión de Precios
 * con el costo del momento. Con el precio anterior y ese costo se calcula el
 * margen que tenía antes, y con el nuevo el que tiene ahora.
 *
 * `precio_anterior` estuvo en NULL durante las primeras 180 filas (el INSERT
 * no lo llenaba). Para esas se cae al precio del cambio inmediatamente
 * anterior del mismo producto, que es lo mismo cuando existe. Las que no
 * tienen ni una cosa ni la otra simplemente no aparecen: es preferible
 * mostrar menos ofertas que inventar un descuento que nadie decidió.
 *
 * EL MARGEN SE USA PARA DECIDIR, NO SE ENTREGA. Las dos rutas que llaman a
 * esto (`/catalogo-clientes/ofertas-baja` y `/catalogo-agente/ofertas-baja`)
 * se abren SIN SESIÓN. Hasta el 2026-10-03 la respuesta llevaba `margenAntes`
 * y `margenAhora` de cada producto: cualquiera con el enlace del catálogo
 * podía leer cuánto se gana en cada uno, y con el precio al lado, sacar el
 * costo. Ninguna pantalla los usaba. Si alguna vez hacen falta adentro, van
 * por una ruta con sesión, no por esta función.
 */

const { query } = require('../../../config/database');

// Cuántos puntos de margen hay que haber resignado para que sea una oferta.
// Cinco es un sacrificio deliberado; menos que eso suele ser el redondeo del
// precio sugerido o un ajuste de costo.
const PUNTOS_MARGEN_MINIMO = 5;

// "Nuevas" tiene que significar algo. Un mes es lo que dura la conversación
// con el cliente sobre un precio.
const DIAS_VIGENCIA = 30;

/**
 * @param {{ puntos?: number, dias?: number, limite?: number }} opciones
 * @returns {Promise<Array>} lo que necesitan los dos catálogos para pintarlas
 */
async function ofertasPorBajaDePrecio({ puntos = PUNTOS_MARGEN_MINIMO, dias = DIAS_VIGENCIA, limite = 40 } = {}) {
  const r = await query(`
    WITH cambios AS (
      SELECT
        h.alegra_item_id,
        h.precio_nuevo,
        h.costo_al_momento,
        h.margen_resultante,
        h.created_at,
        COALESCE(
          h.precio_anterior,
          LAG(h.precio_nuevo) OVER (PARTITION BY h.alegra_item_id ORDER BY h.created_at)
        ) AS precio_antes,
        ROW_NUMBER() OVER (PARTITION BY h.alegra_item_id ORDER BY h.created_at DESC) AS reciente
      FROM precio_historico h
      WHERE h.origen = 'revision_precios'
        AND h.created_at >= NOW() - ($1 || ' days')::interval
    )
    SELECT
      c.alegra_item_id                                        AS "alegraItemId",
      p.name                                                  AS nombre,
      p.reference                                             AS referencia,
      p.category                                              AS categoria,
      p.image_url                                             AS imagen,
      p.tax_percentage                                        AS "taxPercentage",
      c.precio_antes::numeric                                 AS "precioAntes",
      c.precio_nuevo::numeric                                 AS "precioAhora",
      c.created_at                                            AS "cuando"
    FROM cambios c
    JOIN alegra_products_cache p ON p.alegra_id = c.alegra_item_id
    WHERE c.reciente = 1
      AND c.precio_antes IS NOT NULL
      AND c.precio_nuevo < c.precio_antes
      AND p.status = 'active'
      AND p.hidden_locally = FALSE
      -- El margen de antes, menos el de ahora, en puntos.
      AND (((c.precio_antes - c.costo_al_momento) / NULLIF(c.precio_antes, 0) * 100) - c.margen_resultante) >= $2
    ORDER BY (c.precio_antes - c.precio_nuevo) / NULLIF(c.precio_antes, 0) DESC
    LIMIT $3;
  `, [String(dias), puntos, Math.min(Number(limite) || 40, 100)]);

  return r.rows.map(o => {
    const antes = Number(o.precioAntes);
    const ahora = Number(o.precioAhora);
    const iva = Number(o.taxPercentage);
    // El precio que el cliente ve en el catálogo lleva impuesto; el de la
    // bitácora no. Se convierten los dos con la misma regla para que el
    // "antes" y el "ahora" sean comparables.
    const conIva = (n) => (Number.isFinite(iva) ? Math.round(n * (1 + iva / 100) * 100) / 100 : n);

    return {
      alegraItemId: String(o.alegraItemId),
      nombre: o.nombre,
      referencia: o.referencia || '',
      categoria: o.categoria || '',
      imagen: o.imagen || null,
      precioAntes: conIva(antes),
      precioAhora: conIva(ahora),
      // Lo que de verdad le importa al cliente: cuánto menos paga.
      descuentoPorcentaje: Math.round(((antes - ahora) / antes) * 100),
      ahorro: conIva(antes) - conIva(ahora),
      desde: o.cuando
    };
  });
}

module.exports = { ofertasPorBajaDePrecio, PUNTOS_MARGEN_MINIMO, DIAS_VIGENCIA };

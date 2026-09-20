/**
 * Pone en una factura de proveedor, ya guardada por Prisma, los campos que
 * Prisma no conoce: la ruta del XML y los totales del resumen que explican
 * por qué el total del comprobante no siempre es la suma de las líneas
 * (`total_otros_cargos`, `total_descuentos`, `total_iva_devuelto`,
 * `otros_cargos`, el detalle) — ver migraciones 021 y 022.
 *
 * SE HACE CON SQL Y NO CON PRISMA, mismo motivo que
 * `productos-revision/idsPropiosDelMapeo.js`: agregarle los campos al
 * esquema de Prisma obliga a `prisma generate`, y en esta rama
 * `node_modules` es un enlace al árbol de `main`/`developer` — regenerar el
 * cliente desde acá le cambiaría el suyo a la otra rama. Cuando las ramas se
 * junten, esto pasa a ser un `data: {}` más grande y este archivo desaparece.
 *
 * NO FALLA SI NO SE PUEDE: perder estos datos no puede tumbar el guardado de
 * la factura que ya se hizo.
 */

const { query } = require('../../config/database');

async function guardarXmlRutaDeFactura(facturaId, xmlRuta) {
  if (!xmlRuta || !facturaId) return;
  try {
    await query('UPDATE facturas_proveedores SET xml_ruta = $1 WHERE id = $2', [xmlRuta, facturaId]);
  } catch (error) {
    console.warn(`⚠️ No se pudo guardar la ruta del XML de la factura ${facturaId}:`, error.message);
  }
}

/**
 * @param {Object} totales   `facturaData.resumen.totales` ya parseado
 * @param {Array}  otrosCargos  `facturaData.otrosCargos` ya parseado
 */
async function guardarTotalesDelResumen(facturaId, totales, otrosCargos) {
  if (!facturaId || !totales) return;
  try {
    await query(
      `UPDATE facturas_proveedores
          SET total_otros_cargos = $1, total_descuentos = $2,
              total_iva_devuelto = $3, otros_cargos = $4::jsonb
        WHERE id = $5`,
      [
        totales.otrosCargos || 0,
        totales.descuentos || 0,
        totales.ivaDevuelto || 0,
        JSON.stringify(otrosCargos || []),
        facturaId
      ]
    );
  } catch (error) {
    console.warn(`⚠️ No se pudieron guardar los totales del resumen de la factura ${facturaId}:`, error.message);
  }
}

module.exports = { guardarXmlRutaDeFactura, guardarTotalesDelResumen };

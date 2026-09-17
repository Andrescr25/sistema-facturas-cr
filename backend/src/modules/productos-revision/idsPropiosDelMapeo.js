/**
 * Colgar un mapeo proveedor↔producto de NUESTROS ids.
 *
 * `supplier_product_mapping` se llavea por `alegra_item_id` y `supplier_cedula`:
 * un id de un sistema ajeno y un texto que llega escrito de varias formas.
 * La migración 018 le agregó `producto_id` y `proveedor_id` y rellenó los
 * 2.060 que había. Esto es lo que evita que los mapeos NUEVOS nazcan con esas
 * columnas vacías y la migración se pudra al día siguiente.
 *
 * SE HACE CON SQL Y NO CON PRISMA a propósito: agregar los campos al esquema
 * obliga a `prisma generate`, y en esta rama `node_modules` es un enlace al
 * árbol de producción — regenerar el cliente desde el esquema de la rama le
 * cambiaría el suyo a `main`. Cuando las dos ramas se junten, esto pasa a ser
 * dos campos más del upsert y este archivo desaparece.
 *
 * NO FALLA SI NO ENCUENTRA. Un producto que todavía no está en el maestro no
 * puede impedir que se guarde la relación: queda en NULL y se rellena cuando
 * el producto exista. Hay 4 así de los 2.060 —tres de prueba y uno borrado en
 * Alegra—.
 */

const { query } = require('../../../config/database');

/**
 * @param {string} mapeoId  el id del mapeo recién creado o actualizado
 */
async function ligarIdsPropios(mapeoId) {
  if (!mapeoId) return;

  try {
    await query(`
      UPDATE supplier_product_mapping m
         SET producto_id  = COALESCE(m.producto_id,  p.id),
             proveedor_id = COALESCE(m.proveedor_id, pr.id)
        FROM supplier_product_mapping base
        LEFT JOIN producto p   ON p.alegra_id = base.alegra_item_id::text
        LEFT JOIN proveedor pr ON pr.identificacion = base.supplier_cedula
       WHERE m.id = base.id AND m.id = $1
    `, [mapeoId]);
  } catch (error) {
    // Que no se pueda colgar de nuestros ids no es motivo para perder la
    // relación que la persona acaba de confirmar.
    console.warn(`⚠️ No se pudieron ligar los ids propios del mapeo ${mapeoId}:`, error.message);
  }
}

module.exports = { ligarIdsPropios };

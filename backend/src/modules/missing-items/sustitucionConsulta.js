const { ingresoDisponibleSql } = require('./ingresoFaltante');
const { contextoFacturaEn } = require('../facturacion/sustitucionFactura.service');
const { httpError } = require('../../utils/validacion');
const { NORMALIZAR_SQL, normalizar } = require('../catalogo-clientes/consultaProducto');

async function contextoEn(db, faltante) {
  const contexto = await contextoFacturaEn(db, faltante.factura_propia_id);
  const { rows: [original] } = await db.query(`SELECT p.id,p.nombre,p.referencia,p.categoria_id,p.subcategoria_id,
    ${ingresoDisponibleSql('f')} AS disponible,aj.cantidad_entregada,aj.revisado
    FROM faltantes f JOIN producto p ON p.id=f.producto_propio_id
    LEFT JOIN faltantes_ajustes aj ON aj.faltante_id=f.id WHERE f.id=$1`, [faltante.id]);
  if (!original) throw httpError(409, 'El producto original ya no está disponible. Revisá esta factura en Impresión.');
  if (Number(faltante.cantidad_rebajada) > 0) throw httpError(409, 'Esta factura ya se ajustó en Impresión. Revisá su corrección desde Impresión.');
  if (original.revisado) throw httpError(409, 'Deshacé la revisión del producto antes de cambiarlo.');
  if (Number(original.cantidad_entregada) > 0 || Number(original.disponible) > 0) {
    throw httpError(409, 'Este producto tiene unidades ingresadas. Revisá su entrega antes de cambiarlo.');
  }
  return { ...contexto, original };
}

/** Solo productos efectivamente ingresados, descontando todas sus reservas.
 * Primero acota por compras recientes; no correlaciona todo el catálogo. */
async function candidatosEn(db, faltante, original, buscar = '', productoId = null) {
  const { rows } = await db.query(`WITH opciones AS MATERIALIZED (
    SELECT p.id,p.nombre,p.referencia,p.unidad,p.categoria_id,p.subcategoria_id,
      p.precio_sin_iva AS precio_sin_iva,COALESCE(i.tarifa,0) AS tarifa,
      ${ingresoDisponibleSql('f')} AS disponible
    FROM (SELECT DISTINCT cl.producto_id FROM compra_linea cl JOIN compra co ON co.id=cl.compra_id
      WHERE co.estado='registrada' AND co.creado_en >= $1::timestamp - interval '12 hours') entrados
    JOIN producto p ON p.id=entrados.producto_id LEFT JOIN impuesto i ON i.id=p.impuesto_id,
      LATERAL (SELECT 0::int AS id,p.id AS producto_propio_id,$1::timestamp AS created_at) f
    WHERE p.activo AND p.precio_sin_iva>0 AND p.id<>$2
      AND ($3::int IS NULL OR p.id=$3)
      AND ${NORMALIZAR_SQL("p.nombre || ' ' || COALESCE(p.referencia,'')")} LIKE $4
    ) SELECT * FROM opciones WHERE disponible>0
    ORDER BY (subcategoria_id=$5) DESC NULLS LAST,(categoria_id=$6) DESC NULLS LAST,nombre,id LIMIT 30`,
  [faltante.ingreso_desde, faltante.producto_propio_id, productoId, `%${normalizar(String(buscar).trim().slice(0,120))}%`, original.subcategoria_id, original.categoria_id]);
  return rows.map(p => ({ ...p, disponible:Number(p.disponible), precio_sin_iva:Number(p.precio_sin_iva), tarifa:Number(p.tarifa) }));
}

module.exports = { contextoEn, candidatosEn };

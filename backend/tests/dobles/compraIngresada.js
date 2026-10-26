/**
 * Lo que hoy exige marcar «Llegó todo» o «Parte» en Reporte Clientes: que el
 * producto haya ingresado por una compra registrada (2026-10-25,
 * src/modules/missing-items/ingresoFaltante.js). Las pruebas que marcan
 * entregas la crean con esto, registrada ahora en hora de Costa Rica.
 */
const { randomUUID } = require('node:crypto');

async function compraIngresada(db, productoId, cantidad) {
  const etiqueta = `ZZ-INGRESO-${randomUUID().slice(0, 8)}`;
  const { rows: [proveedor] } = await db.query(
    'INSERT INTO proveedor(nombre,identificacion) VALUES($1,$1) RETURNING id', [etiqueta]);
  const { rows: [compra] } = await db.query(`INSERT INTO compra(proveedor_id,numero_consecutivo,fecha_emision,total,estado,creado_en)
    VALUES($1,$2,CURRENT_DATE,1,'registrada',(now() AT TIME ZONE 'America/Costa_Rica')) RETURNING id`, [proveedor.id, etiqueta]);
  await db.query(`INSERT INTO compra_linea(compra_id,numero_linea,producto_id,descripcion,cantidad,precio_unitario,total_linea)
    VALUES($1,1,$2,$3,$4,1,1)`, [compra.id, productoId, etiqueta, cantidad]);
  return { proveedorId: proveedor.id, compraId: compra.id };
}

/** Para las pruebas que confirman sus datos: lo asignado, la compra y su proveedor. */
async function quitarCompraIngresada(db, { proveedorId, compraId }) {
  await db.query('DELETE FROM faltante_ingreso WHERE compra_linea_id IN (SELECT id FROM compra_linea WHERE compra_id=$1)', [compraId]);
  await db.query('DELETE FROM compra WHERE id=$1', [compraId]);
  await db.query('DELETE FROM proveedor WHERE id=$1', [proveedorId]);
}

module.exports = { compraIngresada, quitarCompraIngresada };

/** La fecha acota la lista visible, pero no borra la prueba durable de un
 * intento conocido. Permite otra compra tras un incierto ya separado sin
 * liberar una petición cuyo resultado nunca se recibió (503/timeout).
 */
async function comprobarEn(db, proveedores) {
  if (!proveedores.length) return;
  const { rows } = await db.query(`SELECT o.id orden_id,e.id envio_id,
    o.proveedor_cedula,p.nombre nombre_actual,o.proveedor_nombre,e.estado,
    o.enviada_en FROM orden_compra_ciclo o JOIN proveedor p ON p.id=o.proveedor_id
    JOIN orden_compra_ciclo_envio e ON e.id=o.envio_id
    WHERE e.estado IN ('enviando','incierto','confirmado')
      AND (o.proveedor_cedula=ANY($1::text[]) OR lower(p.nombre)=ANY($2::text[]))`,
  [proveedores.map(p=>p.cedula).filter(Boolean),proveedores.filter(p=>!p.cedula).map(p=>p.nombre.toLowerCase())]);
  for (const p of proveedores) p.comprobacionEnvios = rows.filter(r=>p.cedula
    ? r.proveedor_cedula===p.cedula
    : [r.nombre_actual,r.proveedor_nombre].some(n=>n?.toLowerCase()===p.nombre.toLowerCase()))
    .map(r=>({ orden_id:r.orden_id,envio_id:r.envio_id,enviada:true,
      estado_envio:r.enviada_en?'enviada':'incierto' }));
}
module.exports = { comprobarEn };

/**
 * Auditorías del kardex propio. La apertura es cero PROVISIONAL por pedido
 * del usuario; el conteo completo de producción confirmará la cantidad real.
 * Los registros anteriores se conservan como historia, fuera del flujo nuevo.
 * Bodega -> auditoría es el orden de bloqueo. Conteo y movimiento se confirman
 * juntos: no hay lotes parciales ni stock almacenado que sobrescribir.
 */
const { pool } = require('../../../config/database');
const inv = require('../inventario/inventario.service');
const { httpError, idValido } = require('../../utils/validacion');
const { hoyEnCostaRica, diaEnCostaRica } = require('../../utils/fechaCR');
const { SQL_VIGENTES } = require('../../utils/descuentosExceso');
const DEVOLUCIONES = ['devolucion','devolucion_proveedor'];
const TIPOS = ['random','categoria','critico','inicial','exceso',...DEVOLUCIONES];
const transaccion = inv.conTransaccion;
const conteo = v => v == null || v === '' ? null : inv.decimal(v,'Conteo',{decimales:4});
function expirada(a) {
  return !['inicial','exceso',...DEVOLUCIONES].includes(a.tipo) && a.estado==='en_progreso' &&
    Date.now()-new Date(a.fecha_creacion).getTime()>=24*3600000;
}
async function cargarEn(db,id,editar=false) {
  const {rows:[a]}=await db.query(`SELECT * FROM inventario_auditorias WHERE id=$1 AND NOT historica${editar?' FOR UPDATE':''}`,[idValido(id)]);
  if(!a)throw httpError(404,'Auditoría activa no encontrada. Los registros anteriores son históricos.');
  return a;
}
function editable(a) {
  if(a.estado!=='en_progreso')throw httpError(409,'La auditoría ya fue finalizada.');
  if(expirada(a))throw httpError(409,'El conteo venció. Actualiza las existencias y vuelve a contar antes de aplicar.');
}
async function itemsEn(db,id) {
  return (await db.query(`SELECT i.*,p.imagen_url AS image_url,d.descuento_porcentaje,d.regalado
    FROM inventario_auditoria_items i JOIN producto p ON p.id=i.producto_id
    LEFT JOIN producto_descuento_exceso d ON d.producto_id=i.producto_id AND NOT d.historica
    WHERE i.auditoria_id=$1 ORDER BY i.nombre_producto,i.id`,[id])).rows;
}
async function productoEn(db,id) {
  const {rows:[p]}=await db.query(`${inv.SELECT_PRODUCTOS} WHERE p.id=$1 AND p.activo AND p.inventariable`,[idValido(id)]);
  if(!p)throw httpError(404,'Producto activo inventariable no encontrado.');return p;
}
async function nuevaEn(db,tipo,{nombre,categoria=null,revision}={}) {
  if(!TIPOS.includes(tipo))throw httpError(400,'Tipo de auditoría inválido.');
  if(nombre!=null&&(typeof nombre!=='string'||nombre.trim().length>255))throw httpError(400,'Nombre: hasta 255 caracteres.');
  if(!nombre?.trim()) {
    if(tipo==='exceso'||DEVOLUCIONES.includes(tipo)) {
      const prefijo=tipo==='exceso'?'Excesos':tipo==='devolucion_proveedor'?'Proveedor':'Ajuste';
      const {rows}=await db.query('SELECT nombre FROM inventario_auditorias WHERE tipo=$1 AND NOT historica',[tipo]);
      const nums=rows.map(r=>new RegExp(`^${prefijo}\\s+(\\d+)$`,'i').exec(r.nombre)?.[1]).map(Number).filter(Number.isFinite);
      nombre=`${prefijo} ${Math.max(0,...nums)+1}`;
    } else nombre=`${tipo==='inicial'?'Conteo inicial completo':'Auditoría '+tipo} - ${hoyEnCostaRica()}`;
  }
  return (await db.query(`INSERT INTO inventario_auditorias(nombre,tipo,categoria,estado,revision_inventario,historica)
    VALUES($1,$2,$3,'en_progreso',$4,FALSE) RETURNING *`,[nombre.trim(),tipo,categoria,revision])).rows[0];
}
async function insertarItemEn(db,a,p,stockReal=null,ultimaVenta=null) {
  return (await db.query(`INSERT INTO inventario_auditoria_items
    (auditoria_id,producto_id,nombre_producto,referencia,category,stock_sistema,stock_real,costo_unitario,precio_venta,revision_stock,ultima_venta)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [a.id,p.producto_id,p.nombre,p.referencia,p.categoria,p.existencia,stockReal,p.costo_promedio??p.costo_con_iva??0,p.precio_sin_iva,p.revision_stock,ultimaVenta])).rows[0];
}
async function listarAuditorias(tipo) {
  if(tipo&&!TIPOS.includes(tipo))throw httpError(400,'Tipo de auditoría inválido.');
  return (await pool.query(`SELECT * FROM inventario_auditorias WHERE NOT historica AND
    CASE WHEN $1::text='devolucion' THEN tipo IN ('devolucion','devolucion_proveedor')
      WHEN $1::text IS NOT NULL THEN tipo=$1 ELSE tipo NOT IN ('devolucion','devolucion_proveedor','exceso') END
    ORDER BY fecha_creacion DESC,id DESC`,[tipo||null])).rows;
}
async function listarCategorias() {
  return (await pool.query(`SELECT DISTINCT c.nombre FROM categoria_producto c JOIN producto p ON p.categoria_id=c.id
    WHERE p.activo AND p.inventariable ORDER BY c.nombre`)).rows.map(r=>r.nombre);
}
async function crearAuditoria({tipo,categoria,nombre}) {
  if(!['random','categoria','critico','inicial'].includes(tipo))throw httpError(400,'Tipo de auditoría inválido.');
  if(tipo==='categoria'&&!categoria)throw httpError(400,'Selecciona una categoría.');
  return transaccion(async db=>{
    const b=await inv.bloquear(db);
    if(tipo==='inicial'&&(await db.query(`SELECT id FROM inventario_auditorias WHERE NOT historica AND tipo='inicial' AND estado='en_progreso'`)).rows.length)
      throw httpError(409,'Ya hay un conteo inicial completo abierto. Continúa o actualiza ese conteo.');
    let sql=`${inv.SELECT_PRODUCTOS} WHERE p.activo AND p.inventariable`;const params=[];
    if(tipo==='inicial')sql+=' AND NOT s.conteo_confirmado ORDER BY p.nombre,p.id';
    if(tipo==='categoria'){sql+=' AND c.nombre=$1 ORDER BY p.nombre,p.id';params.push(categoria);}
    if(tipo==='random')sql+=' ORDER BY random() LIMIT 50';
    // Las incidencias y el producto usan ids propios, sin traducción externa.
    if(tipo==='critico')sql+=` ORDER BY (SELECT COUNT(*) AS total_incidencias FROM faltantes f WHERE f.producto_propio_id=p.id) DESC,random() LIMIT 30`;
    const {rows}=await db.query(sql,params);
    if(!rows.length)throw httpError(400,tipo==='inicial'?'No hay productos pendientes de conteo inicial.':'No hay productos para auditar.');
    const a=await nuevaEn(db,tipo,{nombre,categoria,revision:b.revision});
    for(const p of rows)await insertarItemEn(db,a,p);return a;
  });
}
async function getAuditoria(id){const a=await cargarEn(pool,id);return {...a,expirada:expirada(a),items:await itemsEn(pool,a.id)};}
async function guardarUnoEn(db,a,itemId,stockReal) {
  const valor=conteo(stockReal);
  const {rows:[i]}=await db.query('SELECT * FROM inventario_auditoria_items WHERE auditoria_id=$1 AND id=$2 FOR UPDATE',[a.id,idValido(itemId)]);
  if(!i)throw httpError(404,'El producto no pertenece a esta auditoría.');
  if(i.ajustado_inventario) {
    const {rows:[c]}=await db.query('SELECT $1::numeric IS NOT DISTINCT FROM $2::numeric AS igual',[i.stock_real,valor]);
    if(!c.igual)throw httpError(409,'Ese conteo ya se aplicó. Registra otra auditoría para corregirlo.');return;
  }
  await db.query('UPDATE inventario_auditoria_items SET stock_real=$1 WHERE id=$2',[valor,i.id]);
}
async function guardarConteoIndividual(id,itemId,stockReal) {
  return transaccion(async db=>{await inv.bloquear(db);const a=await cargarEn(db,id,true);editable(a);await guardarUnoEn(db,a,itemId,stockReal);});
}
async function validarInicialEn(db,a,b,items) {
  // Evita que una alta/baja concurrente cambie la lista a mitad de la apertura.
  await db.query('LOCK TABLE producto IN SHARE MODE');
  if(String(a.revision_inventario)!==String(b.revision))throw httpError(409,'El inventario cambió durante el conteo inicial. Actualiza las existencias y vuelve a contar.');
  const {rows}=await db.query('SELECT p.id FROM producto p JOIN inventario_saldo s ON s.producto_id=p.id WHERE p.activo AND p.inventariable AND NOT s.conteo_confirmado ORDER BY p.id');
  const ids=items.map(i=>i.producto_id).sort((x,y)=>x-y);
  if(JSON.stringify(ids)!==JSON.stringify(rows.map(r=>r.id)))throw httpError(409,'El catálogo cambió. Actualiza el conteo inicial completo para incluir todos los productos pendientes.');
  if(items.some(i=>i.stock_real==null))throw httpError(400,'Cuenta todos los productos antes de confirmar la apertura física.');
}
async function aplicarEn(db,a,b,{completo=false,usuarioId=null}={}) {
  const items=await itemsEn(db,a.id);
  if(!items.length)throw httpError(400,'Agrega al menos un producto.');
  if(a.tipo==='inicial') {
    if(!completo)throw httpError(409,'El conteo inicial se aplica completo al finalizar; guardar solo conserva el borrador.');
    await validarInicialEn(db,a,b,items);
  }
  if(completo&&items.some(i=>i.stock_real==null))throw httpError(400,'Todavía hay productos sin contar.');
  if(a.tipo==='exceso'&&completo&&items.some(i=>!i.empacado))throw httpError(400,'Todavía hay productos sin empacar.');
  let ajustados=0;
  for(const i of items) {
    if(i.ajustado_inventario||i.stock_real==null)continue;
    const s=await inv.saldo(db,i.producto_id);
    if(String(s.revision_stock)!==String(i.revision_stock))throw httpError(409,`Las existencias de ${i.nombre_producto} cambiaron después de empezar el conteo. Actualiza y vuelve a contar.`);
    const {rows:[d]}=await db.query('SELECT ($1::numeric-$2::numeric)::numeric(14,4) AS cantidad',[i.stock_real,s.existencia]);
    if(Number(d.cantidad)!==0||a.tipo==='inicial')await inv.registrarEn(db,{productoId:i.producto_id,
      tipo:a.tipo==='inicial'?'inicial':a.tipo==='devolucion_proveedor'?'devolucion_proveedor':'ajuste_auditoria',
      cantidad:d.cantidad,cantidadContada:a.tipo==='inicial'?i.stock_real:null,
      costoUnitario:a.tipo==='inicial'?i.costo_unitario:s.costo_promedio??i.costo_unitario,
      origenTipo:a.tipo==='devolucion_proveedor'?'devolucion_proveedor':'auditoria_item',origenId:i.id,
      clave:`auditoria:${a.id}:item:${i.id}`,usuarioId,observaciones:`${a.nombre}: conteo físico ${i.stock_real}.`});
    await db.query('UPDATE inventario_auditoria_items SET ajustado_inventario=TRUE WHERE id=$1',[i.id]);ajustados++;
  }
  if(a.tipo==='inicial')await db.query('UPDATE inventario_bodega SET inicializada_en=COALESCE(inicializada_en,CURRENT_TIMESTAMP) WHERE id=1');
  return {itemsAdjusted:ajustados};
}
async function guardarConteos(id,items,usuarioId=null) {
  if(!Array.isArray(items)||items.length>10000)throw httpError(400,'Lista de conteos inválida.');
  return transaccion(async db=>{
    const b=await inv.bloquear(db),a=await cargarEn(db,id,true);editable(a);
    for(const i of items)await guardarUnoEn(db,a,i.id,i.stock_real);
    if(a.tipo!=='inicial')await aplicarEn(db,a,b,{usuarioId});
    return {message:a.tipo==='inicial'?'Conteos guardados. La apertura se aplicará completa al finalizar.':'Conteos y ajustes confirmados en el inventario propio.'};
  });
}
async function finalizarAuditoria(id,observaciones,usuarioId=null) {
  if(observaciones!=null&&(typeof observaciones!=='string'||observaciones.length>10000))throw httpError(400,'Observaciones: hasta 10000 caracteres.');
  return transaccion(async db=>{
    const b=await inv.bloquear(db),a=await cargarEn(db,id,true);
    if(a.estado==='finalizado')return a; // Reintento tras perder la respuesta.
    editable(a);await aplicarEn(db,a,b,{completo:true,usuarioId});
    return (await db.query(`UPDATE inventario_auditorias SET estado='finalizado',
      precision_porcentaje=(SELECT 100.0*COUNT(*) FILTER(WHERE stock_real=stock_sistema)/COUNT(*) FROM inventario_auditoria_items WHERE auditoria_id=$1),
      descuadre_dinero=(SELECT SUM((stock_real-stock_sistema)*costo_unitario) FROM inventario_auditoria_items WHERE auditoria_id=$1),
      observaciones=$2,fecha_finalizacion=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[a.id,observaciones||null])).rows[0];
  });
}
async function ajustarInventario(id,usuarioId=null) {
  return transaccion(async db=>{
    const b=await inv.bloquear(db),a=await cargarEn(db,id,true);
    if(a.estado==='finalizado')return {message:'Este conteo ya fue aplicado al inventario propio.'};
    editable(a);
    if(a.tipo==='inicial')throw httpError(409,'Finaliza el conteo inicial completo para confirmar las existencias físicas.');
    return {message:'Ajuste confirmado en el inventario propio.',data:await aplicarEn(db,a,b,{usuarioId})};
  });
}
async function resincronizarAuditoria(id) {
  return transaccion(async db=>{
    const b=await inv.bloquear(db),a=await cargarEn(db,id,true);
    if(a.estado!=='en_progreso')throw httpError(409,'La auditoría ya fue finalizada.');
    if(a.tipo==='inicial') {
      // Cambio de catálogo: reconstruir exige volver a contar todo, nunca
      // confirmar una apertura parcial con una lista vieja de productos.
      await db.query('DELETE FROM inventario_auditoria_items WHERE auditoria_id=$1 AND NOT ajustado_inventario',[a.id]);
      const {rows}=await db.query(`${inv.SELECT_PRODUCTOS} WHERE p.activo AND p.inventariable AND NOT s.conteo_confirmado ORDER BY p.nombre,p.id`);
      for(const p of rows)await insertarItemEn(db,a,p);
    } else await db.query(`UPDATE inventario_auditoria_items i SET stock_sistema=s.existencia,stock_real=NULL,
      revision_stock=s.revision_stock,costo_unitario=COALESCE(s.costo_promedio,p.costo_con_iva,0),precio_venta=p.precio_sin_iva,empacado=FALSE
      FROM producto p JOIN inventario_saldo s ON s.producto_id=p.id WHERE i.producto_id=p.id AND i.auditoria_id=$1 AND NOT i.ajustado_inventario`,[a.id]);
    await db.query('UPDATE inventario_auditorias SET fecha_creacion=CURRENT_TIMESTAMP,revision_inventario=$2 WHERE id=$1',[a.id,b.revision]);
  });
}
async function crearDevolucion(destino='cliente') {
  if(!['cliente','proveedor'].includes(destino))throw httpError(400,'Selecciona devolución de cliente o a proveedor.');
  return transaccion(async db=>{const b=await inv.bloquear(db);return nuevaEn(db,destino==='proveedor'?'devolucion_proveedor':'devolucion',{revision:b.revision});});
}
async function buscarProductosParaDevolucion(q) {
  if(!String(q||'').trim())return [];
  const {productos}=await inv.listarExistencias({q:String(q),limit:30});
  return productos.map(p=>({productoId:p.producto_id,nombre:p.nombre,referencia:p.referencia,categoria:p.categoria,
    costoUnitario:Number(p.costo_promedio??p.costo_con_iva),precioVenta:Number(p.precio_sin_iva),stockActual:Number(p.existencia)}));
}
async function agregarItemDevolucion(id,{productoId,cantidadDevuelta}) {
  const cantidad=inv.decimal(cantidadDevuelta,'Cantidad devuelta',{decimales:4});
  if(Number(cantidad)<=0)throw httpError(400,'La cantidad devuelta debe ser mayor a cero.');
  return transaccion(async db=>{
    await inv.bloquear(db);const a=await cargarEn(db,id,true);editable(a);
    if(!DEVOLUCIONES.includes(a.tipo))throw httpError(400,'Este registro no es una devolución.');
    const p=await productoEn(db,productoId);
    if((await db.query('SELECT id FROM inventario_auditoria_items WHERE auditoria_id=$1 AND producto_id=$2',[a.id,p.producto_id])).rows.length)throw httpError(409,'Ese producto ya está en esta devolución.');
    const {rows:[d]}=await db.query('SELECT ($1::numeric+$2::numeric*$3)::numeric(14,4) AS cantidad',[p.existencia,cantidad,a.tipo==='devolucion_proveedor'?-1:1]);
    if(Number(d.cantidad)<0)throw httpError(400,'La devolución a proveedor supera las existencias disponibles.');
    return insertarItemEn(db,a,p,d.cantidad);
  });
}
async function eliminarItemDevolucion(id,itemId) {
  return transaccion(async db=>{
    await inv.bloquear(db);const a=await cargarEn(db,id,true);editable(a);
    if(!['inicial','exceso',...DEVOLUCIONES].includes(a.tipo))throw httpError(400,'No se puede quitar un producto de este conteo.');
    const {rows:[i]}=await db.query('SELECT * FROM inventario_auditoria_items WHERE auditoria_id=$1 AND id=$2',[a.id,idValido(itemId)]);
    if(!i)throw httpError(404,'Producto no encontrado en esta auditoría.');
    if(i.ajustado_inventario)throw httpError(409,'El movimiento ya se aplicó; conserva su respaldo y corrígelo con otra auditoría.');
    await db.query('DELETE FROM inventario_auditoria_items WHERE id=$1',[i.id]);
  });
}
async function crearExcesoManual(){return transaccion(async db=>{const b=await inv.bloquear(db);return nuevaEn(db,'exceso',{revision:b.revision});});}
async function eliminarAuditoria(id) {
  return transaccion(async db=>{
    await inv.bloquear(db);const a=await cargarEn(db,id,true);
    if(a.tipo!=='exceso')throw httpError(400,'Solo se pueden eliminar tandas de excesos.');
    if((await db.query('SELECT id FROM inventario_auditoria_items WHERE auditoria_id=$1 AND ajustado_inventario',[a.id])).rows.length)throw httpError(409,'No se puede borrar el respaldo de un movimiento ya aplicado.');
    await db.query('DELETE FROM inventario_auditorias WHERE id=$1',[a.id]);return {eliminado:true,nombre:a.nombre};
  });
}
function descuentoValido(v) {
  if(v==null||v===''||!Number.isInteger(Number(v))||Number(v)<0||Number(v)>100)throw httpError(400,'El descuento debe ser un entero entre 0 y 100.');return Number(v);
}
async function descuentoEn(db,p,descuento,{soloNuevo=false}={}) {
  // Solo una acción actual reactiva un descuento histórico. El alta inicial
  // NO aumenta un descuento existente ni regala nada (decisión 2026-09-20).
  return db.query(`INSERT INTO producto_descuento_exceso(producto_id,nombre_producto,referencia,descuento_porcentaje,veces_detectado,regalado,historica)
    VALUES($1,$2,$3,$4,1,FALSE,FALSE) ON CONFLICT(producto_id) DO UPDATE SET
    descuento_porcentaje=EXCLUDED.descuento_porcentaje,nombre_producto=EXCLUDED.nombre_producto,referencia=EXCLUDED.referencia,
    regalado=FALSE,historica=FALSE,ultima_actualizacion=CURRENT_TIMESTAMP
    ${soloNuevo?'WHERE producto_descuento_exceso.historica':''} RETURNING *`,[p.producto_id,p.nombre,p.referencia,descuento]);
}
async function agregarItemExceso(id,{productoId}) {
  return transaccion(async db=>{
    await inv.bloquear(db);const a=await cargarEn(db,id,true);editable(a);
    if(a.tipo!=='exceso')throw httpError(400,'Este registro no es una tanda de excesos.');
    const p=await productoEn(db,productoId);
    if((await db.query('SELECT id FROM inventario_auditoria_items WHERE auditoria_id=$1 AND producto_id=$2',[a.id,p.producto_id])).rows.length)throw httpError(409,'El producto ya está en la tanda.');
    const i=await insertarItemEn(db,a,p);await descuentoEn(db,p,10,{soloNuevo:true});return i;
  });
}
async function actualizarItemExceso(id,itemId,{empacado,stockReal},usuarioId=null) {
  if(empacado!==undefined&&typeof empacado!=='boolean')throw httpError(400,'Empacado debe ser sí o no.');
  return transaccion(async db=>{
    const b=await inv.bloquear(db),a=await cargarEn(db,id,true);editable(a);
    if(a.tipo!=='exceso')throw httpError(400,'Este registro no es una tanda de excesos.');
    const {rows:[i]}=await db.query('SELECT * FROM inventario_auditoria_items WHERE auditoria_id=$1 AND id=$2',[a.id,idValido(itemId)]);
    if(!i)throw httpError(404,'Producto no encontrado en esta tanda.');
    if(stockReal!==undefined)await guardarUnoEn(db,a,i.id,stockReal);
    if(empacado===true&&stockReal===undefined&&i.stock_real==null)await guardarUnoEn(db,a,i.id,i.stock_sistema);
    if(empacado!==undefined)await db.query('UPDATE inventario_auditoria_items SET empacado=$1 WHERE id=$2',[empacado,i.id]);
    if(stockReal!==undefined||empacado===true)await aplicarEn(db,a,b,{usuarioId});
    return (await itemsEn(db,a.id)).find(r=>r.id===i.id);
  });
}
async function aplicarDescuentoTanda(id,{descuentoPorcentaje}) {
  const d=descuentoValido(descuentoPorcentaje);
  return transaccion(async db=>{
    await inv.bloquear(db);const a=await cargarEn(db,id,true);
    if(a.tipo!=='exceso')throw httpError(400,'Este registro no es una tanda de excesos.');
    const items=await itemsEn(db,a.id);for(const i of items)await descuentoEn(db,await productoEn(db,i.producto_id),d);
    return {afectados:items.length,descuentoPorcentaje:d,quitados:d===0};
  });
}
async function guardarDescuentoExceso({productoId,descuentoPorcentaje}) {
  const d=descuentoValido(descuentoPorcentaje);
  return transaccion(async db=>{await inv.bloquear(db);return (await descuentoEn(db,await productoEn(db,productoId),d)).rows[0];});
}
async function eliminarDescuentoExceso(productoId) {
  const {rows:[d]}=await pool.query('DELETE FROM producto_descuento_exceso WHERE producto_id=$1 AND NOT historica RETURNING nombre_producto',[idValido(productoId)]);
  if(!d)throw httpError(404,'El producto no tiene descuento activo.');return {eliminado:true,nombre:d.nombre_producto};
}
async function listarDescuentosExceso() {
  const {rows}=await pool.query(`WITH vigentes AS (${SQL_VIGENTES.replace(/;\s*$/,'')})
    SELECT d.*,s.existencia AS stock_efectivo,v.producto_id IS NOT NULL AS visible
    FROM producto_descuento_exceso d JOIN inventario_saldo s ON s.producto_id=d.producto_id
    LEFT JOIN vigentes v ON v.producto_id=d.producto_id WHERE NOT d.historica ORDER BY d.descuento_porcentaje DESC,d.nombre_producto`);
  return rows.map(r=>({productoId:r.producto_id,nombreProducto:r.nombre_producto,referencia:r.referencia,
    descuentoPorcentaje:Number(r.descuento_porcentaje),vecesDetectado:r.veces_detectado,regalado:r.regalado,
    ultimaActualizacion:r.ultima_actualizacion,stockEfectivo:Number(r.stock_efectivo),visibleEnCatalogo:r.visible,
    motivoNoVisible:r.visible?null:r.regalado?'Ya se regaló':Number(r.stock_efectivo)<=0?'No queda stock':Number(r.descuento_porcentaje)<=0?'Sin descuento':'Todavía no se ha confirmado el empaque'}));
}
async function listarRegalos(){return (await pool.query('SELECT * FROM regalos_exceso WHERE NOT historica ORDER BY fecha_regalo DESC')).rows;}
async function detectarCandidatosExceso(db=pool) {
  const limite=new Date();limite.setDate(limite.getDate()-60);
  const {rows}=await db.query(`WITH ultimas AS (SELECT producto_id,MAX(fecha) AS ultima_venta FROM venta_linea GROUP BY producto_id)
    SELECT p.id AS producto_id,p.nombre,p.referencia,c.nombre AS categoria,p.precio_sin_iva,
      s.existencia,s.costo_promedio,p.costo_con_iva,s.revision_stock,u.ultima_venta
    FROM producto p JOIN inventario_saldo s ON s.producto_id=p.id
    LEFT JOIN categoria_producto c ON c.id=p.categoria_id LEFT JOIN ultimas u ON u.producto_id=p.id
    WHERE p.activo AND p.inventariable AND s.existencia>0 AND COALESCE(p.referencia,'') NOT IN ('10062','0000')
      AND (u.ultima_venta IS NULL OR u.ultima_venta<$1::date)
    ORDER BY s.existencia*COALESCE(s.costo_promedio,p.costo_con_iva,0) DESC,p.id`,[diaEnCostaRica(limite)]);
  return {candidatos:rows};
}
async function escalarDescuentosExceso(candidatos) {
  return transaccion(async db=>{await inv.bloquear(db);for(const c of candidatos)await descuentoEn(db,await productoEn(db,c.producto_id),10,{soloNuevo:true});return [];});
}
async function depurarOfertasSinStock(db=pool) {
  // SQL_VIGENTES también consulta el stock actual: no depende de esta acción
  // para ocultar lo agotado. Un fallo SQL no se interpreta como cero stock.
  const {rows}=await db.query(`UPDATE producto_descuento_exceso d SET descuento_porcentaje=0,ultima_actualizacion=CURRENT_TIMESTAMP
    FROM inventario_saldo s WHERE d.producto_id=s.producto_id AND NOT d.historica AND d.descuento_porcentaje>0
    AND s.existencia<=0 RETURNING d.producto_id AS id,d.nombre_producto AS nombre`);
  return {revisados:rows.length,sacados:rows};
}
async function generarTandaDeExcesos() {
  return transaccion(async db=>{
    const b=await inv.bloquear(db),{candidatos}=await detectarCandidatosExceso(db),depurados=await depurarOfertasSinStock(db);
    if(!candidatos.length)return {creado:false,message:'No hay productos con existencias que cumplan 60 días sin venta.',regalosNuevos:[],depurados};
    for(const p of candidatos)await descuentoEn(db,p,10,{soloNuevo:true});
    const a=await nuevaEn(db,'exceso',{revision:b.revision}),seleccionados=candidatos.slice(0,10);
    for(const p of seleccionados)await insertarItemEn(db,a,p,null,p.ultima_venta);
    return {creado:true,id:a.id,nombre:a.nombre,total:seleccionados.length,totalDetectados:candidatos.length,regalosNuevos:[],depurados};
  });
}
module.exports={listarAuditorias,listarCategorias,crearAuditoria,getAuditoria,guardarConteos,guardarConteoIndividual,
  finalizarAuditoria,ajustarInventario,resincronizarAuditoria,crearDevolucion,buscarProductosParaDevolucion,agregarItemDevolucion,
  eliminarItemDevolucion,detectarCandidatosExceso,escalarDescuentosExceso,generarTandaDeExcesos,depurarOfertasSinStock,
  actualizarItemExceso,listarRegalos,crearExcesoManual,eliminarAuditoria,agregarItemExceso,aplicarDescuentoTanda,
  listarDescuentosExceso,guardarDescuentoExceso,eliminarDescuentoExceso};

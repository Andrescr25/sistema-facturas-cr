/** Cantidades de revisión enteras y persistencia atómica; PostgreSQL local. */
const { test,before,after }=require('node:test');
const assert=require('node:assert/strict');
const {sembrar}=require('./dobles/ordenesAutomaticas');
const {baseEnTransaccion}=require('./dobles/buzonEnTransaccion');
const activo=process.env.PROBAR_BASE_LOCAL==='1';
let pool,c,f,s;
const caso=(nombre,fn)=>test(nombre,{skip:!activo},async()=>{await c.query('SAVEPOINT temporal_caso');try{await fn()}finally{await c.query('ROLLBACK TO SAVEPOINT temporal_caso')}});
if(activo){
 require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
 before(async()=>{pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL});c=await pool.connect();await c.query('BEGIN');f=await sembrar(c);
  const ruta=require.resolve('../config/database');require.cache[ruta]={id:ruta,filename:ruta,loaded:true,exports:baseEnTransaccion(c,'temporal')};
  s=require('../src/modules/orders-whatsapp/temporalesProveedor.service');
 });
 after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool?.end()});
}
const cantidad=(q,id=f.productos[0],datos={})=>({proveedor_nombre:f.p.nombre,producto_codigo:`id:${id}`,producto_id:id,producto_nombre:'ZZ cantidad',cantidad_original:10,cantidad_modificada:q,...datos});
const filas=async()=> (await s.getCantidadesModificadas()).rows.filter(r=>r.proveedor_nombre===f.p.nombre);
caso('guardar entero conserva id/código real y el remanente exacto no se modifica',async()=>{
 const [producto]=(await c.query('SELECT referencia FROM producto WHERE id=$1',[f.productos[0]])).rows;
 await s.guardarCantidades([cantidad(2,undefined,{cantidad_original:1.7})]);const [r]=await filas();
 assert.equal(r.producto_id,f.productos[0]);assert.equal(r.clave_producto,`id:${f.productos[0]}`);assert.equal(r.codigo_interno,producto.referencia);assert.equal(r.cantidad_modificada,2);assert.equal(r.cantidad_original,2);
 assert.equal(Number((await c.query('SELECT cantidad FROM factura_linea WHERE factura_id=$1 AND producto_id=$2',[f.facturas[0],f.productos[0]])).rows[0].cantidad),20);
});
caso('fracciones, negativos, vacíos y booleanos se rechazan antes de guardar cualquier fila',async()=>{
 for(const q of [.07,.5,-1,'',true,{},null,NaN]){
  await assert.rejects(s.guardarCantidades([cantidad(7),cantidad(q,f.productos[1])]),e=>e.status===400);
  assert.equal((await filas()).length,0);
 }
});
caso('agregado sólo admite enteros positivos y deshacer no borra una modificación',async()=>{
 for(const q of [.07,0,-1,true])await assert.rejects(s.registrarProductoAgregado(f.p.nombre,`extra:id:${f.productos[0]}`,'ZZ',q,{productoId:f.productos[0]}),e=>e.status===400);
 await s.registrarProductoAgregado(f.p.nombre,`extra:id:${f.productos[0]}`,'ZZ',3,{productoId:f.productos[0]});
 await s.guardarCantidades([cantidad(7)]);await s.eliminarRegistroTemporal(f.p.nombre,`id:${f.productos[0]}`,'eliminado');
 assert.equal((await filas()).find(r=>r.accion==='modificado').cantidad_modificada,7);
});
caso('extra legado único se convierte al total revisado sin reaparecer al recargar',async()=>{
 const p=(await c.query('SELECT nombre,referencia FROM producto WHERE id=$1',[f.productos[0]])).rows[0];
 await c.query("INSERT INTO orden_compra_temporal(proveedor_nombre,producto_codigo,producto_nombre,cantidad_original,cantidad_modificada,accion) VALUES($1,$2,$3,0,3,'agregado')",[f.p.nombre,p.referencia,p.nombre]);
 assert.equal((await filas())[0].producto_id,f.productos[0]);
 await s.guardarCantidades([cantidad(10,undefined,{extras_sustituidos:[p.referencia]})]);
 assert.equal((await filas()).length,1);assert.equal((await filas())[0].accion,'modificado');assert.equal((await filas())[0].cantidad_modificada,10);
});
caso('conservar extra y excluir original sucede en una única transacción',async()=>{
 await s.registrarProductoAgregado(f.p.nombre,`id:${f.productos[0]}`,'ZZ',3,{productoId:f.productos[0]});
 await s.guardarCantidades([cantidad(0,undefined,{extra_conservado:{cantidad:3,productoCodigo:`extra:id:${f.productos[0]}`,clavesOrigen:[`id:${f.productos[0]}`]}})]);
 const r=await filas();assert.equal(r.length,2);assert.equal(r.find(r=>r.accion==='agregado').cantidad_modificada,3);assert.equal(r.find(r=>r.accion==='modificado').cantidad_modificada,0);
});
caso('un agregado de otro producto o ambiguo nunca se borra al consolidar',async()=>{
 await s.registrarProductoAgregado(f.p.nombre,`extra:id:${f.productos[1]}`,'ZZ',3,{productoId:f.productos[1]});const antes=await filas();
 await assert.rejects(s.guardarCantidades([cantidad(10,undefined,{extras_sustituidos:[`extra:id:${f.productos[1]}`]})]),e=>e.status===409);
 assert.deepEqual(await filas(),antes);
 const p=(await c.query('SELECT nombre,referencia FROM producto WHERE id=$1',[f.productos[0]])).rows[0];await c.query('INSERT INTO producto(nombre,referencia) VALUES($1,$2)',[p.nombre,p.referencia]);
 await c.query("INSERT INTO orden_compra_temporal(proveedor_nombre,producto_codigo,producto_nombre,cantidad_original,cantidad_modificada,accion) VALUES($1,$2,$3,0,3,'agregado')",[f.p.nombre,p.referencia,p.nombre]);
 assert.equal((await filas()).find(r=>r.producto_codigo===p.referencia).producto_id,null);
 await assert.rejects(s.guardarCantidades([cantidad(10,undefined,{extras_sustituidos:[p.referencia]})]),e=>e.status===409);
});
caso('código literal id:N legado apunta a su ficha exacta, no al otro id',async()=>{
 const p=(await c.query('SELECT nombre FROM producto WHERE id=$1',[f.productos[0]])).rows[0];const codigo=`id:${f.productos[1]}`;
 await c.query('UPDATE producto SET referencia=$2 WHERE id=$1',[f.productos[0],codigo]);
 await c.query("INSERT INTO orden_compra_temporal(proveedor_nombre,producto_codigo,producto_nombre,cantidad_original,cantidad_modificada,accion) VALUES($1,$2,$3,10,7,'modificado')",[f.p.nombre,codigo,p.nombre]);
 assert.equal((await filas())[0].producto_id,f.productos[0]);assert.equal((await filas())[0].clave_producto,`id:${f.productos[0]}`);
 await assert.rejects(s.guardarCantidades([cantidad(9,f.productos[1])]),e=>e.status===409);assert.equal((await filas())[0].cantidad_modificada,7);
});
caso('nuevo id explícito resuelve incluso dos nombres iguales y una referencia id:N',async()=>{
 const p=(await c.query('SELECT nombre FROM producto WHERE id=$1',[f.productos[1]])).rows[0];await c.query('UPDATE producto SET nombre=$2,referencia=$3 WHERE id=$1',[f.productos[0],p.nombre,`id:${f.productos[1]}`]);
 await s.guardarCantidades([cantidad(9,f.productos[1])]);assert.equal((await filas())[0].producto_id,f.productos[1]);
});
caso('fallo de bitácora revierte la primera edición y la migración de extras',async()=>{
 await s.registrarProductoAgregado(f.p.nombre,`extra:id:${f.productos[0]}`,'ZZ',3,{productoId:f.productos[0]});const antes=await filas(),query=c.query;
 c.query=function(sql,p){if(String(sql).includes('INSERT INTO bitacora_cambio'))throw Error('ZZ fallo temporal');return query.call(this,sql,p)};
 try{await assert.rejects(s.guardarCantidades([cantidad(10,undefined,{extras_sustituidos:[`extra:id:${f.productos[0]}`]})]),/ZZ fallo temporal/)}finally{c.query=query}
 assert.deepEqual(await filas(),antes);
});
async function revisionActual(){
 const r=await new(require('../src/modules/reports/report.service'))().getMissingItemsBySupplier(null,{db:{query:c.query.bind(c)},incluirEnviadas:false});
 assert.equal(r.success,true,r.error);return r.data.find(p=>p.cedula===f.p.identificacion)?.revisionReporte;
}
async function faltante(q,n=0){return require('../src/modules/warehouse/bodegaPropia').registrarFaltantes(f.facturas[n],[{producto_id:f.productos[0],cantidad_faltante:q,tipo_faltante:'parcial'}])}
caso('cada edición nueva conserva la revisión exacta del reporte que se vio',async()=>{
 await faltante(10);const revisionReporte=await revisionActual();
 await s.guardarCantidades([cantidad(7,undefined,{revisionReporte,fechaInicio:null})]);
 const [r]=await filas();assert.equal(r.revision_reporte,revisionReporte);assert.equal(r.fecha_inicio,null);assert.equal(typeof r.actualizado,'string');
});
caso('faltantes nuevos rechazan guardar, agregar, excluir y deshacer desde la fotografía anterior',async()=>{
 await faltante(10);const revisionReporte=await revisionActual();
 await s.registrarProductoAgregado(f.p.nombre,`extra:id:${f.productos[0]}`,'ZZ',3,{productoId:f.productos[0],revisionReporte});const antes=await filas();
 await faltante(3,1);assert.notEqual(await revisionActual(),revisionReporte);
 await assert.rejects(s.guardarCantidades([cantidad(7,undefined,{revisionReporte})]),e=>e.status===409);
 await assert.rejects(s.registrarProductoAgregado(f.p.nombre,`extra:id:${f.productos[0]}`,'ZZ',4,{productoId:f.productos[0],revisionReporte}),e=>e.status===409);
 await assert.rejects(s.eliminarRegistroTemporal(f.p.nombre,`extra:id:${f.productos[0]}`,'agregado',{producto_id:f.productos[0],revisionReporte}),e=>e.status===409);
 assert.deepEqual(await filas(),antes);
});
caso('factura lista no presta su edición a la siguiente factura del mismo producto',async()=>{
 await faltante(10);const revisionReporte=await revisionActual();await s.guardarCantidades([cantidad(7,undefined,{revisionReporte})]);
 await c.query("UPDATE faltantes SET estado='procesado' WHERE factura_propia_id=$1",[f.facturas[0]]);await faltante(3,1);
 assert.notEqual(await revisionActual(),revisionReporte);
 await assert.rejects(s.guardarCantidades([cantidad(7,undefined,{revisionReporte})]),e=>e.status===409);
 assert.equal((await filas())[0].revision_reporte,revisionReporte);
});
caso('consolidar extra concurrente exige la cantidad y revisión que se vio',async()=>{
 const codigo=`extra:id:${f.productos[0]}`;
 await s.registrarProductoAgregado(f.p.nombre,codigo,'ZZ',3,{productoId:f.productos[0]});const [visto]=await filas();
 await s.registrarProductoAgregado(f.p.nombre,codigo,'ZZ',4,{productoId:f.productos[0]});const antes=await filas();
 await assert.rejects(s.guardarCantidades([cantidad(10,undefined,{extras_sustituidos:[codigo],extras_revisados:[{codigo,actualizado:visto.actualizado,cantidad:3}]})]),e=>e.status===409);
 assert.deepEqual(await filas(),antes);
 const [actual]=antes;await s.guardarCantidades([cantidad(11,undefined,{extras_sustituidos:[codigo],extras_revisados:[{codigo,actualizado:actual.actualizado,cantidad:4}]})]);
 assert.equal((await filas()).length,1);assert.equal((await filas())[0].cantidad_modificada,11);
});
caso('deshacer código legado literal valida el producto real antes de borrar',async()=>{
 const id=f.productos[0],codigo=`id:${f.productos[1]}`,p=(await c.query('SELECT nombre FROM producto WHERE id=$1',[id])).rows[0];
 await c.query('UPDATE producto SET referencia=$2 WHERE id=$1',[id,codigo]);
 await c.query("INSERT INTO orden_compra_temporal(proveedor_nombre,producto_codigo,producto_nombre,cantidad_original,cantidad_modificada,accion) VALUES($1,$2,$3,10,0,'eliminado')",[f.p.nombre,codigo,p.nombre]);
 await assert.rejects(s.eliminarRegistroTemporal(f.p.nombre,codigo,'eliminado',{producto_id:f.productos[1]}),e=>e.status===409);
 assert.equal(await s.eliminarRegistroTemporal(f.p.nombre,codigo,'eliminado',{producto_id:id}),1);assert.equal((await filas()).length,0);
});

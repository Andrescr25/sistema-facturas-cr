/** PostgreSQL real, servicios comerciales reales y ROLLBACK de todas las
 * fixtures. Los SAVEPOINT permiten probar COMMIT/ROLLBACK de cada servicio
 * sin confirmar datos de prueba en la copia desechable. No hay dobles de SQL. */
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const habilitadas=process.env.PROBAR_BASE_LOCAL==='1';
let db,inv,aud,ventas,nc,compras;
if(habilitadas){
  require('../config/aislado').asegurarBaseLocal();
  db=require('../config/database');inv=require('../src/modules/inventario/inventario.service');
  aud=require('../src/modules/inventario-auditorias/inventario-auditorias.service');
  ventas=require('../src/modules/facturacion/facturaPropia.service');nc=require('../src/modules/facturacion/notaCredito.service');
  compras=require('../src/modules/compras/compras.service');after(()=>db.pool.end());
}
async function copia(fn){
  const conectar=db.pool.connect,consultar=db.pool.query,c=await conectar.call(db.pool);
  await c.query('BEGIN');let n=0;
  const wrapper={query:async(sql,params)=>{
    if(sql==='BEGIN')return c.query('SAVEPOINT servicio_'+(++n));
    if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT servicio_'+n);
    if(sql==='ROLLBACK'){await c.query('ROLLBACK TO SAVEPOINT servicio_'+n);return c.query('RELEASE SAVEPOINT servicio_'+n);}
    return c.query(sql,params);
  },release(){}};
  db.pool.connect=async()=>wrapper;db.pool.query=(sql,params)=>c.query(sql,params);
  try{
    const {rows:[p]}=await c.query("INSERT INTO producto(nombre,referencia,costo_con_iva,precio_sin_iva) VALUES('ZZ Kardex comercial','zz-kardex-comercial',100,200) RETURNING *");
    const {rows:[u]}=await c.query("INSERT INTO usuario(usuario,nombre,password_hash) VALUES('zz-kardex-'||$1,'ZZ Responsable','zz-no-login') RETURNING id",[p.id]);
    const {rows:[cli]}=await c.query("INSERT INTO cliente(nombre) VALUES('ZZ Cliente inventario') RETURNING id");
    await fn({c,p,u,cli});
  }finally{db.pool.connect=conectar;db.pool.query=consultar;await c.query('ROLLBACK');c.release();}
}
const prueba=(name,fn)=>test(name,{skip:!habilitadas},()=>copia(fn));
const saldo=async(c,p)=>Number((await inv.saldo(c,p.id)).existencia);
const mover=(c,p,cantidad,costo='100')=>inv.registrarEn(c,{productoId:p.id,tipo:'compra',cantidad,costoUnitario:costo,origenTipo:'compra',origenId:1,clave:'zz-mov-'+Math.random()});
const pedido=(p,cli,cantidad)=>({clienteId:cli.id,items:[{productoId:p.id,quantity:cantidad,price:200}]});

prueba('venta propia, reintento, edición y anulación mueven stock en sus transacciones',async({c,p,u,cli})=>{
  await mover(c,p,'10');const datos=pedido(p,cli,1.2345);
  const f=await ventas.crearFactura(datos,u.id,{clave:'zz-venta-kardex'});
  assert.equal(await saldo(c,p),8.7655);
  const repetida=await ventas.crearFactura(datos,u.id,{clave:'zz-venta-kardex'});
  assert.equal(repetida.id,f.id);assert.equal(await saldo(c,p),8.7655);
  await ventas.editarFactura(f.id,{items:pedido(p,cli,2.2345).items},u.id);
  assert.equal(await saldo(c,p),7.7655);
  await ventas.anularFactura(f.id,{motivo:'ZZ anulación de prueba'},u.id);
  await ventas.anularFactura(f.id,{motivo:'ZZ reintento de prueba'},u.id);
  assert.equal(await saldo(c,p),10);
  const k=await inv.kardex(p.id,{},c);assert.equal(k.movimientos.length,4);
  assert.ok(k.movimientos.filter(m=>m.origen_tipo==='factura').every(m=>m.usuario_id===u.id));
});
prueba('una falla después de registrar el movimiento revierte factura, kardex y numerador',async({c,p,u,cli})=>{
  const {rows:antes}=await c.query("SELECT * FROM serie_consecutivo WHERE tipo_documento='factura'");
  // FK inválida en el cobro ocurre DESPUÉS de escribir factura y kardex.
  await assert.rejects(ventas.crearFactura({...pedido(p,cli,2),cobro:{metodoPagoId:2147483647}},u.id));
  assert.equal(await saldo(c,p),0);
  assert.equal((await c.query('SELECT id FROM factura WHERE cliente_id=$1',[cli.id])).rows.length,0);
  assert.deepEqual((await c.query("SELECT * FROM serie_consecutivo WHERE tipo_documento='factura'")).rows,antes);
});
prueba('nota de crédito fraccionaria devuelve exactamente y su anulación revierte sin duplicar',async({c,p,u,cli})=>{
  await mover(c,p,'10');const f=await ventas.crearFactura(pedido(p,cli,2.2345),u.id);
  await mover(c,p,'2','200');
  const valorAntes=Number((await inv.saldo(c,p.id)).costo_promedio)*await saldo(c,p);
  const n=await nc.crearNotaCredito({facturaId:f.id,motivo:'devolucion',motivoTexto:'ZZ retorno fraccionario',lineas:[{numeroLinea:1,cantidad:0.1234}]},u.id);
  assert.equal(await saldo(c,p),9.8889);
  const k=await inv.kardex(p.id,{},c);assert.equal(Number(k.movimientos[0].costo_unitario),100);
  await nc.anularNotaCredito(n.id,{motivo:'ZZ anulación de retorno'},u.id);
  await nc.anularNotaCredito(n.id,{motivo:'ZZ reintento'},u.id);
  assert.equal(await saldo(c,p),9.7655);
  assert.ok(Math.abs(Number((await inv.saldo(c,p.id)).costo_promedio)*await saldo(c,p)-valorAntes)<0.000001);
});
prueba('registrar compra propia suma cantidades y costo con IVA; doble registro no suma otra vez',async({c,p,u})=>{
  const {rows:[pr]}=await c.query("INSERT INTO proveedor(nombre,identificacion) VALUES('ZZ Proveedor inventario','zz-kardex-'||$1) RETURNING *",[p.id]);
  const {rows:[f]}=await c.query(`INSERT INTO facturas_proveedores(clave,numero_consecutivo,fecha_emision,proveedor_nombre,proveedor_cedula,total_productos,total_factura,archivo_xml)
    VALUES('zz-kardex-'||$1,'zz-kardex',CURRENT_TIMESTAMP,$2,$3,1,226,'zz-prueba.xml') RETURNING *`,[p.id,pr.nombre,pr.identificacion]);
  await c.query(`INSERT INTO productos_factura_proveedor(factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,impuesto,total_linea,producto_id)
    VALUES($1,1,'zz-kardex','ZZ Producto',2,'Unid',100,26,226,$2)`,[f.id,p.id]);
  const r=await compras.registrarCompra(f.id,{},u.id);
  assert.equal(await saldo(c,p),2);assert.equal(Number((await inv.saldo(c,p.id)).costo_promedio),113);
  await assert.rejects(compras.registrarCompra(f.id,{},u.id),e=>e.status===409);
  assert.equal(await saldo(c,p),2);assert.ok(r.compra.id);
});
prueba('historia antigua fuera del panel y descuentos; un id histórico no admite ajustes',async({c,p})=>{
  const {rows:[a]}=await c.query("INSERT INTO inventario_auditorias(nombre,tipo,historica) VALUES('ZZ Historia','random',TRUE) RETURNING id");
  await c.query("INSERT INTO producto_descuento_exceso(producto_id,nombre_producto,descuento_porcentaje,historica) VALUES($1,'ZZ Historia',90,TRUE)",[p.id]);
  assert.ok(!(await aud.listarAuditorias()).some(r=>r.id===a.id));
  await assert.rejects(aud.ajustarInventario(a.id),e=>e.status===404);
  assert.ok(!(await aud.listarDescuentosExceso()).some(r=>r.productoId===p.id));assert.equal(await saldo(c,p),0);
});
prueba('conteo ordinario persiste borrador, ajusta con responsable y conserva el respaldo',async({c,p,u})=>{
  await c.query('UPDATE producto SET activo=FALSE WHERE id<>$1',[p.id]);
  const a=await aud.crearAuditoria({tipo:'random'}),i=(await aud.getAuditoria(a.id)).items[0];
  await aud.guardarConteoIndividual(a.id,i.id,'2.3456');assert.equal(await saldo(c,p),0);
  await aud.guardarConteos(a.id,[{id:i.id,stock_real:'2.3456'}],u.id);
  await aud.guardarConteos(a.id,[{id:i.id,stock_real:'2.3456'}],u.id);
  assert.equal(await saldo(c,p),2.3456);assert.equal((await inv.kardex(p.id,{},c)).movimientos.length,1);
  await assert.rejects(aud.guardarConteoIndividual(a.id,i.id,'5'),e=>e.status===409);
  await aud.finalizarAuditoria(a.id,'ZZ conteo',u.id);assert.equal((await aud.getAuditoria(a.id)).estado,'finalizado');
  const k=await inv.kardex(p.id,{},c);assert.equal(k.movimientos[0].usuario_nombre,'ZZ Responsable');
});
prueba('otro movimiento invalida un conteo; actualizar borra el borrador y permite contar otra vez',async({c,p,u})=>{
  await c.query('UPDATE producto SET activo=FALSE WHERE id<>$1',[p.id]);
  const a=await aud.crearAuditoria({tipo:'critico'}),i=(await aud.getAuditoria(a.id)).items[0];
  await aud.guardarConteoIndividual(a.id,i.id,'3');await mover(c,p,'1');
  await assert.rejects(aud.guardarConteos(a.id,[{id:i.id,stock_real:'3'}],u.id),e=>e.status===409);
  assert.equal(await saldo(c,p),1);
  await aud.resincronizarAuditoria(a.id);assert.equal((await aud.getAuditoria(a.id)).items[0].stock_real,null);
  await aud.guardarConteos(a.id,[{id:i.id,stock_real:'3'}],u.id);assert.equal(await saldo(c,p),3);
});
prueba('apertura física exige TODOS los productos y catálogo/revisión estables; ceros también se confirman',async({c,p,u})=>{
  await c.query('UPDATE producto SET activo=FALSE WHERE id<>$1',[p.id]);
  const {rows:[otro]}=await c.query("INSERT INTO producto(nombre,costo_con_iva) VALUES('ZZ Segundo conteo',200) RETURNING *");
  const a=await aud.crearAuditoria({tipo:'inicial'});let items=(await aud.getAuditoria(a.id)).items;
  assert.equal(items.length,2);
  await assert.rejects(aud.crearAuditoria({tipo:'inicial'}),e=>e.status===409);
  await aud.guardarConteos(a.id,[{id:items.find(i=>i.producto_id===p.id).id,stock_real:'4'}],u.id);
  assert.equal(await saldo(c,p),0);await assert.rejects(aud.finalizarAuditoria(a.id,'ZZ incompleto',u.id),e=>e.status===400);
  await mover(c,p,'2');await assert.rejects(aud.finalizarAuditoria(a.id,'ZZ obsoleto',u.id),e=>e.status===409);
  await aud.resincronizarAuditoria(a.id);items=(await aud.getAuditoria(a.id)).items;
  await aud.guardarConteos(a.id,items.map(i=>({id:i.id,stock_real:i.producto_id===p.id?'4':'0'})),u.id);
  await aud.finalizarAuditoria(a.id,'ZZ apertura completa',u.id);
  await aud.finalizarAuditoria(a.id,'ZZ reintento',u.id);
  assert.equal(await saldo(c,p),4);assert.equal(await saldo(c,otro),0);
  assert.equal((await inv.saldo(c,p.id)).conteo_confirmado,true);assert.equal((await inv.saldo(c,otro.id)).conteo_confirmado,true);
  assert.equal((await c.query('SELECT * FROM inventario_bodega')).rows[0].inicializada_en instanceof Date,true);
});
prueba('producto creado durante el conteo exige reconstruir la lista completa, sin apertura parcial',async({c,p,u})=>{
  await c.query('UPDATE producto SET activo=FALSE WHERE id<>$1',[p.id]);const a=await aud.crearAuditoria({tipo:'inicial'});
  const i=(await aud.getAuditoria(a.id)).items[0];await aud.guardarConteoIndividual(a.id,i.id,'2');
  await c.query("INSERT INTO producto(nombre) VALUES('ZZ Alta durante conteo')");
  await assert.rejects(aud.finalizarAuditoria(a.id,'ZZ catálogo cambiado',u.id),e=>e.status===409);
  assert.equal((await inv.saldo(c,p.id)).conteo_confirmado,false);
  await aud.resincronizarAuditoria(a.id);assert.equal((await aud.getAuditoria(a.id)).items.length,2);
});
prueba('devoluciones de cliente ingresan y a proveedor salen; límite de stock y reintento protegidos',async({c,p,u})=>{
  const entrada=await aud.crearDevolucion('cliente');await aud.agregarItemDevolucion(entrada.id,{productoId:p.id,cantidadDevuelta:'3.125'});
  await aud.finalizarAuditoria(entrada.id,'ZZ cliente',u.id);assert.equal(await saldo(c,p),3.125);
  const salida=await aud.crearDevolucion('proveedor');
  await assert.rejects(aud.agregarItemDevolucion(salida.id,{productoId:p.id,cantidadDevuelta:'4'}),e=>e.status===400);
  const i=await aud.agregarItemDevolucion(salida.id,{productoId:p.id,cantidadDevuelta:'1.125'});
  await aud.finalizarAuditoria(salida.id,'ZZ proveedor',u.id);await aud.ajustarInventario(salida.id,u.id);assert.equal(await saldo(c,p),2);
  await assert.rejects(aud.eliminarItemDevolucion(salida.id,i.id),e=>e.status===409);
});
prueba('producto sin id externo recibe exceso; oferta requiere empaque y stock ACTUAL, sin escalada',async({c,p,u})=>{
  await mover(c,p,'5');const a=await aud.crearExcesoManual(),i=await aud.agregarItemExceso(a.id,{productoId:p.id});
  await aud.guardarDescuentoExceso({productoId:p.id,descuentoPorcentaje:40});
  await aud.escalarDescuentosExceso([{producto_id:p.id}]);
  const {SQL_VIGENTES}=require('../src/utils/descuentosExceso');
  const ofertas=async()=> (await c.query(SQL_VIGENTES)).rows.filter(r=>r.producto_id===p.id);
  assert.equal((await ofertas()).length,0);
  await aud.actualizarItemExceso(a.id,i.id,{empacado:true},u.id);assert.equal((await ofertas())[0].descuento_porcentaje,40);
  await assert.rejects(aud.eliminarAuditoria(a.id),e=>e.status===409);
  await mover(c,p,'-5');assert.equal((await ofertas()).length,0);
  await aud.depurarOfertasSinStock();assert.equal((await aud.listarDescuentosExceso()).find(r=>r.productoId===p.id).descuentoPorcentaje,0);
});
prueba('stock mínimo y sugerencia usan saldo propio; validación no trunca fracciones ni cruza auditorías',async({c,p})=>{
  await inv.guardarUmbrales(p.id,{stockMinimo:'3',stockObjetivo:'10'});
  const listado=await inv.listarExistencias({q:p.referencia,soloBajo:true},c);
  assert.equal(Number(listado.productos.find(r=>r.producto_id===p.id).cantidad_sugerida),10);
  await assert.rejects(inv.guardarUmbrales(p.id,{stockMinimo:'10',stockObjetivo:'3'}),e=>e.status===400);
  await assert.rejects(mover(c,p,'1.23456'),e=>e.status===400);
  const a=await aud.crearExcesoManual(),b=await aud.crearExcesoManual();const i=await aud.agregarItemExceso(a.id,{productoId:p.id});
  await assert.rejects(aud.guardarConteoIndividual(b.id,i.id,'3'),e=>e.status===404);
  await assert.rejects(aud.actualizarItemExceso(a.id,i.id,{empacado:'false'}),e=>e.status===400);
});
prueba('ofertas con stock positivo se conservan; cero y negativo se depuran sin tocar historia',async({c,p})=>{
  await aud.guardarDescuentoExceso({productoId:p.id,descuentoPorcentaje:25});
  await mover(c,p,'2');await aud.depurarOfertasSinStock();
  assert.equal((await aud.listarDescuentosExceso()).find(r=>r.productoId===p.id).descuentoPorcentaje,25);
  await mover(c,p,'-3');await aud.depurarOfertasSinStock();
  assert.equal((await aud.listarDescuentosExceso()).find(r=>r.productoId===p.id).descuentoPorcentaje,0);
});
prueba('si falla la actualización de liquidación, se informa el error y no se borra la promoción',async({c,p})=>{
  await aud.guardarDescuentoExceso({productoId:p.id,descuentoPorcentaje:25});
  await c.query('ALTER TABLE producto_descuento_exceso ADD CONSTRAINT zz_fallo_depurar CHECK(descuento_porcentaje>0) NOT VALID');
  await c.query('SAVEPOINT fallo_depurar');
  await assert.rejects(aud.depurarOfertasSinStock(),e=>e.code==='23514');
  await c.query('ROLLBACK TO SAVEPOINT fallo_depurar');
  assert.equal((await aud.listarDescuentosExceso()).find(r=>r.productoId===p.id).descuentoPorcentaje,25);
});
prueba('excesos se detectan por stock y ventas propios, con tope de diez y sin crear regalos',async({c,p,u,cli})=>{
  await c.query('UPDATE producto SET activo=FALSE WHERE id<>$1',[p.id]);
  await mover(c,p,'5');
  const antes=await aud.detectarCandidatosExceso();assert.ok(antes.candidatos.some(r=>r.producto_id===p.id));
  await ventas.crearFactura(pedido(p,cli,1),u.id);
  assert.ok(!(await aud.detectarCandidatosExceso()).candidatos.some(r=>r.producto_id===p.id));
  for(let n=0;n<12;n++){
    const {rows:[x]}=await c.query("INSERT INTO producto(nombre,costo_con_iva) VALUES('ZZ Exceso '||$1,100) RETURNING *",[n]);await mover(c,x,'2');
  }
  const r=await aud.generarTandaDeExcesos();assert.equal(r.total,10);assert.equal(r.totalDetectados,12);assert.deepEqual(r.regalosNuevos,[]);
  assert.equal((await aud.getAuditoria(r.id)).items.length,10);
});

/** Base desechable propia, PDF local; ningún evento físico o transporte real. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const habilitado=process.env.PROBAR_BASE_LOCAL==='1',zz=n=>`ZZ comprobante ${n} ${randomUUID().slice(0,8)}`;
let pool,c,s,e,f,wa,original,d,falloPdf=false,falloBitacora=false,rcp,compras;
const caso=(n,fn)=>test(n,{skip:!habilitado},async()=>{
 await c.query('SAVEPOINT caso_factura');falloPdf=false;falloBitacora=false;
 try{d=await sembrarEn(c);await fn()}finally{await c.query('ROLLBACK TO SAVEPOINT caso_factura')}
});
async function sembrarEn(db){
  const r=(await db.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING *',[zz('ruta')])).rows[0];
  const cl=(await db.query('INSERT INTO cliente(nombre) VALUES($1) RETURNING *',[zz('cliente')])).rows[0];
  const p=(await db.query("INSERT INTO proveedor(nombre,identificacion,telefono_whatsapp) VALUES($1,$2,'88888888') RETURNING *",[zz('proveedor'),randomUUID().slice(0,18)])).rows[0];
  const producto=(await db.query('INSERT INTO producto(nombre,referencia) VALUES($1,$2) RETURNING id',[zz('producto'),'ZZ-REF'])).rows[0].id;
  const ciclos=[],faltantes=[];
  for(const semana of ['2026-10-12','2026-10-19']){
    const cy=(await db.query('INSERT INTO ciclo_ruta(ruta_id,ruta_nombre,semana) VALUES($1,$2,$3) RETURNING id',[r.id,r.nombre,semana])).rows[0].id;
    const rc=(await db.query('INSERT INTO ciclo_ruta_cliente(ciclo_id,cliente_id,orden,cliente_nombre) VALUES($1,$2,1,$3) RETURNING id',[cy,cl.id,cl.nombre])).rows[0].id;
    await db.query('UPDATE ciclo_ruta SET recorrido_fijado=TRUE WHERE id=$1',[cy]);ciclos.push(cy);
    for(const cantidad of semana==='2026-10-12'?[6,4]:[4]){
      const f=(await db.query("INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,ciclo_ruta_cliente_id) VALUES($1,'emitida','2026-10-06',$2,$3,$4) RETURNING id",[zz('FAC'),cl.id,cl.nombre,rc])).rows[0].id;
      await db.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,1,$2,'ZZ Producto',$3::numeric,1,$3::numeric)",[f,producto,cantidad]);
      const id=(await db.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula) VALUES($1,$2,$3,'parcial','pendiente',$4,$5) RETURNING id",[f,producto,cantidad,p.nombre,p.identificacion])).rows[0].id;
      faltantes.push({id,f,cantidad});
    }
  }
  return {proveedor:p,ruta:r,cliente:cl,producto,ciclo:ciclos[0],proximo:ciclos[1],faltantes};
}

if(habilitado){
 require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
 const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});let nivel=0;
 const q=(sql,p)=>{
  if(falloPdf&&sql.includes('INSERT INTO orden_compra_ciclo_factura_pdf'))throw Error('ZZ fallo insertar PDF');
  if(falloBitacora&&sql.includes('INSERT INTO bitacora_cambio'))throw Error('ZZ fallo bitácora');return c.query(sql,p);
 };
 const db=require.resolve('../config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:{pool:{query:q,connect:async()=>{
  const sp=`factura_${++nivel}`;return{query:(sql,p)=>sql==='BEGIN'?q(`SAVEPOINT ${sp}`):sql==='COMMIT'?q(`RELEASE SAVEPOINT ${sp}`):sql==='ROLLBACK'?q(`ROLLBACK TO SAVEPOINT ${sp}`):q(sql,p),release(){}};
 }}}};
 s=require('../src/modules/orders-whatsapp/ordenesCiclo.service');e=require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');f=require('../src/modules/orders-whatsapp/ordenesCicloFactura.service');
 rcp=require('../src/modules/orders-whatsapp/ordenesCicloRecepcion.service');compras=require('../src/modules/compras/compras.service');
 wa=require('../src/integrations/whatsapp');original=wa.enviarDocumento;
 before(async()=>{c=await pool.connect();await c.query('BEGIN');wa.enviarDocumento=async doc=>({enviado:true,numero:doc.telefono,via:'interno'})});
 after(async()=>{wa.enviarDocumento=original;if(c){await c.query('ROLLBACK');c.release()}await pool.end();assert.match(process.env.ALMACENAMIENTO_PRIVADO_DIR,/codex-/);await fs.rm(path.join(process.env.ALMACENAMIENTO_PRIVADO_DIR,'ordenes-facturas'),{recursive:true,force:true})});
}
async function orden(ciclo=d.ciclo,q=10){
 const o=await s.crear({proveedorId:d.proveedor.id,cicloId:ciclo,clave:randomUUID(),lineas:[{productoId:d.producto,cantidadProveedor:q}]});
 const p=await s.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'}),n=await e.preparar(p.id,{version:p.version,telefono:'88888888',mensaje:`Orden ${p.referencia}`,clave:randomUUID()});
 return e.enviar(n.id,n.envios[0].id,{confirmar:true});
}
async function mapping(producto=d.producto,codigo='ZZ-U',factor=1){
 return(await c.query(`INSERT INTO supplier_product_mapping(id,supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
 VALUES($1,$2,$3,$4,'ZZ Descripción','','',$5,$6,$7) RETURNING id`,[randomUUID(),d.proveedor.nombre,d.proveedor.identificacion,codigo,producto,d.proveedor.id,factor])).rows[0].id;
}
async function factura({cantidad=10,producto=d.producto,cedula=d.proveedor.identificacion,factor=1,map=true}={}){
 const id=randomUUID(),clave=String(Date.now())+String(Math.floor(Math.random()*1e9)).padStart(9,'0')+'0'.repeat(28);
 await c.query(`INSERT INTO facturas_proveedores(id,clave,numero_consecutivo,proveedor_nombre,proveedor_cedula,fecha_emision,fecha_procesada,total_productos,total_factura,archivo_xml,estado,porcentaje_relacionado)
 VALUES($1,$2,$3,$4,$5,'2026-10-06',NOW(),1,100,'ZZ.xml','PROCESADA',0)`,[id,clave,'ZZ-'+randomUUID().slice(0,8),d.proveedor.nombre,cedula]);
 const m=map?await mapping(producto,'ZZ-'+randomUUID().slice(0,5),factor):null;
 const linea=randomUUID();await c.query(`INSERT INTO productos_factura_proveedor(id,factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,descuento,impuesto,total_linea,producto_id,mapeo_id,estado_relacionado)
 VALUES($1,$2,1,'ZZ','ZZ Producto factura',$3,'Unid',10,0,0,100,$4,$5,'PENDIENTE')`,[linea,id,cantidad,producto,m]);
 return {id,linea,m};
}
const propuesta=(o,a)=>f.proponer(o.id,a.id);
const vincular=async(o,a,clave=randomUUID())=>{const p=await propuesta(o,a);return f.vincular(o.id,{clave,facturaId:a.id,version:p.version,revision:p.revision,confirmar:true})};
const pdf=()=>require('../src/modules/orders-whatsapp/ordenesCicloFactura.pdf').generarRepresentacion({documento:{numero_consecutivo:'ZZ-PDF',proveedor_nombre:'ZZ',fecha_emision:'2026-10-06',moneda:'CRC',clave:'0'.repeat(50),total_factura:100},lineas:[{codigo_proveedor:'ZZ',descripcion:'ZZ factura',cantidad:1,total_linea:100}]});
const protegido=async(sql,p,patron)=>{await c.query('SAVEPOINT prohibido');try{await assert.rejects(c.query(sql,p),patron)}finally{await c.query('ROLLBACK TO SAVEPOINT prohibido')}};

async function preparado({q=10,factor=1,cantidad=q/factor,anterior=false}={}){
 await mapping(d.producto,'ZZ-BASE',factor);if(q*factor>10)await c.query('UPDATE faltantes SET cantidad_faltante=$2 WHERE id=$1',[d.faltantes[0].id,q*factor]);const a=await factura({cantidad,factor});
 // La compra anterior debe nacer antes de existir una orden enviada posible:
 // registrar después de enviarla ya la vincula automáticamente, como la UI.
 if(anterior)await compras.registrarCompra(a.id);
 const o=await orden(d.ciclo,q);
 await vincular(o,a);if(!anterior)await compras.registrarCompra(a.id);
 const p=await rcp.consultar(o.id);assert.equal(p.bloqueos.length,0);return{o,a,p,l:p.lineas[0]};
}
const fisica=async(o,{cantidad,final=false,motivos=[],clave=randomUUID(),datos}={})=>{
 const p=await rcp.consultar(o.id);return rcp.registrar(o.id,datos||{clave,version:p.version,revision:p.revision,confirmar:true,final,motivos,lineas:cantidad==null?[]:[{lineaId:p.lineas[0].id,cantidad}]});
};
const existencia=async()=>Number((await c.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1',[d.producto])).rows[0].existencia);
caso('compra nueva vinculada acepta finanzas sin acreditar stock antes de recepción',async()=>{
 const {p,a}=await preparado();assert.equal(p.lineas[0].inventarioPorRecepcion,true);assert.equal(await existencia(),0);assert.equal((await c.query('SELECT liberada FROM cuentas_por_pagar WHERE factura_id=$1',[a.id])).rows[0].liberada,true);
});
caso('parcial 4, segunda 3 y final 3 conserva acumulado/pendiente y acredita solo diez',async()=>{
 const {o}=await preparado();let r=await fisica(o,{cantidad:4});assert.equal(r.orden.estado,'parcialmente_recibida');assert.equal(r.comparacion[0].recibido,4);assert.equal(r.comparacion[0].pendiente,6);assert.equal(r.completaEn,null);assert.equal(await existencia(),4);
 r=await fisica(o,{cantidad:3});assert.equal(r.comparacion[0].recibido,7);assert.equal(await existencia(),7);
 r=await fisica(o,{cantidad:3,final:true});assert.equal(r.orden.estado,'recibida');assert.equal(r.comparacion[0].noRecibido,0);assert.ok(r.completaEn);assert.equal(r.historial.length,3);assert.equal(await existencia(),10);
 assert.equal((await c.query('SELECT COUNT(*)::int n FROM compra WHERE proveedor_id=$1',[d.proveedor.id])).rows[0].n,1);
});
caso('misma recepción y clave no duplica stock incluso tras finalizar; otro cuerpo rechaza',async()=>{
 const {o,p,l}=await preparado(),datos={clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final:true,motivos:[],lineas:[{lineaId:l.id,cantidad:10}]};const uno=await rcp.registrar(o.id,datos),dos=await rcp.registrar(o.id,datos);assert.deepEqual(uno,dos);assert.equal(await existencia(),10);
 await assert.rejects(rcp.registrar(o.id,{...datos,final:false}),e=>e.status===409);await assert.rejects(fisica(o,{cantidad:1}),e=>e.status===409);
});
caso('recepción exige revisión/confirmación, cantidades válidas y línea de esta orden',async()=>{
 const {o,p,l}=await preparado(),body={clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final:false,motivos:[],lineas:[{lineaId:l.id,cantidad:1}]};
 await assert.rejects(rcp.registrar(o.id,{...body,confirmar:false}),e=>e.status===400);for(const cantidad of [-1,'0.12345'])await assert.rejects(rcp.registrar(o.id,{...body,lineas:[{lineaId:l.id,cantidad}]}),e=>e.status===400);
 await assert.rejects(rcp.registrar(o.id,{...body,lineas:[{lineaId:l.id,cantidad:1},{lineaId:l.id,cantidad:1}]}),e=>e.status===400);await assert.rejects(rcp.registrar(o.id,{...body,lineas:[{lineaId:999999999,cantidad:1}]}),e=>e.status===409);await assert.rejects(fisica(o,{cantidad:0}),e=>e.status===400);
});
caso('dos cajas de seis se reciben en propias sin superar la cantidad facturada',async()=>{
 const {o,p}=await preparado({q:2,factor:6,cantidad:2});assert.equal(p.lineas[0].cantidad_propia,'12.0000');await fisica(o,{cantidad:7});assert.equal(await existencia(),7);await assert.rejects(fisica(o,{cantidad:6}),e=>e.status===409);const r=await fisica(o,{cantidad:5,final:true});assert.equal(r.comparacion[0].recibido,12);assert.equal(await existencia(),12);
});
caso('final exige motivo explícito: seis recibidas liberan solo cuatro y conservan otro ciclo',async()=>{
 const {o}=await preparado();await fisica(o,{cantidad:6});await assert.rejects(fisica(o,{final:true}),e=>e.status===400);const motivo={productoId:d.producto,tipo:'agotado_confirmado',detalle:'ZZ proveedor confirmó agotadas las cuatro restantes'};
 const r=await fisica(o,{final:true,motivos:[motivo]});assert.equal(r.comparacion[0].noRecibido,4);assert.equal(r.comparacion[0].pendiente,0);assert.deepEqual(r.motivos,[motivo]);assert.equal(await existencia(),6);
 const sug=await s.sugerir({proveedorId:d.proveedor.id,cicloId:d.ciclo});assert.equal(sug.productos[0].disponible,4);assert.equal(sug.productos[0].recibida,6);assert.equal(sug.productos[0].pendienteRecibir,0);
 const nueva=await s.crear({proveedorId:d.proveedor.id,cicloId:d.ciclo,clave:randomUUID(),lineas:[{productoId:d.producto,cantidadProveedor:4}]});assert.equal(nueva.lineas[0].cantidad_propia,4);assert.equal((await s.sugerir({proveedorId:d.proveedor.id,cicloId:d.proximo})).productos[0].disponible,4);
});
caso('parcial mantiene cobertura completa y separa solicitado/recibido/pendiente sin resolver faltantes',async()=>{
 const {o}=await preparado();await fisica(o,{cantidad:6});const p=(await s.sugerir({proveedorId:d.proveedor.id,cicloId:d.ciclo})).productos[0];assert.equal(p.disponible,0);assert.equal(p.solicitada,10);assert.equal(p.recibida,6);assert.equal(p.pendienteRecibir,4);
 const faltante=(await c.query('SELECT cantidad_faltante,estado FROM faltantes WHERE id=$1',[d.faltantes[0].id])).rows[0];assert.equal(Number(faltante.cantidad_faltante),6);assert.equal(faltante.estado,'pendiente');
});
caso('compra registrada antes de vincular no se acredita de nuevo al recibir',async()=>{
 const {o,p}=await preparado({anterior:true});assert.equal(p.lineas[0].inventarioPorRecepcion,false);assert.equal(await existencia(),10);const before=(await c.query('SELECT id FROM movimiento_inventario WHERE origen_id=$1',[p.lineas[0].compraId])).rows;await fisica(o,{cantidad:4});await fisica(o,{cantidad:6,final:true});assert.equal(await existencia(),10);assert.deepEqual((await c.query('SELECT id FROM movimiento_inventario WHERE origen_id=$1',[p.lineas[0].compraId])).rows,before);
});
caso('compra histórica sin kardex no se importa como stock nuevo al recibir',async()=>{
 const o=await orden(),a=await factura(),compra=(await c.query("INSERT INTO compra(proveedor_id,fecha_emision,total,factura_proveedor_id) VALUES($1,'2026-10-06',100,$2) RETURNING id",[d.proveedor.id,a.id])).rows[0].id;await c.query("INSERT INTO compra_linea(compra_id,numero_linea,producto_id,descripcion,cantidad,factor_conversion,precio_unitario,total_linea) VALUES($1,1,$2,'ZZ Histórico',10,1,10,100)",[compra,d.producto]);await vincular(o,a);await assert.rejects(fisica(o,{cantidad:1}),e=>e.status===409);assert.equal(await existencia(),0);
});
caso('cambio de recepción o compra exige otra propuesta',async()=>{
 const {o,p,l}=await preparado();await fisica(o,{cantidad:1});await assert.rejects(rcp.registrar(o.id,{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final:false,motivos:[],lineas:[{lineaId:l.id,cantidad:1}]}),e=>e.status===409);await protegido('UPDATE compra_linea SET cantidad=8 WHERE id=$1',[l.id]);d=await sembrarEn(c);const otro=await preparado();await c.query('UPDATE compra_linea SET cantidad=8 WHERE id=$1',[otro.l.id]);assert.ok((await rcp.consultar(otro.o.id)).bloqueos.length);await assert.rejects(fisica(otro.o,{cantidad:1}),e=>e.status===409);
});
caso('factura vinculada sin compra no ingresa stock ni permite finalizar sin aceptar compra',async()=>{
 const o=await orden(),a=await factura();await vincular(o,a);const p=await rcp.consultar(o.id);assert.equal(p.comprasPendientes.length,1);assert.equal(p.lineas.length,0);await assert.rejects(fisica(o,{final:true,motivos:[{productoId:d.producto,tipo:'otro',detalle:'ZZ'}]}),e=>e.status===409);assert.equal(await existencia(),0);
});
caso('final sin factura y sin mercadería conserva agotamiento declarado sin inventar compra',async()=>{
 const o=await orden(),r=await fisica(o,{final:true,motivos:[{productoId:d.producto,tipo:'agotado_confirmado',detalle:'ZZ confirmó que no despachará nada'}]});assert.equal(r.orden.estado,'recibida');assert.equal(await existencia(),0);assert.equal((await s.sugerir({proveedorId:d.proveedor.id,cicloId:d.ciclo})).productos[0].disponible,10);
});
caso('varias facturas suman recepción por línea una sola vez',async()=>{
 const o=await orden(),a=await factura({cantidad:6}),b=await factura({cantidad:4});await vincular(o,a);await compras.registrarCompra(a.id);await fisica(o,{cantidad:4});await vincular(o,b);await compras.registrarCompra(b.id);const p=await rcp.consultar(o.id);const r=await rcp.registrar(o.id,{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final:true,motivos:[],lineas:p.lineas.map(l=>({lineaId:l.id,cantidad:l.pendiente}))});assert.equal(r.comparacion[0].recibido,10);assert.equal(await existencia(),10);
});
caso('facturado de más se puede rechazar con motivo sin cambiar orden o stock pendiente',async()=>{
 const {o}=await preparado({cantidad:12});const r=await fisica(o,{cantidad:10,final:true,motivos:[{productoId:d.producto,tipo:'rechazado',detalle:'ZZ rechazamos dos adicionales'}]});assert.equal(r.comparacion[0].facturadoSinRecibir,2);assert.equal(await existencia(),10);assert.equal(r.orden.lineas[0].cantidad_propia,10);
});
caso('fracciones 0.1 y 0.2 conservan decimal exacto al ingresar',async()=>{
 const {o}=await preparado({q:1,factor:0.3,cantidad:1});await fisica(o,{cantidad:'0.1000'});const r=await fisica(o,{cantidad:'0.2000',final:true});assert.equal(r.comparacion[0].recibido,0.3);assert.equal(await existencia(),0.3);
});
caso('SQL protege eventos/líneas/orden comercial/modalidad y vínculos con recepción',async()=>{
 const {o,p,l}=await preparado();const r=await fisica(o,{cantidad:4}),id=r.historial[0].id;await protegido('DELETE FROM orden_compra_ciclo_recepcion WHERE id=$1',[id]);await protegido('UPDATE orden_compra_ciclo_recepcion_linea SET cantidad=5 WHERE recepcion_id=$1',[id]);await protegido('INSERT INTO orden_compra_ciclo_recepcion_linea(recepcion_id,vinculo_id,compra_linea_id,cantidad) VALUES($1,$2,$3,1)',[id,l.vinculoId,l.id]);await protegido('UPDATE compra SET inventario_por_recepcion=FALSE WHERE id=$1',[l.compraId]);await protegido("UPDATE orden_compra_ciclo SET estado='recibida',version=version+1,recepcion_completa_en=NOW() WHERE id=$1",[o.id]);await assert.rejects(f.retirar(o.id,l.vinculoId,{motivo:'ZZ incorrecto'}),e=>e.status===409);await protegido("UPDATE orden_compra_ciclo_factura SET estado='retirada',motivo='ZZ',retirado_en=NOW() WHERE id=$1",[l.vinculoId],/fuente de una recepción/);await protegido('DELETE FROM compra_linea WHERE id=$1',[l.id],/fuente de una recepción/);assert.equal(r.orden.lineas[0].cantidad_propia,p.comparacion[0].solicitado);
});
caso('fallo después de entrada revierte evento, estado y kardex juntos',async()=>{
 const {o}=await preparado();falloBitacora=true;await assert.rejects(fisica(o,{cantidad:4}));falloBitacora=false;assert.equal(await existencia(),0);assert.equal((await rcp.consultar(o.id)).historial.length,0);assert.equal((await s.obtener(o.id)).estado,'enviada');
});
caso('recibir conserva compra/CxP/precios/buzón/faltantes y la siguiente semana',async()=>{
 const {o}=await preparado(),tablas=['compra','compra_linea','cuentas_por_pagar','producto','facturas_proveedores','productos_factura_proveedor','faltantes','factura','factura_linea'];const huellas=()=>Promise.all(tablas.map(async t=>(await c.query(`SELECT COUNT(*)::int n,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) filas`)).rows[0]));const antes=await huellas();await fisica(o,{cantidad:10,final:true});assert.deepEqual(await huellas(),antes);assert.equal((await s.sugerir({proveedorId:d.proveedor.id,cicloId:d.proximo})).productos[0].disponible,4);
});


caso('entregas de un producto con costos distintos valoran solo el delta recibido',async()=>{
 const o=await orden(),a=await factura();
 await c.query(`INSERT INTO productos_factura_proveedor(id,factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,descuento,impuesto,total_linea,producto_id,mapeo_id,estado_relacionado)
 VALUES($1,$2,2,'ZZ','ZZ segunda partida',10,'Unid',20,0,0,200,$3,$4,'PENDIENTE')`,[randomUUID(),a.id,d.producto,a.m]);
 await vincular(o,a);await compras.registrarCompra(a.id);let p=await rcp.consultar(o.id);
 const recibir=async(lineaId,cantidad,final=false)=>{const p=await rcp.consultar(o.id);return rcp.registrar(o.id,{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final,motivos:[],lineas:[{lineaId,cantidad}]})};
 const costo=async()=>Number((await c.query('SELECT costo_promedio FROM inventario_saldo WHERE producto_id=$1',[d.producto])).rows[0].costo_promedio);
 await recibir(p.lineas[0].id,5);assert.equal(await costo(),10);await recibir(p.lineas[1].id,10);assert.ok(Math.abs(await costo()-250/15)<0.0001);await recibir(p.lineas[0].id,5,true);assert.equal(await existencia(),20);assert.equal(await costo(),15);
});

caso('regalía posterior conserva costo cero después de una caja con conversión fraccionaria',async()=>{
 await mapping(d.producto,'ZZ-CAJA',3);const o=await orden(d.ciclo,2),a=await factura({cantidad:1,factor:3});await c.query('UPDATE productos_factura_proveedor SET precio_unitario=5,total_linea=5 WHERE id=$1',[a.linea]);
 await c.query(`INSERT INTO productos_factura_proveedor(id,factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,descuento,impuesto,total_linea,producto_id,mapeo_id,estado_relacionado)
 VALUES($1,$2,2,'ZZ','ZZ regalía',1,'Caja',0,0,0,0,$3,$4,'PENDIENTE')`,[randomUUID(),a.id,d.producto,a.m]);await vincular(o,a);await compras.registrarCompra(a.id);const p=await rcp.consultar(o.id);
 const recibir=async(lineaId,final=false)=>{const d=await rcp.consultar(o.id);return rcp.registrar(o.id,{clave:randomUUID(),version:d.version,revision:d.revision,confirmar:true,final,motivos:[],lineas:[{lineaId,cantidad:3}]})};
 await recibir(p.lineas[0].id);await recibir(p.lineas[1].id,true);assert.equal(await existencia(),6);const mov=(await c.query("SELECT cantidad,costo_unitario FROM movimiento_inventario WHERE origen_tipo='compra' AND origen_id=$1 ORDER BY id",[p.lineas[0].compraId])).rows;assert.equal(mov.length,2);assert.equal(Number(mov[1].costo_unitario),0);assert.ok(Math.abs(Number(mov[0].costo_unitario)*3-5)<0.0001);
});

// Dos conexiones requieren fixtures COMMIT, exclusivamente en la base
// desechable identificada al principio. Esa base se elimina al cerrar.
async function conConexiones(fn){
 const externa=c,previo=d,seed=await pool.connect();let fixture;
 try{c=seed;await seed.query('BEGIN');d=await sembrarEn(seed);fixture=await preparado();fixture.producto=d.producto;await seed.query('COMMIT')}
 catch(e){await seed.query('ROLLBACK');throw e}finally{c=externa;d=previo;seed.release()}
 const nombres=['../config/database',...['ordenesCiclo','ordenesCicloEnvio','ordenesCicloFactura','ordenesCicloRecepcion'].map(n=>'../src/modules/orders-whatsapp/'+n+'.service')],rutas=nombres.map(require.resolve),anteriores=rutas.map(p=>require.cache[p]);
 require.cache[rutas[0]]={id:rutas[0],filename:rutas[0],loaded:true,exports:{pool}};for(const ruta of rutas.slice(1))delete require.cache[ruta];
 try{await fn(require(rutas[4]),fixture)}finally{rutas.forEach((p,i)=>require.cache[p]=anteriores[i])}
}
caso('dos operadores reintentan la misma recepción: un evento y una sola entrada',async()=>conConexiones(async(r,{o,p,l,producto})=>{
 const cuerpo={clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final:false,motivos:[],lineas:[{lineaId:l.id,cantidad:4}]};
 const resultados=await Promise.all([r.registrar(o.id,cuerpo),r.registrar(o.id,cuerpo)]);assert.deepEqual(resultados[0],resultados[1]);
 assert.equal((await pool.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo_recepcion WHERE orden_id=$1',[o.id])).rows[0].n,1);assert.equal(Number((await pool.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1',[producto])).rows[0].existencia),4);
}));
caso('dos recepciones distintas con la misma revisión: solo una se confirma',async()=>conConexiones(async(r,{o,p,l,producto})=>{
 const cuerpo={version:p.version,revision:p.revision,confirmar:true,final:false,motivos:[],lineas:[{lineaId:l.id,cantidad:4}]};
 const resultados=await Promise.allSettled([r.registrar(o.id,{...cuerpo,clave:randomUUID()}),r.registrar(o.id,{...cuerpo,clave:randomUUID()})]);
 assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);assert.equal(resultados.find(r=>r.status==='rejected').reason.status,409);assert.equal((await r.consultar(o.id)).historial.length,1);assert.equal(Number((await pool.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1',[producto])).rows[0].existencia),4);
}));

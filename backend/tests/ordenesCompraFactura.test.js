/** Base desechable propia, PDF local; ningún evento físico o transporte real. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const habilitado=process.env.PROBAR_BASE_LOCAL==='1',zz=n=>`ZZ comprobante ${n} ${randomUUID().slice(0,8)}`;
let pool,c,s,e,f,wa,original,d,falloPdf=false,falloBitacora=false;
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
const protegido=async(sql,p)=>{await c.query('SAVEPOINT prohibido');try{await assert.rejects(c.query(sql,p))}finally{await c.query('ROLLBACK TO SAVEPOINT prohibido')}};
caso('candidatas solo del proveedor de orden enviada; proveedor ajeno y UUID inválido rechazan',async()=>{
 const o=await orden(),a=await factura(),ajena=await factura({cedula:'ZZOTRO'});const lista=await f.candidatas(o.id);assert.ok(lista.facturas.some(v=>v.id===a.id));assert.ok(!lista.facturas.some(v=>v.id===ajena.id));
 await assert.rejects(propuesta(o,ajena),e=>e.status===409);await assert.rejects(f.proponer(o.id,'../../archivo'),e=>e.status===400);
});
caso('sin comprobante no afirma faltante ni recepción; propuesta compara cantidades propias',async()=>{
 const o=await orden();assert.equal((await f.consultar(o.id)).comparacion.productos[0].estado,'sin_comprobante');
 const p=await propuesta(o,await factura({cantidad:7})),l=p.comparacion.productos[0];assert.equal(l.solicitado,10);assert.equal(l.facturado,7);assert.equal(l.faltante,3);assert.equal(l.estado,'menos_facturado');assert.equal(p.comparacion.recepcionFisica,'pendiente_de_registrar');
});
caso('conversión de caja y cantidades adicionales no se comparan crudas contra unidades',async()=>{
 const o=await orden(),p=await propuesta(o,await factura({cantidad:2,factor:6})),l=p.comparacion.productos[0];assert.equal(l.facturado,12);assert.equal(l.exceso,2);
});
caso('producto fuera de orden aparece separado; producto desconocido no se adivina por código',async()=>{
 const o=await orden(),otro=(await c.query("INSERT INTO producto(nombre) VALUES('ZZ Extra') RETURNING id")).rows[0].id;
 const p=await propuesta(o,await factura({producto:otro,cantidad:3}));assert.equal(p.comparacion.extras[0].exceso,3);
 const desconocido=await propuesta(o,await factura({producto:null,map:false}));assert.equal(desconocido.comparacion.porRelacionar.length,1);assert.equal(desconocido.comparacion.productos[0].faltante,null);assert.equal(desconocido.comparacion.productos[0].estado,'por_revisar');
});
caso('producto relacionado sin conversión y relación en conflicto requieren revisión',async()=>{
 const o=await orden(),a=await factura({map:false});let p=await propuesta(o,a);assert.equal(p.comparacion.productos[0].facturado,null);
 const otro=(await c.query("INSERT INTO producto(nombre) VALUES('ZZ Otro') RETURNING id")).rows[0].id,b=await factura();await c.query('UPDATE supplier_product_mapping SET producto_id=$2 WHERE id=$1',[b.m,otro]);
 p=await propuesta(o,b);assert.equal(p.comparacion.productos[0].estado,'por_revisar');
});
caso('vinculación exige revisión explícita, es idempotente y clave no cambia de solicitud',async()=>{
 const o=await orden(),a=await factura(),p=await propuesta(o,a),clave=randomUUID(),datos={clave,facturaId:a.id,version:p.version,revision:p.revision,confirmar:true};
 await assert.rejects(f.vincular(o.id,{...datos,confirmar:false}),e=>e.status===400);
 const uno=await f.vincular(o.id,datos),dos=await f.vincular(o.id,datos);assert.deepEqual(uno,dos);assert.equal(uno.facturas.length,1);assert.equal(uno.facturas[0].fuenteCambio,false);
 await assert.rejects(f.vincular(o.id,{...datos,revision:'ZZ otra'}),e=>e.status===409);
});
caso('cantidades cambiadas después de revisar impiden guardar comparación obsoleta',async()=>{
 const o=await orden(),a=await factura(),p=await propuesta(o,a);await c.query('UPDATE productos_factura_proveedor SET cantidad=8 WHERE id=$1',[a.linea]);
 await assert.rejects(f.vincular(o.id,{clave:randomUUID(),facturaId:a.id,version:p.version,revision:p.revision,confirmar:true}),e=>e.status===409);
});
caso('misma factura no cubre dos órdenes/ciclos y conserva su dueño',async()=>{
 const o=await orden(),next=await orden(d.proximo,4),a=await factura();await vincular(o,a);
 await assert.rejects(vincular(next,a),e=>e.status===409);assert.equal((await f.candidatas(next.id)).facturas.find(v=>v.id===a.id).orden_asignada,o.id);
});
caso('varias facturas en una orden suman una vez y una nueva revisión detecta contexto cambiado',async()=>{
 const o=await orden(),a=await factura({cantidad:6}),b=await factura({cantidad:4}),p=await propuesta(o,b);await vincular(o,a);
 await assert.rejects(f.vincular(o.id,{clave:randomUUID(),facturaId:b.id,version:p.version,revision:p.revision,confirmar:true}),e=>e.status===409);
 const n=await vincular(o,b);assert.equal(n.comparacion.productos[0].facturado,10);assert.equal(n.comparacion.productos[0].estado,'coincide');
});
caso('snapshot conservado y cambio de fuente avisado sin reescribir cantidades',async()=>{
 const o=await orden(),a=await factura({cantidad:7}),n=await vincular(o,a);await c.query('UPDATE productos_factura_proveedor SET cantidad=20 WHERE id=$1',[a.linea]);
 const actual=await f.consultar(o.id);assert.equal(actual.comparacion.productos[0].facturado,7);assert.equal(actual.facturas[0].fuenteCambio,true);assert.deepEqual(actual.facturas[0].lineas,n.facturas[0].lineas);
});
caso('compra registrada usa su conversión histórica aunque el mapeo cambie',async()=>{
 const o=await orden(),a=await factura({cantidad:6}),compra=(await c.query("INSERT INTO compra(proveedor_id,fecha_emision,total,factura_proveedor_id) VALUES($1,'2026-10-06',100,$2) RETURNING id",[d.proveedor.id,a.id])).rows[0].id;
 await c.query("INSERT INTO compra_linea(compra_id,numero_linea,producto_id,descripcion,cantidad,factor_conversion,precio_unitario,total_linea) VALUES($1,1,$2,'ZZ Compra',6,2,10,100)",[compra,d.producto]);
 await c.query('UPDATE supplier_product_mapping SET factor_conversion=9 WHERE id=$1',[a.m]);const p=await propuesta(o,a);assert.equal(p.documento.fuente,'compra_registrada');assert.equal(p.comparacion.productos[0].facturado,12);
 await c.query("UPDATE compra SET estado='anulada' WHERE id=$1",[compra]);await assert.rejects(propuesta(o,a),e=>e.status===409);
});
caso('vínculo equivocado se retira con motivo y conserva snapshot; misma factura se puede revisar de nuevo',async()=>{
 const o=await orden(),a=await factura(),n=await vincular(o,a),v=n.facturas[0];await assert.rejects(f.retirar(o.id,v.id,{}),e=>e.status===400);
 const r=await f.retirar(o.id,v.id,{motivo:'ZZ comprobante equivocado'});assert.equal(r.facturas[0].estado,'retirada');assert.equal(r.comparacion.productos[0].estado,'sin_comprobante');
 const nuevo=await vincular(o,a);assert.equal(nuevo.facturas.length,2);assert.equal(nuevo.comparacion.productos[0].facturado,10);
 await protegido("UPDATE orden_compra_ciclo_factura SET firma=repeat('0',64) WHERE id=$1",[v.id]);await protegido('DELETE FROM orden_compra_ciclo_factura WHERE id=$1',[v.id]);
});
caso('PDF original requiere confirmación y bytes PDF, se conserva exacto e idempotente',async()=>{
 const o=await orden(),a=await factura(),v=(await vincular(o,a)).facturas[0],b=await pdf(),clave=randomUUID(),datos={clave,tipo:'original_adjuntado',confirmar:true};
 await assert.rejects(f.guardarPdf(o.id,v.id,{...datos,confirmar:false},b),e=>e.status===400);await assert.rejects(f.guardarPdf(o.id,v.id,datos,Buffer.from('<html>')),e=>e.status===400);
 const n=await f.guardarPdf(o.id,v.id,datos,b),n2=await f.guardarPdf(o.id,v.id,datos,b);assert.deepEqual(n,n2);assert.equal(n.facturas[0].pdfs.length,1);assert.equal(n.facturas[0].pdfs[0].ruta,undefined);
 assert.deepEqual((await f.descargarPdf(o.id,v.id,clave)).pdf,b);await assert.rejects(f.guardarPdf(o.id,v.id,datos,Buffer.concat([b,Buffer.from('ZZ')])),e=>e.status===409);
});
caso('representación queda identificada y archivo privado tiene modo 600; copias anteriores no se reemplazan',async()=>{
 const o=await orden(),v=(await vincular(o,await factura())).facturas[0],id=randomUUID();const n=await f.guardarPdf(o.id,v.id,{clave:id,tipo:'representacion_buzon'});
 const p=n.facturas[0].pdfs[0];assert.equal(p.tipo,'representacion_buzon');const archivo=(await c.query('SELECT ruta FROM orden_compra_ciclo_factura_pdf WHERE id=$1',[id])).rows[0].ruta;
 assert.equal((await fs.stat(path.join(process.env.ALMACENAMIENTO_PRIVADO_DIR,archivo))).mode&0o777,0o600);
 const bytes=(await f.descargarPdf(o.id,v.id,id)).pdf;assert.equal(bytes.subarray(0,5).toString(),'%PDF-');await fs.writeFile(path.join(process.env.ALMACENAMIENTO_PRIVADO_DIR,'representacion-guardada.pdf'),bytes,{mode:0o600});
 const otra=await f.guardarPdf(o.id,v.id,{clave:randomUUID(),tipo:'representacion_buzon'});assert.equal(otra.facturas[0].pdfs.length,2);assert.deepEqual((await f.descargarPdf(o.id,v.id,id)).pdf,bytes);
 await protegido('DELETE FROM orden_compra_ciclo_factura_pdf WHERE id=$1',[id]);
});
caso('PDF de otra orden/vínculo no se descarga, y retirado conserva su copia privada',async()=>{
 const o=await orden(),next=await orden(d.proximo,4),v=(await vincular(o,await factura())).facturas[0],id=randomUUID();await f.guardarPdf(o.id,v.id,{clave:id,tipo:'representacion_buzon'});
 await assert.rejects(f.descargarPdf(next.id,v.id,id),e=>e.status===404);await assert.rejects(f.descargarPdf(o.id,v.id,randomUUID()),e=>e.status===404);
 await f.retirar(o.id,v.id,{motivo:'ZZ revisión'});assert.ok((await f.descargarPdf(o.id,v.id,id)).pdf.length);await assert.rejects(f.guardarPdf(o.id,v.id,{clave:randomUUID(),tipo:'representacion_buzon'}),e=>e.status===409);
});
caso('hash alterado, archivo ausente o enlace simbólico se rechazan sin regenerar',async()=>{
 const o=await orden(),v=(await vincular(o,await factura())).facturas[0],id=randomUUID();await f.guardarPdf(o.id,v.id,{clave:id,tipo:'representacion_buzon'});
 const p=(await c.query('SELECT ruta FROM orden_compra_ciclo_factura_pdf WHERE id=$1',[id])).rows[0],destino=path.join(process.env.ALMACENAMIENTO_PRIVADO_DIR,p.ruta),original=await fs.readFile(destino);
 await fs.appendFile(destino,'ZZ alteración');await assert.rejects(f.descargarPdf(o.id,v.id,id),e=>e.status===409);await fs.unlink(destino);await assert.rejects(f.descargarPdf(o.id,v.id,id),e=>e.status===404);
 const fuera=path.join(process.env.ALMACENAMIENTO_PRIVADO_DIR,'ZZ-fuera.pdf');await fs.writeFile(fuera,original);await fs.symlink(fuera,destino);await assert.rejects(f.descargarPdf(o.id,v.id,id),e=>e.status===409);await fs.unlink(destino);await fs.writeFile(destino,original);
});
caso('guardar vínculo y PDF no crea compra, stock, recepción, cambio de precios ni faltantes',async()=>{
 const o=await orden(),a=await factura(),tablas=['compra','compra_linea','movimiento_inventario','inventario_saldo','producto','facturas_proveedores','productos_factura_proveedor','factura','factura_linea','faltantes','cuentas_por_pagar'];
 // Ordenar huellas pequeñas conserva multiplicidad y contenido completo sin
 // ordenar ni acumular en memoria los XML históricos de cada fila.
 const huellas=()=>Promise.all(tablas.map(async t=>(await c.query(`SELECT COUNT(*)::int n,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) filas`)).rows[0]));
 const antes=await huellas(),n=await vincular(o,a);await f.guardarPdf(o.id,n.facturas[0].id,{clave:randomUUID(),tipo:'representacion_buzon'});assert.deepEqual(await huellas(),antes);assert.equal((await s.obtener(o.id)).estado,'enviada');
});
caso('falla INSERT de PDF elimina archivo sin fila; falla después de fila conserva archivo por posible COMMIT',async()=>{
 const o=await orden(),v=(await vincular(o,await factura())).facturas[0],carpeta=path.join(process.env.ALMACENAMIENTO_PRIVADO_DIR,'ordenes-facturas');const antes=await fs.readdir(carpeta);
 falloPdf=true;await assert.rejects(f.guardarPdf(o.id,v.id,{clave:randomUUID(),tipo:'representacion_buzon'}));falloPdf=false;assert.deepEqual(await fs.readdir(carpeta),antes);
 falloBitacora=true;await assert.rejects(f.guardarPdf(o.id,v.id,{clave:randomUUID(),tipo:'representacion_buzon'}));falloBitacora=false;assert.equal((await fs.readdir(carpeta)).length,antes.length+1);assert.equal((await f.consultar(o.id)).facturas[0].pdfs.length,0);
});
caso('orden sin envío y gasto recurrente no admiten vínculo; SQL no permite motivo vacío',async()=>{
 const a=await factura(),o=await s.crear({proveedorId:d.proveedor.id,cicloId:d.ciclo,clave:randomUUID(),lineas:[{productoId:d.producto,cantidadProveedor:10}]});await assert.rejects(propuesta(o,a),e=>e.status===409);
 const p=await s.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'}),n=await e.preparar(p.id,{version:p.version,telefono:'88888888',mensaje:`Orden ${p.referencia}`,clave:randomUUID()}),sent=await e.enviar(n.id,n.envios[0].id,{confirmar:true});
 const v=(await vincular(sent,a)).facturas[0];await protegido("UPDATE orden_compra_ciclo_factura SET estado='retirada',retirado_en=NOW(),motivo=NULL WHERE id=$1",[v.id]);
 const gasto=await factura();await c.query("UPDATE facturas_proveedores SET estado='GASTO_RECURRENTE' WHERE id=$1",[gasto.id]);await assert.rejects(propuesta(sent,gasto),e=>e.status===409);
});
caso('fracciones se suman con decimal exacto y total del comprobante no se reconstruye',async()=>{
 const o=await orden(),a=await factura({cantidad:0.1});await c.query(`INSERT INTO productos_factura_proveedor(id,factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,total_linea,producto_id,mapeo_id)
 VALUES($1,$2,2,'ZZ','ZZ Segunda',0.2,'Unid',10,2,$3,$4)`,[randomUUID(),a.id,d.producto,a.m]);const p=await propuesta(o,a);assert.equal(p.comparacion.productos[0].facturado,0.3);assert.equal(p.comparacion.productos[0].faltante,9.7);assert.equal(Number(p.documento.total_factura),100);
});
caso('PDF grande se rechaza y API no acepta tipos de copia inventados',async()=>{
 const o=await orden(),v=(await vincular(o,await factura())).facturas[0],b=Buffer.alloc(5*1024*1024+1);b.write('%PDF-');b.write('%%EOF',b.length-5);
 await assert.rejects(f.guardarPdf(o.id,v.id,{clave:randomUUID(),tipo:'original_adjuntado',confirmar:true},b),e=>e.status===413);
 await assert.rejects(f.guardarPdf(o.id,v.id,{clave:randomUUID(),tipo:'XML original'}),e=>e.status===400);
});
caso('dos conexiones y ciclos compiten por una factura: solo un vínculo vigente',async()=>{
 const seed=await pool.connect();let z,a;
 try{await seed.query('BEGIN');z=await sembrarEn(seed);a=randomUUID();const m=randomUUID();await seed.query(`INSERT INTO supplier_product_mapping(id,supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
 VALUES($1,$2,$3,'ZZ-REAL','ZZ','','',$4,$5,1)`,[m,z.proveedor.nombre,z.proveedor.identificacion,z.producto,z.proveedor.id]);
 await seed.query(`INSERT INTO facturas_proveedores(id,clave,numero_consecutivo,proveedor_nombre,proveedor_cedula,fecha_emision,total_productos,total_factura,archivo_xml)
 VALUES($1,$2,'ZZ-REAL',$3,$4,'2026-10-06',1,100,'ZZ.xml')`,[a,String(Date.now())+String(Math.floor(Math.random()*1e9)).padStart(9,'0')+'0'.repeat(28),z.proveedor.nombre,z.proveedor.identificacion]);
 await seed.query(`INSERT INTO productos_factura_proveedor(id,factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,total_linea,producto_id,mapeo_id)
 VALUES($1,$2,1,'ZZ-REAL','ZZ',10,'Unid',10,100,$3,$4)`,[randomUUID(),a,z.producto,m]);await seed.query('COMMIT');
 }catch(e){await seed.query('ROLLBACK');throw e}finally{seed.release()}
 const modulos=['../config/database','../src/modules/orders-whatsapp/ordenesCiclo.service','../src/modules/orders-whatsapp/ordenesCicloEnvio.service','../src/modules/orders-whatsapp/ordenesCicloFactura.service'].map(p=>require.resolve(p)),anteriores=modulos.map(p=>require.cache[p]);
 require.cache[modulos[0]]={id:modulos[0],filename:modulos[0],loaded:true,exports:{pool}};for(const m of modulos.slice(1))delete require.cache[m];
 try{const serv=require(modulos[1]),env=require(modulos[2]),fac=require(modulos[3]);const crear=async(ciclo,q)=>{let o=await serv.crear({proveedorId:z.proveedor.id,cicloId:ciclo,clave:randomUUID(),lineas:[{productoId:z.producto,cantidadProveedor:q}]});o=await serv.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'});const n=await env.preparar(o.id,{version:o.version,telefono:'88888888',mensaje:`Orden ${o.referencia}`,clave:randomUUID()});return env.enviar(o.id,n.envios[0].id,{confirmar:true})};
 const [o,n]=[await crear(z.ciclo,10),await crear(z.proximo,4)],[p,t]=[await fac.proponer(o.id,a),await fac.proponer(n.id,a)];
 const resultado=await Promise.allSettled([[o,p],[n,t]].map(([or,pr])=>fac.vincular(or.id,{clave:randomUUID(),facturaId:a,version:pr.version,revision:pr.revision,confirmar:true})));
 assert.equal(resultado.filter(r=>r.status==='fulfilled').length,1);assert.equal(resultado.find(r=>r.status==='rejected').reason.status,409);
 assert.equal((await pool.query("SELECT COUNT(*)::int n FROM orden_compra_ciclo_factura WHERE factura_id=$1 AND estado='vigente'",[a])).rows[0].n,1);
 }finally{modulos.forEach((m,i)=>require.cache[m]=anteriores[i])}
});

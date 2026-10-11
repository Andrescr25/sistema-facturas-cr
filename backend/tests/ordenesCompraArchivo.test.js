/** Archivo: fechas antiguas SOLO al insertar fixtures propios, con ROLLBACK. */
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
 await mapping(d.producto,'ZZ-BASE',factor);if(q*factor>10)await c.query('UPDATE faltantes SET cantidad_faltante=$2 WHERE id=$1',[d.faltantes[0].id,q*factor]);const o=await orden(d.ciclo,q),a=await factura({cantidad,factor});
 if(anterior)await compras.registrarCompra(a.id);
 await vincular(o,a);if(!anterior)await compras.registrarCompra(a.id);
 const p=await rcp.consultar(o.id);assert.equal(p.bloqueos.length,0);return{o,a,p,l:p.lineas[0]};
}
const fisica=async(o,{cantidad,final=false,motivos=[],clave=randomUUID(),datos}={})=>{
 const p=await rcp.consultar(o.id);return rcp.registrar(o.id,datos||{clave,version:p.version,revision:p.revision,confirmar:true,final,motivos,lineas:cantidad==null?[]:[{lineaId:p.lineas[0].id,cantidad}]});
};
const existencia=async()=>Number((await c.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1',[d.producto])).rows[0].existencia);
// Construir un evento histórico nuevo, nunca editar fechas de uno confirmado.
async function finalHistorica(o,intervalo='24 hours',cantidad=0){
 if(cantidad)await fisica(o,{cantidad});
 const p=await rcp.consultar(o.id),id=randomUUID();
 const motivos=p.comparacion.filter(x=>x.noRecibido>0||x.facturadoSinRecibir>0).map(x=>({productoId:x.productoId,tipo:'otro',detalle:'ZZ final histórica sin más entrega'}));
 await c.query(`INSERT INTO orden_compra_ciclo_recepcion(id,orden_id,solicitud,resumen,final,motivos,fecha)
   VALUES($1,$2,$3,$4,TRUE,$5,NOW()-$6::interval)`,[id,o.id,{version:p.version,revision:p.revision},{incrementos:[],comparacion:p.comparacion},JSON.stringify(motivos),intervalo]);
 await c.query(`UPDATE orden_compra_ciclo SET estado='recibida',recepcion_id=$2,
   recepcion_completa_en=(SELECT fecha FROM orden_compra_ciclo_recepcion WHERE id=$2),version=version+1 WHERE id=$1`,[o.id,id]);
 return s.obtener(o.id);
}
const listas=()=>Promise.all(['activas','historial'].map(vista=>s.listar({proveedorId:d.proveedor.id,cicloId:d.ciclo,vista})));
for(const [intervalo,archivada]of [['23:59:59.999999',false],['24 hours',true],['24 hours 0.000001 seconds',true]]){
 caso('frontera exacta '+intervalo+' desde final, sin redondear microsegundos',async()=>{
  const o=await orden(),h=await finalHistorica(o,intervalo);assert.equal(h.archivada,archivada);assert.equal(Boolean(h.archivada_en),archivada);
  assert.equal(h.estado,'recibida');const [activas,historial]=await listas();assert.equal(activas.some(x=>x.id===o.id),!archivada);assert.equal(historial.some(x=>x.id===o.id),archivada);
 });
}
caso('parcial permanece activa aunque el evento sea antiguo',async()=>{
 const {o}=await preparado(),p=await rcp.consultar(o.id),id=randomUUID();
 await c.query(`INSERT INTO orden_compra_ciclo_recepcion(id,orden_id,solicitud,resumen,final,motivos,fecha) VALUES($1,$2,$3,'{}',FALSE,'[]',NOW()-INTERVAL '30 days')`,[id,o.id,{version:p.version}]);
 await c.query("UPDATE orden_compra_ciclo SET estado='parcialmente_recibida',recepcion_id=$2,version=version+1 WHERE id=$1",[o.id,id]);
 const h=await s.obtener(o.id);assert.equal(h.archivada,false);assert.equal(h.archivo_programado_en,null);assert.equal(h.archivada_en,null);assert.ok((await listas())[0].some(x=>x.id===o.id));
});
caso('historial conserva origen y PDF de envío; cobertura recibida no se libera',async()=>{
 const {o}=await preparado(),original=await s.obtener(o.id);const h=await finalHistorica(o,'25 hours',6);
 const sug=(await s.sugerir({proveedorId:d.proveedor.id,cicloId:d.ciclo})).productos[0];assert.equal(sug.recibida,6);assert.equal(sug.disponible,4);assert.equal(sug.pendienteRecibir,0);
 assert.deepEqual(h.lineas[0].origenes,original.lineas[0].origenes);assert.equal(h.lineas[0].cantidad_propia,10);assert.equal(h.envios[0].sha256,original.envios[0].sha256);
 const bytes=(await e.descargar(o.id,o.envio_id)).pdf;assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 const r=await rcp.consultar(o.id);assert.equal(r.historial.length,2);assert.equal(r.comparacion[0].recibido,6);assert.equal(r.comparacion[0].noRecibido,4);
 assert.equal((await s.sugerir({proveedorId:d.proveedor.id,cicloId:d.proximo})).productos[0].disponible,4);
});
caso('factura y PDF permanecen consultables después de archivar',async()=>{
 const {o,a}=await preparado();const vinc=(await f.consultar(o.id)).facturas[0];await f.guardarPdf(o.id,vinc.id,{clave:randomUUID(),tipo:'representacion_buzon'});
 const antes=(await f.descargarPdf(o.id,vinc.id,(await f.consultar(o.id)).facturas[0].pdfs[0].id)).pdf;
 await finalHistorica(o,'25 hours',10);const despues=await f.consultar(o.id);assert.equal(despues.facturas[0].factura_id,a.id);
 const bytes=(await f.descargarPdf(o.id,vinc.id,despues.facturas[0].pdfs[0].id)).pdf;assert.deepEqual(bytes,antes);
});
caso('archivo solo lee: conserva filas, stock, versión y otras semanas',async()=>{
 const {o}=await preparado();await finalHistorica(o,'26 hours',6);
 const huellas=async()=>{const r={};for(const t of ['orden_compra_ciclo','orden_compra_ciclo_linea','orden_compra_ciclo_origen','orden_compra_ciclo_envio','orden_compra_ciclo_factura','orden_compra_ciclo_recepcion','orden_compra_ciclo_recepcion_linea','inventario_saldo','movimiento_inventario','faltantes','ciclo_ruta','envio_whatsapp'])r[t]=(await c.query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) x`)).rows[0].h;return r};
 const antes=await huellas();await listas();await s.obtener(o.id);await rcp.consultar(o.id);await f.consultar(o.id);assert.deepEqual(await huellas(),antes);
});
caso('cerrada sin envío sigue en historial sin archivo por recepción',async()=>{
 const o=await s.crear({proveedorId:d.proveedor.id,cicloId:d.ciclo,clave:randomUUID(),lineas:[{productoId:d.producto,cantidadProveedor:10}]});
 const h=await s.cambiarEstado(o.id,{version:o.version,estado:'cerrada',motivo:'ZZ sin compra'});assert.equal(h.archivada,false);assert.equal(h.archivo_programado_en,null);
 const [act,hist]=await listas();assert.equal(act.length,0);assert.equal(hist[0].id,o.id);
});
caso('UTC y Costa Rica conservan las 24 horas transcurridas',async()=>{
 const o=await orden();await finalHistorica(o,'24 hours');await c.query("SET LOCAL TIME ZONE 'UTC'");assert.equal((await s.obtener(o.id)).archivada,true);
 await c.query("SET LOCAL TIME ZONE 'America/Costa_Rica'");assert.equal((await s.obtener(o.id)).archivada,true);
});
caso('ruta, ciclo y Sin ciclo conservan historia y próxima semana separadas',async()=>{
 const o=await orden();await finalHistorica(o,'25 hours');const p=await orden(d.proximo,4);
 assert.deepEqual((await s.listar({rutaId:d.ruta.id,cicloId:d.ciclo,vista:'historial'})).map(x=>x.id),[o.id]);
 assert.deepEqual((await s.listar({rutaId:d.ruta.id,cicloId:d.proximo})).map(x=>x.id),[p.id]);assert.equal((await s.listar({cicloId:'sin-ciclo',proveedorId:d.proveedor.id,vista:'historial'})).length,0);
});

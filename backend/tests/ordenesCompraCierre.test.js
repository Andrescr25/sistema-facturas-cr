/** Base desechable propia, PDF local; ningún evento físico o transporte real. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const habilitado=process.env.PROBAR_BASE_LOCAL==='1',zz=n=>`ZZ comprobante ${n} ${randomUUID().slice(0,8)}`;
let pool,c,s,e,f,wa,original,d,falloPdf=false,falloBitacora=false,rcp,compras,cierre,necesidades;
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
  const actor=(await db.query("INSERT INTO usuario(usuario,nombre,password_hash) VALUES($1,'ZZ responsable cierre','ZZ no login') RETURNING id",[zz('actor')])).rows[0].id;
  return {actor,proveedor:p,ruta:r,cliente:cl,producto,ciclo:ciclos[0],proximo:ciclos[1],faltantes};
}

if(habilitado){
 require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
 const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});let nivel=0;
 const q=(sql,p)=>{
  if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')return Promise.resolve({rows:[]});
  if(falloPdf&&sql.includes('INSERT INTO orden_compra_ciclo_factura_pdf'))throw Error('ZZ fallo insertar PDF');
  if(falloBitacora&&sql.includes('INSERT INTO bitacora_cambio'))throw Error('ZZ fallo bitácora');return c.query(sql,p);
 };
 const db=require.resolve('../config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:{pool:{query:q,connect:async()=>{
  const sp=`factura_${++nivel}`;return{query:(sql,p)=>sql==='BEGIN'?q(`SAVEPOINT ${sp}`):sql==='COMMIT'?q(`RELEASE SAVEPOINT ${sp}`):sql==='ROLLBACK'?q(`ROLLBACK TO SAVEPOINT ${sp}`):q(sql,p),release(){}};
 }}}};
 s=require('../src/modules/orders-whatsapp/ordenesCiclo.service');e=require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');f=require('../src/modules/orders-whatsapp/ordenesCicloFactura.service');
 rcp=require('../src/modules/orders-whatsapp/ordenesCicloRecepcion.service');compras=require('../src/modules/compras/compras.service');cierre=require('../src/modules/orders-whatsapp/ordenesCicloCierre.service');necesidades=require('../src/modules/reports/necesidades.service');
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
const solicitar=async o=>{const p=await cierre.consultar(o.id);return{clave:randomUUID(),version:p.version,revision:p.revision,motivo:'ZZ proveedor confirmó que no enviará lo pendiente',confirmar:true}};
const cerrar=async(o,datos)=>cierre.cerrar(o.id,datos||await solicitar(o),d.actor);
const libre=async(cicloId=d.ciclo)=>Number((await s.sugerir({proveedorId:d.proveedor.id,cicloId})).productos[0].disponible);
const huellas=async()=>{const r={};for(const t of ['compra','compra_linea','cuentas_por_pagar','producto','facturas_proveedores','productos_factura_proveedor','faltantes','factura','factura_linea','inventario_saldo','movimiento_inventario','orden_compra_ciclo_linea','orden_compra_ciclo_origen','orden_compra_ciclo_envio','orden_compra_ciclo_factura','orden_compra_ciclo_factura_pdf','orden_compra_ciclo_recepcion','orden_compra_ciclo_recepcion_linea'])r[t]=(await c.query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) x`)).rows[0].h;return r};
caso('enviada sin recepción se cierra con actor, hora y libera diez sin inventar stock',async()=>{
 const o=await orden(),p=await cierre.consultar(o.id);assert.equal(p.puedeCerrar,true);assert.equal(Number(p.resumen.lineas[0].liberada),10);const antes=await huellas();const fin=await cerrar(o);
 assert.equal(fin.orden.estado,'cerrada');assert.equal(fin.evento.usuarioId,d.actor);assert.ok(fin.evento.fecha);assert.equal(fin.orden.enviada_en.getTime(),o.enviada_en.getTime());assert.equal(fin.orden.recepcion_completa_en,null);assert.equal(await libre(),10);assert.deepEqual(await huellas(),antes);assert.equal((await rcp.consultar(o.id)).historial.length,0);
});
caso('parcial seis de diez conserva seis, libera cuatro por sus facturas y próximo ciclo independiente',async()=>{
 const {o}=await preparado();await fisica(o,{cantidad:6});const antes=await huellas();const p=await cierre.consultar(o.id),l=p.resumen.lineas[0];assert.equal(Number(l.recibido),6);assert.equal(Number(l.conservada),6);assert.equal(Number(l.liberada),4);
 assert.deepEqual(l.origenes.map(x=>[Number(x.conservada),Number(x.liberada)]),[[6,0],[0,4]]);const fin=await cerrar(o);assert.deepEqual(await huellas(),antes);assert.equal(await existencia(),6);assert.ok(fin.orden.recepcion_id);assert.equal(await libre(),4);assert.equal(await libre(d.proximo),4);
 const su=(await s.sugerir({proveedorId:d.proveedor.id,cicloId:d.ciclo})).productos[0];assert.equal(su.reservadaBorrador,0);assert.equal(su.recibida,6);assert.equal(su.pendienteRecibir,0);
 const nueva=await s.crear({proveedorId:d.proveedor.id,cicloId:d.ciclo,clave:randomUUID(),lineas:[{productoId:d.producto,cantidadProveedor:4}]});assert.notEqual(nueva.id,o.id);assert.equal(nueva.lineas[0].origenes.length,1);assert.equal(nueva.lineas[0].origenes[0].faltante_id,d.faltantes[1].id);assert.equal((await s.obtener(o.id)).lineas[0].cantidad_propia,10);
});
caso('necesidades conserva solicitado original y recibido de cerrada, pendiente cero',async()=>{
 const {o}=await preparado();await fisica(o,{cantidad:6});await cerrar(o);const r=await necesidades.listar({cicloId:d.ciclo});const p=r.productos.find(p=>p.productoId===d.producto);for(const [k,v] of Object.entries({solicitado:10,recibido:6,pendienteRecibir:0,cubierta:6,sinCobertura:4,reservadaBorrador:0}))assert.equal(Number(p.cantidades[k]),v);assert.equal(p.compras[0].estado,'cerrada');
});
caso('cierre sin envío anterior conserva su flujo y queda excluido de solicitado',async()=>{
 const o=await s.crear({proveedorId:d.proveedor.id,cicloId:d.ciclo,clave:randomUUID(),lineas:[{productoId:d.producto,cantidadProveedor:10}]});await s.cambiarEstado(o.id,{version:o.version,estado:'cerrada',motivo:'ZZ no enviar'});assert.equal(await libre(),10);const r=await necesidades.listar({cicloId:d.ciclo});assert.equal(r.productos[0].compras.length,0);assert.equal((await cierre.consultar(o.id)).evento,null);
});
caso('mismo UUID reintenta incluso tras cierre, sin duplicar evento ni bitácora',async()=>{
 const o=await orden(),datos=await solicitar(o);const a=await cerrar(o,datos),b=await cerrar(o,datos);assert.deepEqual(a,b);assert.equal((await c.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo_cierre WHERE orden_id=$1',[o.id])).rows[0].n,1);assert.equal((await c.query("SELECT COUNT(*)::int n FROM bitacora_cambio WHERE entidad='orden_compra_ciclo' AND entidad_id=$1 AND accion='cerrar_enviada'",[String(o.id)])).rows[0].n,1);await assert.rejects(cerrar(o,{...datos,motivo:'ZZ otro'}),e=>e.status===409);await assert.rejects(cerrar(o,{...datos,clave:randomUUID()}),e=>e.status===409);
});
caso('otra orden no consume clave del cierre anterior',async()=>{
 const o=await orden(),datos=await solicitar(o);await cerrar(o,datos);const otra=await orden(d.proximo,4);await assert.rejects(cerrar(otra,datos),e=>e.status===409);assert.equal((await s.obtener(otra.id)).estado,'enviada');
});
caso('revisión vieja tras parcial o nuevo vínculo bloquea sin liberar cobertura',async()=>{
 const {o}=await preparado(),datos=await solicitar(o);await fisica(o,{cantidad:4});await assert.rejects(cerrar(o,datos),e=>e.status===409);assert.equal(await libre(),0);const actual=await solicitar(o);await vincular(o,await factura({cantidad:1}));await assert.rejects(cerrar(o,actual),e=>e.status===409);assert.equal(await libre(),0);
});
caso('firma de cantidades revisadas obligatoria y confirmación/motivo/usuario válidos',async()=>{
 const o=await orden(),datos=await solicitar(o);for(const extra of [{motivo:''},{motivo:'x'.repeat(1001)},{confirmar:false},{revision:''},{clave:'x'},{version:true}])await assert.rejects(cerrar(o,{...datos,...extra}),e=>e.status===400);
 await assert.rejects(cerrar(o,{...datos,revision:'0'.repeat(64)}),e=>e.status===409);await c.query('UPDATE usuario SET activo=FALSE WHERE id=$1',[d.actor]);await assert.rejects(cerrar(o,datos),e=>e.status===403);assert.equal(await libre(),0);
});
caso('incierto y pendiente no se cierran hasta verificar resultado confirmado',async()=>{
 wa.enviarDocumento=async()=>{throw Error('ZZ incierto')};const o=await orden();wa.enviarDocumento=async doc=>({enviado:true,numero:doc.telefono,via:'interno'});assert.equal(o.estado,'pendiente_enviar');assert.equal((await cierre.consultar(o.id)).puedeCerrar,false);await assert.rejects(cerrar(o),e=>e.status===409);assert.equal(await libre(),0);
 const p=await e.confirmarVerificado(o.id,o.envios[0].id,{confirmarEnvio:true,motivo:'ZZ proveedor verifica recepción del mensaje'},d.actor);assert.equal(p.estado,'enviada');await cerrar(p);assert.equal(await libre(),10);
});
caso('ciclo cancelado y proveedor inactivo permiten cerrar obligación previa conservando contexto',async()=>{
 const o=await orden();await c.query("UPDATE ciclo_ruta SET estado='cancelado' WHERE id=$1",[d.ciclo]);await c.query('UPDATE proveedor SET activo=FALSE WHERE id=$1',[d.proveedor.id]);const fin=await cerrar(o);assert.equal(fin.orden.ciclo.id,d.ciclo);assert.equal(fin.orden.proveedor_nombre,d.proveedor.nombre);
});
caso('recibida conserva archivo 24h y no admite cierre/reapertura ni nueva recepción',async()=>{
 const {o}=await preparado();await fisica(o,{cantidad:10,final:true});assert.equal((await cierre.consultar(o.id)).puedeCerrar,false);await assert.rejects(cerrar(o),e=>e.status===409);assert.equal(await libre(),0);
});
caso('cerrada va a historial inmediato con PDF y recepciones disponibles; no recibe otra vez',async()=>{
 const {o}=await preparado();await fisica(o,{cantidad:4});const fin=await cerrar(o);assert.equal((await s.listar({proveedorId:d.proveedor.id})).length,0);assert.equal((await s.listar({proveedorId:d.proveedor.id,vista:'historial'}))[0].id,o.id);assert.equal(fin.orden.archivada,false);assert.ok((await e.descargar(o.id,o.envios[0].id)).pdf.length>0);assert.equal((await rcp.consultar(o.id)).comparacion[0].pendiente,0);await assert.rejects(fisica(o,{cantidad:1}),e=>e.status===409);await assert.rejects(s.cambiarEstado(o.id,{version:fin.orden.version,estado:'borrador'}),e=>e.status===409);
});
caso('SQL exige evento coincidente y conserva estado, líneas, envío y recepción inmutables',async()=>{
 const {o}=await preparado();await fisica(o,{cantidad:4});await protegido("UPDATE orden_compra_ciclo SET estado='cerrada',version=version+1,motivo_cierre='ZZ',cerrada_en=NOW() WHERE id=$1",[o.id],/evento revisado/);const fin=await cerrar(o);
 for(const sql of ["UPDATE orden_compra_ciclo SET estado='enviada',version=version+1,motivo_cierre=NULL,cerrada_en=NULL WHERE id=$1",'DELETE FROM orden_compra_ciclo WHERE id=$1','UPDATE orden_compra_ciclo_linea SET cantidad_proveedor=20 WHERE orden_id=$1','DELETE FROM orden_compra_ciclo_cierre WHERE orden_id=$1',"UPDATE orden_compra_ciclo_cierre SET motivo='ZZ otro' WHERE orden_id=$1"])await protegido(sql,[o.id]);
 const re=(await rcp.consultar(o.id)).historial[0];await protegido('DELETE FROM orden_compra_ciclo_recepcion WHERE id=$1',[re.id]);assert.equal(fin.orden.envio_id,o.envio_id);
});
caso('SQL no permite snapshots/actor inventados ni retirar factura del cierre sin físico',async()=>{
 const o=await orden(),a=await factura();const v=await vincular(o,a);const datos=await solicitar(o);await protegido('INSERT INTO orden_compra_ciclo_cierre(id,orden_id,solicitud,resumen,motivo,usuario_id) VALUES($1,$2,$3,$4,$5,$6)',[datos.clave,o.id,datos,{},datos.motivo,d.actor],/revisión/);await cerrar(o);await protegido("UPDATE orden_compra_ciclo_factura SET estado='retirada',motivo='ZZ',retirado_en=NOW() WHERE id=$1",[v.facturas[0].id],/finalizada/);
});
caso('fallo bitácora revierte cierre/evento y no libera cobertura ni toca inventario',async()=>{
 const {o}=await preparado();await fisica(o,{cantidad:4});const antes=await huellas(),datos=await solicitar(o);falloBitacora=true;await assert.rejects(cerrar(o,datos));falloBitacora=false;assert.equal((await s.obtener(o.id)).estado,'parcialmente_recibida');assert.equal((await cierre.consultar(o.id)).evento,null);assert.equal(await libre(),0);assert.deepEqual(await huellas(),antes);await cerrar(o,datos);assert.equal(await libre(),6);
});
caso('conversión fraccionaria preserva cuatro decimales recibidos y seis de cobertura',async()=>{
 const {o}=await preparado({q:3,factor:0.333333,cantidad:3});await fisica(o,{cantidad:0.3333});const p=await cierre.consultar(o.id);assert.equal(Number(p.resumen.lineas[0].conservada),0.3333);assert.equal(p.resumen.lineas[0].liberada,'0.666699');await cerrar(o);assert.equal(await existencia(),0.3333);assert.equal(await libre(),9.6667);
});
caso('recibido excedente no cubre otro origen ni próxima semana al cerrar',async()=>{
 await mapping(d.producto,'ZZ-BASE',6);const o=await orden(d.ciclo,2),a=await factura({cantidad:2,factor:6});await vincular(o,a);await compras.registrarCompra(a.id);await fisica(o,{cantidad:11});const p=await cierre.consultar(o.id);assert.equal(Number(p.resumen.lineas[0].conservada),10);assert.equal(Number(p.resumen.lineas[0].liberada),0);assert.equal(Number(p.resumen.lineas[0].recibido),11);await cerrar(o);assert.equal(await libre(),0);assert.equal(await libre(d.proximo),4);
});
// Conexiones reales sobre fixtures COMMIT de la base desechable. Permiten
// verificar READ ONLY y la carrera entre cierre y recepción.
async function conConexiones(fn){
 const externa=c,previo=d,seed=await pool.connect();let fixture;
 try{c=seed;await seed.query('BEGIN');d=await sembrarEn(seed);fixture=await preparado();fixture.d=d;await fisica(fixture.o,{cantidad:4});fixture.cierre=await solicitar(fixture.o);fixture.recepcion=await rcp.consultar(fixture.o.id);await seed.query('COMMIT')}
 catch(e){await seed.query('ROLLBACK');throw e}finally{c=externa;d=previo;seed.release()}
 const nombres=['../config/database',...['ordenesCiclo','ordenesCicloCierre','ordenesCicloRecepcion'].map(n=>'../src/modules/orders-whatsapp/'+n+'.service')],rutas=nombres.map(require.resolve),anteriores=rutas.map(p=>require.cache[p]);
 require.cache[rutas[0]]={id:rutas[0],filename:rutas[0],loaded:true,exports:{pool}};for(const ruta of rutas.slice(1))delete require.cache[ruta];
 try{await fn(require(rutas[2]),require(rutas[3]),fixture)}finally{rutas.forEach((p,i)=>require.cache[p]=anteriores[i])}
}
caso('dos cierres con mismo UUID confirman un evento sin duplicar bitácora ni liberar dos veces',async()=>conConexiones(async(cl,r,{o,cierre:datos,d})=>{
 const [a,b]=await Promise.all([cl.cerrar(o.id,datos,d.actor),cl.cerrar(o.id,datos,d.actor)]);assert.deepEqual(a,b);assert.equal((await pool.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo_cierre WHERE orden_id=$1',[o.id])).rows[0].n,1);assert.equal(Number((await pool.query('SELECT SUM(cobertura) c FROM orden_compra_ciclo_cobertura WHERE orden_id=$1',[o.id])).rows[0].c),4);
}));
caso('dos UUID distintos con misma revisión solo confirman un cierre',async()=>conConexiones(async(cl,r,{o,cierre:datos,d})=>{
 const rs=await Promise.allSettled([cl.cerrar(o.id,datos,d.actor),cl.cerrar(o.id,{...datos,clave:randomUUID()},d.actor)]);assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);assert.equal(rs.find(r=>r.status==='rejected').reason.status,409);
}));
caso('cierre y recepción concurrentes conservan solo el evento ganador de la revisión',async()=>conConexiones(async(cl,r,{o,cierre:datos,recepcion:p,d})=>{
 const rs=await Promise.allSettled([cl.cerrar(o.id,datos,d.actor),r.registrar(o.id,{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final:false,motivos:[],lineas:[{lineaId:p.lineas[0].id,cantidad:2}]},d.actor)]);assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);assert.equal(rs.find(r=>r.status==='rejected').reason.status,409);
 const stock=Number((await pool.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1',[d.producto])).rows[0].existencia);assert.equal(stock,rs[0].status==='fulfilled'?4:6);
}));
caso('propuesta nativa READ ONLY/REPEATABLE READ consulta cobertura sin escritura ni FOR SHARE',async()=>conConexiones(async(cl,r,{o})=>{
 const connect=pool.connect.bind(pool),observados=[];pool.connect=async()=>{const db=await connect(),q=db.query.bind(db);db.query=async(sql,p)=>{const r=await q(sql,p);if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')observados.push([(await q('SHOW transaction_read_only')).rows[0].transaction_read_only,(await q('SHOW transaction_isolation')).rows[0].transaction_isolation]);return r};const release=db.release.bind(db);db.release=()=>{db.query=q;db.release=release;release()};return db};
 try{const p=await cl.consultar(o.id);assert.equal(p.puedeCerrar,true);assert.equal(Number(p.resumen.lineas[0].conservada),4);assert.deepEqual(observados,[['on','repeatable read']]);await assert.rejects(cl.consultar(2147483647),e=>e.status===404)}finally{pool.connect=connect}
}));
test('cierre conserva permiso de Reporte Proveedores, incluidos variantes Express',()=>{const {moduloDeRuta}=require('../src/modules/usuarios/modulos');assert.equal(moduloDeRuta('/Orden-Compra/Por-Ciclo/1/Cierre/'),'reporte-proveedores')});

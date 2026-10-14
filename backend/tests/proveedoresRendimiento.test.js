/** Lotes reales y lectura sin bloqueos, siempre PostgreSQL local/ROLLBACK. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {sembrar}=require('./dobles/ordenesAutomaticas');
const {baseEnTransaccion}=require('./dobles/buzonEnTransaccion');
const activo=process.env.PROBAR_BASE_LOCAL==='1';
let pool,c,f,db,auto,motor,destino,sql=[];
const caso=(n,fn)=>test(n,{skip:!activo},async()=>{await c.query('SAVEPOINT rendimiento');try{await fn()}finally{await c.query('ROLLBACK TO SAVEPOINT rendimiento')}});
if(activo){
 require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
 before(async()=>{
  pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL,max:4});c=await pool.connect();await c.query('BEGIN');
  db=baseEnTransaccion(c,'rendimiento_db');const connect=db.pool.connect;
  db.pool.connect=async()=>{const cl=await connect(),q=cl.query;cl.query=(s,p)=>{sql.push(s);return q(s,p)};return cl};
  const ruta=require.resolve('../config/database');require.cache[ruta]={id:ruta,filename:ruta,loaded:true,exports:db};
  f=await sembrar(c);auto=require('../src/modules/orders-whatsapp/ordenesAutomaticas.service');motor=require('../src/modules/orders-whatsapp/ordenesCiclo.service');destino=require('../src/modules/orders-whatsapp/destinoProveedor.service');
 });
 after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool?.end()});
}
async function prepararProductos(tam){
 const ids=[...f.productos];
 for(let i=3;i<tam;i++){
  const p=(await c.query('INSERT INTO producto(nombre,referencia) VALUES($1,$1) RETURNING id',['ZZ rendimiento '+randomUUID().slice(0,18)])).rows[0];ids.push(p.id);
  await c.query(`INSERT INTO supplier_product_mapping(supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
    VALUES($1,$2,$3::text,$3::text,'','',$4,$5,1)`,[f.p.nombre,f.p.identificacion,'ZZ-'+i,p.id,f.p.id]);
  await c.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,$2,$3,'ZZ',20,1,20)",[f.facturas[0],i+1,p.id]);
 }
 for(const id of ids)await c.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula) VALUES($1,$2,10,'parcial','pendiente',$3,$4)",[f.facturas[0],id,f.p.nombre,f.p.identificacion]);
 return ids;
}
caso('40 productos acumulan con dos lecturas de necesidades y un lote, sin cambiar su cobertura',async()=>{
 const ids=await prepararProductos(40);sql=[];const r=await auto.sincronizar({proveedorId:f.p.id});
 assert.equal(r.ordenes.length,1);assert.equal(sql.filter(s=>s.includes('AS "faltanteId"')).length,2);
 assert.equal(sql.filter(s=>s.includes('INSERT INTO orden_compra_ciclo_linea')).length,1);
 assert.equal(sql.filter(s=>s.includes('INSERT INTO orden_compra_ciclo_origen')).length,1);
 const o=await motor.obtener(r.ordenes[0]);assert.equal(o.lineas.length,40);
 assert.deepEqual(new Set(o.lineas.map(l=>l.producto_id)),new Set(ids));
 for(const l of o.lineas){assert.equal(l.cantidad_proveedor,10);assert.equal(l.origenes.length,1);assert.equal(Number(l.origenes[0].cantidad),10)}
 assert.deepEqual(await auto.sincronizar({proveedorId:f.p.id}),{ordenes:[]});assert.deepEqual(await motor.obtener(o.id),o);
});
caso('501 productos se dividen en 500 y 1, cada origen se reserva una vez',async()=>{
 await prepararProductos(501);const r=await auto.sincronizar({proveedorId:f.p.id});assert.equal(r.ordenes.length,2);
 const ordenes=await Promise.all(r.ordenes.map(id=>motor.obtener(id)));assert.deepEqual(ordenes.map(o=>o.lineas.length),[500,1]);
 const origenes=ordenes.flatMap(o=>o.lineas.flatMap(l=>l.origenes));assert.equal(origenes.length,501);assert.equal(new Set(origenes.map(r=>r.faltante_id)).size,501);
 assert.equal(origenes.reduce((s,r)=>s+Number(r.cantidad),0),5010);
});
caso('un rechazo en un origen revierte el lote completo y no deja líneas ni bitácora parcial',async()=>{
 await prepararProductos(4);const id=(await c.query('SELECT max(id) id FROM faltantes WHERE factura_propia_id=$1',[f.facturas[0]])).rows[0].id;
 await c.query(`CREATE FUNCTION pg_temp.rechazar_origen_rendimiento() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.faltante_id=${id} THEN RAISE EXCEPTION 'ZZ origen rechazado'; END IF; RETURN NEW; END $$`);
 await c.query('CREATE TRIGGER zz_rechazar_origen_rendimiento BEFORE INSERT ON orden_compra_ciclo_origen FOR EACH ROW EXECUTE FUNCTION pg_temp.rechazar_origen_rendimiento()');
 await assert.rejects(auto.sincronizar({proveedorId:f.p.id}),/ZZ origen rechazado/);
 assert.equal((await c.query('SELECT count(*)::int n FROM orden_compra_ciclo WHERE proveedor_id=$1',[f.p.id])).rows[0].n,0);
});
caso('contactos de una ficha se leen sin escrituras ni consultas de compras',async()=>{
 const consultas=[],ejecutor={query:(s,p)=>{consultas.push(s);return c.query(s,p)}};
 const r=await destino.consultar({cedula:f.p.identificacion},{db:ejecutor});assert.equal(r.telefono,'50688888888');assert.equal(consultas.length,1);
 assert.ok(consultas.every(s=>/^SELECT /.test(s)&&!/(FOR SHARE|pg_advisory|orden_compra|faltantes)/.test(s)));
 await c.query('UPDATE proveedor SET telefono_whatsapp=$2 WHERE id=$1',[f.p.id,'8888 8888\n8777 7777']);
 const varios=await destino.consultar({proveedorId:f.p.id},{db:ejecutor});assert.equal(varios.telefono,'');assert.equal(varios.telefonos.length,2);
});
caso('lectura READ ONLY real de contactos responde aunque otra conexión tenga el bloqueo de compras',async()=>{
 const p=(await pool.query('SELECT id FROM proveedor WHERE activo ORDER BY id LIMIT 1')).rows[0];
 const bloqueo=await pool.connect(),lectura=await pool.connect();
 try{
  await bloqueo.query('BEGIN');await bloqueo.query('SELECT pg_advisory_xact_lock(46005,1)');
  await lectura.query('BEGIN READ ONLY');await lectura.query("SET LOCAL statement_timeout='1500ms'");
  assert.equal((await lectura.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
  const r=await destino.consultar({proveedorId:p.id},{db:lectura});assert.equal(typeof r.mensaje,'string');assert.ok(Array.isArray(r.telefonos));
 }finally{await lectura.query('ROLLBACK');await bloqueo.query('ROLLBACK');lectura.release();bloqueo.release()}
});

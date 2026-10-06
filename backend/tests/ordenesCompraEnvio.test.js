/** PostgreSQL propio y transporte simulado: ningún mensaje real. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const habilitado=process.env.PROBAR_BASE_LOCAL==='1',zz=n=>`ZZ envío ${n} ${randomUUID().slice(0,8)}`;
let pool,c,s,env,wa,original,fixture,llamadas=[],fallarRegistro=false,iniciadoAntiguo=false;
const caso=(n,f)=>test(n,{skip:!habilitado},async()=>{
  llamadas=[];fallarRegistro=false;iniciadoAntiguo=false;
  wa.enviarDocumento=async d=>{llamadas.push(d);return{enviado:true,numero:d.telefono,via:'interno'}};
  await c.query('SAVEPOINT caso_envio');try{await f()}finally{await c.query('ROLLBACK TO SAVEPOINT caso_envio');wa.enviarDocumento=original}
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
  const q=(sql,params)=>{
    if(fallarRegistro&&sql.includes('INSERT INTO envio_whatsapp'))throw Error('ZZ caída al guardar');
    if(iniciadoAntiguo&&sql.includes("SET estado='enviando'"))sql=sql.replace('iniciado_en=NOW()',"iniciado_en=NOW()-INTERVAL '6 minutes'");
    return c.query(sql,params);
  };
  const db=require.resolve('../config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:{pool:{query:q,connect:async()=>{
    const sp=`envio_${++nivel}`;return{query:(sql,p)=>sql==='BEGIN'?q(`SAVEPOINT ${sp}`):sql==='COMMIT'?q(`RELEASE SAVEPOINT ${sp}`):sql==='ROLLBACK'?q(`ROLLBACK TO SAVEPOINT ${sp}`):q(sql,p),release(){}}
  }}}};
  s=require('../src/modules/orders-whatsapp/ordenesCiclo.service');env=require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');
  wa=require('../src/integrations/whatsapp');original=wa.enviarDocumento;
  before(async()=>{c=await pool.connect();await c.query('BEGIN');fixture=await sembrarEn(c)});
  after(async()=>{wa.enviarDocumento=original;if(c){await c.query('ROLLBACK');c.release()}await pool.end()});
}
async function pendiente(serv=s,d=fixture,q=10){
  const o=await serv.crear({proveedorId:d.proveedor.id,cicloId:d.ciclo,clave:randomUUID(),lineas:[{productoId:d.producto,cantidadProveedor:q}]});
  return serv.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'});
}
const datos=o=>({version:o.version,telefono:'8888 8888',mensaje:`Orden ${o.referencia} para su semana`,clave:randomUUID()});
async function copia(o=undefined){o=o||await pendiente();const n=await env.preparar(o.id,datos(o));return {o:n,e:n.envios[0]};}
const mandar=(o,e)=>env.enviar(o.id,e.id,{confirmar:true});
const sugerir=()=>s.sugerir({proveedorId:fixture.proveedor.id,cicloId:fixture.ciclo});
const protegido=async(sql,params)=>{await c.query('SAVEPOINT proteger');try{await assert.rejects(c.query(sql,params))}finally{await c.query('ROLLBACK TO SAVEPOINT proteger')}};

caso('copia privada guarda bytes/huella/numero/mensaje y DTO nunca expone el PDF',async()=>{
  const {o,e}=await copia(),d=await env.descargar(o.id,e.id);
  assert.equal(d.pdf.subarray(0,5).toString(),'%PDF-');assert.equal(e.numero,'50688888888');assert.equal(e.bytes,d.pdf.length);assert.match(e.sha256,/^[a-f0-9]{64}$/);
  assert.equal(e.pdf,undefined);assert.equal(o.estado,'pendiente_enviar');assert.equal(o.envio_id,null);assert.equal(llamadas.length,0);
  await fs.mkdir(process.env.ALMACENAMIENTO_PRIVADO_DIR,{recursive:true});await fs.writeFile(path.join(process.env.ALMACENAMIENTO_PRIVADO_DIR,'orden-revisada.pdf'),d.pdf,{mode:0o600});
});
caso('reintento de preparación devuelve la misma copia y rechaza otra solicitud con esa clave',async()=>{
  const o=await pendiente(),d=datos(o),a=await env.preparar(o.id,d),b=await env.preparar(o.id,d);assert.equal(a.envios.length,1);assert.deepEqual(a,b);
  await assert.rejects(env.preparar(o.id,{...d,telefono:'77777777'}),e=>e.status===409);
});
caso('número ambiguo, mensaje ajeno o sin confirmación no inician transporte',async()=>{
  const o=await pendiente();for(const telefono of ['88888888 77777777','1234567',''])await assert.rejects(env.preparar(o.id,{...datos(o),telefono}),e=>e.status===400);
  await assert.rejects(env.preparar(o.id,{...datos(o),mensaje:`OC-${o.id}0`}),e=>e.status===400);
  const {e}=await copia(o);await assert.rejects(env.enviar(o.id,e.id,{}),e=>e.status===400);assert.equal(llamadas.length,0);
});
caso('descarga ajena o UUID inválido no concede acceso; copia anterior sigue inmutable',async()=>{
  const {o,e}=await copia(),a=await env.descargar(o.id,e.id);const b=await s.cambiarEstado(o.id,{version:o.version,estado:'borrador'});
  const nuevo=await s.editar(b.id,{version:b.version,lineas:[{productoId:fixture.producto,cantidadProveedor:7}]});
  assert.deepEqual((await env.descargar(o.id,e.id)).pdf,a.pdf);await assert.rejects(mandar(nuevo,e),e=>e.status===409);
  await assert.rejects(env.descargar(o.id,'../otro'),e=>e.status===400);
  const otra=await s.crear({proveedorId:fixture.proveedor.id,cicloId:fixture.proximo,clave:randomUUID(),lineas:[{productoId:fixture.producto,cantidadProveedor:4}]});
  await assert.rejects(env.descargar(otra.id,e.id),e=>e.status===404);
});
caso('enviar usa exactamente PDF y caption revisados aunque cambien maestro/mapeos/ficha',async()=>{
  const {o,e}=await copia(),a=await env.descargar(o.id,e.id);
  await c.query('UPDATE producto SET nombre=$2 WHERE id=$1',[fixture.producto,zz('otro nombre')]);await c.query("UPDATE proveedor SET telefono_whatsapp='77777777' WHERE id=$1",[fixture.proveedor.id]);
  const n=await mandar(o,e);assert.equal(n.estado,'enviada');assert.equal(n.envio_id,e.id);assert.ok(n.enviada_en);
  assert.deepEqual(llamadas[0].pdf,a.pdf);assert.equal(llamadas[0].telefono,e.numero);assert.equal(llamadas[0].mensaje,e.mensaje);assert.equal(n.envios[0].confirmacion,'transporte');
  assert.equal((await c.query('SELECT referencia,exito FROM envio_whatsapp WHERE referencia=$1',[o.referencia])).rows[0].exito,true);
});
caso('orden enviada no vuelve a borrador, no cambia líneas ni se cierra sin recepción, incluso SQL',async()=>{
  const {o,e}=await copia(),n=await mandar(o,e);
  await assert.rejects(s.editar(n.id,{version:n.version,lineas:[{productoId:fixture.producto,cantidadProveedor:13}]}),e=>e.status===409);
  for(const estado of ['borrador','cerrada'])await assert.rejects(s.cambiarEstado(n.id,{version:n.version,estado,motivo:'ZZ'}),e=>e.status===409);
  await protegido('UPDATE orden_compra_ciclo SET estado=\'borrador\',version=version+1 WHERE id=$1',[n.id]);
  await protegido('DELETE FROM orden_compra_ciclo_linea WHERE orden_id=$1',[n.id]);
  await protegido("UPDATE orden_compra_ciclo_envio SET mensaje='ZZ cambiado' WHERE id=$1",[e.id]);
  await protegido('DELETE FROM orden_compra_ciclo_envio WHERE id=$1',[e.id]);
});
caso('10 enviadas y 3 nuevas: nueva orden solo 3, anterior conserva 10 y próxima semana 4',async()=>{
  const {o,e}=await copia();await mandar(o,e);await c.query('UPDATE faltantes SET cantidad_faltante=cantidad_faltante+3 WHERE id=$1',[fixture.faltantes[1].id]);
  const p=(await sugerir()).productos[0];assert.equal(p.faltante,13);assert.equal(p.solicitada,10);assert.equal(p.pendienteRecibir,10);assert.equal(p.reservadaBorrador,0);assert.equal(p.disponible,3);
  const otra=await s.crear({proveedorId:fixture.proveedor.id,cicloId:fixture.ciclo,clave:randomUUID(),lineas:[{productoId:fixture.producto,cantidadProveedor:3}]});
  assert.equal(otra.lineas[0].cantidad_propia,3);assert.equal((await s.obtener(o.id)).lineas[0].cantidad_proveedor,10);
  assert.equal((await s.sugerir({proveedorId:fixture.proveedor.id,cicloId:fixture.proximo})).productos[0].disponible,4);
});
caso('mismo envío repetido tras confirmación no vuelve a tocar transporte',async()=>{
  const {o,e}=await copia(),a=await mandar(o,e),b=await mandar(o,e);assert.equal(llamadas.length,1);assert.deepEqual(a,b);
});
caso('timeout queda incierto, reserva cobertura y no reenvía ni admite cambios',async()=>{
  const {o,e}=await copia();wa.enviarDocumento=async d=>{llamadas.push(d);throw Object.assign(Error('ZZ error con detalle privado'),{status:502})};
  const n=await mandar(o,e);assert.equal(n.estado,'pendiente_enviar');assert.equal(n.envios[0].estado,'incierto');assert.ok(n.envio_id);
  assert.equal((await sugerir()).productos[0].disponible,0);assert.equal((await sugerir()).productos[0].solicitada,0);
  await mandar(o,e);assert.equal(llamadas.length,1);assert.ok(!n.envios[0].motivo.includes('detalle privado'));
  await assert.rejects(s.cambiarEstado(n.id,{version:n.version,estado:'borrador'}),e=>e.status===409);
});
caso('confirmación manual de incertidumbre guarda motivo sin envío nuevo ni inventario',async()=>{
  const {o,e}=await copia();wa.enviarDocumento=async()=>{throw Error('ZZ timeout')};await mandar(o,e);
  await assert.rejects(env.confirmarVerificado(o.id,e.id,{confirmarEnvio:true}),e=>e.status===400);
  const n=await env.confirmarVerificado(o.id,e.id,{confirmarEnvio:true,motivo:'ZZ proveedor confirmó PDF y cantidades por llamada'});
  assert.equal(n.estado,'enviada');assert.equal(n.envios[0].confirmacion,'manual');assert.equal(llamadas.length,0);assert.equal((await sugerir()).productos[0].solicitada,10);
  assert.deepEqual(await env.confirmarVerificado(o.id,e.id,{confirmarEnvio:true,motivo:'ZZ repetición'}),n);
});
caso('fallo antes de iniciar canal permite nueva copia explícita, nunca reintenta la misma',async()=>{
  const {o,e}=await copia();wa.enviarDocumento=async d=>{llamadas.push(d);throw Object.assign(Error('ZZ sin canal'),{envioNoIniciado:true})};
  const n=await mandar(o,e);assert.equal(n.envios[0].estado,'no_enviado');assert.equal(n.envio_id,null);assert.equal(n.estado,'pendiente_enviar');
  await mandar(o,e);assert.equal(llamadas.length,1);const nueva=await env.preparar(n.id,datos(n));assert.equal(nueva.envios.length,2);
});
caso('bloqueo real del aislamiento ocurre antes de iniciar intento o transporte',async()=>{
  const {o,e}=await copia(),contexto=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
  try{await assert.rejects(mandar(o,e),e=>e.status===423);assert.equal((await s.obtener(o.id)).envios[0].estado,'revisado');assert.equal(llamadas.length,0)}finally{if(contexto!==undefined)process.env.NODE_TEST_CONTEXT=contexto}
});
caso('bodega cambia necesidad después de preparar: no enviar copia obsoleta',async()=>{
  const {o,e}=await copia();await c.query('UPDATE faltantes SET cantidad_faltante=2 WHERE id=$1',[fixture.faltantes[0].id]);
  await assert.rejects(mandar(o,e),e=>e.status===409);assert.equal(llamadas.length,0);
});
caso('cerrar ciclo después de preparar bloquea antes de enviar',async()=>{
  const {o,e}=await copia();await c.query("UPDATE ciclo_ruta SET estado='cancelado' WHERE id=$1",[fixture.ciclo]);
  await assert.rejects(mandar(o,e),e=>e.status===409);assert.equal(llamadas.length,0);
});
caso('fallo al guardar después de transmitir mantiene bloqueo; recargar no repite el mensaje',async()=>{
  const {o,e}=await copia();fallarRegistro=true;await assert.rejects(mandar(o,e),e=>e.status===503);fallarRegistro=false;
  const n=await mandar(o,e);assert.equal(llamadas.length,1);assert.equal(n.envios[0].estado,'enviando');assert.ok(n.envio_id);
  await assert.rejects(env.confirmarVerificado(o.id,e.id,{confirmarEnvio:true,motivo:'ZZ antes de tiempo'}),e=>e.status===409);
});
caso('proceso interrumpido se confirma tras cinco minutos y verificación explícita sin reenviar',async()=>{
  const {o,e}=await copia();iniciadoAntiguo=true;fallarRegistro=true;await assert.rejects(mandar(o,e));fallarRegistro=false;
  const n=await env.confirmarVerificado(o.id,e.id,{confirmarEnvio:true,motivo:'ZZ proveedor verificó la orden tras reiniciar'});assert.equal(n.estado,'enviada');assert.equal(llamadas.length,1);
});
caso('conversiones y excedente guardados separan pendiente total de cobertura por origen',async()=>{
  await c.query(`INSERT INTO supplier_product_mapping(id,supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
    VALUES($1,$2,$3,'ZZ-CAJA','ZZ Caja','','',$4,$5,6)`,[randomUUID(),fixture.proveedor.nombre,fixture.proveedor.identificacion,fixture.producto,fixture.proveedor.id]);
  const {o,e}=await copia(await pendiente(s,fixture,2)),n=await mandar(o,e);
  assert.equal(n.lineas[0].cantidad_propia,12);assert.equal(n.lineas[0].origenes.reduce((a,r)=>a+Number(r.cantidad),0),10);
  assert.equal((await sugerir()).productos[0].pendienteRecibir,10);assert.equal((await s.sugerir({proveedorId:fixture.proveedor.id,cicloId:fixture.proximo})).productos[0].disponible,4);
});
caso('envío no registra compra, entrada de inventario ni modifica documentos/faltantes',async()=>{
  const tablas=['compra','compra_linea','movimiento_inventario','inventario_saldo','factura','factura_linea','faltantes'];
  const huellas=async()=>Promise.all(tablas.map(async t=>(await c.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) h FROM ${t} t`)).rows[0].h));
  const {o,e}=await copia(),antes=await huellas();await mandar(o,e);assert.deepEqual(await huellas(),antes);
});
async function conConexiones(f){
  const seed=await pool.connect();let d;try{await seed.query('BEGIN');d=await sembrarEn(seed);await seed.query('COMMIT')}catch(e){await seed.query('ROLLBACK');throw e}finally{seed.release()}
  const rutas=['../config/database','../src/modules/orders-whatsapp/ordenesCiclo.service','../src/modules/orders-whatsapp/ordenesCicloEnvio.service'].map(p=>require.resolve(p)),previas=rutas.map(p=>require.cache[p]);
  require.cache[rutas[0]]={id:rutas[0],filename:rutas[0],loaded:true,exports:{pool}};delete require.cache[rutas[1]];delete require.cache[rutas[2]];
  try{await f(require(rutas[1]),require(rutas[2]),d)}finally{rutas.forEach((p,i)=>require.cache[p]=previas[i])}
}
caso('dos operadores: el intento está COMMIT antes de transportar y la misma copia se manda una vez',async()=>conConexiones(async(serv,enviar,d)=>{
  const o=await pendiente(serv,d),n=await enviar.preparar(o.id,datos(o)),e=n.envios[0];let entrar,soltar;
  const entro=new Promise(r=>entrar=r),esperar=new Promise(r=>soltar=r);
  wa.enviarDocumento=async doc=>{llamadas.push(doc);entrar();await esperar;return{enviado:true,numero:doc.telefono,via:'interno'}};
  const primero=enviar.enviar(o.id,e.id,{confirmar:true});await entro;
  try{const visible=(await pool.query('SELECT estado FROM orden_compra_ciclo_envio WHERE id=$1',[e.id])).rows[0];assert.equal(visible.estado,'enviando');
    const segundo=await enviar.enviar(o.id,e.id,{confirmar:true});assert.equal(segundo.envio_id,e.id);assert.equal(segundo.envios[0].estado,'enviando');assert.equal(llamadas.length,1);
  }finally{soltar()}
  assert.equal((await primero).estado,'enviada');
}));
caso('copias distintas compiten por la misma orden: solo una inicia transporte',async()=>conConexiones(async(serv,enviar,d)=>{
  const o=await pendiente(serv,d),a=(await enviar.preparar(o.id,datos(o))).envios[0],b=(await enviar.preparar(o.id,datos(o))).envios[0];
  const resultados=await Promise.allSettled([enviar.enviar(o.id,a.id,{confirmar:true}),enviar.enviar(o.id,b.id,{confirmar:true})]);
  assert.equal(llamadas.length,1);assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);assert.equal(resultados.find(r=>r.status==='rejected').reason.status,409);
}));

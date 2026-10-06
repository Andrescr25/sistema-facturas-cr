/** Clon local propio; operaciones físicas sin documentos comerciales/stock. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const activo=process.env.PROBAR_BASE_LOCAL==='1';let c,pool,s,plan,datos,fallar=false,nivel=0;
const caso=(nombre,fn)=>test(nombre,{skip:!activo},async()=>{await c.query('SAVEPOINT caso');try{datos=await sembrar(c);await fn()}finally{fallar=false;await c.query('ROLLBACK TO SAVEPOINT caso')}});
async function sembrar(db,activar=true){
 const r=(await db.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING id',['ZZ Registro '+randomUUID()])).rows[0].id;
 const cl=(await db.query("INSERT INTO cliente(nombre) VALUES('ZZ Cliente físico') RETURNING id")).rows[0].id;
 const ciclos=[],facturas=[];
 for(const semana of ['2026-10-12','2026-10-19']){
  const cy=(await db.query("INSERT INTO ciclo_ruta(ruta_id,ruta_nombre,semana) VALUES($1,'ZZ Ruta física',$2) RETURNING id",[r,semana])).rows[0].id;
  const rc=(await db.query("INSERT INTO ciclo_ruta_cliente(ciclo_id,cliente_id,orden,cliente_nombre) VALUES($1,$2,1,'ZZ Cliente físico') RETURNING id",[cy,cl])).rows[0].id;
  await db.query('UPDATE ciclo_ruta SET recorrido_fijado=TRUE WHERE id=$1',[cy]);ciclos.push(cy);
  const f=(await db.query(`INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,ciclo_ruta_cliente_id,preventa_anticipada,estado_bodega)
   VALUES($1,'emitida','2026-10-06',$2,'ZZ Cliente físico',$3,TRUE,'procesado') RETURNING id`,['ZZ '+randomUUID(),cl,rc])).rows[0].id;
  for(const [n,q]of [[1,10],[2,2.25]])await db.query("INSERT INTO factura_linea(factura_id,numero_linea,nombre,cantidad,precio_unitario,total) VALUES($1,$2,'ZZ producto',$3::numeric,1,$3::numeric)",[f,n,q]);facturas.push(f);
 }
 if(activar)await db.query("UPDATE ciclo_ruta SET estado='entrega' WHERE id=$1",[ciclos[0]]);
 const us=[];for(const adm of [false,true])us.push((await db.query("INSERT INTO usuario(usuario,nombre,password_hash,es_admin) VALUES($1,'ZZ operador','ZZ no login',$2) RETURNING id",['zz-'+randomUUID(),adm])).rows[0].id);
 return{ciclo:ciclos[0],proximo:ciclos[1],f:facturas[0],otra:facturas[1],actor:us[0],admin:us[1]};
}
if(activo){
 require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
 pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL,max:4});
 const q=async(sql,p)=>{if(fallar&&sql.includes('INSERT INTO bitacora_cambio'))throw Error('ZZ fallo bitácora');if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')return{rows:[]};return c.query(sql,p)};
 const db=require.resolve('../config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:{pool:{query:q,connect:async()=>{const sp=`registro_${++nivel}`;return{query:(sql,p)=>sql==='BEGIN'?q(`SAVEPOINT ${sp}`):sql==='COMMIT'?q(`RELEASE SAVEPOINT ${sp}`):sql==='ROLLBACK'?q(`ROLLBACK TO SAVEPOINT ${sp}`):q(sql,p),release(){}}}}}};
 s=require('../src/modules/entregas/registroFisico.service');plan=require('../src/modules/entregas/entregas.service');
 before(async()=>{c=await pool.connect();await c.query('BEGIN')});after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool.end()});
}
const body=async(accion,lineas=[],motivo=null,f=datos.f)=>{const p=await s.consultar(f);return{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,accion,lineas,motivo}};
const registrar=async(accion,lineas=[],motivo=null,f=datos.f)=>s.registrar(f,await body(accion,lineas,motivo,f),datos.actor);
const revisar=async(ls,motivo='ZZ conteo físico revisado por supervisor')=>s.revisar(datos.f,await body('revision',ls,motivo),datos.admin);
const huellas=async()=>{const r={};for(const t of ['factura','factura_linea','pedido_cliente','faltantes','faltantes_ajustes','inventario_saldo','movimiento_inventario','ciclo_ruta','ciclo_ruta_cliente','serie_consecutivo','pago','compra'])r[t]=(await c.query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) x`)).rows[0].h;return r};
const protegido=async(sql,p,patron)=>{await c.query('SAVEPOINT proteger');try{await assert.rejects(c.query(sql,p),patron)}finally{await c.query('ROLLBACK TO SAVEPOINT proteger')}};
caso('carga4 y6; entrega3 y7 conserva acumulado, fecha, actor e historia sin stock',async()=>{
 const antes=await huellas();let p=await registrar('carga',[{numeroLinea:1,cantidad:4}]);assert.equal(p.estado,'cargada');assert.equal(p.lineas[0].enCamion,4);
 p=await registrar('carga',[{numeroLinea:1,cantidad:6},{numeroLinea:2,cantidad:2.25}]);assert.equal(p.lineas[0].cargada,10);
 p=await registrar('entrega',[{numeroLinea:1,cantidad:3}]);assert.equal(p.estado,'parcialmente_entregada');assert.equal(p.lineas[0].pendiente,7);
 p=await registrar('entrega',[{numeroLinea:1,cantidad:7},{numeroLinea:2,cantidad:2.25}]);assert.equal(p.estado,'entregada');assert.equal(p.historial.length,4);assert.equal(p.historial[3].usuarioId,datos.actor);assert.ok(p.historial[3].fecha);
 assert.deepEqual(await huellas(),antes);assert.equal((await plan.plan({cicloId:datos.ciclo})).carga.length,0);
});
caso('misma clave/cuerpo retorna sin duplicar; clave con otra cantidad409',async()=>{
 const b=await body('carga',[{numeroLinea:1,cantidad:4}]);await s.registrar(datos.f,b,datos.actor);const p=await s.registrar(datos.f,b,datos.actor);assert.equal(p.version,1);assert.equal(p.lineas[0].cargada,4);
 await assert.rejects(s.registrar(datos.f,{...b,lineas:[{numeroLinea:1,cantidad:5}]},datos.actor),e=>e.status===409);
});
caso('revisión obsoleta no duplica cargas de operadores distintos',async()=>{
 const a=await body('carga',[{numeroLinea:1,cantidad:4}]),b=await body('carga',[{numeroLinea:1,cantidad:6}]);await s.registrar(datos.f,a,datos.actor);
 await assert.rejects(s.registrar(datos.f,b,datos.admin),e=>e.status===409);assert.equal((await s.consultar(datos.f)).lineas[0].cargada,4);
});
caso('no entregar sin carga ni sobrecargar, ni descargar unidades ya entregadas',async()=>{
 await assert.rejects(registrar('entrega',[{numeroLinea:1,cantidad:1}]),e=>e.status===400);await assert.rejects(registrar('carga',[{numeroLinea:1,cantidad:11}]),e=>e.status===400);
 await registrar('carga',[{numeroLinea:1,cantidad:5}]);await registrar('entrega',[{numeroLinea:1,cantidad:3}]);await assert.rejects(registrar('descarga',[{numeroLinea:1,cantidad:3}],'ZZ volvió carga'),e=>e.status===400);
 const p=await registrar('descarga',[{numeroLinea:1,cantidad:2}],'ZZ no entregado, regresó a bodega');assert.equal(p.lineas[0].enCamion,0);assert.equal(p.lineas[0].entregada,3);
 await registrar('carga',[{numeroLinea:1,cantidad:7}]);assert.equal((await s.consultar(datos.f)).lineas[0].enCamion,7);
});
caso('incidencia registra visita fallida y motivo sin alterar carga o factura',async()=>{
 await registrar('carga',[{numeroLinea:1,cantidad:4}]);const p=await registrar('incidencia',[],'ZZ cliente ausente confirmado en visita');assert.equal(p.lineas[0].enCamion,4);assert.equal(p.historial[1].accion,'incidencia');
 await assert.rejects(registrar('incidencia',[],null),e=>e.status===400);
});
caso('motivos, confirmación, UUID, precisión y líneas inválidas rechazan antes de escribir',async()=>{
 const b=await body('carga',[{numeroLinea:1,cantidad:1}]);
 for(const delta of [{clave:'x'},{confirmar:false},{version:-1},{revision:'x'},{lineas:[{numeroLinea:1,cantidad:0}]},{lineas:[{numeroLinea:1,cantidad:0.00001}]},{lineas:[{numeroLinea:1,cantidad:true}]},{lineas:[{numeroLinea:1,cantidad:1},{numeroLinea:1,cantidad:1}]},{lineas:[{numeroLinea:99,cantidad:1}]}])await assert.rejects(s.registrar(datos.f,{...b,...delta},datos.actor),e=>e.status===400);
 assert.equal((await s.consultar(datos.f)).version,0);
});
caso('cambiar factura exige revisión; descarga conserva el documento cargado anterior',async()=>{
 await registrar('carga',[{numeroLinea:1,cantidad:4}]);await c.query("UPDATE factura_linea SET cantidad=3,nombre='ZZ Nuevo nombre' WHERE factura_id=$1 AND numero_linea=1",[datos.f]);
 let p=await s.consultar(datos.f);assert.equal(p.requiereRevision,true);assert.equal(p.lineas[0].nombre,'ZZ producto');assert.equal(p.documento.lineas[0].nombre,'ZZ Nuevo nombre');
 await assert.rejects(registrar('entrega',[{numeroLinea:1,cantidad:1}]),e=>e.status===409);
 p=await registrar('descarga',[{numeroLinea:1,cantidad:4}],'ZZ descargadas físicamente, factura cambió');assert.equal(p.lineas[0].enCamion,0);assert.equal(p.requiereRevision,true);
 p=await revisar([{numeroLinea:1,cargada:4,entregada:0,descargada:4},{numeroLinea:2,cargada:0,entregada:0,descargada:0}]);assert.equal(p.requiereRevision,false);assert.equal(p.lineas[0].nombre,'ZZ Nuevo nombre');assert.equal(p.historial[0].documento.lineas[0].cantidad,10);
});
caso('corrección explícita de error físico requiere admin/motivo y conserva evento original',async()=>{
 await registrar('carga',[{numeroLinea:1,cantidad:4}]);const b=await body('revision',[{numeroLinea:1,cargada:3,entregada:0,descargada:0},{numeroLinea:2,cargada:0,entregada:0,descargada:0}],'ZZ registro4 errado, cargadas3 verificadas');
 await assert.rejects(s.revisar(datos.f,b,datos.actor),e=>e.status===403);await assert.rejects(s.registrar(datos.f,b,datos.admin),e=>e.status===400);
 const p=await s.revisar(datos.f,b,datos.admin);assert.equal(p.lineas[0].cargada,3);assert.equal(p.historial[0].saldos[0].cargada,4);assert.equal(p.historial[1].accion,'revision');
 await assert.rejects(s.revisar(datos.f,b,datos.actor),e=>e.status===403);
});
caso('revisión exige todas las líneas actuales y saldos coherentes',async()=>{
 await assert.rejects(revisar([{numeroLinea:1,cargada:1,entregada:0,descargada:0}]),e=>e.status===400);
 await assert.rejects(revisar([{numeroLinea:1,cargada:1,entregada:2,descargada:0},{numeroLinea:2,cargada:0,entregada:0,descargada:0}]),e=>e.status===400);
});
caso('reemplazar líneas en reimpresión no borra la fotografía ni reasigna cantidades',async()=>{
 await registrar('carga',[{numeroLinea:1,cantidad:4}]);await c.query('DELETE FROM factura_linea WHERE factura_id=$1',[datos.f]);await c.query("INSERT INTO factura_linea(factura_id,numero_linea,nombre,cantidad,precio_unitario,total) VALUES($1,7,'ZZ Reimpresión',5,1,5)",[datos.f]);
 const p=await s.consultar(datos.f);assert.equal(p.requiereRevision,true);assert.equal(p.lineas[0].numeroLinea,1);assert.equal(p.documento.lineas[0].numeroLinea,7);
 const r=await revisar([{numeroLinea:7,cargada:4,entregada:0,descargada:0}]);assert.equal(r.lineas[0].numeroLinea,7);assert.equal(r.historial[0].saldos[0].numeroLinea,1);
});
caso('cambio de bodega/faltantes invalida revisión; cambio de precio no cambia físico',async()=>{
 const b=await body('carga',[{numeroLinea:1,cantidad:1}]);await c.query("UPDATE factura SET estado_bodega='pendiente' WHERE id=$1",[datos.f]);await assert.rejects(s.registrar(datos.f,b,datos.actor),e=>e.status===409);
 await c.query("UPDATE factura SET estado_bodega='procesado' WHERE id=$1",[datos.f]);await registrar('carga',[{numeroLinea:1,cantidad:1}]);await c.query('UPDATE factura_linea SET precio_unitario=2 WHERE factura_id=$1',[datos.f]);assert.equal((await s.consultar(datos.f)).requiereRevision,false);
});
caso('faltante nuevo invalida documento observado sin adivinar que llegó mercadería',async()=>{
 const b=await body('carga',[{numeroLinea:1,cantidad:4}]);const producto=(await c.query("INSERT INTO producto(nombre) VALUES('ZZ faltante físico') RETURNING id")).rows[0].id;
 await c.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado) VALUES($1,$2,2,'parcial','pendiente')",[datos.f,producto]);
 await assert.rejects(s.registrar(datos.f,b,datos.actor),e=>e.status===409);assert.equal((await s.consultar(datos.f)).version,0);
});
caso('actor/fecha del cuerpo se ignoran; responsable inactivo no registra ni reintenta',async()=>{
 const b={...await body('carga',[{numeroLinea:1,cantidad:4}]),usuarioId:datos.admin,fecha:'2000-01-01'};
 const p=await s.registrar(datos.f,b,datos.actor);assert.equal(p.historial[0].usuarioId,datos.actor);assert.notEqual(new Date(p.historial[0].fecha).getFullYear(),2000);
 await c.query('UPDATE usuario SET activo=FALSE WHERE id=$1',[datos.actor]);await assert.rejects(s.registrar(datos.f,b,datos.actor),e=>e.status===403);
});
caso('preventa permite adelantar carga, entrega exige promoción explícita; siguiente ciclo intacto',async()=>{
 const antes=await huellas();await registrar('carga',[{numeroLinea:1,cantidad:4}],null,datos.otra);
 await assert.rejects(registrar('entrega',[{numeroLinea:1,cantidad:1}],null,datos.otra),e=>e.status===409);
 assert.equal((await s.consultar(datos.f)).version,0);assert.deepEqual(await huellas(),antes);
});
caso('descargar conserva carga anterior aunque se cierre el ciclo o se anule factura',async()=>{
 await registrar('carga',[{numeroLinea:1,cantidad:4}]);await c.query("UPDATE ciclo_ruta SET estado='cerrado' WHERE id=$1",[datos.ciclo]);await c.query("UPDATE factura SET estado='anulada' WHERE id=$1",[datos.f]);
 const p=await registrar('descarga',[{numeroLinea:1,cantidad:4}],'ZZ carga devuelta tras anulación');assert.equal(p.lineas[0].enCamion,0);assert.equal(p.requiereRevision,true);
 await assert.rejects(revisar([{numeroLinea:1,cargada:0,entregada:0,descargada:0},{numeroLinea:2,cargada:0,entregada:0,descargada:0}]),e=>e.status===409);
});
caso('SQL impide modificar/borrar historia, falsear actor, balances o versión',async()=>{
 const b=await body('carga',[{numeroLinea:1,cantidad:1}]);const p=await s.registrar(datos.f,b,datos.actor),evento=p.historial[0];
 await protegido('DELETE FROM entrega_evento WHERE id=$1',[evento.id],/historial/);await protegido("UPDATE entrega_evento SET motivo='ZZ' WHERE id=$1",[evento.id],/historial/);
 const actual=await s.consultar(datos.f),req=await body('carga',[{numeroLinea:1,cantidad:1}]);
 await protegido(`INSERT INTO entrega_evento(id,factura_id,recorrido_id,version,accion,solicitud,documento,saldos,usuario_id) VALUES($1,$2,$3,$4,'carga',$5,$6,$7,$8)`,[randomUUID(),datos.f,actual.documento.factura.recorridoId,2,{...req,version:1},actual.documento,JSON.stringify([{numeroLinea:1,cargada:99,entregada:0,descargada:0}]),datos.actor],/cantidades físicas/);
});
caso('fallo de bitácora revierte evento/version/cantidades en una transacción',async()=>{
 const b=await body('carga',[{numeroLinea:1,cantidad:4}]);fallar=true;await assert.rejects(s.registrar(datos.f,b,datos.actor),/ZZ fallo/);fallar=false;assert.equal((await s.consultar(datos.f)).version,0);
});
caso('fracciones entregadas/descargadas no dejan residuos binarios en camión',async()=>{
 await registrar('carga',[{numeroLinea:1,cantidad:0.3}]);await registrar('entrega',[{numeroLinea:1,cantidad:0.1}]);
 const p=await registrar('descarga',[{numeroLinea:1,cantidad:0.2}],'ZZ fracción restante devuelta');assert.equal(p.lineas[0].enCamion,0);assert.equal(p.lineas[0].pendiente,9.9);
});
caso('SQL usa hora del servidor e impide revisión de factura anulada',async()=>{
 const req=await body('incidencia',[],'ZZ visita fallida confirmada'),p=await s.consultar(datos.f);
 const saldos=(await c.query('SELECT entrega_calcular_saldos($1,$2,$3,$4) saldos',[p.documento,'[]','incidencia','[]'])).rows[0].saldos;
 const sql=`INSERT INTO entrega_evento(id,factura_id,recorrido_id,version,accion,solicitud,documento,saldos,motivo,usuario_id,fecha)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'2000-01-01') RETURNING fecha=CURRENT_TIMESTAMP servidor`;
 const canon={accion:req.accion,version:req.version,revision:req.revision,lineas:req.lineas,motivo:req.motivo};
 assert.equal((await c.query(sql,[req.clave,datos.f,p.documento.factura.recorridoId,1,'incidencia',canon,p.documento,JSON.stringify(saldos),req.motivo,datos.actor])).rows[0].servidor,true);
 await c.query("UPDATE factura SET estado='anulada' WHERE id=$1",[datos.f]);const actual=await s.consultar(datos.f);
 const revision={accion:'revision',version:1,revision:actual.revision,lineas:actual.lineas.map(l=>({numeroLinea:l.numeroLinea,cargada:0,entregada:0,descargada:0})),motivo:'ZZ intento inválido'};
 await protegido(sql,[randomUUID(),datos.f,p.documento.factura.recorridoId,2,'revision',revision,actual.documento,JSON.stringify(saldos),revision.motivo,datos.admin],/factura anulada/);
});

// Fixtures confirmados solo en el clon identificado arriba. Dos conexiones
// reales verifican los bloqueos y READ ONLY, sin simular SQL ni transacciones.
async function conexiones(fn){
 const seed=await pool.connect();let fixture;
 try{await seed.query('BEGIN');fixture=await sembrar(seed,false);await seed.query('COMMIT')}catch(e){await seed.query('ROLLBACK');throw e}finally{seed.release()}
 const rutas=['../config/database','../src/modules/entregas/registroFisico.service'].map(require.resolve),previas=rutas.map(p=>require.cache[p]);
 require.cache[rutas[0]]={id:rutas[0],filename:rutas[0],loaded:true,exports:{pool}};delete require.cache[rutas[1]];
 try{await fn(require(rutas[1]),fixture)}finally{rutas.forEach((p,i)=>require.cache[p]=previas[i])}
}
caso('dos conexiones con misma clave generan un solo evento físico',async()=>conexiones(async(real,d)=>{
 const p=await real.consultar(d.f),b={clave:randomUUID(),version:p.version,revision:p.revision,accion:'carga',confirmar:true,lineas:[{numeroLinea:1,cantidad:4}]};
 const resultados=await Promise.all([real.registrar(d.f,b,d.actor),real.registrar(d.f,b,d.admin)]);assert.deepEqual(resultados[0],resultados[1]);
 assert.equal((await real.consultar(d.f)).version,1);assert.equal((await pool.query('SELECT COUNT(*)::int n FROM entrega_evento WHERE factura_id=$1',[d.f])).rows[0].n,1);
}));
caso('dos cargas distintas de igual versión confirman solo una y rechazan409 la otra',async()=>conexiones(async(real,d)=>{
 const p=await real.consultar(d.f),b={version:p.version,revision:p.revision,accion:'carga',confirmar:true,lineas:[{numeroLinea:1,cantidad:4}]};
 const resultados=await Promise.allSettled([real.registrar(d.f,{...b,clave:randomUUID()},d.actor),real.registrar(d.f,{...b,clave:randomUUID()},d.admin)]);
 assert.equal(resultados.filter(x=>x.status==='fulfilled').length,1);assert.equal(resultados.find(x=>x.status==='rejected').reason.status,409);assert.equal((await real.consultar(d.f)).lineas[0].cargada,4);
}));
caso('consulta real exige READ ONLY y REPEATABLE READ sin bloqueos de escritura',async()=>conexiones(async(real,d)=>{
 const connect=pool.connect.bind(pool),observados=[];
 pool.connect=async()=>{const db=await connect(),q=db.query.bind(db);db.query=async(sql,p)=>{const r=await q(sql,p);if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')observados.push({lectura:(await q('SHOW transaction_read_only')).rows[0].transaction_read_only,aislamiento:(await q('SHOW transaction_isolation')).rows[0].transaction_isolation});return r};
  const release=db.release.bind(db);db.release=()=>{db.query=q;db.release=release;release()};return db};
 try{assert.equal((await real.consultar(d.f)).version,0)}finally{pool.connect=connect}
 assert.deepEqual(observados,[{lectura:'on',aislamiento:'repeatable read'}]);
}));
test('revisión física tiene acción de administrador, aun con mayúsculas/barra final',()=>{
 const {accionDeAdmin}=require('../src/modules/usuarios/modulos');assert.equal(accionDeAdmin('POST','/Entregas/Facturas/1/Revision/').clave,'corregir-entrega');
});

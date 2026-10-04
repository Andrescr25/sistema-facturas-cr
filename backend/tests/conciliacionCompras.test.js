const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {normalizar,compraAlegra,leerCompras,leerBaseCompras,conciliar,ejecutar}=require('../scripts/independencia/lib/conciliacion-compras');
const p={desde:'2026-09-01',hasta:'2026-09-30'};
const propia=(c={})=>normalizar({id:910001,alegra_bill_id:'81',numero:'00100001010000000001',
  proveedor_identificacion:'3101000001',fecha:'2026-09-10',vencimiento:'2026-09-10',estado:'registrada',
  moneda:'CRC',total:'113.00',lineas:1,impuesto_lineas:'13.00',...c});
const raw=(c={})=>({id:'81',date:'2026-09-10',dueDate:'2026-09-10',status:'open',total:113,
  numberTemplate:{number:'00100001010000000001',fullNumber:'00100001010000000001'},
  provider:{id:'777',identification:'3101000001'},purchases:{items:[{tax:[{amount:13}]}]},...c});
const remota=(c={})=>compraAlegra(raw(c));
const pagina=docs=>{let i=0;return {get:async()=>({success:true,data:docs[i++]||[]})};};

test('un id explícito enlaza el comprobante; nunca se usa el serial propio',()=>{
  const r=conciliar([remota()],[propia()],p);
  assert.equal(r.resumen.vinculadas_coinciden,1);assert.equal(r.sin_diferencias,true);
  const distinto=conciliar([remota({id:'910001'})],[propia()],p);
  assert.equal(distinto.resumen.vinculadas_coinciden,0);
  assert.equal(distinto.resumen.vinculos_sin_origen,1);
});
test('cédula y número exactos solo proponen; no certifican ni escriben un vínculo',()=>{
  const b=propia({alegra_bill_id:null});const antes=structuredClone(b);
  const r=conciliar([remota()],[b],p);
  assert.equal(r.resumen.candidatos_unicos,1);assert.equal(r.resumen.base_sin_vinculo,1);
  assert.equal(r.resumen.vinculadas_coinciden,0);assert.equal(r.sin_diferencias,false);
  assert.deepEqual(r.candidatos[0].cambios,[]);assert.deepEqual(b,antes);
});
test('el número solo, el nombre parecido y perder ceros no emparejan proveedores',()=>{
  for(const cedula of ['3101000002',null]) {
    assert.equal(conciliar([remota()],[propia({alegra_bill_id:null,proveedor_identificacion:cedula})],p).candidatos.length,0);
  }
  assert.equal(conciliar([remota()],[propia({alegra_bill_id:null,numero:'100001010000000001'})],p).candidatos.length,0);
  assert.equal(conciliar([remota()],[propia({alegra_bill_id:null,proveedor_identificacion:'3-101-000001'})],p).candidatos.length,1);
});
test('dos bills con el mismo proveedor y número son ambiguos; no elegir uno por fecha o total',()=>{
  const r=conciliar([remota(),remota({id:'82',total:99})],[propia({alegra_bill_id:null})],p);
  assert.equal(r.resumen.candidatos_ambiguos,1);assert.equal(r.resumen.candidatos_unicos,0);
  assert.equal(r.candidatos[0].cambios,null);
});
test('dos compras que declaran el mismo id histórico se señalan como vínculo repetido',()=>{
  const r=conciliar([remota()],[propia(),propia({id:910002})],p);
  assert.equal(r.resumen.vinculadas_coinciden,0);assert.equal(r.sin_diferencias,false);
  assert.ok(r.incidencias.some(i=>i.tipo==='vinculo_historico_repetido'));
});
test('totales compensados no ocultan diferencias de comprobantes, líneas o impuestos',()=>{
  const a=[remota(),remota({id:'82'})];
  const r=conciliar(a,[propia({total:112}),propia({id:910002,alegra_bill_id:'82',total:114,lineas:2,impuesto_lineas:12})],p);
  assert.equal(r.resumen.vinculadas_difieren,2);
  assert.equal(r.mensual[0].alegra.total,r.mensual[0].base.total);
  assert.ok(r.diferencias[1].cambios.some(c=>c.campo==='impuesto_lineas'));
  assert.ok(r.diferencias[1].cambios.some(c=>c.campo==='lineas'));
});
test('CRC y USD, anuladas y vigentes, se agrupan aparte; no se compara saldo de proveedor',()=>{
  const a=[remota(),remota({id:'82',status:'void'}),remota({id:'83',currency:{code:'USD'}})];
  const b=[propia(),propia({id:910002,alegra_bill_id:'82',estado:'anulada'}),propia({id:910003,alegra_bill_id:'83',moneda:'USD'})];
  const r=conciliar(a,b,p);assert.equal(r.mensual.length,3);assert.equal(r.sin_diferencias,true);
});
test('el total manda; no se reconstruye como suma de líneas, y centavos no se pierden',()=>{
  const a=remota({total:113.01,purchases:{items:[{total:99,tax:[{amount:6.5},{amount:6.5}]}]}});
  assert.equal(a.total,11301);assert.equal(a.impuesto_lineas,1300);
  assert.equal(conciliar([a],[propia({total:'113.01'})],p).sin_diferencias,true);
  const fracciones=remota({purchases:{items:[{tax:[{amount:0.004},{amount:0.004},{amount:0.004}]}]}});
  assert.equal(fracciones.impuesto_lineas,1,'redondea el impuesto conjunto de la línea, no cada fragmento');
});
test('impuesto null queda desconocido; no se suma el resto como si fuese un total completo',()=>{
  const a=remota({purchases:{items:[{tax:null}]}});
  const r=conciliar([a,remota({id:'82'})],[propia(),propia({id:910002,alegra_bill_id:'82'})],p);
  assert.equal(r.resumen.alegra_impuestos_incompletos,1);
  assert.equal(r.mensual[0].alegra.impuesto_lineas,null);
  assert.equal(r.mensual[0].alegra.documentos_impuesto_incompleto,1);
  assert.equal(r.sin_diferencias,false);
  assert.ok(r.incidencias.some(i=>i.tipo==='impuestos_no_informados'));
  assert.equal(r.diferencias[0].cambios.find(c=>c.campo==='impuesto_lineas').alegra,null);
});
test('el listado fiscal incompleto se completa por GET individual; cambios entre ambas lecturas abortan',async()=>{
  for(const total of [113,114]){
    let n=0;const ep=[];
    const prom=leerCompras({get:async e=>{
      ep.push(e);return{success:true,data:e==='/bills'?(n++===0?[raw({purchases:{items:[{tax:null}]}})]:[]):raw({total})};
    }},p);
    if(total===113){const r=await prom;assert.equal(r[0].impuesto_lineas,1300);assert.deepEqual(ep,['/bills','/bills/81','/bills']);}
    else await assert.rejects(prom,/cambió/);
  }
});
test('número o proveedor ausentes impiden una certificación aunque los dos encabezados calcen',()=>{
  const a=remota({provider:{id:'777'}}),b=propia({proveedor_identificacion:null});
  assert.equal(conciliar([a],[b],p).sin_diferencias,false);
});
test('datos inválidos y formas no soportadas abortan; no se convierten en ceros o vacíos',()=>{
  for(const c of [{total:null},{date:'2026-02-30'},{status:'draft'},{currency:{code:'???'}},
    {purchases:{items:[],categories:[{}]}},{purchases:{}},{purchases:{items:[{tax:[{amount:NaN}]}]}}]) {
    assert.throws(()=>remota(c));
  }
  assert.throws(()=>propia({alegra_bill_id:''}));
  assert.throws(()=>conciliar([remota(),remota()],[propia()],p),/repetido/);
});
test('páginas cortas, fechas empatadas y cruce del inicio: offsets completos sin filtro inventado',async()=>{
  const llamadas=[];const f=pagina([[raw(),raw({id:'82'})],[raw({id:'83',date:'2026-08-31'})]]);
  const a=await leerCompras({get:async(e,params)=>{llamadas.push({e,params});return f.get();}},p);
  assert.equal(a.length,2);assert.deepEqual(llamadas.map(x=>x.params.start),[0,2]);
  assert.deepEqual(Object.keys(llamadas[0].params).sort(),['limit','order_direction','order_field','start']);
});
test('errores de paginación, ids repetidos y orden ignorado abortan',async()=>{
  await assert.rejects(leerCompras({get:async()=>({success:false,status:403})},p),/incompleta/);
  await assert.rejects(leerCompras(pagina([[raw()],[raw()]]),p),/repetida/);
  await assert.rejects(leerCompras(pagina([[raw(),raw({id:'82',date:'2026-09-11'})]]),p),/orden/);
});
const poolFake=rows=>({connect:async()=>({query:async sql=>({rows:sql.startsWith('SELECT')?rows:[]}),release(){}})});
test('una compra movida fuera del tramo se verifica por ficha individual, no se pierde',async()=>{
  const b={...propia(),total:'113',impuesto_lineas:'13'};
  const endpoints=[];
  const r=await ejecutar({p,pool:poolFake([b]),client:{get:async ep=>{
    endpoints.push(ep);return {success:true,data:ep==='/bills'?[]:raw({date:'2026-08-31'})};
  }}});
  assert.deepEqual(endpoints,['/bills','/bills/81']);
  assert.ok(r.diferencias[0].cambios.some(c=>c.campo==='fecha'));
});
test('404 comprobado queda como diferencia; 403, ficha de otro id o error de red abortan',async()=>{
  const b={...propia(),total:'113',impuesto_lineas:'13'};
  for(const estado of [404,403,'otro']) {
    const prom=ejecutar({p,pool:poolFake([b]),client:{get:async ep=>ep==='/bills'?{success:true,data:[]}:
      estado==='otro'?{success:true,data:raw({id:'82'})}:{success:false,status:estado}}});
    if(estado===404)assert.equal((await prom).resumen.vinculos_sin_origen,1);
    else await assert.rejects(prom,/verificar/);
  }
});
test('fallo de GET no abre la base ni genera una conciliación vacía',async()=>{
  let conecto=false;
  await assert.rejects(ejecutar({p,client:{get:async()=>({success:false,status:403})},pool:{connect:async()=>{conecto=true;}}}));
  assert.equal(conecto,false);
});
test('el lector revierte y libera ante una base inválida',async()=>{
  const llamadas=[];
  await assert.rejects(leerBaseCompras({connect:async()=>({query:async sql=>{
    llamadas.push(sql);return{rows:sql.startsWith('SELECT')?[{fecha:'no es fecha'}]:[]};
  },release:()=>llamadas.push('release')})}));
  assert.deepEqual(llamadas.slice(-2),['ROLLBACK','release']);
});
test('CLI: error seguro retira el parcial, informe anterior intacto y validación antes de conectarse',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zz-conciliacion-compras-'));
  await fs.chmod(dir,0o700);
  const cli=path.resolve(__dirname,'../scripts/independencia/conciliar-compras.js');
  const mod=path.resolve(__dirname,'../src/integrations/alegra/alegra.client.js');
  const pre=path.join(dir,'doble.cjs'), salida=path.join(dir,'nuevo.json');
  try{
    await fs.writeFile(pre,`require.cache[${JSON.stringify(mod)}]={exports:{getInstance:()=>({get:async()=>({success:false,status:403,error:'ZZ-SECRETO-no-imprimir'})})}};`,{mode:0o600});
    const run=extra=>spawnSync(process.execPath,['--require',pre,cli,...extra],{encoding:'utf8',timeout:10000});
    let r=run([`--desde=${p.desde}`,`--hasta=${p.hasta}`,`--salida=${salida}`]);
    assert.equal(r.status,1);assert.ok(!`${r.stdout}${r.stderr}`.includes('ZZ-SECRETO'));
    await assert.rejects(fs.stat(salida),e=>e.code==='ENOENT');
    await fs.writeFile(salida,'informe anterior',{mode:0o600});
    r=run([`--desde=${p.desde}`,`--hasta=${p.hasta}`,`--salida=${salida}`]);
    assert.equal(r.status,1);assert.equal(await fs.readFile(salida,'utf8'),'informe anterior');
    r=run(['--desde=2026-02-30']);assert.equal(r.status,1);assert.ok(!r.stdout.includes('Database'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('PostgreSQL: FK del buzón, instantánea READ ONLY y huellas de datos/secuencias intactas',
  {skip:process.env.PROBAR_BASE_LOCAL!=='1'},async()=>{
  const {pool}=require('../config/database');
  const huella=async()=>(await pool.query(`SELECT
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM compra d) AS compras,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM compra_linea d) AS lineas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM facturas_proveedores d) AS buzon,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM proveedor d) AS proveedores,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM reporte_contador_linea d) AS contador,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.sequencename),'')) FROM pg_sequences d WHERE d.schemaname='public') AS secuencias`)).rows[0];
  try{
    const antes=await huella();const docs=await leerBaseCompras(pool);assert.ok(docs.length>0);
    assert.deepEqual(await huella(),antes);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("UPDATE facturas_proveedores SET alegra_bill_id='910081' WHERE id=(SELECT factura_proveedor_id FROM compra ORDER BY id LIMIT 1)");
      const leidas=await leerBaseCompras({connect:async()=>({query:sql=>sql.startsWith('BEGIN') || sql==='COMMIT'?Promise.resolve({rows:[]}):db.query(sql),release(){}})});
      assert.equal(leidas[0].alegra_bill_id,'910081');
    }finally{await db.query('ROLLBACK');db.release();}
    await assert.rejects(leerBaseCompras({connect:async()=>{
      const c=await pool.connect();return{query:sql=>sql.startsWith('SELECT')?c.query('UPDATE compra SET total=total WHERE false'):c.query(sql),release:()=>c.release()};
    }}),e=>e.code==='25006');
    assert.deepEqual(await huella(),antes);
  }finally{await pool.end();}
});

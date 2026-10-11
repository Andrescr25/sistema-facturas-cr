const {test}=require('node:test');
const assert=require('node:assert/strict');
const {debitoDesdeAlegra,leerHistorico,cargarHistorico}=require('../scripts/independencia/lib/historico-debitos-ingreso');
const {cargarNotas}=require('../scripts/independencia/cargar-notas-credito');
const {notaDesdeAlegra}=require('../src/modules/facturacion/notaDesdeAlegra');
const {ejecutar:conciliar}=require('../scripts/independencia/lib/conciliacion-notas-credito');
const {periodo}=require('../scripts/independencia/lib/conciliacion-ventas');
const fecha='2025-02-11';
const linea={id:'910003',name:'ZZ-producto',quantity:1,price:100,discount:0,total:113,tax:[{id:'1',percentage:13,amount:13}]};
const debito=(extra={})=>({id:'910003',date:fecha,status:'closed',numberTemplate:{fullNumber:'ZZ-DEB-1',documentType:'incomeDebitNote'},
  subtotal:100,discount:0,tax:13,total:113,totalPaid:0,balance:0,items:[linea],client:{name:'ZZ-cliente'},stamp:{uuid:'ZZ-clave-original'},invoices:[],...extra});
const nota=(extra={})=>({id:'910001',date:fecha,status:'open',numberTemplate:{prefix:'ZZ-NC',number:'1',fullNumber:'ZZ-NC-1'},
  subtotal:100,discount:0,tax:13,total:113,totalApplied:113,balance:0,client:{name:'ZZ-cliente'},cause:'error',items:[linea],...extra});
const cliente=(d=debito(),n=nota())=>({get:async(ep,p={})=>({success:true,data:
  ep==='/income-debit-notes'?(p.start===0?[d]:[]):ep==='/credit-notes'?(p.start===0?[n]:[]):
  ep===`/credit-notes/${n.id}`?{...n,incomeDebitNotes:[{id:d.id,amount:113}]}:[]})});

test('archiva el débito completo y conserva su tipo, líneas, clave y referencias',()=>{
  const d=debito({items:[{...linea,tax:[...linea.tax,{id:'2',percentage:0,amount:0}]}]});
  const r=debitoDesdeAlegra(d);
  assert.equal(r.alegra_id,'910003');assert.equal(r.estado,'emitida');assert.equal(r.moneda,'CRC');
  assert.deepEqual(r.original,d);assert.notEqual(r.original,d);assert.equal(r.total,113);
  assert.equal('saldo' in r,false);assert.equal('total_pagado' in r,false);
});
test('débitos incompletos o de otro tipo abortan antes de inventar valores',()=>{
  for(const extra of [{id:''},{id:false},{date:'2025-02-30'},{status:'nuevo'},{numberTemplate:{documentType:'invoice'}},
    {total:null},{balance:undefined},{totalPaid:false},{items:{}},{items:[{...linea,quantity:null}]},
    {items:[{...linea,tax:{}}]},{currency:{code:'???'}},{total:-1}])assert.throws(()=>debitoDesdeAlegra(debito(extra)));
});
test('el historial sigue páginas cortas y completa el destino omitido en la ficha individual',async()=>{
  const llamadas=[],fake=cliente();
  const r=await leerHistorico({get:async(ep,p)=>{llamadas.push({ep,p});return fake.get(ep,p);}});
  assert.equal(r.debitos.length,1);assert.equal(r.notas[0].normalizada.otros_destinos[0].alegra_id,'910003');
  assert.equal(r.notas[0].original.incomeDebitNotes[0].amount,113);
  assert.deepEqual(llamadas.filter(c=>c.ep==='/income-debit-notes').map(c=>c.p.start),[0,1]);
  assert.deepEqual(llamadas.filter(c=>c.ep==='/credit-notes').map(c=>c.p.start),[0,1]);
});
test('un GET fallido no llega a conectar ni escribir; tampoco un detalle sin respaldo',async()=>{
  let conecto=false;
  const pool={connect:async()=>{conecto=true;throw new Error('zz-no conectar');}};
  await assert.rejects(cargarHistorico({pool,client:{get:async()=>({success:false,status:403})}}));
  assert.equal(conecto,false);
  const fake=cliente();
  await assert.rejects(cargarHistorico({pool,client:{get:(ep,p)=>ep.startsWith('/credit-notes/')?Promise.resolve({success:true,data:nota()}):fake.get(ep,p)}}),/incompleto/);
  assert.equal(conecto,false);
});
test('no fabrica un débito ausente ni aplica colones a un destino extranjero o excedido',async()=>{
  const fake=cliente();
  await assert.rejects(leerHistorico({get:(ep,p)=>ep==='/income-debit-notes'?Promise.resolve({success:true,data:[]}):fake.get(ep,p)}),/ausente/);
  await assert.rejects(leerHistorico(cliente(debito({currency:{code:'USD'}}))),/extranjero/);
  await assert.rejects(leerHistorico(cliente(debito({total:100}))),/supera/);
});
test('el crédito a débito cuenta al contrastar aplicado y no se avisa como nota sin destino',()=>{
  const r=notaDesdeAlegra(nota({incomeDebitNotes:[{id:'910003',amount:113}]}),{clientes:new Map(),productos:new Map(),impuestos:new Map(),facturas:new Map()});
  assert.equal(r.avisos.includes('no_acredita_ninguna_factura'),false);
  assert.equal(r.avisos.includes('lo_aplicado_no_calza_con_alegra'),false);
  assert.deepEqual(r.aplicaciones,[]);
});
test('sin migración, una cabecera distinta o una nota aún sin copiar se revierte y libera la conexión',async()=>{
  for(const caso of ['migracion','cabecera','nota']){
    const llamadas=[];
    const pool={connect:async()=>({query:async(sql)=>{
      llamadas.push(sql);
      if(sql.includes('to_regclass'))return{rows:caso==='migracion'?[]:[{debitos:'d',aplicaciones:'a'}]};
      if(sql.startsWith('SELECT n.id'))return{rows:caso==='cabecera'?[{id:1,alegra_id:'910001',fecha,estado:'anulada',total:113,total_aplicado:113}]:[]};
      return{rows:[]};
    },release:()=>llamadas.push('release')})};
    await assert.rejects(cargarHistorico({pool,client:cliente()}));
    assert.deepEqual(llamadas.slice(-2),['ROLLBACK','release']);
    assert.ok(!llamadas.some(s=>/^INSERT|^UPDATE|^DELETE/.test(s)));
  }
});

test('PostgreSQL: copia repetible y concurrente, rollback íntegro, crédito nativo conservado y recarga completa',
  {skip:process.env.PROBAR_BASE_LOCAL!=='1'},async()=>{
  const {pool}=require('../config/database');
  const huella=async()=>(await pool.query(`SELECT
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM factura d) AS facturas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM pago d) AS pagos,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM pago_factura d) AS cobros,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM nota_credito d) AS notas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM nota_credito_linea d) AS lineas_credito,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM nota_credito_factura d) AS creditos_factura,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM debito_ingreso_historico d) AS debitos,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM nota_credito_debito_ingreso d) AS destinos,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.serie),'')) FROM serie_consecutivo d) AS series,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.sequencename),'')) FROM pg_sequences d
      WHERE d.schemaname='public' AND d.sequencename IN ('debito_ingreso_historico_id_seq','nota_credito_debito_ingreso_id_seq')) AS secuencias`)).rows[0];
  let debitoId;
  try{
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM debito_ingreso_historico WHERE alegra_id='910003'")).rows[0].n,0,'el identificador de la prueba debe estar libre');
    await pool.query(`INSERT INTO nota_credito (id,alegra_id,numero,fecha,estado,cliente_nombre,total,total_aplicado)
      VALUES (-910001,'910001','ZZ-NC-1',$1,'emitida','ZZ-importada',113,113),
             (-910002,NULL,'ZZ-NC-1',$1,'emitida','ZZ-nativa',113,113)`,[fecha]);
    const antes=await huella();
    const nativaAntes=(await pool.query('SELECT * FROM nota_credito WHERE id=-910002')).rows[0];
    const a=await cargarHistorico({pool,client:cliente()});
    assert.deepEqual(a,{debitos:1,notas_con_destino_revisadas:1,aplicaciones:1});
    const archivo=(await pool.query("SELECT * FROM debito_ingreso_historico WHERE alegra_id='910003'")).rows[0];debitoId=archivo.id;
    assert.deepEqual(archivo.original,debito());
    const enlace=(await pool.query('SELECT * FROM nota_credito_debito_ingreso WHERE nota_credito_id=-910001')).rows[0];
    assert.equal(enlace.debito_ingreso_id,archivo.id);assert.equal(enlace.monto,'113.00');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM nota_credito_factura WHERE nota_credito_id=-910001')).rows[0].n,0);
    const despues=await huella();
    for(const k of ['facturas','pagos','cobros','notas','lineas_credito','creditos_factura','series'])assert.equal(despues[k],antes[k],k);
    await Promise.all([cargarHistorico({pool,client:cliente()}),cargarHistorico({pool,client:cliente()})]);
    assert.deepEqual(await huella(),despues,'contenido, timestamps y secuencias idénticos al repetir');
    const auditoria=await conciliar({pool,client:cliente(),p:periodo(fecha,fecha)});
    assert.equal(auditoria.notas.resumen.coinciden,1); // Las notas reales del mismo día se informan aparte.
    assert.ok(!auditoria.notas.diferencias.some(d=>d.alegra_id==='910001'));
    // Fallar después de actualizar el archivo, al guardar la aplicación.
    const db=await pool.connect();
    try{
      await assert.rejects(cargarHistorico({client:cliente(debito({observations:'ZZ-cambio que se revierte'})),pool:{connect:async()=>({
        query:async(sql,params)=>{if(sql.startsWith('UPDATE nota_credito_debito_ingreso'))throw new Error('ZZ-fallo guardando destino');return db.query(sql,params);},release(){}
      })}}),/ZZ-fallo/);
    }finally{db.release();}
    assert.deepEqual(await huella(),despues);
    // La misma transacción del cargador completo preserva este destino.
    const completa=await cargarNotas({pool,client:cliente()});
    assert.equal(completa.aplicaciones_debito,1);
    assert.equal((await pool.query('SELECT debito_ingreso_id FROM nota_credito_debito_ingreso WHERE nota_credito_id=-910001')).rows[0].debito_ingreso_id,debitoId);
    assert.deepEqual((await pool.query('SELECT * FROM nota_credito WHERE id=-910002')).rows[0],nativaAntes);
    const final=await huella();for(const k of ['facturas','pagos','cobros'])assert.equal(final[k],antes[k],k);
    // Los constraints impiden duplicar destinos o guardar montos inválidos.
    for(const [monto,codigo] of [[113,'23505'],[0,'23514']]){
      const db=await pool.connect();
      try{await db.query('BEGIN');await assert.rejects(db.query('INSERT INTO nota_credito_debito_ingreso (nota_credito_id,debito_ingreso_id,monto) VALUES (-910001,$1,$2)',[debitoId,monto]),e=>e.code===codigo);}
      finally{await db.query('ROLLBACK');db.release();}
    }
  }finally{
    await pool.query('DELETE FROM nota_credito WHERE id IN (-910001,-910002)');
    if(debitoId!=null)await pool.query('DELETE FROM debito_ingreso_historico WHERE id=$1',[debitoId]);
    await pool.end();
  }
});

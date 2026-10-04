const { test } = require('node:test');
const assert = require('node:assert/strict');
const { periodo } = require('../scripts/independencia/lib/conciliacion-ventas');
const { getLectura, normalizarCobro, cobroAlegra, leerCobros, porIds, leerBaseCobros, compararCobros, compararSaldos, ejecutar } = require('../scripts/independencia/lib/conciliacion-cobros');
const p = periodo('2026-09-01','2026-09-30');
const remoto = (extra={})=>({ id:'700',date:p.desde,type:'in',status:'open',number:'ZZ-700',amount:113,paymentMethod:'cash',client:{id:'800'},bankAccount:{id:'900'},invoices:[{id:'600',amount:113}],...extra });
const propio = (extra={})=>normalizarCobro({id:10,alegra_id:'700',fecha:p.desde,numero:'ZZ-700',monto:'113.00',anulado:false,cliente_alegra_id:'800',cuenta_alegra_id:'900',metodo:'CASH',aplicaciones:[{factura_id:20,factura_alegra_id:'600',monto:'113.00'}],...extra});
const facturaA = (extra={})=>({id:'600',date:p.desde,status:'closed',balance:0,...extra});
const facturaB = (extra={})=>({id:20,alegra_id:'600',fecha:p.desde,numero:'ZZ-600',estado:'emitida',moneda:'CRC',saldo_calculado:'0.00',cobrado:'113.00',acreditado:'0.00',cobrado_nativo:'0.00',...extra});

test('cobros en centavos, métodos normalizados y referencias por ids de Alegra',()=>{
  const r=compararCobros([cobroAlegra(remoto())],[propio()],p);
  assert.equal(r.resumen.coinciden,1);assert.deepEqual(r.diferencias,[]);assert.deepEqual(r.incidencias,[]);
  assert.equal(r.mensual[0].alegra.monto,113);
});
test('el recibo correcto aplicado a otra factura se detecta aunque el monto mensual coincida',()=>{
  const r=compararCobros([cobroAlegra(remoto())],[propio({aplicaciones:[{factura_id:600,factura_alegra_id:'20',monto:113}]})],p);
  assert.equal(r.mensual[0].diferencia_base_menos_alegra.monto,0);
  assert.deepEqual(r.diferencias[0].cambios.map(c=>c.campo),['aplicaciones.600','aplicaciones.20']);
});
test('un abono repartido conserva el monto de cada factura, independientemente del orden',()=>{
  const a=cobroAlegra(remoto({invoices:[{id:'600',amount:13},{id:'601',amount:100}]}));
  const b=propio({aplicaciones:[{factura_id:21,factura_alegra_id:'601',monto:100},{factura_id:20,factura_alegra_id:'600',monto:13}]});
  assert.equal(compararCobros([a],[b],p).resumen.coinciden,1);
});
test('faltante y sobrante con el mismo importe no se compensan; los nativos se separan',()=>{
  const r=compararCobros([cobroAlegra(remoto())],[propio({alegra_id:'701'}),propio({alegra_id:null})],p);
  assert.equal(r.resumen.faltan_en_base,1);assert.equal(r.resumen.solo_en_base,1);assert.equal(r.resumen.nativos_excluidos,1);
  assert.equal(r.mensual[0].base_nativa.monto,113);
});
test('anulados se agrupan aparte y un cambio de fecha fuera del tramo no desaparece',()=>{
  const r=compararCobros([cobroAlegra(remoto({status:'void'}))],[propio({fecha:'2026-08-31'})],p);
  assert.deepEqual(r.diferencias[0].cambios.map(c=>c.campo),['fecha','anulado']);
  assert.equal(r.mensual[0].estado,'anulado');
});
test('montos sin aplicar y aplicaciones sin factura propia impiden una conciliación limpia',()=>{
  const r=compararCobros([], [propio({aplicaciones:[{factura_id:null,factura_alegra_id:null,monto:100}]})],p);
  assert.deepEqual(r.incidencias.map(i=>i.tipo),['monto_sin_aplicar_o_excedido','aplicacion_sin_factura_propia']);
  assert.equal(r.incidencias[0].diferencia,13);
});
test('tipo, estado, monto, moneda e ids incompletos no se convierten en valores inventados',()=>{
  for(const extra of [{type:'out'},{type:undefined},{status:'nuevo'},{amount:null},{amount:false},{currency:{code:'USD'}},{invoices:[{amount:113}]},{invoices:[{id:'600',amount:13},{id:'600',amount:100}]}])assert.throws(()=>cobroAlegra(remoto(extra)));
  assert.throws(()=>propio({alegra_id:''}));
});
test('lectura descendente incluye ambos límites, páginas cortas y excluye el futuro',async()=>{
  const paginas=[[remoto({id:'703',date:'2026-10-01'}),remoto({id:'702',date:p.hasta})],[remoto()],[remoto({id:'699',date:'2026-08-31'})]];
  const llamadas=[];
  const docs=await leerCobros({get:async(e,params)=>{llamadas.push(params);return{success:true,data:paginas.shift()};}},p);
  assert.deepEqual(docs.map(d=>d.alegra_id),['702','700']);
  assert.deepEqual(llamadas.map(d=>d.start),[0,2,3]);
  assert.ok(llamadas.every(d=>d.limit===10&&d.type==='in'&&d.order_direction==='DESC'));
});
test('paginación fallida, repetida o sin orden aborta antes de certificar',async()=>{
  await assert.rejects(leerCobros({get:async()=>({success:false})},p));
  await assert.rejects(leerCobros({get:async()=>({success:true,data:[remoto(),remoto()]})},p));
  await assert.rejects(leerCobros({get:async()=>({success:true,data:[remoto(),remoto({id:'701',date:p.hasta})]})},p));
});
test('consulta por ids no acepta objetos ajenos ni duplicados',async()=>{
  for(const data of [[{id:'otro'}],[{id:'700'},{id:'700'}],{}])await assert.rejects(porIds({get:async()=>({success:true,data})},'/payments',['700']));
});
test('timeout reintenta el mismo offset con página de cinco, sin duplicar lo leído',async()=>{
  const llamadas=[],esperas=[];
  const r=await getLectura({get:async(ep,params)=>{llamadas.push(params);return llamadas.length===1?{success:false,error:'timeout'}:{success:true,data:[remoto()]};}},'/payments',{start:80,limit:10},()=>{},async ms=>esperas.push(ms));
  assert.equal(r.success,true);assert.deepEqual(llamadas,[{start:80,limit:10},{start:80,limit:5}]);assert.deepEqual(esperas,[1000]);
});
test('el límite de Alegra respeta reset, un 403 no reintenta y tres fallos terminan',async()=>{
  let n=0;const esperas=[];
  await getLectura({get:async()=>++n===1?{success:false,status:400,data:{code:429,headers:{'x-rate-limit-reset':10}}}:{success:true,data:[]}},'/payments',{},()=>{},async ms=>esperas.push(ms));
  assert.deepEqual(esperas,[11000]);n=0;
  await getLectura({get:async()=>{n++;return{success:false,status:403};}},'/payments',{},()=>{},async()=>{});assert.equal(n,1);n=0;
  const r=await getLectura({get:async()=>{n++;return{success:false,error:'timeout'};}},'/payments',{},()=>{},async()=>{});assert.equal(n,3);assert.equal(r.success,false);
});
test('los saldos comparan la fórmula actual, sin usar la columna histórica saldo',()=>{
  const r=compararSaldos([facturaA()],[facturaB({saldo:'999999',total_pagado:'0'})],new Set(['600']));
  assert.equal(r.resumen.coinciden,1);
  const d=compararSaldos([facturaA()],[facturaB({saldo_calculado:'13',cobrado_nativo:'5'})],new Set(['600'])).diferencias[0];
  assert.equal(d.diferencia,13);assert.equal(d.cobrado_nativo_base,5);
});
test('facturas ausentes, estados distintos y documentos no cobrables quedan explícitos',()=>{
  assert.equal(compararSaldos([facturaA()],[],new Set(['600'])).diferencias[0].tipo,'factura_falta_en_base');
  assert.equal(compararSaldos([],[facturaB()],new Set(['600'])).diferencias[0].tipo,'factura_solo_en_base');
  assert.equal(compararSaldos([facturaA({status:'void'})],[facturaB()],new Set(['600'])).diferencias[0].tipo,'estado_distinto');
  assert.equal(compararSaldos([facturaA({status:'void'})],[facturaB({estado:'anulada'})],new Set(['600'])).resumen.no_cobrables_omitidas,1);
  assert.throws(()=>compararSaldos([facturaA({balance:null})],[facturaB()],new Set(['600'])));
  assert.throws(()=>compararSaldos([facturaA({currency:{code:'USD'}})],[],new Set(['600'])));
});
test('la foto local exige READ ONLY y libera la conexión al fallar',async()=>{
  const llamadas=[];
  await assert.rejects(leerBaseCobros({connect:async()=>({query:async(sql)=>{llamadas.push(sql);if(sql.startsWith('SELECT'))throw new Error('zz');return{rows:[]};},release:()=>llamadas.push('release')})}));
  assert.match(llamadas[0],/REPEATABLE READ READ ONLY/);assert.deepEqual(llamadas.slice(-2),['ROLLBACK','release']);
});
test('flujo completo: un cobro del tramo a factura anterior incluye su saldo actual',async()=>{
  let listado=0;
  const client={get:async(ep,params)=>({success:true,data:ep==='/payments'&&!params.id?(listado++===0?[remoto()]:[]):ep==='/invoices'&&params.id?[facturaA({date:'2026-08-01'})]:[]})};
  const pago={...propio(),monto:'113',aplicaciones:[{factura_id:20,factura_alegra_id:'600',monto:'113'}]};
  const pool={connect:async()=>({query:async(sql)=>({rows:sql.startsWith('SELECT p.')?[pago]:sql.startsWith('SELECT f.')?[facturaB({fecha:'2026-08-01'})]:[]}),release(){}})};
  const r=await ejecutar({client,pool,p});
  assert.equal(r.sin_diferencias,true);assert.equal(r.saldos.resumen.facturas_revisadas,1);assert.match(r.alcance,/ACTUALES/);
});

test('PostgreSQL: pagos, aplicaciones, notas y numeradores no cambian; saldos excluyen anulados', {skip:process.env.PROBAR_BASE_LOCAL!=='1'},async()=>{
  const {pool}=require('../config/database');
  const huella=async()=>(await pool.query(`SELECT
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM pago d) AS pago,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM pago_factura d) AS aplicaciones,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM factura d) AS factura,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM nota_credito d) AS notas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM nota_credito_factura d) AS notas_aplicaciones,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.serie),'')) FROM serie_consecutivo d) AS series`)).rows[0];
  try{
    const antes=await huella();const b=await leerBaseCobros(pool);
    assert.ok(b.cobros.length>0&&b.facturas.length>0);assert.deepEqual(await huella(),antes);
    const f=(await pool.query(`SELECT f.id, f.total,
      COALESCE((SELECT SUM(pf.monto) FROM pago_factura pf JOIN pago p ON p.id=pf.pago_id WHERE pf.factura_id=f.id AND NOT p.anulado),0) AS cobrado,
      COALESCE((SELECT SUM(nf.monto) FROM nota_credito_factura nf JOIN nota_credito n ON n.id=nf.nota_credito_id WHERE nf.factura_id=f.id AND n.estado<>'anulada'),0) AS acreditado
      FROM factura f JOIN pago_factura pf ON pf.factura_id=f.id JOIN pago p ON p.id=pf.pago_id WHERE p.anulado LIMIT 1`)).rows[0];
    assert.ok(f,'caso real de cobro anulado');
    assert.equal(Number(b.facturas.find(d=>d.id===f.id).saldo_calculado),Math.max(0,Math.round((Number(f.total)-Number(f.cobrado)-Number(f.acreditado))*100)/100));
  }finally{await pool.end();}
});

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { preparar } = require('./dobles/entregasPorRuta');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const activo=process.env.PROBAR_BASE_LOCAL==='1';

describe('ROT-05 — todas las facturas pendientes de la ruta sin semanas, PostgreSQL', {skip:!activo},()=>{
  let pool,c,f,s,fisico,lecturas=[];
  const plan = extra => s.plan({rutaId:f.a.id,...extra});
  const evento = async (factura,accion,cantidad,motivo=null) => {
    const p=await fisico.consultar(factura.id);
    return fisico.registrar(factura.id,{clave:randomUUID(),version:p.version,revision:p.revision,
      accion,confirmar:true,lineas:accion==='incidencia'?[]:[{numeroLinea:1,cantidad}],motivo},f.actor);
  };
  before(async()=>{
    require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
    pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL});c=await pool.connect();await c.query('BEGIN');f=await preparar(c);
    const db=baseEnTransaccion(c,'ruta_entrega'),q=db.query;
    db.query=async(sql,p)=>{lecturas.push(sql);if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')return {rows:[]};return q(sql,p)};
    const connect=db.pool.connect;db.pool.connect=async()=>{const cx=await connect(),ejecutar=cx.query;
      cx.query=async(sql,p)=>{lecturas.push(sql);if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')return {rows:[]};return ejecutar(sql,p)};return cx};
    const path=require.resolve('../config/database');require.cache[path]={id:path,filename:path,loaded:true,exports:db};
    s=require('../src/modules/entregas/entregas.service');fisico=require('../src/modules/entregas/registroFisico.service');
  });
  after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool?.end()});
  test('sin semanas ni fecha límite: todas las pendientes, incluidas las que esperan Bodega',async()=>{
    const p=await plan();assert.equal(p.resumen.facturas,4);assert.equal(p.resumen.paradas,3);assert.equal(p.resumen.revisadas,3);
    assert.equal(p.carga.flatMap(p=>p.facturas).length,4);
    assert.deepEqual(p.paradas.map(p=>p.clienteId),[f.primero.id,f.segundo.id,f.gemelo.id]);
    assert.ok(p.paradas[0].documentos.some(d=>d.id===f.adicional.id&&!d.revisionBodega));
    assert.deepEqual(p.carga.map(p=>p.clienteId),[f.gemelo.id,f.segundo.id,f.primero.id]);
    assert.equal(p.ciclo,null);assert.ok(!p.paradas.flatMap(p=>p.documentos).some(d=>[f.anulada.id,f.borrador.id].includes(d.id)));
  });
  test('carga completa no depende de la página visible, detalle exacto y homónimos separados',async()=>{
    const a=await plan({pagina:1,tamano:1}),b=await plan({pagina:2,tamano:1});assert.deepEqual(a.carga,b.carga);
    assert.deepEqual(a.carga.map(p=>p.pagina),[3,2,1]);
    assert.equal(a.paradas[0].documentos.length,2);
    const d=await s.parada(a.paradas[0].clave,{rutaId:f.a.id});assert.equal(d.documentos.length,2);assert.equal(d.documentos[0].lineas[0].cantidad,10);
    await assert.rejects(s.parada(a.paradas[0].clave,{rutaId:f.b.id}),e=>e.status===404);
  });
  test('carga parcial y entrega funcionan sin ciclo; la factura sale al historial solo al completar',async()=>{
    let p=await evento(f.f1,'carga',4);assert.equal(p.ciclo,null);assert.equal(p.puedeEntregar,true);assert.equal(p.documento.factura.ruta.id,f.a.id);
    p=await evento(f.f1,'entrega',4);assert.equal(p.estado,'parcialmente_entregada');
    assert.ok((await plan()).paradas.flatMap(p=>p.documentos).some(d=>d.id===f.f1.id));
    await evento(f.f1,'carga',6);p=await evento(f.f1,'entrega',6);assert.equal(p.estado,'entregada');
    assert.ok(!(await plan()).paradas.flatMap(p=>p.documentos).some(d=>d.id===f.f1.id));
    assert.ok((await plan({vista:'historial'})).paradas.flatMap(p=>p.documentos).some(d=>d.id===f.f1.id));
  });
  test('una factura nueva entra automáticamente y no modifica eventos ni saldo de la anterior',async()=>{
    const historial=(await fisico.consultar(f.f1.id)).historial;
    const nueva=await f.factura(f.primero);
    assert.ok((await plan()).carga.flatMap(p=>p.facturas).some(d=>d.id===nueva.id));
    assert.deepEqual((await fisico.consultar(f.f1.id)).historial,historial);
  });
  test('Bodega pendiente no habilita carga física aunque esté en la lista automática',async()=>{
    const p=await fisico.consultar(f.adicional.id);assert.equal(p.puedeCargar,false);
    await assert.rejects(evento(f.adicional,'carga',1),e=>e.status===409);
  });
  test('cambiar ruta antes de cargar invalida formulario; luego de cargar conserva ruta/Maps/orden',async()=>{
    const p=await fisico.consultar(f.f2.id),body={clave:randomUUID(),version:p.version,revision:p.revision,accion:'carga',confirmar:true,lineas:[{numeroLinea:1,cantidad:4}]};
    await c.query('UPDATE cliente SET ruta_id=$2 WHERE id=$1',[f.segundo.id,f.b.id]);
    await assert.rejects(fisico.registrar(f.f2.id,body,f.actor),e=>e.status===409);
    const cargado=await evento(f.f2,'carga',4),h=cargado.historial;
    await c.query("UPDATE cliente SET ruta_id=$2,orden_ruta=22,ubicacion_maps='https://maps.app.goo.gl/ZZOtra' WHERE id=$1",[f.segundo.id,f.a.id]);
    const actualizado=await fisico.consultar(f.f2.id);assert.equal(actualizado.documento.factura.ruta.id,f.b.id);
    assert.equal(actualizado.requiereRevision,false);assert.deepEqual(actualizado.historial,h);
    assert.ok(!(await plan()).paradas.flatMap(p=>p.documentos).some(d=>d.id===f.f2.id));
    assert.ok((await s.plan({rutaId:f.b.id})).paradas.flatMap(p=>p.documentos).some(d=>d.id===f.f2.id));
  });
  test('anulada con carga queda para descargar; nunca se carga/entrega de nuevo y conserva historia',async()=>{
    await c.query("UPDATE factura SET estado='anulada' WHERE id=$1",[f.f2.id]);
    const p=await s.plan({rutaId:f.b.id});assert.ok(p.paradas.some(p=>p.documentos.some(d=>d.id===f.f2.id&&!d.vigente)));
    assert.equal(p.carga.length,0);await assert.rejects(evento(f.f2,'entrega',1),e=>e.status===409);
    await evento(f.f2,'descarga',4,'ZZ devuelve carga de factura anulada');
    assert.equal((await s.plan({rutaId:f.b.id})).resumen.facturas,0);
    assert.equal((await s.plan({rutaId:f.b.id,vista:'historial'})).resumen.facturas,1);
  });
  test('nota completa impide cargar/entregar aunque estado siga emitida; parcial no retira venta',async()=>{
    await evento(f.otro,'carga',2);
    const {rows:[n]}=await c.query("INSERT INTO nota_credito(fecha,cliente_nombre,total) VALUES('2026-10-13','ZZ crédito ruta',5000) RETURNING id");
    await c.query('INSERT INTO nota_credito_factura(nota_credito_id,factura_id,monto) VALUES($1,$2,5000)',[n.id,f.otro.id]);
    assert.equal((await fisico.consultar(f.otro.id)).puedeEntregar,true);
    await c.query('UPDATE nota_credito_factura SET monto=10000 WHERE nota_credito_id=$1',[n.id]);
    assert.equal((await fisico.consultar(f.otro.id)).puedeEntregar,false);
    await assert.rejects(evento(f.otro,'entrega',1),e=>e.status===409);
    assert.ok((await plan()).paradas.flatMap(p=>p.documentos).some(d=>d.id===f.otro.id&&!d.vigente));
    await evento(f.otro,'descarga',2,'ZZ devuelve carga acreditada');
    assert.ok(!(await plan()).paradas.flatMap(p=>p.documentos).some(d=>d.id===f.otro.id));
  });
  test('sin ruta permite revisar históricos sin inventar cliente, Maps, semana ni pedido',async()=>{
    const p=await s.plan({rutaId:'sin-ruta'});assert.ok(p.carga.some(p=>p.facturas.some(d=>d.id===f.huerfana.id)));
    const r=await fisico.consultar(f.huerfana.id);assert.equal(r.documento.factura.ruta.id,null);assert.equal(r.documento.factura.ruta.ubicacionMaps,null);
    await evento(f.huerfana,'carga',1);assert.equal((await fisico.consultar(f.huerfana.id)).ciclo,null);
  });
  test('consultas/Excel no escriben y exportan todas las páginas sin semana ni importes',async()=>{
    const huellas=async()=> (await c.query('SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) h FROM entrega_evento e')).rows[0].h;
    const antes=await huellas();lecturas=[];
    const p=await plan({tamano:1});await s.parada(p.paradas[0].clave,{rutaId:f.a.id});
    const r=await require('../src/modules/entregas/entregas.excel').exportar({rutaId:f.a.id}),XLSX=require('xlsx');
    const libro=XLSX.read(r.buffer,{type:'buffer'}),docs=XLSX.utils.sheet_to_json(libro.Sheets.Documentos);
    assert.equal(docs.length,p.resumen.facturas);assert.ok(docs.every(d=>d.Ruta===f.a.nombre));
    assert.ok(!Object.keys(docs[0]).some(k=>/Semana|ID ciclo|Precio|Costo|Saldo/.test(k)));
    assert.equal(await huellas(),antes);assert.equal(lecturas.some(s=>/^\s*(INSERT|UPDATE|DELETE|ALTER)\b/i.test(s)),false);
    assert.ok(lecturas.includes('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'));
  });
  test('plan/detalle/físico nuevos usan READ ONLY real; dos operadores no duplican carga sin ciclo',async()=>{
    const seed=await pool.connect();let propio;
    try{await seed.query('BEGIN');propio=await preparar(seed);await seed.query('COMMIT')}catch(e){await seed.query('ROLLBACK');throw e}finally{seed.release()}
    const paths=['../config/database','../src/modules/entregas/entregas.service','../src/modules/entregas/registroFisico.service'].map(require.resolve),previos=paths.map(p=>require.cache[p]);
    require.cache[paths[0]]={id:paths[0],filename:paths[0],loaded:true,exports:{pool}};paths.slice(1).forEach(p=>delete require.cache[p]);
    const real=require(paths[1]),registro=require(paths[2]),connect=pool.connect.bind(pool),observados=[];
    pool.connect=async()=>{const db=await connect(),q=db.query.bind(db);db.query=async(sql,p)=>{
      const r=await q(sql,p);if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')observados.push([
        (await q('SHOW transaction_read_only')).rows[0].transaction_read_only,(await q('SHOW transaction_isolation')).rows[0].transaction_isolation]);return r
    };const release=db.release.bind(db);db.release=()=>{db.query=q;db.release=release;release()};return db};
    try{
      const p=await real.plan({rutaId:propio.a.id});await real.parada(p.paradas[0].clave,{rutaId:propio.a.id});
      const r=await registro.consultar(propio.f1.id);assert.deepEqual(observados,Array.from({length:3},()=>['on','repeatable read']));
      const body={clave:randomUUID(),version:r.version,revision:r.revision,confirmar:true,accion:'carga',lineas:[{numeroLinea:1,cantidad:4}]};
      const respuestas=await Promise.all([registro.registrar(propio.f1.id,body,propio.actor),registro.registrar(propio.f1.id,body,propio.actor)]);
      assert.deepEqual(respuestas[0],respuestas[1]);assert.equal(respuestas[0].lineas[0].cargada,4);assert.equal(respuestas[0].historial.length,1);
      const base=await registro.consultar(propio.f1.id),b={...body,version:base.version,revision:base.revision,lineas:[{numeroLinea:1,cantidad:2}]};
      const dos=await Promise.allSettled([registro.registrar(propio.f1.id,{...b,clave:randomUUID()},propio.actor),registro.registrar(propio.f1.id,{...b,clave:randomUUID()},propio.actor)]);
      assert.equal(dos.filter(r=>r.status==='fulfilled').length,1);assert.equal(dos.find(r=>r.status==='rejected').reason.status,409);
    }finally{pool.connect=connect;paths.forEach((p,i)=>require.cache[p]=previos[i])}
  });
  test('ruta, vista y paginación inválidas no amplían el ámbito',async()=>{
    for(const extra of [{rutaId:''},{rutaId:0},{rutaId:true},{rutaId:[]},{rutaId:'1 OR 1=1'},{rutaId:'2147483648'},{pagina:'2x'},{tamano:51},{vista:'todos'}])await assert.rejects(plan(extra),e=>e.status===400);
    await assert.rejects(plan({rutaId:2147483647}),e=>e.status===404);
  });
});

test('corregir líneas reemplazadas exige acumulados nuevos; incidencia nunca copia cantidades',async()=>{
  const {prepararCantidades,lineasDeRegistro}=await import('../../frontend/src/utils/registroEntrega.js');
  const d={requiereRevision:true,documento:{lineas:[{numeroLinea:1,productoId:7}]},lineas:[{numeroLinea:1,productoId:6,cargada:4,entregada:2,descargada:1}]};
  assert.deepEqual(prepararCantidades(d,'revision'),{1:{cargada:'0',entregada:'0',descargada:'0'}});
  assert.deepEqual(lineasDeRegistro(d,'incidencia',{1:'4'}),[]);
  assert.deepEqual(lineasDeRegistro(d,'carga',{1:'1.25'}),[{numeroLinea:1,cantidad:'1.25'}]);
  assert.deepEqual(lineasDeRegistro(d,'revision',{}),[{numeroLinea:1,cargada:'0',entregada:'0',descargada:'0'}]);
});

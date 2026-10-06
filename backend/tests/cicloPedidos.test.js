/** Retiro semanal: contratos anteriores rechazan sin importar cron/SQL.
 * Nunca ejecutar la implementación antigua, ni contra una base simulada.
 */
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const db=require.resolve('../config/database'),ciclo=require.resolve('../src/modules/orders-whatsapp/cicloPedidos');
const ordenes=require.resolve('../src/modules/orders-whatsapp/orders-whatsapp.service'),reportes=require.resolve('../src/modules/reports/report.service');
let consultas;
beforeEach(()=>{consultas=[];for(const p of [db,ciclo,ordenes,reportes])delete require.cache[p];
 const query=async(sql,params)=>{consultas.push({sql:String(sql),params});if(!/^\s*SELECT/.test(sql))throw Error('Una consulta intentó escribir');return{rows:[]}};
 require.cache[db]={id:db,filename:db,loaded:true,exports:{query,pool:{query}}};
});
test('sin corte histórico se consultan todos los envíos, sin corte de lunes',()=>{
 const c=require(ciclo);assert.match(c.SQL_INICIO_CICLO,/SELECT reiniciado_en FROM ciclo_pedidos WHERE id = 1/);
 assert.match(c.SQL_INICIO_CICLO,/'-infinity'::timestamp/);assert.doesNotMatch(c.SQL_INICIO_CICLO,/date_trunc/);
});
test('consulta antigua conserva fecha explícita e historia, sin DDL',async()=>{
 await new (require(ordenes))().getOrdenesEnviadas('2026-10-01');assert.equal(consultas.length,1);
 assert.match(consultas[0].sql,/creado_en >= GREATEST/);assert.deepEqual(consultas[0].params,['2026-10-01']);
});
test('reinicio antiguo responde 410 sin escribir ni consultar',async()=>{
 await assert.rejects(require(ciclo).reiniciar(),e=>e.status===410);assert.deepEqual(consultas,[]);
});
test('API antigua de faltantes rechaza aun con registros, sin borrado ni consulta',async()=>{
 const r=await new (require(reportes))().clearProcessedSupplierMissingItems();assert.equal(r.status,410);assert.equal(r.success,false);assert.deepEqual(consultas,[]);
});
test('API antigua de cantidades rechaza sin alterar su borrador',async()=>{
 await assert.rejects(new (require(ordenes))().limpiarCantidades(),e=>e.status===410);assert.deepEqual(consultas,[]);
});
test('compatibilidad de cron solo rechaza; arranque no lo importa ni programa',async()=>{
 const p=require.resolve('../services/scheduledCleanup'),src=fs.readFileSync(p,'utf8');
 assert.doesNotMatch(src,/require\([^)]*(?:database|node-cron)/);
 for(const fn of Object.values(require(p)))await assert.rejects(fn(),e=>e.status===410);
 assert.deepEqual(consultas,[]);
 const server=fs.readFileSync(require.resolve('../server'),'utf8');assert.doesNotMatch(server,/scheduledCleanup|iniciarLimpiezaProgramada/);
});

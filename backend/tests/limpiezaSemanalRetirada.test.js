/** La limpieza semanal está retirada: los contratos anteriores rechazan sin
 * importar cron, botón o SQL. Nunca ejecutar la implementación antigua, ni
 * contra una base simulada (ver la memoria «Nunca correr la limpieza semanal»).
 * El «ciclo de pedidos» semanal (`cicloPedidos`, `/orden-compra/enviados`) se
 * retiró el 2026-10-20 con los ciclos; estas guardas se quedan.
 */
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const db=require.resolve('../config/database');
const ordenes=require.resolve('../src/modules/orders-whatsapp/orders-whatsapp.service'),reportes=require.resolve('../src/modules/reports/report.service');
let consultas;
beforeEach(()=>{consultas=[];for(const p of [db,ordenes,reportes])delete require.cache[p];
 const query=async(sql,params)=>{consultas.push({sql:String(sql),params});if(!/^\s*SELECT/.test(sql))throw Error('Una consulta intentó escribir');return{rows:[]}};
 require.cache[db]={id:db,filename:db,loaded:true,exports:{query,pool:{query}}};
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
test('el ciclo de pedidos semanal y su historial ya no existen',()=>{
 for(const f of ['cicloPedidos.js','historialEnviosProveedor.service.js'])assert.equal(fs.existsSync(require('node:path').join(__dirname,'../src/modules/orders-whatsapp',f)),false,f);
 assert.equal(typeof require(ordenes).prototype.getOrdenesEnviadas,'undefined');
});

require('dotenv').config();
const svc = require('./src/modules/duplicados-electronica/duplicados.service');
(async()=>{
  const r = await svc.revisarDuplicados({ soloDetectar: true });
  const L=[];
  L.push(`corte DESDE_FECHA          : ${svc.DESDE_FECHA}`);
  L.push(`facturas revisadas         : ${r.facturasRevisadas}`);
  L.push(`pares detectados (post-corte): ${r.detectados}`);
  L.push(`se anularían               : ${r.anulados} (0 porque es solo lectura)`);
  L.push(`para revisión              : ${r.requierenRevision}`);
  const p = await svc.listarPendientes();
  L.push(`\nregistrados en la bitácora : ${p.length}`);
  p.forEach(x=>L.push(`   ${x.fecha?.toISOString?.().slice(0,10)||x.fecha} ${x.clienteNombre?.slice(0,26)} ₡${x.total} | copia ${x.duplicadoNumero} | ${x.motivo}`));
  require('fs').writeFileSync(process.env.OUT, L.join('\n'));
  process.exit(0);
})().catch(e=>{require('fs').writeFileSync(process.env.OUT,'ERR '+e.message);process.exit(1);});

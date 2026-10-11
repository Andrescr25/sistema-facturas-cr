/** Contexto y cantidades operativas: seis decimales visibles, cero no significa desconocido. */
const col=(clave,titulo,tipo='texto',ancho=22)=>({clave,titulo,tipo,ancho,...(tipo==='numero'?{formato:'#,##0.######'}:{})});
const contexto=[col('ruta','Ruta','texto',32),col('cicloId','ID ciclo','numero'),col('semana','Semana','fecha'),col('parada','Orden de entrega','numero')];
const aContexto=c=>({ruta:c?.rutaNombre||'Sin ciclo',cicloId:c?.id,semana:c?.semana,parada:c?.orden});
const siNo=v=>v?'Sí':'No';
const informacion=(c,f={},extra=[])=>[
 ['Ruta ID',f.rutaId||'Todas'],['Ciclo ID',f.cicloId||'Todos'],
 ['Contexto',c?c.rutaNombre:f.cicloId==='sin-ciclo'?'Sin ciclo: documentos sin semana asignada':'Vista conjunta: contexto propio en cada fila'],
 ['Semana',c?.semana||'Sin semana única'],['Estado del ciclo',c?.estado||''],
 ['Páginas','Todos los resultados seleccionados; no solo la página visible.'],...extra];
module.exports={col,contexto,aContexto,siNo,informacion};

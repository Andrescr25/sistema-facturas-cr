const {randomUUID}=require('node:crypto');
const {registrarCambio}=require('../../utils/bitacora');
const {interno:{enOrden,obtenerEn,proveedorEn,necesidadesEn,agrupar,micros,cantidadDe}}=require('./ordenesCiclo.service');
const {faltantesEn}=require('./comprasProveedores.service');
const {insertarLineasEn}=require('./ordenesCicloLineas.service');

/** Una abierta por proveedor, sin agrupar por semana. La enviada/intento
 * incierto nunca recibe nuevos productos. Se llama dentro de la transacción de Bodega/asignación, antes del COMMIT. */
async function sincronizarEn(db,filtros={},usuarioId,incrementos=null) {
  await db.query('SELECT pg_advisory_xact_lock(46005,1)');
  const faltantes=await faltantesEn(db,filtros),contextos=new Map(),ordenes=[];
  for(const f of faltantes){
    if(!f.proveedor_id||!f.activo)continue;
    if(incrementos&&!incrementos.has(f.id))continue;
    contextos.set(f.proveedor_id,{proveedorId:f.proveedor_id});
  }
  for(const {proveedorId} of contextos.values()){
    const cicloId=null,p=await proveedorEn(db,proveedorId);
    const {rows:[abierta]}=await db.query(`SELECT id FROM orden_compra_ciclo WHERE proveedor_id=$1 AND estado IN ('borrador','pendiente_enviar') AND envio_id IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`,[proveedorId]);
    let o=abierta?await obtenerEn(db,abierta.id,{bloquear:true}):null;
    const libres=await necesidadesEn(db,p,null,{bloquear:true});
    // Bajo el bloqueo de compra y de todos sus faltantes, otros productos no
    // alteran los orígenes de éste. Leer la disponibilidad excluyendo la abierta
    // una sola vez evita volver a consultar al proveedor completo por cada línea.
    const disponibles=new Map(agrupar(await necesidadesEn(db,p,o?.id??null,{bloquear:true})).map(p=>[p.productoId,p]));
    // Guardar de nuevo el mismo faltante no repone cantidades excluidas en una
    // revisión manual. Solo el aumento recién detectado puede ampliar el pedido.
    for(const f of libres)if(incrementos){
      const libre=micros(f.cantidad_faltante)-micros(f.reservada),aumento=incrementos.get(f.faltanteId)||0n;
      f.cantidad_faltante=cantidadDe(micros(f.reservada)+(libre>0n?(libre<aumento?libre:aumento):0n));
    }
    const productos=agrupar(libres).filter(p=>p.disponible>0);
    let pendientes=[],nuevas=0,estadoAnterior=o?.estado;
    const guardarLote=async()=>{
      if(!pendientes.length)return;
      const anteriores=pendientes.filter(e=>e.previa).map(e=>e.previa.id);
      if(anteriores.length){
        await db.query('DELETE FROM orden_compra_ciclo_origen WHERE linea_id=ANY($1::int[])',[anteriores]);
        await db.query('DELETE FROM orden_compra_ciclo_linea WHERE id=ANY($1::int[])',[anteriores]);
      }
      await insertarLineasEn(db,o,pendientes);
      await terminarEn(db,o,estadoAnterior,usuarioId);
      if(!ordenes.includes(o.id))ordenes.push(o.id);
      pendientes=[];nuevas=0;
    };
    for(const producto of productos){
      let previa=o?.lineas.find(l=>l.producto_id===producto.productoId);
      const factor=previa?.factor_conversion??producto.factorConversion;
      if(!Number.isFinite(factor)||factor<0.000001||factor>1000000)continue;
      const cobertura=previa?.origenes.reduce((s,r)=>s+micros(r.cantidad),0n)||0n;
      const factorMicro=micros(factor.toFixed(6)),necesaria=(cobertura+micros(producto.disponible)+factorMicro-1n)/factorMicro;
      const cantidadProveedor=Math.max(previa?.cantidad_proveedor||0,Number(necesaria));
      if(cantidadProveedor>1000000)continue;
      // Límite del formulario: otro borrador conserva los productos restantes.
      if(o&&!previa&&o.lineas.length+nuevas>=500){
        await guardarLote();
        o=null;estadoAnterior=null;
      }
      if(!o){
        const {rows:[n]}=await db.query(`INSERT INTO orden_compra_ciclo(proveedor_id,proveedor_nombre,proveedor_cedula,ciclo_id,ruta_nombre,semana,clave,solicitud)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[p.id,p.nombre,p.identificacion,cicloId,null,null,randomUUID(),{automatica:true,sinCiclos:true,proveedorId,cicloId:null}]);
        o={...n,lineas:[]};ordenes.push(o.id);
      }
      if(!pendientes.length&&o.estado==='pendiente_enviar'){
        // SQL permite líneas solo en borrador. Volver y restaurar pendiente en
        // esta misma transacción invalida las copias PDF de la revisión anterior.
        await db.query("UPDATE orden_compra_ciclo SET estado='borrador',version=version+1,actualizado_en=NOW() WHERE id=$1",[o.id]);
      }
      const disponible=disponibles.get(producto.productoId);
      const anteriores=new Map(previa?.origenes.map(r=>[r.faltante_id,micros(r.cantidad)])||[]);
      for(const f of disponible.origenes){
        const permitido=(anteriores.get(f.faltanteId)||0n)+(incrementos?(incrementos.get(f.faltanteId)||0n):micros(f.disponible));
        f.disponible=cantidadDe(micros(f.disponible)<permitido?micros(f.disponible):permitido);
      }
      pendientes.push({l:{productoId:producto.productoId,cantidadProveedor},producto:disponible,previa});
      if(!previa)nuevas++;
    }
    await guardarLote();
  }
  return{ordenes};
}
async function terminarEn(db,o,estadoAnterior,usuarioId){
  await db.query('UPDATE orden_compra_ciclo SET estado=$2,version=version+1,actualizado_en=NOW() WHERE id=$1',[o.id,estadoAnterior||'borrador']);
  await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'acumular_faltantes',despues:await obtenerEn(db,o.id),usuarioId});
}
const sincronizar=(filtros,usuarioId)=>enOrden(db=>sincronizarEn(db,filtros,usuarioId));
module.exports={sincronizar,sincronizarEn};

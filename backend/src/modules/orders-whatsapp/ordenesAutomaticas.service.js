const {randomUUID}=require('node:crypto');
const {registrarCambio}=require('../../utils/bitacora');
const {interno:{enOrden,obtenerEn,contextoEn,proveedorEn,necesidadesEn,agrupar,micros,cantidadDe,reemplazarLineaEn}}=require('./ordenesCiclo.service');
const {faltantesEn}=require('./comprasProveedores.service');

/** Se llama dentro de la transacción de Bodega/asignación, antes del COMMIT. */
async function sincronizarEn(db,filtros={},usuarioId,incrementos=null) {
  await db.query('SELECT pg_advisory_xact_lock(46005,1)');
  const faltantes=await faltantesEn(db,filtros),contextos=new Map(),ordenes=[];
  for(const f of faltantes){
    if(!f.proveedor_id||!f.activo||['cerrado','cancelado'].includes(f.ciclo_estado))continue;
    if(incrementos&&!incrementos.has(f.id))continue;
    contextos.set(`${f.proveedor_id}|${f.ciclo_id}`,{proveedorId:f.proveedor_id,cicloId:f.ciclo_id});
  }
  for(const {proveedorId,cicloId} of contextos.values()){
    const p=await proveedorEn(db,proveedorId),c=await contextoEn(db,cicloId);
    const {rows:[abierta]}=await db.query(`SELECT id FROM orden_compra_ciclo WHERE proveedor_id=$1 AND ciclo_id IS NOT DISTINCT FROM $2::int
      AND estado IN ('borrador','pendiente_enviar') AND envio_id IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`,[proveedorId,cicloId]);
    let o=abierta?await obtenerEn(db,abierta.id,{bloquear:true}):null;
    const libres=await necesidadesEn(db,p,cicloId,null,{bloquear:true});
    // Guardar de nuevo el mismo faltante no repone cantidades excluidas en una
    // revisión manual. Solo el aumento recién detectado puede ampliar el pedido.
    for(const f of libres)if(incrementos){
      const libre=micros(f.cantidad_faltante)-micros(f.reservada),aumento=incrementos.get(f.faltanteId)||0n;
      f.cantidad_faltante=cantidadDe(micros(f.reservada)+(libre>0n?(libre<aumento?libre:aumento):0n));
    }
    const productos=agrupar(libres).filter(p=>p.disponible>0);
    let cambios=0,estadoAnterior=o?.estado;
    for(const producto of productos){
      let previa=o?.lineas.find(l=>l.producto_id===producto.productoId);
      const factor=previa?.factor_conversion??producto.factorConversion;
      if(!Number.isFinite(factor)||factor<0.000001||factor>1000000)continue;
      const cobertura=previa?.origenes.reduce((s,r)=>s+micros(r.cantidad),0n)||0n;
      const factorMicro=micros(factor.toFixed(6)),necesaria=(cobertura+micros(producto.disponible)+factorMicro-1n)/factorMicro;
      const cantidadProveedor=Math.max(previa?.cantidad_proveedor||0,Number(necesaria));
      if(cantidadProveedor>1000000)continue;
      // Límite del formulario: otro borrador conserva los productos restantes.
      if(o&&!previa&&o.lineas.length>=500){
        if(cambios){await terminarEn(db,o,estadoAnterior,usuarioId);if(!ordenes.includes(o.id))ordenes.push(o.id)}
        o=null;cambios=0;estadoAnterior=null;
      }
      if(!o){
        const {rows:[n]}=await db.query(`INSERT INTO orden_compra_ciclo(proveedor_id,proveedor_nombre,proveedor_cedula,ciclo_id,ruta_nombre,semana,clave,solicitud)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[p.id,p.nombre,p.identificacion,cicloId,c?.ruta_nombre??null,c?.semana??null,randomUUID(),{automatica:true,proveedorId,cicloId}]);
        o={...n,lineas:[]};ordenes.push(o.id);
      }
      if(!cambios&&o.estado==='pendiente_enviar'){
        // SQL permite líneas solo en borrador. Volver y restaurar pendiente en
        // esta misma transacción invalida las copias PDF de la revisión anterior.
        await db.query("UPDATE orden_compra_ciclo SET estado='borrador',version=version+1,actualizado_en=NOW() WHERE id=$1",[o.id]);
      }
      if(previa){
        await db.query('DELETE FROM orden_compra_ciclo_origen WHERE linea_id=$1',[previa.id]);
        await db.query('DELETE FROM orden_compra_ciclo_linea WHERE id=$1',[previa.id]);
      }
      // Solo reasignar los orígenes de ESTA línea. Otras revisiones y cantidades
      // manuales permanecen intactas. La orden enviada jamás llega a este flujo.
      const disponible=agrupar(await necesidadesEn(db,p,cicloId,o.id,{bloquear:true})).find(p=>p.productoId===producto.productoId);
      const anteriores=new Map(previa?.origenes.map(r=>[r.faltante_id,micros(r.cantidad)])||[]);
      for(const f of disponible.origenes){
        const permitido=(anteriores.get(f.faltanteId)||0n)+(incrementos?(incrementos.get(f.faltanteId)||0n):micros(f.disponible));
        f.disponible=cantidadDe(micros(f.disponible)<permitido?micros(f.disponible):permitido);
      }
      await reemplazarLineaEn(db,o,{productoId:producto.productoId,cantidadProveedor},disponible,previa);
      cambios++;o=await obtenerEn(db,o.id);
    }
    if(cambios){await terminarEn(db,o,estadoAnterior,usuarioId);if(!ordenes.includes(o.id))ordenes.push(o.id)}
  }
  return{ordenes};
}
async function terminarEn(db,o,estadoAnterior,usuarioId){
  await db.query('UPDATE orden_compra_ciclo SET estado=$2,version=version+1,actualizado_en=NOW() WHERE id=$1',[o.id,estadoAnterior||'borrador']);
  await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'acumular_faltantes',despues:await obtenerEn(db,o.id),usuarioId});
}
const sincronizar=(filtros,usuarioId)=>enOrden(db=>sincronizarEn(db,filtros,usuarioId));
module.exports={sincronizar,sincronizarEn};

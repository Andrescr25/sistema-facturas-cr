/**
 * Auditoría de encabezados e importes agregados de compras. NO reconstruye
 * compras, ni enlaza por nombre, serial propio o número suelto. El buzón
 * puede conservar el id explícito de Alegra; los pares cédula+número solo
 * se proponen para revisión y nunca certifican una correspondencia.
 */
const { ErrorConciliacion, periodo, fechaValida, escalado } = require('./conciliacion-ventas');
const { getLectura } = require('./conciliacion-cobros');
const texto = v => v == null || String(v).trim() === '' ? null : String(v).trim();
const dentro = (d,p) => d.fecha >= p.desde && d.fecha <= p.hasta;
const CAMPOS = ['numero','proveedor_identificacion','fecha','vencimiento','estado','moneda','total','lineas','impuesto_lineas'];
const DINERO = new Set(['total','impuesto_lineas']);

function normalizar(d) {
  if (!fechaValida(d.fecha) || (d.vencimiento != null && !fechaValida(d.vencimiento)) ||
      !['registrada','anulada'].includes(d.estado) || !/^[A-Z]{3}$/.test(d.moneda || '')) {
    throw new ErrorConciliacion('Compra con fecha, estado o moneda inválidos.');
  }
  const id = texto(d.alegra_bill_id);
  if (d.alegra_bill_id != null && (!id || !/^\d{1,20}$/.test(id))) throw new ErrorConciliacion('Id histórico de compra inválido.');
  if (!Number.isSafeInteger(d.lineas) || d.lineas < 0) throw new ErrorConciliacion('Cantidad de líneas de compra inválida.');
  return { ...d, alegra_bill_id:id, vencimiento:d.vencimiento ?? null, numero:texto(d.numero),
    proveedor_identificacion:texto(d.proveedor_identificacion),
    total:escalado(d.total,2,'total de compra'),
    impuesto_lineas:d.impuestos_incompletos === true && d.impuesto_lineas == null ? null :
      escalado(d.impuesto_lineas,2,'impuestos de compra') };
}

function compraAlegra(d) {
  if (!d || !/^\d{1,20}$/.test(String(d.id || '')) || !['open','closed','void'].includes(d.status) ||
      !Array.isArray(d.purchases?.items) || (d.purchases.categories?.length || 0)) {
    throw new ErrorConciliacion('Factura de proveedor con identidad, estado o detalle no soportados.');
  }
  let impuesto = 0, impuestosIncompletos=false;
  for (const l of d.purchases.items) {
    // null/ausente no se inventa como cero. Se intenta completar la ficha
    // individual; si tampoco informa, el informe señala el alcance pendiente.
    if(l.tax==null){impuestosIncompletos=true;continue;}
    if (!Array.isArray(l.tax)) throw new ErrorConciliacion('Impuestos de compra con forma inválida.');
    let impuestoLinea=0;
    for (const t of l.tax) {
      escalado(t.amount,2,'impuesto de línea de compra');
      impuestoLinea+=Number(t.amount);
    }
    // compra_linea.impuesto es un monto POR LÍNEA NUMERIC(14,2), no por
    // cada impuesto individual: redondear cada uno antes cambia el resultado.
    impuesto+=escalado(impuestoLinea,2,'suma de impuestos de línea');
    if (!Number.isSafeInteger(impuesto)) throw new ErrorConciliacion('Suma de impuestos fuera del rango seguro.');
  }
  return normalizar({ alegra_bill_id:String(d.id), fecha:d.date, vencimiento:d.dueDate ?? null,
    numero:d.numberTemplate?.fullNumber || d.numberTemplate?.number,
    proveedor_identificacion:d.provider?.identification,
    estado:d.status === 'void' ? 'anulada' : 'registrada', moneda:d.currency?.code || 'CRC',
    total:d.total, lineas:d.purchases.items.length,
    impuestos_incompletos:impuestosIncompletos,impuesto_lineas:impuestosIncompletos?null:impuesto/100 });
}

/** /bills documenta fecha exacta, NO rango ni lotes por id. */
async function leerCompras(client,p,avisar=()=>{}) {
  periodo(p.desde,p.hasta);
  const documentos=[], ids=new Set();
  let start=0, anterior='9999-12-31';
  for (let pagina=0;pagina<5000;pagina++) {
    const r=await client.get('/bills',{start,limit:30,order_field:'date',order_direction:'DESC'});
    if (!r?.success || !Array.isArray(r.data)) throw new ErrorConciliacion(`Lectura incompleta de compras, página ${pagina+1}.`);
    if (!r.data.length) return documentos;
    for (const d of r.data) {
      const id=String(d?.id || '');
      if (!/^\d{1,20}$/.test(id) || !fechaValida(d.date) || ids.has(id) || d.date>anterior) {
        throw new ErrorConciliacion('Paginación de compras repetida, inválida o fuera de orden.');
      }
      ids.add(id); anterior=d.date;
      if (dentro({fecha:d.date},p)) {
        let compra=compraAlegra(d);
        if(compra.impuestos_incompletos) {
          const ficha=await client.get(`/bills/${id}`,{});
          if(!ficha?.success || String(ficha.data?.id)!==id) throw new ErrorConciliacion('No se pudo completar el detalle fiscal de una compra.');
          const completa=compraAlegra(ficha.data);
          if(CAMPOS.filter(k=>k!=='impuesto_lineas').some(k=>compra[k]!==completa[k])) {
            throw new ErrorConciliacion('La compra cambió entre listado y detalle; repetir con el origen sin cambios.');
          }
          compra=completa;
        }
        documentos.push(compra);
      }
    }
    start+=r.data.length;
    avisar(`Compras: ${start} leídas; ${documentos.length} en el tramo`);
    // Una página corta no termina el barrido. Cruzar el inicio sí, después
    // de validar toda la página y el orden de las filas (incluidos empates).
    if (anterior<p.desde) return documentos;
  }
  throw new ErrorConciliacion('Demasiadas páginas de compras; lectura incompleta.');
}

async function leerBaseCompras(pool) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // La identidad histórica viene del FK real al buzón, nunca de c.id.
    // Leer también fuera del tramo permite descubrir fechas cambiadas.
    const {rows}=await db.query(`SELECT c.id,c.clave,c.factura_proveedor_id,
      f.alegra_bill_id,c.numero_consecutivo AS numero,c.fecha_emision::text AS fecha,
      c.fecha_vencimiento::text AS vencimiento,c.estado,c.moneda,c.total,
      p.identificacion AS proveedor_identificacion,
      (SELECT count(*)::int FROM compra_linea l WHERE l.compra_id=c.id) AS lineas,
      COALESCE((SELECT sum(l.impuesto) FROM compra_linea l WHERE l.compra_id=c.id),0) AS impuesto_lineas
      FROM compra c LEFT JOIN facturas_proveedores f ON f.id=c.factura_proveedor_id
      LEFT JOIN proveedor p ON p.id=c.proveedor_id ORDER BY c.id`);
    const compras=rows.map(normalizar);
    await db.query('COMMIT');
    return compras;
  } catch(e) { await db.query('ROLLBACK'); throw e; }
  finally { db.release(); }
}

function cambios(a,b) {
  return CAMPOS.filter(k=>a[k]!==b[k]).map(campo=>({campo,
    alegra:DINERO.has(campo) && a[campo]!=null?a[campo]/100:a[campo],
    base:DINERO.has(campo) && b[campo]!=null?b[campo]/100:b[campo]}));
}

function claveCandidata(d) {
  // Conserva ceros y letras: NO convertir identificaciones o números a
  // Number. Solo separadores habituales de cédula; sin parecido de texto.
  const cedula=d.proveedor_identificacion?.replace(/[\s.-]/g,'');
  return cedula && d.numero ? JSON.stringify([cedula,d.numero]) : null;
}

function agrupar(docs,clave) {
  const m=new Map();
  for (const d of docs) { const k=clave(d); if (k!=null) m.set(k,[...(m.get(k)||[]),d]); }
  return m;
}

function conciliar(remotas,propias,p) {
  periodo(p.desde,p.hasta);
  const origen=agrupar(remotas,d=>d.alegra_bill_id);
  if ([...origen.values()].some(g=>g.length!==1)) throw new ErrorConciliacion('Id de compra repetido en el origen.');
  const locales=agrupar(propias,d=>d.alegra_bill_id);
  const diferencias=[], incidencias=[], vinculadasA=new Set(), vinculadasB=new Set();
  for(const [fuente,docs] of [['alegra',remotas],['base',propias]]) for(const d of docs.filter(d=>dentro(d,p))) {
    if(!d.numero || !d.proveedor_identificacion) incidencias.push({tipo:'identidad_comprobante_incompleta',fuente,
      id_propio:d.id ?? null,alegra_bill_id:d.alegra_bill_id});
    if(d.impuesto_lineas==null) incidencias.push({tipo:'impuestos_no_informados',fuente,
      id_propio:d.id ?? null,alegra_bill_id:d.alegra_bill_id});
  }
  let coinciden=0;
  for (const [id,grupo] of locales) {
    const a=origen.get(id)?.[0];
    if (!grupo.some(d=>dentro(d,p)) && !(a && dentro(a,p))) continue;
    vinculadasA.add(id); grupo.forEach(b=>vinculadasB.add(b.id));
    if (grupo.length>1) {
      incidencias.push({tipo:'vinculo_historico_repetido',alegra_bill_id:id,ids_propios:grupo.map(d=>d.id)});
      continue;
    }
    const b=grupo[0];
    if (!a) diferencias.push({tipo:'vinculo_sin_documento_origen',alegra_bill_id:id,id_propio:b.id});
    else {
      const c=cambios(a,b);
      if(c.length) diferencias.push({tipo:'datos_distintos',alegra_bill_id:id,id_propio:b.id,cambios:c});
      else coinciden++;
    }
  }
  const sinA=remotas.filter(d=>!vinculadasA.has(d.alegra_bill_id));
  const sinB=propias.filter(d=>!vinculadasB.has(d.id) && d.alegra_bill_id==null);
  const candidatosA=agrupar(sinA,claveCandidata), candidatosB=agrupar(sinB,claveCandidata);
  const candidatos=[];
  for (const clave of new Set([...candidatosA.keys(),...candidatosB.keys()])) {
    const a=candidatosA.get(clave)||[], b=candidatosB.get(clave)||[];
    if (!a.length || !b.length || ![...a,...b].some(d=>dentro(d,p))) continue;
    candidatos.push({tipo:a.length===1 && b.length===1?'unico_sin_confirmar':'ambiguo',
      ids_alegra:a.map(d=>d.alegra_bill_id),ids_propios:b.map(d=>d.id),
      cambios:a.length===1 && b.length===1?cambios(a[0],b[0]):null});
  }
  const baseSinVinculo=sinB.filter(d=>dentro(d,p));
  const origenSinVinculo=sinA.filter(d=>dentro(d,p));
  for (const d of baseSinVinculo) incidencias.push({tipo:'compra_sin_vinculo_historico',id_propio:d.id});
  for (const d of origenSinVinculo) incidencias.push({tipo:'origen_sin_vinculo_propio',alegra_bill_id:d.alegra_bill_id});
  // Ni un par único ni una suma idéntica prueban que ESTE es el documento
  // que se copió. Esos candidatos no entran en "coinciden" ni se enlazan.
  const mensual=new Map();
  for (const [fuente,docs] of [['alegra',remotas],['base',propias]]) for(const d of docs.filter(d=>dentro(d,p))) {
    const clave=`${d.fecha.slice(0,7)}:${d.moneda}:${d.estado}`;
    if(!mensual.has(clave)) mensual.set(clave,{mes:d.fecha.slice(0,7),moneda:d.moneda,estado:d.estado,
      alegra:{documentos:0,total:0,impuesto_lineas:0,documentos_impuesto_incompleto:0},
      base:{documentos:0,total:0,impuesto_lineas:0,documentos_impuesto_incompleto:0}});
    const g=mensual.get(clave)[fuente];g.documentos++;
    if(d.impuesto_lineas==null)g.documentos_impuesto_incompleto++;
    for(const k of DINERO) {
      g[k]=g[k]===null || d[k]===null ? null : g[k]+d[k];
      if(g[k]!==null && !Number.isSafeInteger(g[k]))throw new ErrorConciliacion('Suma mensual de compras fuera del rango seguro.');
    }
  }
  for(const m of mensual.values()) for(const fuente of ['alegra','base']) for(const k of DINERO) if(m[fuente][k]!==null)m[fuente][k]/=100;
  return {version:1,periodo:p,alcance:'encabezados_e_importes_agregados; candidatos_no_certifican_vinculos',
    resumen:{vinculadas_coinciden:coinciden,vinculadas_difieren:diferencias.filter(d=>d.tipo==='datos_distintos').length,
      vinculos_sin_origen:diferencias.filter(d=>d.tipo==='vinculo_sin_documento_origen').length,
      base_sin_vinculo:baseSinVinculo.length,alegra_sin_vinculo:origenSinVinculo.length,
      candidatos_unicos:candidatos.filter(d=>d.tipo==='unico_sin_confirmar').length,
      candidatos_ambiguos:candidatos.filter(d=>d.tipo==='ambiguo').length,
      alegra_impuestos_incompletos:remotas.filter(d=>dentro(d,p) && d.impuesto_lineas==null).length},
    mensual:[...mensual.values()].sort((a,b)=>`${a.mes}:${a.moneda}:${a.estado}`.localeCompare(`${b.mes}:${b.moneda}:${b.estado}`)),
    diferencias,incidencias,candidatos,sin_diferencias:diferencias.length===0 && incidencias.length===0 && candidatos.length===0};
}

async function ejecutar({pool,client,p,avisar=()=>{}}) {
  periodo(p.desde,p.hasta);
  const iniciada_en=new Date().toISOString(); // Instante de auditoría, no fecha de negocio.
  const lectura={get:(e,params)=>getLectura(client,e,params,avisar)};
  const remotas=await leerCompras(lectura,p,avisar), propias=await leerBaseCompras(pool);
  const leidas=new Set(remotas.map(d=>d.alegra_bill_id));
  const extra=new Set(propias.filter(d=>dentro(d,p) && d.alegra_bill_id!=null && !leidas.has(d.alegra_bill_id)).map(d=>d.alegra_bill_id));
  for (const id of extra) {
    const r=await lectura.get(`/bills/${id}`,{});
    if (!r?.success && r?.status===404) continue; // Ausencia comprobada; queda como diferencia.
    if (!r?.success || !r.data || String(r.data.id)!==id) throw new ErrorConciliacion('No se pudo verificar el vínculo histórico de una compra.');
    remotas.push(compraAlegra(r.data));
  }
  const informe=conciliar(remotas,propias,p);
  informe.lectura={iniciada_en,terminada_en:new Date().toISOString()};
  return informe;
}

module.exports={normalizar,compraAlegra,leerCompras,leerBaseCompras,conciliar,ejecutar};

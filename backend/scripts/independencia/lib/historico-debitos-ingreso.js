/**
 * Archivo histórico con destino propio para los créditos. Solo copia el
 * origen: no emite un débito, no lo convierte en factura, no crea deuda ni
 * cambia el saldo del mostrador. Las líneas/referencias quedan en el JSON.
 */
const { ErrorConciliacion, fechaValida, escalado, leerPaginas } = require('./conciliacion-ventas');
const { getLectura } = require('./conciliacion-cobros');
const { notaAlegra, completarDetalleNota } = require('./conciliacion-notas-credito');
const { ESTADOS } = require('../../../src/modules/facturacion/desdeAlegra');
const CAMPOS = ['numero','fecha','estado','moneda','subtotal','descuento','impuesto','total','original'];
const dinero = (v,campo) => escalado(v,2,campo)/100;

function debitoDesdeAlegra(d) {
  if (!d || !/^\d{1,20}$/.test(String(d.id || '')) || !fechaValida(d.date) || !ESTADOS[d.status] ||
    d.numberTemplate?.documentType !== 'incomeDebitNote' || !Array.isArray(d.items)) throw new ErrorConciliacion('Débito de ingreso con identidad, tipo, fecha, estado o líneas inválidos.');
  const moneda=String(d.currency?.code || 'CRC').trim();
  if (!/^[A-Z]{3}$/.test(moneda)) throw new ErrorConciliacion('Moneda inválida en débito histórico.');
  for (const l of d.items) {
    for (const k of ['quantity','price','discount','total']) escalado(l[k],5,k);
    if (!Array.isArray(l.tax)) throw new ErrorConciliacion('Impuestos ausentes en línea de débito histórico.');
    for (const t of l.tax) { escalado(t.percentage,3,'tarifa'); escalado(t.amount,2,'impuesto de línea'); }
  }
  const total=dinero(d.total,'total');
  if (total<0) throw new ErrorConciliacion('Débito con total negativo no soportado.');
  // balance/totalPaid quedan exclusivamente como parte de la foto original.
  // No se transforman en una columna que alguien tome por deuda actual.
  dinero(d.balance,'balance histórico'); dinero(d.totalPaid,'totalPaid histórico');
  const numero=d.numberTemplate.fullNumber || d.numberTemplate.formattedNumber || null;
  if (numero!=null && (typeof numero!=='string' || numero.length>40)) throw new ErrorConciliacion('Número de débito inválido.');
  return {alegra_id:String(d.id),numero,fecha:d.date,estado:ESTADOS[d.status],moneda,
    subtotal:dinero(d.subtotal,'subtotal'),descuento:dinero(d.discount,'descuento'),impuesto:dinero(d.tax,'impuesto'),total,
    original:JSON.parse(JSON.stringify(d))};
}

async function leerHistorico(client,avisar=()=>{}) {
  const lectura={get:(e,p)=>getLectura(client,e,p,avisar)};
  const debitos=(await leerPaginas(lectura,'/income-debit-notes',{},avisar)).map(debitoDesdeAlegra);
  const porId=new Map(debitos.map(d=>[d.alegra_id,d]));
  const notas=[];
  for (const original of await leerPaginas(lectura,'/credit-notes',{},avisar)) {
    const normalizada=notaAlegra(original);
    const completa=await completarDetalleNota(lectura,normalizada) || original;
    const aplicado=[...normalizada.aplicaciones,...normalizada.otros_destinos].reduce((s,a)=>s+a.monto,0);
    if (!Number.isSafeInteger(aplicado) || aplicado!==normalizada.total_aplicado || aplicado>normalizada.total) throw new ErrorConciliacion('Detalle de crédito incompleto o excedido; revisar el origen antes de cargar.');
    for (const v of normalizada.otros_destinos) {
      const d=porId.get(v.alegra_id);
      if (!d) throw new ErrorConciliacion('El crédito refiere un débito ausente en el origen; no se cargó nada.');
      if (d.moneda!=='CRC') throw new ErrorConciliacion('Crédito a débito extranjero: nota_credito aún no guarda moneda.');
      if (v.monto>escalado(d.total,2,'total de débito')) throw new ErrorConciliacion('El crédito supera el importe del débito; revisar el origen.');
    }
    notas.push({original:completa,normalizada});
  }
  return {debitos,notas};
}

async function exigirMigracion(client) {
  const {rows}=await client.query("SELECT to_regclass('debito_ingreso_historico') AS debitos, to_regclass('nota_credito_debito_ingreso') AS aplicaciones");
  if (!rows[0]?.debitos || !rows[0]?.aplicaciones) throw new ErrorConciliacion('Aplicar la migración 040 antes de copiar los débitos históricos.');
  // Los dos cargadores escriben estas mismas notas/archivos. Serializar sus
  // transacciones evita duplicar un destino o tomar los candados al revés.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('independencia:carga-notas-historicas'))");
}

async function guardarDebitos(client,debitos) {
  const mapa=new Map();
  for (const d of debitos) {
    const valores=CAMPOS.map(k=>k==='original'?JSON.stringify(d[k]):d[k]);
    const previo=(await client.query('SELECT id FROM debito_ingreso_historico WHERE alegra_id=$1 FOR UPDATE',[d.alegra_id])).rows[0];
    let id=previo?.id;
    if (previo) {
      // Sin churn de timestamps/secuencias al repetir una copia idéntica.
      const nuevos=CAMPOS.map((_,i)=>`$${i+2}${CAMPOS[i]==='original'?'::jsonb':''}`);
      await client.query(`UPDATE debito_ingreso_historico SET ${CAMPOS.map((k,i)=>`${k}=${nuevos[i]}`).join(',')},
        actualizado_en=now() AT TIME ZONE 'America/Costa_Rica'
        WHERE id=$1 AND ROW(${CAMPOS.join(',')}) IS DISTINCT FROM ROW(${nuevos.join(',')})`,[id,...valores]);
    } else {
      id=(await client.query(`INSERT INTO debito_ingreso_historico (alegra_id,${CAMPOS.join(',')})
        VALUES (${[d.alegra_id,...valores].map((_,i)=>`$${i+1}`).join(',')}) RETURNING id`,[d.alegra_id,...valores])).rows[0].id;
    }
    mapa.set(d.alegra_id,id);
  }
  return mapa;
}

async function guardarAplicacionesDebito(client,notaId,nota,debitos) {
  const previas=(await client.query('SELECT id,debito_ingreso_id,monto FROM nota_credito_debito_ingreso WHERE nota_credito_id=$1 FOR UPDATE',[notaId])).rows;
  const porId=new Map(previas.map(a=>[a.debito_ingreso_id,a]));
  const destinos=new Set();
  for (const a of nota.otros_destinos) {
    const id=debitos.get(a.alegra_id);
    if (id==null) throw new ErrorConciliacion('No existe el débito propio que acredita esta nota.');
    destinos.add(id);
    if (porId.has(id)) await client.query('UPDATE nota_credito_debito_ingreso SET monto=$2 WHERE id=$1 AND monto IS DISTINCT FROM $2',[porId.get(id).id,a.monto/100]);
    else await client.query('INSERT INTO nota_credito_debito_ingreso (nota_credito_id,debito_ingreso_id,monto) VALUES ($1,$2,$3)',[notaId,id,a.monto/100]);
  }
  for (const a of previas) if (!destinos.has(a.debito_ingreso_id)) await client.query('DELETE FROM nota_credito_debito_ingreso WHERE id=$1',[a.id]);
}

/** Completar SOLO estos destinos, sin reimportar cabeceras/líneas de crédito. */
async function cargarHistorico({pool,client,avisar=()=>{}}) {
  const historico=await leerHistorico(client,avisar), db=await pool.connect();
  try {
    await db.query('BEGIN'); await exigirMigracion(db);
    const propias=(await db.query(`SELECT n.id,n.alegra_id,n.fecha::text AS fecha,n.estado,n.total,n.total_aplicado,
      EXISTS(SELECT 1 FROM nota_credito_debito_ingreso a WHERE a.nota_credito_id=n.id) AS tiene_debitos
      FROM nota_credito n WHERE n.alegra_id IS NOT NULL ORDER BY n.id FOR UPDATE OF n`)).rows;
    const porId=new Map(propias.map(n=>[n.alegra_id,n]));
    const elegidas=[];
    for (const {normalizada:n} of historico.notas) {
      const propia=porId.get(n.alegra_id);
      if (!n.otros_destinos.length && !propia?.tiene_debitos) continue;
      if (!propia) throw new ErrorConciliacion('Cargar primero la nota de crédito que refiere el débito.');
      if (propia.fecha!==n.fecha || propia.estado!==n.estado || escalado(propia.total,2,'total local')!==n.total ||
        escalado(propia.total_aplicado,2,'aplicado local')!==n.total_aplicado) throw new ErrorConciliacion('La cabecera de crédito difiere del origen; revisar la copia antes de completar el destino.');
      elegidas.push({id:propia.id,nota:n});
    }
    const mapa=await guardarDebitos(db,historico.debitos);
    for (const n of elegidas) await guardarAplicacionesDebito(db,n.id,n.nota,mapa);
    await db.query('COMMIT');
    return {debitos:mapa.size,notas_con_destino_revisadas:elegidas.length,aplicaciones:elegidas.reduce((s,n)=>s+n.nota.otros_destinos.length,0)};
  } catch(e) {await db.query('ROLLBACK');throw e;}
  finally {db.release();}
}

module.exports={debitoDesdeAlegra,leerHistorico,exigirMigracion,guardarDebitos,guardarAplicacionesDebito,cargarHistorico};

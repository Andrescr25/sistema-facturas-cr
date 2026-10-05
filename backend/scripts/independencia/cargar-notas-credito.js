/**
 * Carga las notas de crédito de Alegra en la base propia
 * (rama independencia-alegra).
 *
 * LEE de Alegra (solo GET) y ESCRIBE en la base local. Se puede correr las
 * veces que haga falta: actualiza por `alegra_id` y reemplaza las líneas y las
 * facturas y débitos de ingreso acreditados. Migración 040 requerida.
 *
 * Requiere cargadas antes las facturas: una nota que no encuentra su factura
 * se guarda igual, pero no acredita nada.
 *
 * Uso:  node scripts/independencia/cargar-notas-credito.js
 */
const { notaDesdeAlegra } = require('../../src/modules/facturacion/notaDesdeAlegra');
const { leerHistorico, exigirMigracion, guardarDebitos, guardarAplicacionesDebito } = require('./lib/historico-debitos-ingreso');
const { ErrorConciliacion } = require('./lib/conciliacion-ventas');
const { mensajeSeguro } = require('./conciliar-ventas');

const NOTA = [
  'serie', 'consecutivo', 'numero', 'electronica', 'clave_hacienda', 'estado', 'fecha',
  'cliente_id', 'cliente_nombre', 'cliente_identificacion', 'motivo', 'motivo_texto',
  'subtotal', 'descuento', 'impuesto', 'total', 'total_aplicado', 'saldo',
  'observaciones', 'alegra_id'
];

const LINEA = [
  'nota_credito_id', 'numero_linea', 'producto_id', 'nombre', 'referencia', 'descripcion', 'cabys', 'unidad',
  'cantidad', 'precio_unitario', 'descuento_porcentaje', 'descuento_monto',
  'impuesto_id', 'tarifa', 'impuesto_monto', 'total', 'alegra_item_id'
];

const SENTENCIA_NOTA = `
  INSERT INTO nota_credito (${NOTA.join(', ')})
  VALUES (${NOTA.map((_, i) => `$${i + 1}`).join(', ')})
  ON CONFLICT (alegra_id) DO UPDATE SET
    ${NOTA.filter(c => c !== 'alegra_id').map(c => `${c} = EXCLUDED.${c}`).join(', ')},
    actualizado_en = CURRENT_TIMESTAMP
  RETURNING id`;

const SENTENCIA_LINEA = `
  INSERT INTO nota_credito_linea (${LINEA.join(', ')})
  VALUES (${LINEA.map((_, i) => `$${i + 1}`).join(', ')})`;

async function contextoDe(cliente) {
  const [cl, pr, im, fa] = await Promise.all([
    cliente.query('SELECT id, alegra_id FROM cliente WHERE alegra_id IS NOT NULL'),
    cliente.query('SELECT id, alegra_id FROM producto WHERE alegra_id IS NOT NULL'),
    cliente.query('SELECT id, alegra_id FROM impuesto WHERE alegra_id IS NOT NULL'),
    cliente.query('SELECT id, alegra_id FROM factura WHERE alegra_id IS NOT NULL')
  ]);
  return {
    clientes: new Map(cl.rows.map(r => [String(r.alegra_id), r.id])),
    productos: new Map(pr.rows.map(r => [String(r.alegra_id), r.id])),
    impuestos: new Map(im.rows.map(r => [String(r.alegra_id), r.id])),
    facturas: new Map(fa.rows.map(r => [String(r.alegra_id), r.id]))
  };
}

async function cargarNotas({pool,client,avisar=()=>{}}) {
  // Completar el detalle omitido ANTES de escribir. Un GET incompleto no
  // puede borrar aplicaciones que ya teníamos, ni dejar una carga a medias.
  const historico=await leerHistorico(client,avisar);
  const conteo = { notas: 0, lineas: 0, acreditadas: 0, debitos:historico.debitos.length, aplicaciones_debito:0, monto: 0, motivos: {}, avisos: {} };
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await exigirMigracion(cliente);
    const contexto=await contextoDe(cliente);
    if(contexto.facturas.size===0) throw new ErrorConciliacion('No hay facturas cargadas; cargar-facturas.js va primero.');
    const debitos=await guardarDebitos(cliente,historico.debitos);
    for (const {original,normalizada} of historico.notas) {
      const { fila, lineas, aplicaciones, avisos } = notaDesdeAlegra(original, contexto);

      const { rows } = await cliente.query(SENTENCIA_NOTA, NOTA.map(c => fila[c]));
      const notaId = rows[0].id;

      await cliente.query('DELETE FROM nota_credito_linea WHERE nota_credito_id = $1', [notaId]);
      for (const linea of lineas) {
        await cliente.query(SENTENCIA_LINEA, LINEA.map(c => (c === 'nota_credito_id' ? notaId : linea[c])));
      }

      await cliente.query('DELETE FROM nota_credito_factura WHERE nota_credito_id = $1', [notaId]);
      for (const a of aplicaciones) {
        await cliente.query(
          'INSERT INTO nota_credito_factura (nota_credito_id, factura_id, factura_numero, monto) VALUES ($1, $2, $3, $4)',
          [notaId, a.factura_id, a.factura_numero, a.monto]
        );
      }
      await guardarAplicacionesDebito(cliente,notaId,normalizada,debitos);

      conteo.notas++;
      conteo.lineas += lineas.length;
      conteo.acreditadas += aplicaciones.length;
      conteo.aplicaciones_debito += normalizada.otros_destinos.length;
      conteo.monto += fila.total;
      if (fila.motivo) conteo.motivos[fila.motivo] = (conteo.motivos[fila.motivo] || 0) + 1;
      for (const x of avisos) conteo.avisos[x] = (conteo.avisos[x] || 0) + 1;
    }
    // Numeradores y documentos son una sola carga: un fallo de series no
    // puede dejar notas ya confirmadas. GREATEST conserva números nativos.
    const series=await cliente.query(`UPDATE serie_consecutivo s SET siguiente=GREATEST(s.siguiente,m.maximo+1)
      FROM (SELECT serie,MAX(consecutivo) AS maximo FROM nota_credito
        WHERE serie IS NOT NULL AND consecutivo IS NOT NULL GROUP BY serie) m WHERE m.serie=s.serie
      RETURNING s.serie,s.siguiente`);
    conteo.series=series.rows;
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  return conteo;
}

async function main() {
  require('dotenv').config({path:require('path').join(__dirname,'../../.env'),quiet:true});
  require('../../config/aislado').asegurarBaseLocal();
  const {pool}=require('../../config/database');
  try {
    const client=require('./lib/lectura-alegra').getInstance();
    console.log(JSON.stringify(await cargarNotas({pool,client,avisar:console.log})));
  } finally {await pool.end();}
}
if(require.main===module) main().catch(e=>{console.error(`Carga de notas no confirmada: ${mensajeSeguro(e)}`);process.exitCode=1;});
module.exports={cargarNotas};

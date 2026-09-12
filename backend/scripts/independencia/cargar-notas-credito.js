/**
 * Carga las notas de crédito de Alegra en la base propia
 * (rama independencia-alegra).
 *
 * LEE de Alegra (solo GET) y ESCRIBE en la base local. Se puede correr las
 * veces que haga falta: actualiza por `alegra_id` y reemplaza las líneas y las
 * facturas acreditadas.
 *
 * Requiere cargadas antes las facturas: una nota que no encuentra su factura
 * se guarda igual, pero no acredita nada.
 *
 * Uso:  node scripts/independencia/cargar-notas-credito.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { pool } = require('../../config/database');
const { getClient } = require('../../src/integrations/alegra');
const { notaDesdeAlegra } = require('../../src/modules/facturacion/notaDesdeAlegra');

const alegra = getClient();
const PAGINA = 30;

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

async function main() {
  const inicio = Date.now();
  const contexto = await contextoDe(pool);
  if (contexto.facturas.size === 0) throw new Error('No hay facturas cargadas: corra antes cargar-facturas.js');

  const notas = [];
  for (let start = 0; ; start += PAGINA) {
    const r = await alegra.get('/credit-notes', { start, limit: PAGINA });
    if (r?.success === false) throw new Error(`Alegra /credit-notes: ${r.status} ${r.data?.message || r.error}`);
    const pagina = r.data ?? r;
    if (!Array.isArray(pagina)) throw new Error('Alegra /credit-notes devolvió algo que no es una lista');
    notas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  console.log(`→ Leídas de Alegra: ${notas.length} notas de crédito`);

  const conteo = { notas: 0, lineas: 0, acreditadas: 0, monto: 0, motivos: {}, avisos: {} };
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    for (const notaAlegra of notas) {
      const { fila, lineas, aplicaciones, avisos } = notaDesdeAlegra(notaAlegra, contexto);

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

      conteo.notas++;
      conteo.lineas += lineas.length;
      conteo.acreditadas += aplicaciones.length;
      conteo.monto += fila.total;
      if (fila.motivo) conteo.motivos[fila.motivo] = (conteo.motivos[fila.motivo] || 0) + 1;
      for (const x of avisos) conteo.avisos[x] = (conteo.avisos[x] || 0) + 1;
    }
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  const segundos = Math.round((Date.now() - inicio) / 1000);
  console.log(`✓ Notas de crédito: ${conteo.notas} por ₡${conteo.monto.toLocaleString('es-CR')}, con ${conteo.lineas} líneas, acreditando ${conteo.acreditadas} facturas, en ${segundos} s.`);
  console.log('  Por motivo:', JSON.stringify(conteo.motivos));
  console.log('  Avisos:', Object.keys(conteo.avisos).length ? JSON.stringify(conteo.avisos) : 'ninguno');
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✗ No se cargaron las notas de crédito:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });

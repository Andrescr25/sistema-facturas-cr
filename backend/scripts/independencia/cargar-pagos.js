/**
 * Carga los cobros a clientes de Alegra en la base propia
 * (rama independencia-alegra).
 *
 * LEE de Alegra (solo GET) y ESCRIBE en la base local. Se puede correr las
 * veces que haga falta: actualiza por `alegra_id` y reemplaza a qué facturas
 * se aplicó cada cobro.
 *
 * Requiere cargadas antes las facturas (cargar-facturas.js) y los contactos:
 * un cobro sin su factura no puede bajar ningún saldo.
 *
 * Los pagos a proveedor (`type: 'out'`) NO se copian acá: son cuentas por
 * pagar y tienen su propia sección.
 *
 * Uso:  node scripts/independencia/cargar-pagos.js [--limite=100]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { pool } = require('../../config/database');
const { getClient } = require('../../src/integrations/alegra');
const { pagoDesdeAlegra, esCobro } = require('../../src/modules/cobros/desdeAlegra');

const alegra = getClient();
const PAGINA = 30;

const PAGO = [
  'numero', 'fecha', 'cliente_id', 'cliente_nombre', 'metodo_pago_id', 'metodo_pago_texto',
  'cuenta_dinero_id', 'cuenta_texto', 'referencia', 'monto', 'observaciones',
  'anulado', 'motivo_anulacion', 'alegra_id'
];

const SENTENCIA_PAGO = `
  INSERT INTO pago (${PAGO.join(', ')})
  VALUES (${PAGO.map((_, i) => `$${i + 1}`).join(', ')})
  ON CONFLICT (alegra_id) DO UPDATE SET
    ${PAGO.filter(c => c !== 'alegra_id').map(c => `${c} = EXCLUDED.${c}`).join(', ')},
    actualizado_en = CURRENT_TIMESTAMP
  RETURNING id`;

async function contextoDe(cliente) {
  const [cl, me, cu, fa] = await Promise.all([
    cliente.query('SELECT id, alegra_id FROM cliente WHERE alegra_id IS NOT NULL'),
    cliente.query('SELECT id, alegra_clave FROM metodo_pago WHERE alegra_clave IS NOT NULL'),
    cliente.query('SELECT id, alegra_id FROM cuenta_dinero WHERE alegra_id IS NOT NULL'),
    cliente.query('SELECT id, alegra_id FROM factura WHERE alegra_id IS NOT NULL')
  ]);

  // En los pagos el método llega en minúsculas ("cash") y en las facturas en
  // mayúsculas ("CASH"): se aceptan las dos.
  const metodos = new Map();
  for (const r of me.rows) {
    metodos.set(String(r.alegra_clave), r.id);
    metodos.set(String(r.alegra_clave).toUpperCase(), r.id);
  }

  return {
    clientes: new Map(cl.rows.map(r => [String(r.alegra_id), r.id])),
    metodos,
    cuentas: new Map(cu.rows.map(r => [String(r.alegra_id), r.id])),
    facturas: new Map(fa.rows.map(r => [String(r.alegra_id), r.id]))
  };
}

/**
 * Alegra a veces tarda más de 30 segundos en devolver una página y el cliente
 * corta. Sin reintento, esa sola página aborta la carga entera: la primera
 * corrida se detuvo en la página 900 de 1.349 por un timeout.
 *
 * Reintentar es seguro porque leer no cambia nada allá, y volver a cargar lo
 * mismo acá tampoco: el upsert es por `alegra_id`.
 */
async function leerPagina(start, intentos = 4) {
  for (let intento = 1; ; intento++) {
    try {
      const r = await alegra.get('/payments', { start, limit: PAGINA });
      if (r?.success === false) throw new Error(`Alegra /payments: ${r.status} ${r.data?.message || r.error}`);
      const pagina = r.data ?? r;
      if (!Array.isArray(pagina)) throw new Error('Alegra /payments devolvió algo que no es una lista');
      return pagina;
    } catch (error) {
      if (intento >= intentos) throw error;
      const espera = 3000 * intento;
      // Solo el mensaje: el volcado completo del error de axios trae la URL
      // con la credencial adentro.
      console.log(`  ⚠️ ${error.message} — reintento ${intento} de ${intentos - 1} en ${espera / 1000} s`);
      await new Promise(seguir => setTimeout(seguir, espera));
    }
  }
}

async function guardarPagina(pagos, contexto, conteo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    for (const pagoAlegra of pagos) {
      if (!esCobro(pagoAlegra)) { conteo.saltados++; continue; }

      const { fila, aplicaciones, avisos } = pagoDesdeAlegra(pagoAlegra, contexto);
      const { rows } = await cliente.query(SENTENCIA_PAGO, PAGO.map(c => fila[c]));
      const pagoId = rows[0].id;

      await cliente.query('DELETE FROM pago_factura WHERE pago_id = $1', [pagoId]);
      for (const a of aplicaciones) {
        await cliente.query(
          'INSERT INTO pago_factura (pago_id, factura_id, factura_numero, monto) VALUES ($1, $2, $3, $4)',
          [pagoId, a.factura_id, a.factura_numero, a.monto]
        );
      }

      conteo.pagos++;
      conteo.aplicaciones += aplicaciones.length;
      conteo.monto += fila.monto;
      for (const x of avisos) conteo.avisos[x] = (conteo.avisos[x] || 0) + 1;
    }
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

async function main() {
  const inicio = Date.now();
  const encontrado = process.argv.find(a => a.startsWith('--limite='));
  const limite = encontrado ? Number(encontrado.split('=')[1]) : null;

  const contexto = await contextoDe(pool);
  if (contexto.facturas.size === 0) throw new Error('No hay facturas cargadas: corra antes cargar-facturas.js');

  const conteo = { pagos: 0, saltados: 0, aplicaciones: 0, monto: 0, avisos: {} };

  // `--desde=` permite retomar donde se cortó una corrida anterior, sin volver
  // a leer de Alegra lo que ya está guardado.
  const desdeArg = process.argv.find(a => a.startsWith('--desde='));
  const desde = desdeArg ? Number(desdeArg.split('=')[1]) || 0 : 0;
  if (desde) console.log(`→ Retomando desde el cobro ${desde}`);

  for (let start = desde; ; start += PAGINA) {
    const pagina = await leerPagina(start);
    if (pagina.length === 0) break;
    const recorte = limite ? pagina.slice(0, Math.max(0, limite - conteo.pagos)) : pagina;
    await guardarPagina(recorte, contexto, conteo);
    if (conteo.pagos % 300 < PAGINA) console.log(`  ${conteo.pagos} cobros…`);
    if (pagina.length < PAGINA) break;
    if (limite && conteo.pagos >= limite) break;
  }

  const segundos = Math.round((Date.now() - inicio) / 1000);
  console.log(`✓ Cobros cargados: ${conteo.pagos} por ₡${conteo.monto.toLocaleString('es-CR')}, aplicados a ${conteo.aplicaciones} facturas, en ${segundos} s.`);
  if (conteo.saltados) console.log(`  ${conteo.saltados} eran pagos a proveedor y no se copiaron.`);
  console.log('  Avisos:', Object.keys(conteo.avisos).length ? JSON.stringify(conteo.avisos) : 'ninguno');
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✗ No se cargaron los cobros:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });

/**
 * Carga las facturas de venta de Alegra en la base propia
 * (rama independencia-alegra).
 *
 * LEE de Alegra (solo GET) y ESCRIBE en la base local. Se puede correr las
 * veces que haga falta: actualiza por `alegra_id` y reemplaza las líneas de
 * cada factura que vuelve a cargar.
 *
 * Requiere cargados antes: configuración (impuestos, plazos, métodos de pago),
 * productos y contactos. Lo que no calce se carga igual y se cuenta como
 * aviso: una factura de hace dos años puede apuntar a un cliente que ya se
 * borró en Alegra, y perderla sería peor que guardarla incompleta.
 *
 * Cada página se guarda en su propia transacción. Leer las 5.398 toma varios
 * minutos y dejar una transacción abierta todo ese rato bloquearía la base
 * para nada; así, si algo falla, lo ya cargado queda.
 *
 * Uso:  node scripts/independencia/cargar-facturas.js [--limite=100]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { pool } = require('../../config/database');
const { getClient } = require('./lib/lectura-alegra');
const { facturaDesdeAlegra } = require('../../src/modules/facturacion/desdeAlegra');

const alegra = getClient();
const PAGINA = 30;

const FACTURA = [
  'tipo_documento', 'serie', 'consecutivo', 'numero', 'electronica', 'clave_hacienda', 'estado',
  'hacienda_estado', 'hacienda_origen', 'plantilla_electronica',
  'fecha', 'fecha_vencimiento', 'emitida_en',
  'cliente_id', 'cliente_nombre', 'cliente_tipo_identificacion', 'cliente_identificacion', 'cliente_correo',
  'condicion_venta', 'plazo_credito_id', 'plazo_texto', 'metodo_pago_id', 'metodo_pago_texto',
  'moneda', 'subtotal', 'descuento', 'impuesto', 'total', 'total_pagado', 'saldo',
  'observaciones', 'anotaciones', 'vendedor', 'actividad_economica', 'anulada_por_nota', 'motivo_anulacion',
  'alegra_id'
];

const LINEA = [
  'factura_id', 'numero_linea', 'producto_id', 'nombre', 'referencia', 'descripcion', 'cabys', 'unidad',
  'cantidad', 'precio_unitario', 'descuento_porcentaje', 'descuento_monto',
  'impuesto_id', 'tarifa', 'impuesto_monto', 'total', 'alegra_item_id'
];

const SENTENCIA_FACTURA = `
  INSERT INTO factura (${FACTURA.join(', ')})
  VALUES (${FACTURA.map((_, i) => `$${i + 1}`).join(', ')})
  ON CONFLICT (alegra_id) DO UPDATE SET
    ${FACTURA.filter(c => c !== 'alegra_id').map(c => `${c} = EXCLUDED.${c}`).join(', ')},
    actualizado_en = CURRENT_TIMESTAMP
  RETURNING id`;

const SENTENCIA_LINEA = `
  INSERT INTO factura_linea (${LINEA.join(', ')})
  VALUES (${LINEA.map((_, i) => `$${i + 1}`).join(', ')})`;

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Los mapas que traducen los ids de Alegra a los propios. */
async function contextoDe(cliente) {
  const [cl, pr, im, pl, me] = await Promise.all([
    cliente.query('SELECT id, alegra_id FROM cliente WHERE alegra_id IS NOT NULL'),
    cliente.query('SELECT id, alegra_id FROM producto WHERE alegra_id IS NOT NULL'),
    cliente.query('SELECT id, alegra_id FROM impuesto WHERE alegra_id IS NOT NULL'),
    cliente.query('SELECT id, nombre FROM plazo_credito'),
    cliente.query('SELECT id, alegra_clave FROM metodo_pago WHERE alegra_clave IS NOT NULL')
  ]);

  // Alegra manda el método en mayúsculas ("CASH") y la tabla lo guarda como
  // viene de su catálogo ("cash", "SINPE_MOVIL"): se aceptan las dos grafías.
  const metodos = new Map();
  for (const r of me.rows) {
    metodos.set(String(r.alegra_clave), r.id);
    metodos.set(String(r.alegra_clave).toUpperCase(), r.id);
  }

  return {
    clientes: new Map(cl.rows.map(r => [String(r.alegra_id), r.id])),
    productos: new Map(pr.rows.map(r => [String(r.alegra_id), r.id])),
    impuestos: new Map(im.rows.map(r => [String(r.alegra_id), r.id])),
    plazos: new Map(pl.rows.map(r => [normalizar(r.nombre), r.id])),
    metodos
  };
}

async function leerPagina(start) {
  const r = await alegra.get('/invoices', { start, limit: PAGINA });
  if (r?.success === false) throw new Error(`Alegra /invoices: ${r.status} ${r.data?.message || r.error}`);
  const pagina = r.data ?? r;
  if (!Array.isArray(pagina)) throw new Error('Alegra /invoices devolvió algo que no es una lista');
  return pagina;
}

async function guardarPagina(facturas, contexto, conteo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    for (const facturaAlegra of facturas) {
      const { fila, lineas, avisos } = facturaDesdeAlegra(facturaAlegra, contexto);

      const { rows } = await cliente.query(SENTENCIA_FACTURA, FACTURA.map(c => fila[c]));
      const facturaId = rows[0].id;

      // Se reemplazan: una factura corregida en Alegra puede tener menos
      // líneas que antes, y actualizar una por una dejaría las sobrantes.
      await cliente.query('DELETE FROM factura_linea WHERE factura_id = $1', [facturaId]);
      for (const linea of lineas) {
        await cliente.query(SENTENCIA_LINEA, LINEA.map(c => (c === 'factura_id' ? facturaId : linea[c])));
      }

      conteo.facturas++;
      conteo.lineas += lineas.length;
      conteo.estados[fila.estado] = (conteo.estados[fila.estado] || 0) + 1;
      conteo.tipos[fila.tipo_documento] = (conteo.tipos[fila.tipo_documento] || 0) + 1;
      for (const a of avisos) conteo.avisos[a] = (conteo.avisos[a] || 0) + 1;
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
  const argumento = (nombre) => {
    const encontrado = process.argv.find(a => a.startsWith(`--${nombre}=`));
    return encontrado ? Number(encontrado.split('=')[1]) : null;
  };
  const limite = argumento('limite');

  await require('../../src/integrations/hacienda/historico').normalizarSeriesHistoricas(pool,'factura');
  const contexto = await contextoDe(pool);
  if (contexto.clientes.size === 0) throw new Error('No hay clientes cargados: corra antes cargar-contactos.js');
  if (contexto.productos.size === 0) throw new Error('No hay productos cargados: corra antes cargar-productos.js');

  const conteo = { facturas: 0, lineas: 0, estados: {}, tipos: {}, avisos: {} };

  for (let start = 0; ; start += PAGINA) {
    const pagina = await leerPagina(start);
    if (pagina.length === 0) break;
    const recorte = limite ? pagina.slice(0, Math.max(0, limite - conteo.facturas)) : pagina;
    await guardarPagina(recorte, contexto, conteo);

    if (conteo.facturas % 300 < PAGINA) {
      console.log(`  ${conteo.facturas} facturas…`);
    }
    if (pagina.length < PAGINA) break;
    if (limite && conteo.facturas >= limite) break;
  }

  // LA SERIE SIGUE DESDE LO COPIADO. Mientras `main` factura en Alegra, la
  // serie propia se queda donde se sembró (4869) y Alegra sigue numerando: con
  // la copia del 23 de setiembre ya iba en la 4936. Sin esto, la primera
  // factura propia después del corte choca con la UNIQUE (tipo, serie,
  // consecutivo) y el mostrador se queda sin poder facturar. GREATEST: nunca
  // retrocede, así que correr la carga otra vez no reusa números.
  const series = await pool.query(`
    UPDATE serie_consecutivo s
       SET siguiente = GREATEST(s.siguiente, m.maximo + 1)
      FROM (SELECT serie, MAX(consecutivo) AS maximo
              FROM factura
             WHERE serie IS NOT NULL AND consecutivo IS NOT NULL
             GROUP BY serie) m
     WHERE m.serie = s.serie
     RETURNING s.serie, s.siguiente`);

  const segundos = Math.round((Date.now() - inicio) / 1000);
  console.log(`✓ Facturas cargadas: ${conteo.facturas} con ${conteo.lineas} líneas en ${segundos} s.`);
  console.log('  Próximo número por serie:', series.rows.map((r) => `${r.serie} → ${r.siguiente}`).join(', ') || 'ninguna serie calzó');
  console.log('  Por estado:', JSON.stringify(conteo.estados));
  console.log('  Por tipo:', JSON.stringify(conteo.tipos));
  console.log('  Avisos:', Object.keys(conteo.avisos).length ? JSON.stringify(conteo.avisos) : 'ninguno');
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✗ No se cargaron las facturas:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });

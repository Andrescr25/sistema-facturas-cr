const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

/**
 * Dos reglas de la migración sobre las tablas, medidas contra la base local
 * y contra el código, para que sigan siendo ciertas.
 *
 * 1. IDS PROPIOS EN TODA TABLA NUEVA (sección 0 del checklist). Cada tabla
 *    que crea una migración de `independencia/` tiene su propia llave `id`, y
 *    ningún id de Alegra es obligatorio: una fila tiene que poder nacer acá,
 *    sin ficha allá. Un `alegra_id NOT NULL` es una tabla que deja de servir
 *    el día que Alegra no esté. Es la regla que más cuesta arreglar después —
 *    `supplier_product_mapping.alegra_item_id` nació obligatoria y hoy guarda
 *    un texto vacío para los productos propios, porque el cliente de Prisma
 *    la declara así y no se puede regenerar.
 *
 * 2. LAS TABLAS RETIRADAS NO VUELVEN A USARSE (sección 16). A medida que cada
 *    módulo pasó a la base propia quedaron tablas viejas —espejos de Alegra,
 *    fotos calculadas a mano, la lista vieja de proveedores— que ya no lee ni
 *    escribe nadie. Siguen en la base hasta el corte. La lista es cerrada: si
 *    alguien vuelve a consultarlas, falla acá y no en producción con datos de
 *    hace meses.
 */

const BACKEND = path.join(__dirname, '..');

/**
 * Las únicas columnas de Alegra obligatorias en una tabla nueva, y por qué.
 * Agregar una acá es una decisión, no un trámite.
 */
const ALEGRA_OBLIGATORIO_A_PROPOSITO = [
  // El documento histórico de Alegra guardado tal cual: su identidad ES el id
  // de allá (docs/grafo/modulo/historico-debitos-ingreso.md).
  'debito_ingreso_historico.alegra_id'
];

/**
 * Tablas que ya no consulta el código de la aplicación (medido el 2026-10-04).
 * Los `scripts/` de carga y conciliación y la integración de Alegra quedan
 * fuera de la cuenta: leen de donde haga falta hasta el corte.
 */
const TABLAS_RETIRADAS = [
  'alegra_products_cache',   // inventario usa producto y kardex propios
  'venta_items',             // excesos consultan venta_linea
  'abonos_cobro',            // el espejo viejo de los pagos de Alegra
  'cuentas_por_cobrar',      // el espejo viejo de la cartera de Alegra
  'factura_items',           // líneas de la copia vieja de facturas
  'facturas',                // la copia vieja de facturas de Alegra (Bodega la usaba)
  'facturas_pendientes',     // la cola vieja de reimpresión
  'faltantes_historico',
  'margen_snapshot',         // fotos del margen; Rentabilidad calcula en vivo
  'producto_rotacion',       // foto de la rotación; ventas/rotacion.js calcula en vivo
  'rotacion_productos',
  'productos',               // la copia vieja del catálogo de Alegra (no es `producto`)
  'proveedores',             // la lista vieja, sin cédula (no es `proveedor`)
  'proveedor_contactos',     // el WhatsApp del proveedor por NOMBRE; hoy va en su ficha
  'venta_historico',         // el histórico de ventas copiado de Alegra; hoy es `venta_linea`
  'temp_factura_mapping',
  'competencia_mapping', 'competencia_rechazo', 'precio_competencia',
  'configuracion_semanal'
];

function archivosDe(...carpetas) {
  const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : recorrer(ruta);
    return e.name.endsWith('.js') ? [ruta] : [];
  });
  return carpetas.flatMap(c => recorrer(path.join(BACKEND, c)))
    .filter(ruta => !ruta.includes(path.join('src', 'integrations', 'alegra')));
}

describe('ids propios en toda tabla nueva — contra PostgreSQL local', () => {
  let pool, conexion, nuevas;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();

    const dir = path.join(BACKEND, 'migrations', 'independencia');
    nuevas = [...new Set(fs.readdirSync(dir).filter(a => a.endsWith('.sql'))
      .flatMap(a => [...fs.readFileSync(path.join(dir, a), 'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/gi)])
      .map(m => m[1].toLowerCase()))].sort();
  });

  after(async () => {
    if (conexion) conexion.release();
    if (pool) await pool.end();
  });

  test('se reconocen las tablas que crearon las migraciones de la rama', () => {
    assert.ok(nuevas.length >= 27, `se esperaban al menos 27, se leyeron ${nuevas.length}`);
    for (const t of ['producto', 'cliente', 'proveedor', 'factura', 'factura_linea', 'compra', 'pago']) {
      assert.ok(nuevas.includes(t), `falta ${t}: cambió la forma de las migraciones`);
    }
  });

  test('cada una tiene su propia llave `id`', async () => {
    const { rows } = await conexion.query(`
      SELECT c.relname AS tabla, string_agg(a.attname, ',' ORDER BY a.attnum) AS llave
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
        LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
       WHERE c.relkind = 'r' AND c.relname = ANY($1::text[])
       GROUP BY 1`, [nuevas]);

    assert.equal(rows.length, nuevas.length, 'hay migraciones sin aplicar en la copia local');
    assert.deepEqual(rows.filter(r => r.llave !== 'id').map(r => `${r.tabla} (${r.llave || 'sin llave'})`), []);
  });

  test('ningún id de Alegra es obligatorio, salvo los documentados', async () => {
    const { rows } = await conexion.query(`
      SELECT table_name || '.' || column_name AS columna
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
         AND column_name ~ '^alegra' AND is_nullable = 'NO'
       ORDER BY 1`, [nuevas]);

    assert.deepEqual(rows.map(r => r.columna), ALEGRA_OBLIGATORIO_A_PROPOSITO);
  });
});

describe('las tablas retiradas no vuelven a usarse', () => {
  const fuentes = archivosDe('src', 'services').concat([path.join(BACKEND, 'server.js')])
    .map(ruta => ({ ruta: path.relative(BACKEND, ruta), codigo: sinComentarios(fs.readFileSync(ruta, 'utf8')) }));

  /** ¿El archivo consulta esa tabla por SQL? `producto` no es `productos`. */
  const consulta = (codigo, tabla) =>
    new RegExp(`\\b(FROM|JOIN|INTO|UPDATE|TABLE|ONLY)\\s+(public\\.)?"?${tabla}"?(?![A-Za-z0-9_])`, 'i').test(codigo);

  for (const tabla of TABLAS_RETIRADAS) {
    test(`nadie consulta \`${tabla}\``, () => {
      assert.deepEqual(fuentes.filter(f => consulta(f.codigo, tabla)).map(f => f.ruta), []);
    });
  }

  test('la lista no tiene nombres repetidos ni tablas que sí están en uso', () => {
    assert.equal(new Set(TABLAS_RETIRADAS).size, TABLAS_RETIRADAS.length);
    // Los nombres que se confunden: el maestro vive en singular.
    for (const viva of ['producto', 'proveedor', 'factura', 'venta_linea']) {
      assert.equal(TABLAS_RETIRADAS.includes(viva), false);
      assert.ok(fuentes.some(f => consulta(f.codigo, viva)), `la prueba ya no reconoce una consulta a ${viva}`);
    }
  });
});

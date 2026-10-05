/**
 * Carga los contactos de Alegra como clientes y proveedores propios
 * (rama independencia-alegra).
 *
 * LEE de Alegra (solo GET) y ESCRIBE en la base local. Se puede correr las
 * veces que haga falta: actualiza por `alegra_id`.
 *
 * Dos cosas que no son obvias:
 *
 * 1. Un contacto puede ser cliente y proveedor a la vez (acá son 3): se carga
 *    en las dos tablas, no se elige una.
 * 2. Hay proveedores que NUNCA fueron contacto en Alegra: aparecen solo en
 *    `supplier_product_mapping`, que es por cédula, porque sus facturas entran
 *    por el buzón. Se agregan al final, sin `alegra_id`.
 *
 * Requiere los plazos cargados antes (cargar-configuracion.js).
 *
 * Uso:  node scripts/independencia/cargar-contactos.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { pool } = require('../../config/database');
const { getClient } = require('./lib/lectura-alegra');
const { clienteDesdeAlegra, proveedorDesdeAlegra, esCliente, esProveedor } = require('../../src/modules/clientes/desdeAlegra');

const alegra = getClient();

const CLIENTE = [
  'nombre', 'tipo_identificacion', 'identificacion', 'correo', 'correos_adicionales', 'telefono',
  'telefono_secundario', 'celular', 'provincia', 'canton', 'distrito', 'barrio', 'otras_senas',
  'actividad_economica', 'plazo_credito_id', 'limite_credito', 'exoneracion', 'observaciones',
  'activo', 'alegra_id'
];
const PROVEEDOR = [
  'nombre', 'tipo_identificacion', 'identificacion', 'correo', 'telefono', 'plazo_credito_id',
  'observaciones', 'activo', 'alegra_id'
];

function sentencia(tabla, columnas) {
  const valores = columnas.map((_, i) => `$${i + 1}`).join(', ');
  const asignaciones = columnas.filter(c => c !== 'alegra_id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
  return `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${valores})
          ON CONFLICT (alegra_id) DO UPDATE SET ${asignaciones}, actualizado_en = CURRENT_TIMESTAMP`;
}

/**
 * En Costa Rica la cédula dice sola de qué tipo es: 9 dígitos es física y 10
 * que empiezan con 3 es jurídica. Cualquier otra cosa se deja en blanco en vez
 * de adivinar.
 */
function tipoPorCedula(cedula) {
  const d = String(cedula || '').replace(/\D/g, '');
  if (d.length === 9) return 'CF';
  if (d.length === 10 && d.startsWith('3')) return 'CJ';
  return null;
}

async function leerTodosLosContactos() {
  const todos = [];
  for (let start = 0; ; start += 30) {
    const r = await alegra.get('/contacts', { start, limit: 30 });
    if (r?.success === false) throw new Error(`Alegra /contacts: ${r.status} ${r.data?.message || r.error}`);
    const pagina = r.data ?? r;
    if (!Array.isArray(pagina)) throw new Error('Alegra /contacts devolvió algo que no es una lista');
    todos.push(...pagina);
    if (pagina.length < 30) break;
  }
  return todos;
}

function contar(destino, avisos) {
  for (const a of avisos) destino[a] = (destino[a] || 0) + 1;
}

async function main() {
  const inicio = Date.now();
  const contactos = await leerTodosLosContactos();
  console.log(`→ Leídos de Alegra: ${contactos.length} contactos en ${Math.round((Date.now() - inicio) / 1000)} s`);

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: pl } = await cliente.query('SELECT id, alegra_id FROM plazo_credito WHERE alegra_id IS NOT NULL');
    if (pl.length === 0) throw new Error('No hay plazos de crédito cargados: corra antes cargar-configuracion.js');
    const contexto = { plazos: new Map(pl.map(r => [String(r.alegra_id), r.id])) };

    const avisosCliente = {};
    const avisosProveedor = {};
    let clientes = 0;
    let proveedores = 0;

    for (const contacto of contactos) {
      if (esCliente(contacto)) {
        const { fila, avisos } = clienteDesdeAlegra(contacto, contexto);
        await cliente.query(sentencia('cliente', CLIENTE), CLIENTE.map(c => fila[c]));
        if (fila.activo) contar(avisosCliente, avisos);
        clientes++;
      }
      if (esProveedor(contacto)) {
        const { fila, avisos } = proveedorDesdeAlegra(contacto, contexto);
        await cliente.query(sentencia('proveedor', PROVEEDOR), PROVEEDOR.map(c => fila[c]));
        if (fila.activo) contar(avisosProveedor, avisos);
        proveedores++;
      }
    }

    // Los que solo existen en el mapeo de facturas de proveedor. El nombre que
    // se guarda es el de la cédula con más productos mapeados: es el que se ve
    // hoy en las pantallas.
    const { rows: delMapeo } = await cliente.query(
      `SELECT DISTINCT ON (supplier_cedula) supplier_cedula, supplier_name
         FROM supplier_product_mapping
        ORDER BY supplier_cedula, times_used DESC, last_used_date DESC`
    );
    let soloMapeo = 0;
    for (const p of delMapeo) {
      const r = await cliente.query(
        `INSERT INTO proveedor (nombre, tipo_identificacion, identificacion)
         VALUES ($1, $2, $3)
         ON CONFLICT (identificacion) WHERE identificacion IS NOT NULL DO NOTHING`,
        [String(p.supplier_name).slice(0, 200), tipoPorCedula(p.supplier_cedula), p.supplier_cedula]
      );
      soloMapeo += r.rowCount;
    }

    await cliente.query('COMMIT');
    console.log(`✓ Clientes: ${clientes}. Proveedores: ${proveedores} de Alegra + ${soloMapeo} que solo estaban en el mapeo de facturas.`);
    console.log('  Pendientes de corregir en los CLIENTES activos:', Object.keys(avisosCliente).length ? JSON.stringify(avisosCliente) : 'ninguno');
    console.log('  Pendientes de corregir en los PROVEEDORES activos:', Object.keys(avisosProveedor).length ? JSON.stringify(avisosProveedor) : 'ninguno');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✗ No se cargaron los contactos:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });

const axios = require('axios');
const { query } = require('../config/database');

const API_BASE = 'http://localhost:3000';
const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000, // Increased default timeout to 15s to be safe
  validateStatus: () => true // Allow handling non-2xx status codes in verification
});

// Helper for log formatting
const logSection = (name) => {
  console.log(`\n==================================================`);
  console.log(`   TEST MODULE: ${name}`);
  console.log(`==================================================`);
};

const logResult = (name, success, info = '') => {
  if (success) {
    console.log(`  ✅ PASSED: ${name} ${info ? `(${info})` : ''}`);
  } else {
    console.log(`  ❌ FAILED: ${name} ${info ? `- ${info}` : ''}`);
  }
};

// Global variables to store created IDs for cleanups/dependant tests
let testerProveedorId = null;
let testerProductoId = null;
let testerFacturaId = null;
let testerFaltanteId = null;
let testerFaltanteId2 = null;
const testerHaciendaFacturaUuid = '99999999-9999-9999-9999-999999999999';

// Helpers to run SQL directly for data setup/teardown
async function dbQuery(sql, params = []) {
  try {
    return await query(sql, params);
  } catch (error) {
    console.error(`Database Error executing: ${sql}`, error.message);
    throw error;
  }
}

async function runTests() {
  console.log('🚀 Starting System E2E Tests...');
  console.log(`🔗 Target API URL: ${API_BASE}`);

  try {
    // --------------------------------------------------
    // CLEANUP PRIOR TO RUN (ensure state is fresh)
    // --------------------------------------------------
    await cleanupTesterData();

    // --------------------------------------------------
    // MODULO 1: Health & Admin
    // --------------------------------------------------
    logSection('Modulo 1 — Health & Admin');
    
    let res = await api.get('/health');
    logResult('GET /health', res.status === 200 && res.data.status === 'OK', `status: ${res.status}`);

    res = await api.get('/api');
    logResult('GET /api', res.status === 200 && res.data.message !== undefined, `status: ${res.status}`);

    res = await api.get('/api/admin/test-simple');
    logResult('GET /api/admin/test-simple', res.status === 200, `status: ${res.status}`);

    // Call database debug info endpoint with a larger timeout because it loops through all tables
    res = await api.get('/api/admin/database', { timeout: 60000 });
    logResult('GET /api/admin/database (large query)', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    res = await api.get('/api/alegra/debug/test-simple');
    logResult('GET /api/alegra/debug/test-simple', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/alegra/debug/database');
    logResult('GET /api/alegra/debug/database', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 2: Proveedores
    // --------------------------------------------------
    logSection('Modulo 2 — Proveedores');

    // Create a local test supplier
    const proveInsert = await dbQuery(`
      INSERT INTO proveedores (nombre, contacto, telefono, email)
      VALUES ('TESTER_PROVEEDOR', 'Tester Contact', '555-TEST', 'tester@example.com')
      RETURNING id
    `);
    testerProveedorId = proveInsert.rows[0].id;
    logResult('Setup: Insert test supplier in DB', testerProveedorId !== null, `ID: ${testerProveedorId}`);

    // Create a test Hacienda invoice (required to test GET /api/proveedores endpoints)
    await dbQuery(`
      INSERT INTO facturas_proveedores (id, clave, numero_consecutivo, fecha_emision, proveedor_nombre, proveedor_cedula, total_productos, total_factura, archivo_xml, estado)
      VALUES ($1, '12345678901234567890123456789012345678901234567890', 'TESTER_CONSECUTIVO', NOW(), 'TESTER_PROVEEDOR_HACIENDA', 'TESTER_CEDULA_999', 1, 1000.0, 'test_xml_content', 'RECIBIDA')
    `, [testerHaciendaFacturaUuid]);
    logResult('Setup: Insert test Hacienda invoice in DB', true);

    res = await api.get('/api/proveedores');
    const isProveedorInList = res.status === 200 && res.data.success === true && res.data.proveedores.some(p => p.cedula === 'TESTER_CEDULA_999');
    logResult('GET /api/proveedores', isProveedorInList, `Found: ${isProveedorInList}, Status: ${res.status}`);

    res = await api.get('/api/proveedores/TESTER_CEDULA_999');
    logResult('GET /api/proveedores/:cedula', res.status === 200 && res.data.success === true, `Status: ${res.status}`);

    // Test the newly fixed Alegra adapters
    res = await api.get('/api/alegra/proveedores');
    logResult('GET /api/alegra/proveedores', res.status === 200 && res.data.success === true, `Status: ${res.status}`);

    res = await api.get('/api/alegra/contactos?type=provider');
    logResult('GET /api/alegra/contactos', res.status === 200 && res.data.success === true, `Status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 3: Productos
    // --------------------------------------------------
    logSection('Modulo 3 — Productos');

    res = await api.post('/api/productos', {
      nombre: 'TESTER_PRODUCTO_001',
      codigo: 'TST001',
      descripcion: 'Tester Product Description',
      proveedor_id: testerProveedorId,
      precio_unitario: 12.50
    });
    testerProductoId = res.data?.data?.id;
    logResult('POST /api/productos (Create Product)', res.status === 201 && testerProductoId !== undefined, `ID: ${testerProductoId}`);

    res = await api.get('/api/productos');
    logResult('GET /api/productos', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    res = await api.get(`/api/productos/${testerProductoId}`);
    logResult('GET /api/productos/:id', res.status === 200 && res.data.data.nombre === 'TESTER_PRODUCTO_001', `status: ${res.status}`);

    res = await api.get('/api/productos/buscar/TESTER');
    logResult('GET /api/productos/buscar/:termino', res.status === 200 && res.data.data.length > 0, `Results: ${res.data?.data?.length}`);

    res = await api.get(`/api/productos/proveedor/${testerProveedorId}`);
    logResult('GET /api/productos/proveedor/:id', res.status === 200 && res.data.data.length > 0, `Results: ${res.data?.data?.length}`);

    res = await api.get('/api/productos/sin-proveedor');
    logResult('GET /api/productos/sin-proveedor', res.status === 200, `status: ${res.status}`);

    res = await api.put(`/api/productos/${testerProductoId}/proveedor`, {
      proveedor_id: testerProveedorId
    });
    logResult('PUT /api/productos/:id/proveedor', res.status === 200, `status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 4: Facturas (Local)
    // --------------------------------------------------
    logSection('Modulo 4 — Facturas');

    res = await api.post('/api/facturas', {
      numero_factura: 'TESTER-FAC-001',
      alegra_id: 999001,
      cliente_nombre: 'TESTER_CLIENTE',
      cliente_email: 'tester@client.com',
      fecha_emision: '2026-07-07',
      total: 125.00,
      items: [
        {
          producto_id: testerProductoId,
          cantidad: 10,
          precio_unitario: 12.50,
          subtotal: 125.00
        }
      ]
    });
    testerFacturaId = res.data?.data?.id;
    logResult('POST /api/facturas (Create Invoice)', res.status === 201 && testerFacturaId !== undefined, `ID: ${testerFacturaId}`);

    res = await api.get('/api/facturas');
    logResult('GET /api/facturas', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    res = await api.get(`/api/facturas/${testerFacturaId}`);
    const isCorrectInvoice = res.status === 200 && (res.data.data.numero_factura === 'TESTER-FAC-001' || res.data.data.local_data?.numero_factura === 'TESTER-FAC-001');
    logResult('GET /api/facturas/:id', isCorrectInvoice, `status: ${res.status}`);

    res = await api.get('/api/facturas/buscar/TESTER');
    logResult('GET /api/facturas/buscar/:termino', res.status === 200 && res.data.data.length > 0, `Results: ${res.data?.data?.length}`);

    res = await api.get('/api/facturas/buscar/numero/TESTER-FAC-001');
    logResult('GET /api/facturas/buscar/numero/:numero', res.status === 200 && res.data.data.length > 0, `Results: ${res.data?.data?.length}`);

    res = await api.get('/api/facturas/buscar/cliente/TESTER_CLIENTE');
    logResult('GET /api/facturas/buscar/cliente/:cliente', res.status === 200 && res.data.data.length > 0, `Results: ${res.data?.data?.length}`);

    res = await api.get('/api/facturas/siguiente-consecutivo');
    logResult('GET /api/facturas/siguiente-consecutivo', res.status === 200 && res.data.success === true, `Next: ${res.data?.data?.siguiente}`);

    // Detalle endpoint is dependent on Alegra API, so it is expected to return 404 for simulated test invoice
    res = await api.get(`/api/facturas/detalle/${testerFacturaId}`);
    logResult('GET /api/facturas/detalle/:id', res.status === 200 || res.status === 404, `status: ${res.status} (expected 404 for fake Alegra ID)`);

    res = await api.put(`/api/facturas/${testerFacturaId}`, {
      procesada: true
    });
    logResult('PUT /api/facturas/:id (Update)', res.status === 200, `status: ${res.status}`);

    res = await api.patch(`/api/facturas/${testerFacturaId}/procesada`);
    logResult('PATCH /api/facturas/:id/procesada', res.status === 200, `status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 5: Faltantes
    // --------------------------------------------------
    logSection('Modulo 5 — Faltantes');

    res = await api.post('/api/faltantes', {
      factura_id: testerFacturaId,
      producto_id: testerProductoId,
      cantidad_faltante: 2,
      tipo_faltante: 'parcial',
      observaciones: 'Missing 2 units',
      registrado_por: 'Tester User'
    });
    testerFaltanteId = res.data?.data?.id;
    logResult('POST /api/faltantes (Register Single)', res.status === 201 && testerFaltanteId !== undefined, `ID: ${testerFaltanteId}`);

    res = await api.get('/api/faltantes');
    logResult('GET /api/faltantes', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    res = await api.get(`/api/faltantes/factura/${testerFacturaId}`);
    logResult('GET /api/faltantes/factura/:id', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    res = await api.put(`/api/faltantes/${testerFaltanteId}`, {
      cantidad_faltante: 3,
      tipo_faltante: 'parcial',
      observaciones: 'Updated missing units'
    });
    logResult('PUT /api/faltantes/:id (Update)', res.status === 200 && res.data.data.cantidad_faltante === 3, `status: ${res.status}`);

    res = await api.delete(`/api/faltantes/${testerFaltanteId}`);
    logResult('DELETE /api/faltantes/:id', res.status === 200, `status: ${res.status}`);

    // Register multiple faltantes
    res = await api.post(`/api/faltantes/factura/${testerFacturaId}/multiple`, {
      registrado_por: 'Tester User',
      faltantes: [
        {
          producto_id: testerProductoId,
          cantidad_faltante: 1,
          tipo_faltante: 'total',
          observaciones: 'Missing entire line'
        }
      ]
    });
    testerFaltanteId2 = res.data?.data?.[0]?.id;
    logResult('POST /api/faltantes/factura/:id/multiple', res.status === 201 && testerFaltanteId2 !== undefined, `ID: ${testerFaltanteId2}`);

    // Fetch a real Alegra provider to get a valid ID for testing mapping
    let realAlegraId = '1';
    const alegraProveedoresRes = await api.get('/api/alegra/proveedores');
    if (alegraProveedoresRes.status === 200 && alegraProveedoresRes.data.success && alegraProveedoresRes.data.data.length > 0) {
      realAlegraId = alegraProveedoresRes.data.data[0].id.toString();
    }

    res = await api.post('/api/alegra/faltantes/asignar-proveedor-manual', {
      alegraReference: 'TST001',
      alegraItemId: '1792',
      alegraName: 'TESTER_PRODUCTO_001',
      proveedorId: realAlegraId
    });
    logResult('POST /api/alegra/faltantes/asignar-proveedor-manual', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    res = await api.post('/api/alegra/faltantes/reasignar-proveedor', {
      alegraReference: 'TST001',
      alegraItemId: '1792',
      alegraName: 'TESTER_PRODUCTO_001',
      nuevoProveedorId: realAlegraId
    });
    logResult('POST /api/alegra/faltantes/reasignar-proveedor', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    // Call resumen endpoint
    // Week calculations for "2026-07-07": year 2026, month 7, week 2
    res = await api.get('/api/faltantes/resumen/2026/7/2');
    logResult('GET /api/faltantes/resumen/:ano/:mes/:semana', res.status === 200 && res.data.success === true, `Total Faltantes: ${res.data?.data?.total_faltantes}`);

    // --------------------------------------------------
    // MODULO 6: Reportes
    // --------------------------------------------------
    logSection('Modulo 6 — Reportes');

    res = await api.get('/api/reportes/faltantes/proveedor');
    logResult('GET /api/reportes/faltantes/proveedor', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/reportes/faltantes/cliente');
    logResult('GET /api/reportes/faltantes/cliente', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/reportes/faltantes/consolidado');
    logResult('GET /api/reportes/faltantes/consolidado', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/reportes/historial');
    logResult('GET /api/reportes/historial', res.status === 200, `status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 7: Reimpresión
    // --------------------------------------------------
    logSection('Modulo 7 — Reimpresión');

    res = await api.get('/api/reimpresion/facturas/pendientes');
    logResult('GET /api/reimpresion/facturas/pendientes', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/reimpresion/facturas/procesadas');
    logResult('GET /api/reimpresion/facturas/procesadas', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/reimpresion/historial');
    logResult('GET /api/reimpresion/historial', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/facturas/pendientes-reimpresion');
    logResult('GET /api/facturas/pendientes-reimpresion (Legacy)', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/facturas/procesadas-reimpresion');
    logResult('GET /api/facturas/procesadas-reimpresion (Legacy)', res.status === 200, `status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 8: Revisión de Precios
    // --------------------------------------------------
    logSection('Modulo 8 — Revisión de Precios');

    res = await api.get('/api/revision-precios/facturas');
    logResult('GET /api/revision-precios/facturas', res.status === 200, `status: ${res.status}`);

    // Large DB query loops over many products, uses custom large timeout (60s)
    res = await api.get('/api/revision-precios/productos-pendientes', { timeout: 60000 });
    logResult('GET /api/revision-precios/productos-pendientes', res.status === 200, `status: ${res.status}`);

    // Test products cache sync endpoint (takes some time due to 67+ pages in Alegra)
    res = await api.post('/api/alegra/sincronizar/cache-productos', {}, { timeout: 180000 });
    logResult('POST /api/alegra/sincronizar/cache-productos', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    // Test automatic sync endpoint
    res = await api.post('/api/alegra/sincronizar/automatica', {}, { timeout: 180000 });
    logResult('POST /api/alegra/sincronizar/automatica', res.status === 200 && res.data.success === true, `status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 9: Productos Revisión (Mapeo)
    // --------------------------------------------------
    logSection('Modulo 9 — Productos Revisión');

    res = await api.get('/api/productos-revision/relacionados');
    logResult('GET /api/productos-revision/relacionados', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/productos-revision/buscar-alegra?query=test');
    logResult('GET /api/productos-revision/buscar-alegra', res.status === 200, `status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 10: Pagos Proveedores
    // --------------------------------------------------
    logSection('Modulo 10 — Pagos Proveedores');

    res = await api.get('/api/pagos-proveedores');
    logResult('GET /api/pagos-proveedores', res.status === 200, `status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 11: Bodega
    // --------------------------------------------------
    logSection('Modulo 11 — Bodega');

    res = await api.get('/api/bodega/facturas');
    logResult('GET /api/bodega/facturas', res.status === 200, `status: ${res.status}`);

    // --------------------------------------------------
    // MODULO 12: Inventario Auditorías
    // --------------------------------------------------
    logSection('Modulo 12 — Inventario Auditorías');

    res = await api.get('/api/inventario-auditorias');
    logResult('GET /api/inventario-auditorias', res.status === 200, `status: ${res.status}`);

    res = await api.get('/api/inventario-auditorias/categorias');
    logResult('GET /api/inventario-auditorias/categorias', res.status === 200, `status: ${res.status}`);

  } catch (error) {
    console.error('❌ E2E Execution crashed!', error);
  } finally {
    // --------------------------------------------------
    // CLEANUP AND FINALIZE
    // --------------------------------------------------
    logSection('Final Cleanups');
    await cleanupTesterData();
    console.log('\n🏁 E2E Testing Completed!');
  }
}

async function cleanupTesterData() {
  console.log('🧹 Cleaning up database from TESTER_* data...');
  try {
    // Remove test relations and test data
    await dbQuery("DELETE FROM faltantes WHERE observaciones LIKE '%TESTER%' OR registrado_por = 'Tester User'");
    await dbQuery("DELETE FROM factura_items WHERE factura_id IN (SELECT id FROM facturas WHERE numero_factura LIKE 'TESTER%')");
    await dbQuery("DELETE FROM facturas WHERE numero_factura LIKE 'TESTER%'");
    await dbQuery("DELETE FROM productos WHERE nombre LIKE 'TESTER%' OR codigo LIKE 'TST%'");
    await dbQuery("DELETE FROM proveedores WHERE nombre LIKE 'TESTER%'");
    await dbQuery("DELETE FROM facturas_proveedores WHERE id = $1 OR clave = '12345678901234567890123456789012345678901234567890'", [testerHaciendaFacturaUuid]);
    console.log('✅ Cleanup finished successfully.');
  } catch (err) {
    console.error('⚠️ Cleanup encountered an error:', err.message);
  }
}

runTests();

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

describe('descargar faltantes propios — PostgreSQL con ROLLBACK', () => {
  let pool, conexion, excel, productoId, facturaId, sinProveedorId;
  const contenido = r => XLSX.utils.sheet_to_json(XLSX.read(r.buffer, { type: 'buffer' }).Sheets.Faltantes);
  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');
    productoId = (await conexion.query("INSERT INTO producto (nombre, referencia) VALUES ('zz-Excel Jabón', '00123') RETURNING id")).rows[0].id;
    facturaId = (await conexion.query(`INSERT INTO factura (numero, estado, fecha, cliente_nombre, tipo_documento)
      VALUES ('zz-excel-pg-1', 'emitida', '2026-10-01', 'zz-Excel PostgreSQL José', 'factura') RETURNING id`)).rows[0].id;
    const faltanteId = (await conexion.query(`INSERT INTO faltantes (factura_propia_id, producto_propio_id, cantidad_faltante, tipo_faltante, estado,
      proveedor_asignado, proveedor_cedula) VALUES ($1, $2, 3, 'parcial', 'pendiente', 'zz-Excel Proveedor PostgreSQL', '00100001') RETURNING id`,
    [facturaId, productoId])).rows[0].id;
    await conexion.query(`INSERT INTO faltantes_ajustes (faltante_id, cantidad_entregada, estado, revisado)
      VALUES ($1, 1, 'parcial', true)`, [faltanteId]);
    const otro = (await conexion.query("INSERT INTO producto (nombre, referencia) VALUES ('zz-Excel Sin proveedor', 'zz-excel-null') RETURNING id")).rows[0].id;
    await conexion.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,1,$2,'zz-Excel Jabón',3,1,3),($1,2,$3,'zz-Excel Sin proveedor',2,1,2)",[facturaId,productoId,otro]);
    sinProveedorId = (await conexion.query(`INSERT INTO faltantes (factura_propia_id, producto_propio_id, cantidad_faltante, tipo_faltante, estado)
      VALUES ($1, $2, 2, 'parcial', 'pendiente') RETURNING id`, [facturaId, otro])).rows[0].id;

    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: { query: (sql, params) => {
      assert.match(sql, /^\s*(SELECT|WITH)\b/i, 'el Excel intentó escribir en la base');
      return conexion.query(sql, params);
    } } };
    const asignacion = require.resolve('../services/proveedorAsignacionService');
    require.cache[asignacion] = { id: asignacion, filename: asignacion, loaded: true, exports: {
      asignarProveedorAutomatico: () => { throw new Error('Descargar no debe asignar proveedores'); }
    } };
    excel = require('../src/modules/reports/report.excel');
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('cliente y factura sin Alegra, respuesta guardada y fecha exacta; los sin asignar no se tocan', async () => {
    const filas = contenido(await excel.exportarClientes({ cliente_nombre: 'zz-Excel PostgreSQL José' }));
    assert.equal(filas.length, 2);
    const f = filas.find(f => f['ID producto'] === productoId);
    assert.equal(f['ID factura'], facturaId);
    assert.equal(f.Código, '00123');
    assert.equal(f['Cantidad faltante'], 3);
    assert.equal(f['Cantidad entregada'], 1);
    assert.equal(f.Revisado, 'Sí');
    const dia = XLSX.SSF.parse_date_code(f['Fecha factura']);
    assert.deepEqual([dia.y, dia.m, dia.d], [2026, 10, 1]);
    assert.equal((await conexion.query('SELECT proveedor_asignado FROM faltantes WHERE id = $1', [sinProveedorId])).rows[0].proveedor_asignado, null);
  });

  test('fecha y búsqueda del proveedor coinciden; cédula y código conservan sus ceros', async () => {
    const filtros = { fecha_inicio: '2026-10-01', buscar: 'zz-excel proveedor postgresql' };
    assert.equal(contenido(await excel.exportarProveedores(filtros)).length,0,'una decisión revisada ya no es compra actual');
    await conexion.query('UPDATE faltantes_ajustes SET revisado=false WHERE faltante_id IN (SELECT id FROM faltantes WHERE factura_propia_id=$1)',[facturaId]);
    const filas = contenido(await excel.exportarProveedores(filtros));
    assert.equal(filas.length, 1);
    assert.equal(filas[0]['ID producto'], productoId);
    assert.equal(filas[0]['Cédula proveedor'], '00100001');
    assert.equal(filas[0].Código, '00123');
    assert.equal(filas[0]['Cantidad faltante'], 2);
    assert.equal(contenido(await excel.exportarProveedores({ ...filtros, fecha_inicio: '2026-10-02' })).length, 0);
  });

  test('buscar un producto conserva todos los faltantes del cliente encontrado, igual que su tarjeta', async () => {
    const filas = contenido(await excel.exportarClientes({ cliente: 'zz-excel postgresql jose', producto: 'jabon', proveedores: ['zz-Excel Proveedor PostgreSQL'] }));
    assert.equal(filas.length, 2);
    assert.equal(contenido(await excel.exportarClientes({ cliente: 'zz-excel postgresql jose', proveedores: ['zz-no existe'] })).length, 0);
  });

  test('fecha inexistente o filtro no escalar se rechazan sin descargar otro reporte', async () => {
    await assert.rejects(() => excel.exportarProveedores({ fecha_inicio: '2026-02-30' }), e => e.status === 400);
    await assert.rejects(() => excel.exportarProveedores({ buscar: [] }), e => e.status === 400);
  });
});

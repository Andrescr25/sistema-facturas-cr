const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('../config/aislado').asegurarBaseLocal();
const { Client } = require('pg');
const { crearServicio } = require('../src/integrations/hacienda/emision.service');
const config = require('../src/integrations/hacienda/configuracion.service');
const { certificado, emisor, venta } = require('./helpers/hacienda');
const { generarVenta } = require('../src/integrations/hacienda/xml/v4.4');
const { firmar } = require('../src/integrations/hacienda/firma/xades');
const { guardarArchivo, borrarPrivado } = require('../src/integrations/almacenamiento');

test('el gasto firma la revisión propia, sin aceptación automática ni segunda compra', {
  skip: process.env.PROBAR_BASE_LOCAL !== '1'
}, async () => {
  assert.match(new URL(process.env.DATABASE_URL).hostname, /^(127\.0\.0\.1|localhost)$/);
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'zz-hacienda-gasto-'));
  const almacenPrevio = process.env.HACIENDA_ALMACEN_PRIVADO;
  process.env.HACIENDA_ALMACEN_PRIVADO = raiz;
  let originalRuta;
  await db.connect();
  await db.query('BEGIN');
  let n = 0;
  const pila = [];
  const puente = { release() {}, query: async (sql, p) => {
    if (sql === 'BEGIN') { const s = 'zz_gasto_' + ++n; pila.push(s); return db.query('SAVEPOINT ' + s); }
    if (sql === 'COMMIT') return db.query('RELEASE SAVEPOINT ' + pila.pop());
    if (sql === 'ROLLBACK') { const s = pila.pop(); await db.query('ROLLBACK TO SAVEPOINT ' + s); return db.query('RELEASE SAVEPOINT ' + s); }
    return db.query(sql, p);
  } };
  const pool = { query: puente.query, connect: async () => puente };
  const envios = [];
  const servicio = crearServicio(pool, { verificarSalida() {},
    probar: async () => ({ conectado: true }),
    enviar: async (_, sobre) => { envios.push(sobre); return { status: 201 }; },
    consultar: async () => ({ status: 404 }) });
  try {
    const c = certificado();
    await db.query("UPDATE empresa SET nombre='ZZ emisor',tipo_identificacion='CF',identificacion='123456789',otras_senas='ZZ prueba',correo='zz@example.invalid' WHERE id=1");
    await config.guardar(db, 'produccion', { ...emisor, pin: c.pin,
      usuario: 'cpf-01-2345-6789@prod.comprobanteselectronicos.go.cr', clave: 'zz-no-es-real',
      habilitada: true, condicion_iva_compras: '01' }, c.p12);
    const v = venta();
    const clave = String(Date.now()).padStart(50, '5');
    v.clave = clave;
    originalRuta = (await guardarArchivo({ carpeta: 'compras-proveedor', prefijo: 'zz-fiscal-gasto',
      extension: 'xml', buffer: Buffer.from(firmar(generarVenta(v), c.p12, c.pin)) })).ruta;
    const factura = (await db.query(`INSERT INTO facturas_proveedores(id,clave,numero_consecutivo,
      fecha_emision,proveedor_nombre,proveedor_cedula,total_productos,total_factura,archivo_xml,estado,tratamiento,xml_ruta)
      VALUES($1,$2,$3,CURRENT_TIMESTAMP,'ZZ proveedor gasto','123456789',1,113,'zz.xml','GASTO_RECURRENTE','alimentacion',$4) RETURNING id`,
    [randomUUID(), clave, v.consecutivo, originalRuta])).rows[0];
    const proveedorId = (await db.query('SELECT min(id) AS id FROM proveedor')).rows[0].id;
    const compra = (await db.query(`INSERT INTO compra(proveedor_id,clave,fecha_emision,total,xml_ruta,factura_proveedor_id)
      VALUES($1,$2,CURRENT_DATE,113,$3,$4) RETURNING id`, [proveedorId, clave, originalRuta, factura.id])).rows[0];
    const gasto = (await db.query(`INSERT INTO gasto_operativo(factura_id,compra_id,categoria,descripcion,originales,validacion,iva_maximo)
      VALUES($1,$2,'alimentacion','ZZ almuerzo','{}','validado',13) RETURNING id`, [factura.id, compra.id])).rows[0];
    assert.equal((await servicio.alRegistrarCompra(compra.id)).estado, 'pendiente');
    assert.equal(envios.length, 0);
    await assert.rejects(servicio.preparar('compra', compra.id, { ambiente: 'produccion', mensaje: '1', condicionImpuesto: '01' }), e => e.code === 'GASTO_SIN_REVISION_FISCAL');
    await db.query(`UPDATE gasto_operativo SET renta='parcial', gasto_deducible=50,iva='parcial',iva_credito=6,
      respuesta='2',motivo_fiscal='ZZ uso empresarial parcial',revisado_en=CURRENT_TIMESTAMP WHERE id=$1`, [gasto.id]);
    const preparado = await servicio.aceptarCompra(compra.id);
    const xml = (await servicio.archivo(preparado.id)).toString();
    assert.match(xml, /<Mensaje>2<\/Mensaje>/);
    assert.match(xml, /<CondicionImpuesto>02<\/CondicionImpuesto>/);
    assert.match(xml, /<MontoTotalImpuestoAcreditar>6\.00000<\/MontoTotalImpuestoAcreditar>/);
    assert.match(xml, /<MontoTotalDeGastoAplicable>50\.00000<\/MontoTotalDeGastoAplicable>/);
    assert.equal((await servicio.aceptarCompra(compra.id)).id, preparado.id);
    assert.equal(envios.length, 0, 'preparar tampoco envía por sí solo');
    await servicio.enviar(preparado.id);
    assert.equal(envios.length, 1);
    assert.equal((await db.query('SELECT count(*)::int n FROM compra WHERE factura_proveedor_id=$1', [factura.id])).rows[0].n, 1);
  } finally {
    await db.query('ROLLBACK'); await db.end();
    if (originalRuta) await borrarPrivado(originalRuta);
    if (almacenPrevio === undefined) delete process.env.HACIENDA_ALMACEN_PRIVADO;
    else process.env.HACIENDA_ALMACEN_PRIVADO = almacenPrevio;
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

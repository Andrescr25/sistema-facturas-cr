const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomInt } = require('node:crypto');
require('../config/aislado').asegurarBaseLocal();
const { pool } = require('../config/database');
const { venta, certificado } = require('./helpers/hacienda');
const { generarVenta } = require('../src/integrations/hacienda/xml/v4.4');
const { firmar } = require('../src/integrations/hacienda/firma/xades');
const { tratamientoDelProveedor, recibirGasto } = require('../src/modules/gastos-operativos/gastos.recepcion');
const registro = require('../src/modules/gastos-operativos/gastos.registro');
const servicio = require('../src/modules/gastos-operativos/gastos.service');
const { conservarPdf, conservarXml } = require('../src/modules/gastos-operativos/gastos.archivos');
const { guardarArchivo, borrarPrivado, leerArchivoPrivado } = require('../src/integrations/almacenamiento');
const { crearAceptacion } = require('../src/integrations/hacienda/aceptacionCompra.service');
const { aplicarRevisionGasto } = require('../src/integrations/hacienda/gastoOperativo');
const XmlParser = require('../services/xmlParser');

// Las pruebas de concurrencia confirman transacciones. Exigen una COPIA
// desechable con nombre explícito, nunca la base local compartida ni producción.
const copia = /^tachi_codex_gastos_/.test(new URL(process.env.DATABASE_URL).pathname.slice(1));
const marca = String(Date.now()).padStart(40, '5');
describe('gastos operativos — PostgreSQL desechable, sin red', { skip: process.env.PROBAR_BASE_LOCAL !== '1' || !copia }, () => {
  let proveedor, empresa, usuario, metodo, huellaInicial, sec = 0;
  const archivos = [];
  before(async () => {
    empresa = (await pool.query('SELECT * FROM empresa WHERE id=1')).rows[0];
    usuario = (await pool.query('SELECT id FROM usuario WHERE activo ORDER BY id LIMIT 1')).rows[0].id;
    metodo = (await pool.query('SELECT id FROM metodo_pago WHERE activo AND NOT pide_referencia ORDER BY id LIMIT 1')).rows[0].id;
    proveedor = (await pool.query(`INSERT INTO proveedor (nombre,tipo_identificacion,identificacion,tratamiento_facturas)
      VALUES ('zz-Gastos combustible','CF',$1,'combustible') RETURNING *`, ['19' + randomInt(1000000, 9999999)])).rows[0];
    huellaInicial = (await pool.query(`SELECT md5(string_agg(id||':'||costo_con_iva||':'||precio_sin_iva,',' ORDER BY id)) AS h FROM producto`)).rows[0].h;
  });
  after(async () => {
    for (const archivo of archivos) await borrarPrivado(archivo).catch(() => {});
    await require('../lib/prisma').$disconnect();
    await pool.end();
  });

  async function comprobante({ categoria = 'combustible', receptor = empresa.identificacion, modificar = x => x, xml = true, emisor = proveedor.identificacion } = {}) {
    const v = venta();
    v.emisor.identificacion = emisor;
    v.documento.cliente_identificacion = receptor;
    v.documento.cliente_tipo_identificacion = empresa.tipo_identificacion;
    v.clave = marca + String(++sec).padStart(10, '0');
    v.consecutivo = '0010000101' + String(sec).padStart(10, '0');
    v.fecha = '2026-10-20T23:15:00-06:00';
    v.lineas[0].nombre = 'zz-Almuerzo o combustible, detalle original';
    const c = certificado();
    const original = modificar(firmar(generarVenta(v), c.p12, c.pin));
    const datos = await new XmlParser().parseFacturaXML(original);
    let ruta = null;
    if (xml) {
      ruta = (await guardarArchivo({ carpeta: 'compras-proveedor', prefijo: 'zz-gasto', extension: 'xml', buffer: Buffer.from(original) })).ruta;
      archivos.push(ruta);
    }
    return { datos, ruta, original, categoria };
  }
  const recibir = async p => recibirGasto(p.datos, 'zz-gasto.xml', 'zz-correo', p.ruta, p.categoria);

  test('todos los proveedores anteriores conservan el flujo comercial', async () => {
    const identificacion = '19' + randomInt(1000000, 9999999);
    const pr = (await pool.query("INSERT INTO proveedor(nombre,identificacion) VALUES('zz-Comercial anterior',$1) RETURNING tratamiento_facturas", [identificacion])).rows[0];
    assert.equal(pr.tratamiento_facturas, 'comercial');
    assert.equal(await tratamientoDelProveedor(identificacion), 'comercial');
    assert.equal(await tratamientoDelProveedor('0' + proveedor.identificacion), 'combustible');
    await pool.query('UPDATE proveedor SET activo=FALSE WHERE id=$1', [proveedor.id]);
    assert.equal(await tratamientoDelProveedor(proveedor.identificacion), 'combustible');
    await pool.query('UPDATE proveedor SET activo=TRUE WHERE id=$1', [proveedor.id]);
    const p = await comprobante();
    assert.equal(await recibirGasto(p.datos, 'zz.xml', null, p.ruta, 'comercial'), null);
    assert.equal(await recibirGasto(p.datos, 'zz.xml', null, p.ruta, 'mixto'), null);
  });

  test('el buzón comercial conserva sus mapeos y el mixto permite clasificar sólo esta factura', async () => {
    const DatabaseService = require('../services/databaseService');
    const buzon = new DatabaseService();
    const { guardarMapeo, productoPropio } = require('../src/modules/productos-revision/relacionPropia');
    const prod = await productoPropio((await pool.query('SELECT id FROM producto WHERE activo ORDER BY id LIMIT 1')).rows[0].id);
    for (const tratamiento of ['comercial', 'mixto']) {
      const ident = '19' + randomInt(1000000, 9999999);
      await pool.query('INSERT INTO proveedor(nombre,identificacion,tratamiento_facturas) VALUES($1,$2,$3)', ['zz-' + tratamiento, ident, tratamiento]);
      const p = await comprobante({ emisor: ident });
      await guardarMapeo({ cedula: ident, codigo: p.datos.productos[0].codigo, nombreProveedor: 'zz-Mixto', descripcion: p.datos.productos[0].descripcion }, prod);
      const f = await buzon.saveFactura(p.datos, 'zz-mixto.xml', 'zz-mail', p.ruta);
      const linea = (await pool.query('SELECT producto_id FROM productos_factura_proveedor WHERE factura_id=$1', [f.id])).rows[0];
      if (tratamiento === 'comercial') assert.equal(linea.producto_id, prod.id);
      else {
        assert.equal(linea.producto_id, null);
        const r = await registro.desdeFactura(f.id, { categoria: 'alimentacion', guardarPreferencia: false }, usuario);
        assert.equal((await servicio.obtener(r.id)).validacion, 'validado');
        assert.equal(await tratamientoDelProveedor(ident), 'mixto');
        assert.equal((await pool.query('SELECT producto_id FROM supplier_product_mapping WHERE supplier_cedula=$1', [ident])).rows[0].producto_id, prod.id, 'el mapeo comercial se conserva');
      }
    }
  });

  test('guardar la preferencia es explícito y la siguiente factura entra automáticamente como gasto', async () => {
    const ident = '19' + randomInt(1000000, 9999999);
    await pool.query("INSERT INTO proveedor(nombre,identificacion) VALUES('zz-Preferencia de gasto',$1)", [ident]);
    const DatabaseService = require('../services/databaseService');
    const buzon = new DatabaseService();
    const p = await comprobante({ emisor: ident });
    const f = await buzon.saveFactura(p.datos, 'zz-preferencia.xml', 'zz-correo', p.ruta);
    await registro.desdeFactura(f.id, { categoria: 'alimentacion', guardarPreferencia: true }, usuario);
    assert.equal(await tratamientoDelProveedor(ident), 'alimentacion');
    const otra = await comprobante({ emisor: ident });
    const r = await buzon.saveFactura(otra.datos, 'zz-siguiente.xml', 'zz-correo', otra.ruta);
    assert.ok(r.gastoId);
    assert.equal((await servicio.obtener(r.gastoId)).categoria, 'alimentacion');
  });

  test('recibe una única compra sin catálogo, pago, costos ni inventario; conserva fecha CR y originales', async () => {
    const p = await comprobante();
    const r = await recibir(p);
    const g = await servicio.obtener(r.gastoId);
    assert.equal(g.validacion, 'validado', g.motivo_validacion);
    assert.ok(g.compra_id);
    assert.equal(g.originales.lineasOriginales[0].Detalle, p.datos.productos[0].descripcion);
    assert.equal(g.originales.fechaEmision.original, '2026-10-20T23:15:00-06:00');
    assert.equal(g.renta, 'pendiente'); assert.equal(g.iva, 'pendiente');
    assert.equal(g.revisado_en, null); assert.equal(Number(g.saldo), 113);
    assert.equal(g.pagos.length, 0);
    const lineas = (await pool.query('SELECT producto_id,cantidad,precio_unitario FROM compra_linea WHERE compra_id=$1', [g.compra_id])).rows;
    assert.equal(lineas.length, 1); assert.equal(lineas[0].producto_id, null);
    assert.equal((await pool.query('SELECT fecha_emision::text FROM compra WHERE id=$1', [g.compra_id])).rows[0].fecha_emision, '2026-10-20');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM movimiento_inventario WHERE origen_tipo='compra' AND origen_id=$1", [g.compra_id])).rows[0].n, 0);
    const otra = await recibir(p);
    assert.equal(otra.id, r.id); assert.equal(otra.duplicada, true);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM compra WHERE factura_proveedor_id=$1', [r.id])).rows[0].n, 1);
  });

  test('dos recepciones simultáneas de la misma clave producen un solo gasto', async () => {
    const p = await comprobante();
    const [a, b] = await Promise.all([recibir(p), recibir(p)]);
    assert.equal(a.id, b.id);
    assert.equal([a, b].filter(r => r.duplicada).length, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM gasto_operativo WHERE factura_id=$1', [a.id])).rows[0].n, 1);
  });

  test('un XML de otro receptor permanece documentado y no habilita compra ni pago', async () => {
    const r = await recibir(await comprobante({ receptor: '123456788' }));
    const g = await servicio.obtener(r.gastoId);
    assert.equal(g.validacion, 'requiere_revision');
    assert.match(g.motivo_validacion, /receptor/);
    assert.equal(g.compra_id, null);
    assert.equal(g.cuenta_id, null);
    await assert.rejects(servicio.pagar(g.id, {}, usuario), /Validá/);
  });

  test('una factura sin original se completa una sola vez y se valida sin Hacienda', async () => {
    const p = await comprobante({ xml: false });
    const r = await recibir(p);
    let g = await servicio.obtener(r.gastoId);
    assert.equal(g.compra_id, null);
    await conservarXml(g.id, Buffer.from(p.original), usuario);
    g = await servicio.revalidar(g.id, usuario);
    assert.equal(g.validacion, 'validado', g.motivo_validacion);
    assert.ok(g.compra_id);
    await assert.rejects(conservarXml(g.id, Buffer.from(p.original), usuario), /no se reemplaza/);
    archivos.push((await pool.query('SELECT xml_ruta FROM facturas_proveedores WHERE id=$1', [g.factura_id])).rows[0].xml_ruta);
  });

  test('la revisión es auditable y no permite guardar encima de cambios de otra persona', async () => {
    const r = await recibir(await comprobante());
    let g = await servicio.obtener(r.gastoId);
    assert.equal(g.empleado, null); assert.equal(g.placa, null);
    g = await servicio.editar(g.id, { version: g.version, empleado: 'zz-Chofer', placa: 'ZZ-123' }, usuario);
    assert.equal(g.empleado, 'zz-Chofer');
    await assert.rejects(servicio.editar(g.id, { version: g.version - 1, empleado: 'zz-Otro' }, usuario), /Otra persona/);
    await assert.rejects(servicio.editar(g.id, { version: g.version, categoria: 'alimentacion' }, usuario), /por qué/);
    g = await servicio.editar(g.id, { version: g.version, categoria: 'alimentacion', motivo: 'ZZ comprobante de almuerzo' }, usuario);
    assert.equal(g.categoria, 'alimentacion');
    assert.ok(g.historial.some(h => h.motivo === 'ZZ comprobante de almuerzo'));
  });

  test('la recepción no acepta sola, ni se puede saltar la revisión fiscal por la API de compras', async () => {
    const r = await recibir(await comprobante());
    let g = await servicio.obtener(r.gastoId);
    let envios = 0;
    const aceptar = crearAceptacion({ pool, tx: fn => fn(pool), preparar: async () => { envios++; }, enviar: async () => { envios++; }, vista: c => c, id: Number });
    assert.equal((await aceptar.alRegistrar(g.compra_id, usuario)).estado, 'pendiente');
    assert.equal(envios, 0);
    await assert.rejects(aplicarRevisionGasto(pool, g.compra_id, { mensaje: '1', condicionImpuesto: '01' }), /Revisá/);
    g = await servicio.editar(g.id, { version: g.version, fiscal: { renta: 'no_deducible', iva: 'sin_credito', respuesta: '3', motivo_fiscal: 'ZZ compra no reconocida' } }, usuario);
    const fiscales = await aplicarRevisionGasto(pool, g.compra_id, { mensaje: '1', condicionImpuesto: '01', impuestoAcreditar: 999 });
    assert.equal(fiscales.mensaje, '3'); assert.equal(Number(fiscales.impuestoAcreditar), 0); assert.equal(Number(fiscales.gastoAplicable), 0);
    assert.ok(g.revisado_en); assert.equal(envios, 0);
  });

  test('el PDF original no se reemplaza y ninguna línea de gasto puede crear stock', async () => {
    const r = await recibir(await comprobante());
    const g = await servicio.obtener(r.gastoId);
    const pdf = Buffer.from('%PDF-1.4\nZZ original del proveedor');
    await conservarPdf(g.factura_id, pdf, usuario);
    const ruta = (await pool.query('SELECT pdf_ruta FROM facturas_proveedores WHERE id=$1', [g.factura_id])).rows[0].pdf_ruta;
    archivos.push(ruta);
    await conservarPdf(g.factura_id, Buffer.from('%PDF-1.4\nZZ otro'), usuario);
    assert.deepEqual(await leerArchivoPrivado(ruta), pdf);
    const prod = (await pool.query('SELECT id FROM producto ORDER BY id LIMIT 1')).rows[0].id;
    await assert.rejects(pool.query('UPDATE compra_linea SET producto_id=$2 WHERE compra_id=$1', [g.compra_id, prod]), /no puede tener productos/);
    await assert.rejects(pool.query('UPDATE productos_factura_proveedor SET producto_id=$2 WHERE factura_id=$1', [g.factura_id, prod]), /respaldo documental/);
  });

  test('reintentar simultáneamente un abono devuelve el mismo pago y un único rebajo', async () => {
    const r = await recibir(await comprobante());
    const claveIdempotencia = randomUUID();
    const datos = { metodoPagoId: metodo, monto: 10, claveIdempotencia };
    const [a, b] = await Promise.all([servicio.pagar(r.gastoId, datos, usuario), servicio.pagar(r.gastoId, datos, usuario)]);
    assert.equal(a.id, b.id);
    const g = await servicio.obtener(r.gastoId);
    assert.equal(Number(g.saldo), 103); assert.equal(g.pagos.length, 1);
    await assert.rejects(servicio.pagar(r.gastoId, { ...datos, monto: 20 }, usuario), /ya registró otro pago/);
    assert.equal((await pool.query(`SELECT md5(string_agg(id||':'||costo_con_iva||':'||precio_sin_iva,',' ORDER BY id)) AS h FROM producto`)).rows[0].h, huellaInicial);
  });
});

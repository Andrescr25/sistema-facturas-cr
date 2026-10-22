const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomInt, randomUUID } = require('node:crypto');
require('../config/aislado').asegurarBaseLocal();
const { pool } = require('../config/database');
const { certificado, venta, emisor } = require('./helpers/hacienda');
const { generarVenta } = require('../src/integrations/hacienda/xml/v4.4');
const { firmar } = require('../src/integrations/hacienda/firma/xades');
const config = require('../src/integrations/hacienda/configuracion.service');
const { crearServicio } = require('../src/integrations/hacienda/emision.service');
const { recibirGasto } = require('../src/modules/gastos-operativos/gastos.recepcion');
const servicio = require('../src/modules/gastos-operativos/gastos.service');
const { decidir } = require('../src/modules/gastos-operativos/gastos.aprobacion');
const { guardarArchivo, borrarPrivado } = require('../src/integrations/almacenamiento');
const { prepararGasto, resumir } = require('../src/modules/reporte-contador/contador.mes');
const XmlParser = require('../services/xmlParser');
const activo = process.env.PROBAR_BASE_LOCAL === '1' && /^\/tachi_codex_gastos_/.test(new URL(process.env.DATABASE_URL).pathname);

describe('aprobar un gasto — transacciones reales y Hacienda simulada', { skip: !activo }, () => {
  let usuario, metodo, proveedor, empresa, configuracion, fiscal, rutaOriginal, corte, desconectado = false;
  const archivos = [], envios = [], comprasCreadas = [];
  before(async () => {
    empresa = (await pool.query('SELECT * FROM empresa WHERE id=1')).rows[0];
    configuracion = (await pool.query("SELECT * FROM hacienda_configuracion WHERE ambiente='produccion'")).rows[0];
    usuario = (await pool.query('SELECT id FROM usuario WHERE activo ORDER BY id LIMIT 1')).rows[0].id;
    metodo = (await pool.query('SELECT id FROM metodo_pago WHERE activo AND NOT pide_referencia ORDER BY id LIMIT 1')).rows[0].id;
    proveedor = (await pool.query("INSERT INTO proveedor(nombre,identificacion,tipo_identificacion,tratamiento_facturas) VALUES('ZZ Aprobar gasto',$1,'CF','alimentacion') RETURNING *", ['19' + randomInt(1000000, 9999999)])).rows[0];
    corte = (await pool.query("SELECT md5(string_agg(id||':'||costo_con_iva||':'||precio_sin_iva,',' ORDER BY id)) h FROM producto")).rows[0].h;
    await pool.query("UPDATE empresa SET nombre='ZZ emisor',tipo_identificacion='CF',identificacion='123456789',otras_senas='ZZ prueba',correo='zz@example.invalid' WHERE id=1");
    const c = certificado();
    await config.guardar(pool, 'produccion', { ...emisor, pin: c.pin, usuario: 'cpf-01-2345-6789@prod.comprobanteselectronicos.go.cr', clave: 'zz-no-real', habilitada: true, condicion_iva_compras: '01' }, c.p12);
    fiscal = crearServicio(pool, { verificarSalida() {}, probar: async () => ({ conectado: true }),
      enviar: async (_, sobre) => { envios.push(sobre); return { status: 201 }; }, consultar: async () => ({ status: 404 }) });
    const ruta = require.resolve('../src/integrations/hacienda/rutas');
    rutaOriginal = require.cache[ruta];
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: { responderCompra: async id => {
      if (desconectado) throw new Error('ZZ caída simulada antes de reservar el comprobante');
      const preparado = await fiscal.aceptarCompra(id, { sustituir: true }, usuario);
      return fiscal.enviar(preparado.id);
    } } };
  });
  after(async () => {
    // El documento queda como evidencia en este clon desechable, pero no
    // ocupa el LIMIT del trabajador que prueban otros archivos de la suite.
    await pool.query("UPDATE hacienda_comprobante SET proxima_consulta=now()+interval '20 years' WHERE origen='compra' AND origen_id=ANY($1::integer[])", [comprasCreadas]);
    for (const ruta of archivos) await borrarPrivado(ruta).catch(() => {});
    for (const [tabla, llave, valor, previa] of [['empresa', 'id', 1, empresa], ['hacienda_configuracion', 'ambiente', 'produccion', configuracion]]) {
      if (previa) {
        const campos = Object.keys(previa).filter(k => k !== llave);
        await pool.query(`UPDATE ${tabla} SET ${campos.map((k, i) => `"${k}"=$${i + 2}`).join(',')} WHERE ${llave}=$1`, [valor, ...campos.map(k => previa[k])]);
      } else {
        await pool.query(`DELETE FROM ${tabla} WHERE ${llave}=$1`, [valor]);
      }
    }
    const ruta = require.resolve('../src/integrations/hacienda/rutas');
    if (rutaOriginal) require.cache[ruta] = rutaOriginal; else delete require.cache[ruta];
    await pool.end();
  });
  async function nuevo(opciones = {}) {
    const v = venta(), c = certificado();
    v.emisor.identificacion = proveedor.identificacion; v.emisor.nombre = proveedor.nombre;
    v.clave = String(Date.now()).padStart(42, '5') + String(randomInt(10000000, 99999999));
    v.consecutivo = '0010000101' + String(randomInt(1000000, 9999999)).padStart(10, '0');
    v.fecha = '2026-10-20T10:30:00-06:00';
    const xml = firmar(generarVenta(v), c.p12, c.pin);
    const datos = await new XmlParser().parseFacturaXML(xml);
    const ruta = (await guardarArchivo({ carpeta: 'compras-proveedor', prefijo: 'zz-aprobar', extension: 'xml', buffer: Buffer.from(xml) })).ruta;
    archivos.push(ruta);
    const r = await recibirGasto(datos, 'zz-aprobar.xml', 'zz-correo', ruta, opciones.categoria || 'alimentacion');
    const g = await servicio.obtener(r.gastoId);
    if (g.compra_id) comprasCreadas.push(g.compra_id);
    return g;
  }
  const datos = g => ({ accion: 'aprobar', metodoPagoId: metodo, claveIdempotencia: randomUUID(), version: g.version });
  const pagos = async g => (await pool.query('SELECT count(*)::int n,COALESCE(sum(pc.monto),0) monto FROM pago_proveedor_cuenta pc JOIN pago_proveedor p ON p.id=pc.pago_id WHERE pc.cuenta_por_pagar_id=$1 AND NOT p.anulado', [g.cuenta_id])).rows[0];

  test('recibir sigue pendiente en Revisión, sin pagar ni enviar a Hacienda', async () => {
    const g = await nuevo(), pendientes = await servicio.listar({ decision: 'pendiente' });
    assert.equal(g.decision, 'pendiente'); assert.equal(Number(g.pagado), 0);
    assert.ok(pendientes.gastos.some(f => f.id === g.id));
    assert.equal((await pagos(g)).n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM hacienda_comprobante WHERE origen='compra' AND origen_id=$1", [g.compra_id])).rows[0].n, 0);
  });
  test('aprobar registra el pago total en Caja y aceptación con la condición configurada', async () => {
    const g = await nuevo(), r = await decidir(g.id, datos(g), usuario);
    assert.equal(r.gasto.decision, 'aprobado'); assert.equal(Number(r.gasto.saldo), 0);
    assert.equal(Number(r.gasto.pagado), 113); assert.equal(r.gasto.pagos.length, 1);
    assert.equal(r.gasto.renta, 'deducible'); assert.equal(Number(r.gasto.iva_credito), 13);
    assert.equal(Number(r.gasto.gasto_deducible), 100);
    const caja = (await pool.query("SELECT * FROM movimiento_caja WHERE tipo='pago_proveedor' AND documento_id=$1", [r.pagoId])).rows;
    assert.equal(caja.length, 1); assert.equal(Number(caja[0].monto), 113); assert.equal(caja[0].sentido, 'salida');
    const xml = (await fiscal.archivo(r.hacienda.comprobante.id)).toString();
    assert.match(xml, /<Mensaje>1<\/Mensaje>/); assert.match(xml, /<MontoTotalImpuestoAcreditar>13\.00000/);
    assert.equal((await servicio.listar({ decision: 'aprobado' })).gastos.some(f => f.id === g.id), true);
    assert.equal((await servicio.listar({ decision: 'pendiente' })).gastos.some(f => f.id === g.id), false);
  });
  test('doble clic y respuesta perdida conservan un pago y una respuesta fiscal', async () => {
    const g = await nuevo(), d = datos(g);
    const [a, b] = await Promise.all([decidir(g.id, d, usuario), decidir(g.id, d, usuario)]);
    assert.equal(a.gasto.pago_aprobacion_id, b.gasto.pago_aprobacion_id);
    assert.equal((await pagos(g)).n, 1);
    await decidir(g.id, { ...d, claveIdempotencia: randomUUID() }, usuario);
    assert.equal((await pagos(g)).n, 1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM hacienda_comprobante WHERE origen='compra' AND origen_id=$1", [g.compra_id])).rows[0].n, 1);
    await assert.rejects(decidir(g.id, { ...d, referencia: 'ZZ otro pago' }, usuario), e => e.status === 409);
  });
  test('rechazar no paga, bloquea la deuda y comunica rechazo sin sumar el gasto al contador', async () => {
    const g = await nuevo(), r = await decidir(g.id, { accion: 'rechazar', claveIdempotencia: randomUUID(), version: g.version }, usuario);
    assert.equal(r.gasto.decision, 'rechazado'); assert.equal((await pagos(g)).n, 0);
    assert.equal((await pool.query('SELECT liberada FROM cuentas_por_pagar WHERE id=$1', [g.cuenta_id])).rows[0].liberada, false);
    assert.equal((await pool.query('SELECT estado FROM compra WHERE id=$1', [g.compra_id])).rows[0].estado, 'anulada');
    assert.match((await fiscal.archivo(r.hacienda.comprobante.id)).toString(), /<Mensaje>3<\/Mensaje>/);
    const preparado = prepararGasto({ ...r.gasto, estado: 'anulada', moneda: 'CRC', total: 113 });
    assert.equal(preparado.revision, 'Rechazado'); assert.equal(resumir([], [preparado])[0].gastos, 0);
    await assert.rejects(servicio.pagar(g.id, {}, usuario), e => e.status === 409);
    await assert.rejects(decidir(g.id, datos(g), usuario), e => e.status === 409);
  });
  test('un reintento posterior a anular el pago conserva el saldo, sin pagar otra vez', async () => {
    const g = await nuevo(), d = datos(g), r = await decidir(g.id, d, usuario);
    await require('../src/modules/pagos-proveedores/pagosProveedor.service').anularPago(r.pagoId, { motivo: 'ZZ medio incorrecto' }, usuario);
    const repetida = await decidir(g.id, d, usuario);
    assert.equal(repetida.existente, true); assert.equal(Number(repetida.gasto.saldo), 113);
    assert.equal(repetida.gasto.pagos.length, 1); assert.equal(repetida.gasto.pagos[0].anulado, true);
    assert.equal(repetida.gasto.metodo_pago, null);
  });
  test('fallar al guardar la decisión revierte también el pago que acababa de crearse', async () => {
    const g = await nuevo();
    await pool.query(`CREATE FUNCTION zz_fallar_aprobacion() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN IF NEW.id=${Number(g.id)} AND NEW.decision='aprobado' THEN RAISE EXCEPTION 'ZZ fallo final'; END IF; RETURN NEW; END $f$;
      CREATE TRIGGER zz_fallar_aprobacion BEFORE UPDATE ON gasto_operativo FOR EACH ROW EXECUTE FUNCTION zz_fallar_aprobacion()`);
    try {
      await assert.rejects(decidir(g.id, datos(g), usuario), /ZZ fallo final/);
      assert.equal((await pagos(g)).n, 0); assert.equal((await servicio.obtener(g.id)).decision, 'pendiente');
    } finally { await pool.query('DROP TRIGGER zz_fallar_aprobacion ON gasto_operativo; DROP FUNCTION zz_fallar_aprobacion()'); }
  });
  test('una caída fiscal deja aprobado/pagado y el trabajador retoma sólo la respuesta', async () => {
    const g = await nuevo(); desconectado = true;
    try {
      const r = await decidir(g.id, datos(g), usuario);
      assert.equal(r.hacienda.estado, 'pendiente'); assert.equal(r.gasto.decision, 'aprobado'); assert.equal((await pagos(g)).n, 1);
    } finally { desconectado = false; }
    await pool.query("UPDATE gasto_operativo SET decidido_en=now()-interval '3 minutes' WHERE id=$1", [g.id]);
    await fiscal.recuperarGastosPendientes();
    assert.equal((await pagos(g)).n, 1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM hacienda_comprobante WHERE origen='compra' AND origen_id=$1", [g.compra_id])).rows[0].n, 1);
  });
  test('medios inválidos y versión obsoleta no pagan; aprobar pide sólo el medio', async () => {
    const g = await nuevo(), d = datos(g);
    await assert.rejects(decidir(g.id, { ...d, metodoPagoId: 999999999 }, usuario), e => e.status === 400);
    await assert.rejects(decidir(g.id, { ...d, version: g.version - 1 }, usuario), e => e.status === 409);
    const m = (await pool.query("INSERT INTO metodo_pago(clave,nombre,pide_referencia) VALUES($1,'ZZ Referencia obligatoria',true) RETURNING id", ['zz-' + randomUUID().slice(0,20)])).rows[0].id;
    assert.equal((await servicio.obtener(g.id)).decision, 'pendiente'); assert.equal((await pagos(g)).n, 0);
    const aprobado = await decidir(g.id, { ...d, metodoPagoId: m }, usuario);
    assert.equal(Number(aprobado.gasto.saldo), 0);
    assert.equal(aprobado.gasto.pagos[0].referencia, null, 'no se inventa una referencia bancaria');
  });
  test('sin crédito y proporcionalidad usan los datos configurados sin inventar IVA', async () => {
    for (const condicion of ['04', '05']) {
      await pool.query("UPDATE hacienda_configuracion SET datos=jsonb_set(datos,'{condicion_iva_compras}',to_jsonb($1::text)) WHERE ambiente='produccion'", [condicion]);
      const g = await nuevo(), r = await decidir(g.id, datos(g), usuario);
      const xml = (await fiscal.archivo(r.hacienda.comprobante.id)).toString();
      assert.match(xml, new RegExp('<CondicionImpuesto>' + condicion));
      assert.equal(Number(r.gasto.iva_credito), 0);
      if (condicion === '05') { assert.doesNotMatch(xml, /<MontoTotalImpuestoAcreditar>|<MontoTotalDeGastoAplicable>/); assert.equal(r.gasto.revisado_en, null); }
      else assert.equal(Number(r.gasto.gasto_deducible), 113);
    }
    await pool.query("UPDATE hacienda_configuracion SET datos=jsonb_set(datos,'{condicion_iva_compras}','\"01\"') WHERE ambiente='produccion'");
  });
  test('el impuesto no acreditable no se transforma en crédito y los productos quedan intactos', async () => {
    const g = await nuevo({ categoria: 'combustible' });
    await pool.query('UPDATE gasto_operativo SET iva_maximo=0 WHERE id=$1', [g.id]);
    const r = await decidir(g.id, datos(g), usuario);
    assert.equal(Number(r.gasto.iva_credito), 0); assert.equal(Number(r.gasto.gasto_deducible), 113);
    assert.match((await fiscal.archivo(r.hacienda.comprobante.id)).toString(), /<CondicionImpuesto>04/);
    assert.equal((await pool.query("SELECT md5(string_agg(id||':'||costo_con_iva||':'||precio_sin_iva,',' ORDER BY id)) h FROM producto")).rows[0].h, corte);
  });
});

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const XLSX = require('xlsx');
const { periodo, prepararGasto, resumir } = require('../src/modules/reporte-contador/contador.mes');
const { excelMensual } = require('../src/modules/reporte-contador/contador.excel');
const { comprobantes } = require('../src/modules/reporte-contador/contador.comprobantes');

const fuente = (nombre) =>
  fs
    .readFileSync(path.join(__dirname, '../../frontend/src/utils', nombre), 'utf8')
    .replace(/^import .*\n/gm, '')
    .replace(/^export /gm, '');
const frente = new Function(
  fuente('fechaCR.js') +
    '\n' +
    fuente('reporteContadorUtils.js') +
    '\nreturn {periodoMesAnterior,periodoActual,moverMes,filtrarMovimientos};'
)();

describe('el cierre mensual conserva las decisiones y las monedas', () => {
  test('límites del mes, bisiesto y datos inválidos', () => {
    assert.equal(periodo({ anio: 2028, mes: 2 }).hasta, '2028-02-29');
    assert.equal(periodo({ anio: 2026, mes: 12 }).siguiente, '2027-01-01');
    for (const v of [
      { anio: 2026, mes: 13 },
      { anio: 2026.5, mes: 1 },
      { anio: '1 OR 1=1', mes: 1 },
      { anio: 2026, mes: 1.5 }
    ])
      assert.throws(
        () => periodo(v),
        (e) => e.status === 400
      );
  });
  test('el mes por defecto usa Costa Rica y pasa de enero a diciembre', () => {
    assert.deepEqual(frente.periodoMesAnterior(new Date('2027-01-01T03:00:00Z')), {
      anio: 2026,
      mes: 11
    });
    assert.deepEqual(frente.periodoMesAnterior(new Date('2027-01-01T07:00:00Z')), {
      anio: 2026,
      mes: 12
    });
  });
  test('lo pendiente y lo anulado no son importes fiscales aprobados', () => {
    const base = {
      total: '113',
      renta: 'deducible',
      iva: 'total',
      gasto_deducible: '100',
      iva_credito: '13',
      validacion: 'validado',
      estado: 'registrada'
    };
    assert.equal(prepararGasto(base).gasto_deducible, null);
    assert.equal(prepararGasto({ ...base, revisado_en: '2026-10-01' }).iva_credito, 13);
    assert.equal(
      prepararGasto({ ...base, revisado_en: '2026-10-01', estado: 'anulada' }).iva_credito,
      null
    );
    const r = resumir(
      [{ moneda: 'USD', tipo: 'Venta', total: 20 }],
      [{ moneda: 'CRC', estado: 'registrada', total: 113, gasto_deducible: 100, iva_credito: 13 }]
    );
    assert.deepEqual(
      r.map((x) => [x.moneda, x.ventas, x.gastos]),
      [
        ['CRC', 0, 113],
        ['USD', 20, 0]
      ]
    );
  });
  test('buscar no mezcla notas de proveedor con ventas', () => {
    const documentos = [
      { tipo: 'Nota de crédito proveedor', contraparte: 'ZZ Proveedor', numero: '1' },
      { tipo: 'Venta', contraparte: 'ZZ Cliente', numero: '2' }
    ];
    assert.equal(frente.filtrarMovimientos({ documentos }, 'ventas', '').length, 1);
    assert.equal(frente.filtrarMovimientos({ documentos }, 'compras', 'proveedor').length, 1);
  });
  test('el ZIP conserva los bytes originales y enumera los faltantes', async () => {
    const original = Buffer.from([0, 1, 255, 12]);
    const zip = await comprobantes(
      {
        anio: 2031,
        mes: 3,
        etiqueta: '03/2031',
        gastos: [{ id: 9, numero: '001', xml_ruta: 'zz.xml' }]
      },
      async () => original
    );
    const b = XLSX.CFB.read(zip.buffer, { type: 'buffer' });
    const xml = b.FileIndex.find((f) => f.name === 'gasto-9.xml');
    assert.deepEqual(Buffer.from(xml.content), original);
    assert.match(
      b.FileIndex.find((f) => f.name === 'LEEME.txt').content.toString(),
      /PDF no disponible/
    );
    assert.equal(zip.faltantes, 1);
  });
});

describe(
  'reporte mensual real, con PostgreSQL y correo simulado',
  { skip: process.env.PROBAR_BASE_LOCAL !== '1' },
  () => {
    let db, pool, servicio, historico, mes, previo, contacto, cuenta, gastoId;
    const archivos = [],
      envios = [];
    const almacen = require('../src/integrations/almacenamiento');
    before(async () => {
      require('../config/aislado').asegurarBaseLocal();
      assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_/);
      db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
      await db.connect();
      await db.query('BEGIN');
      let seq = 0;
      const pila = [];
      const puente = {
        release() {},
        query: async (sql, p) => {
          if (/^BEGIN/.test(sql)) {
            const n = 'zz_contador_' + ++seq;
            pila.push(n);
            return db.query('SAVEPOINT ' + n);
          }
          if (sql === 'COMMIT') return db.query('RELEASE SAVEPOINT ' + pila.pop());
          if (sql === 'ROLLBACK') {
            const n = pila.pop();
            await db.query('ROLLBACK TO SAVEPOINT ' + n);
            return db.query('RELEASE SAVEPOINT ' + n);
          }
          return db.query(sql, p);
        }
      };
      pool = { query: puente.query, connect: async () => puente };
      const config = require.resolve('../config/database');
      require.cache[config] = {
        id: config,
        filename: config,
        loaded: true,
        exports: { pool, query: puente.query }
      };
      const mail = require.resolve('../services/mailer');
      require.cache[mail] = {
        id: mail,
        filename: mail,
        loaded: true,
        exports: {
          estaConfigurado: () => true,
          enviarCorreo: async (r) => {
            envios.push(r);
            return { messageId: 'zz-simulado' };
          }
        }
      };
      for (const name of ['contador.mes', 'reporte-contador.service', 'contador.historico'])
        delete require.cache[require.resolve('../src/modules/reporte-contador/' + name)];
      servicio = require('../src/modules/reporte-contador/reporte-contador.service');
      historico = require('../src/modules/reporte-contador/contador.historico');
      const proveedor = (
        await db.query(
          "INSERT INTO proveedor(nombre,identificacion) VALUES('ZZ Contador restaurante',$1) RETURNING id",
          ['ZZ' + randomUUID().slice(0, 16)]
        )
      ).rows[0];
      for (const [numero, estado, fecha, total] of [
        ['ZZ-venta', 'emitida', '2031-03-31', 113.37],
        ['ZZ-anulada', 'anulada', '2031-03-20', 999],
        ['ZZ-borrador', 'borrador', '2031-03-20', 999],
        ['ZZ-abril', 'emitida', '2031-04-01', 999]
      ]) {
        const f = (
          await db.query(
            `INSERT INTO factura(numero,estado,fecha,cliente_nombre,subtotal,impuesto,total) VALUES($1,$2,$3,'ZZ Cliente',100,13.37,$4) RETURNING id`,
            [numero, estado, fecha, total]
          )
        ).rows[0];
        await db.query(
          "INSERT INTO factura_linea(factura_id,numero_linea,nombre,cantidad,precio_unitario,impuesto_monto,total) VALUES($1,1,'ZZ sin impuesto asignado',1,100,13.37,$2)",
          [f.id, total]
        );
      }
      await db.query(
        "INSERT INTO nota_credito(numero,fecha,cliente_nombre,total) VALUES('ZZ-nota','2031-03-31','ZZ Cliente',10)"
      );
      const comprar = async (numero, total, estado = 'registrada', facturaId = null) => {
        const c = (
          await db.query(
            `INSERT INTO compra(proveedor_id,numero_consecutivo,fecha_emision,total,estado,factura_proveedor_id) VALUES($1,$2,'2031-03-15',$3,$4,$5) RETURNING *`,
            [proveedor.id, numero, total, estado, facturaId]
          )
        ).rows[0];
        await db.query(
          "INSERT INTO compra_linea(compra_id,numero_linea,descripcion,cantidad,precio_unitario,total_linea) VALUES($1,1,'ZZ exento',1,$2,$2)",
          [c.id, total]
        );
        return c;
      };
      await comprar('ZZ-compra-exenta', 57);
      await comprar('ZZ-compra-anulada', 999, 'anulada');
      const crearGasto = async ({
        fecha = '2031-03-31 23:59:59',
        estado = 'registrada',
        revisado = false,
        total = 113,
        moneda = 'CRC',
        sinCompra = false
      } = {}) => {
        const f = (
          await db.query(
            `INSERT INTO facturas_proveedores(id,clave,numero_consecutivo,fecha_emision,proveedor_nombre,proveedor_cedula,total_productos,total_factura,moneda,archivo_xml,estado,tratamiento)
        VALUES($1,$2,'ZZ-factura',$3,'ZZ Contador restaurante','ZZ-123',0,$4,$5,'zz.xml','GASTO_RECURRENTE','alimentacion') RETURNING *`,
            [randomUUID(), randomUUID(), fecha, total, moneda]
          )
        ).rows[0];
        const c = sinCompra ? null : await comprar('ZZ-factura', total, estado, f.id);
        const g = (
          await db.query(
            `INSERT INTO gasto_operativo(factura_id,compra_id,categoria,descripcion,originales,validacion,renta,iva,iva_maximo,iva_credito,gasto_deducible,revisado_en)
        VALUES($1,$2,'alimentacion','ZZ almuerzo','{"resumen":{"totales":{"venta":100,"descuentos":0,"impuesto":13}}}','validado','deducible','total',13,13,100,$3) RETURNING id`,
            [f.id, c?.id || null, revisado ? new Date() : null]
          )
        ).rows[0];
        return { g, f, c };
      };
      await db.query(
        "UPDATE factura SET subtotal=90,descuento=10,impuesto=23.37 WHERE numero='ZZ-venta'"
      );
      const principal = await crearGasto({ revisado: true });
      gastoId = principal.g.id;
      cuenta = await require('../src/modules/compras/liberarCuentaPorPagar').crearCuentaDeContado(
        db,
        principal.f,
        principal.c
      );
      await crearGasto({ sinCompra: true, total: 20 });
      await crearGasto({ revisado: true, estado: 'anulada', total: 999 });
      await crearGasto({ fecha: '2031-04-01 00:00:00', total: 999 });
      await crearGasto({ total: 5, moneda: 'USD' });
      const xml = await almacen.guardarArchivo({
        carpeta: 'zz-contador',
        prefijo: 'original',
        extension: 'xml',
        buffer: Buffer.from('<original>ZZ proveedor</original>')
      });
      archivos.push(xml.ruta);
      await db.query('UPDATE facturas_proveedores SET xml_ruta=$2 WHERE id=$1', [
        principal.f.id,
        xml.ruta
      ]);
      await db.query(
        `INSERT INTO nota_credito_proveedor(clave,clave_referencia,proveedor_nombre,proveedor_cedula,fecha_emision,monto_total) VALUES($1,'ZZ-ref','ZZ proveedor','ZZ-123','2031-03-15',4)`,
        [randomUUID()]
      );
      contacto = await servicio.crearContacto({
        nombre: 'ZZ contador',
        email: 'zz-contador@example.invalid'
      });
      previo = (
        await db.query(
          `INSERT INTO reporte_contador_periodo(anio,mes,tipo,nombre_archivo) VALUES(2031,3,'ventas','ZZ entregado') RETURNING id`
        )
      ).rows[0];
    });
    after(async () => {
      if (db) {
        await db.query('ROLLBACK');
        await db.end();
      }
      for (const a of archivos) await almacen.borrarPrivado(a);
    });
    test('mes completo: emitidas, compras exentas, notas y gastos una sola vez; conserva originales', async () => {
      const resultado = await servicio.obtenerMes({ anio: 2031, mes: 3 });
      mes = resultado;
      assert.equal(mes.documentos.filter((d) => d.tipo === 'Venta').length, 1);
      assert.equal(mes.documentos.find((d) => d.tipo === 'Venta').total, 113.37);
      assert.equal(mes.documentos.find((d) => d.tipo === 'Venta').base, 90);
      assert.equal(mes.documentos.find((d) => d.tipo === 'Venta').lineas.length, 1);
      assert.equal(mes.documentos.filter((d) => d.tipo === 'Compra').length, 1);
      assert.equal(mes.documentos.filter((d) => d.tipo === 'Nota de crédito proveedor').length, 1);
      assert.equal(mes.gastos.length, 4);
      assert.equal(mes.gastos.filter((g) => g.revision === 'Por revisar').length, 2);
      assert.equal(mes.resumen.find((r) => r.moneda === 'CRC').gastos, 133);
      assert.equal(mes.resumen.find((r) => r.moneda === 'CRC').gasto_deducible, 100);
      assert.equal(mes.resumen.find((r) => r.moneda === 'USD').gastos, 5);
      assert.equal(
        (
          await db.query('SELECT nombre_archivo FROM reporte_contador_periodo WHERE id=$1', [
            previo.id
          ])
        ).rows[0].nombre_archivo,
        'ZZ entregado'
      );
      assert.equal((await historico.listarPeriodos(2031, 3))[0].id, previo.id);
      const publico = require('../src/modules/reporte-contador/contador.mes').vistaPublica(mes);
      assert.ok(publico.gastos.every((g) => !('xml_ruta' in g) && !('pdf_ruta' in g)));
    });
    test('Excel con todas las secciones, precisión y pendientes vacíos', () => {
      const b = XLSX.read(excelMensual(mes).buffer, { type: 'buffer' });
      assert.deepEqual(b.SheetNames, [
        'Información',
        'Resumen',
        'Documentos',
        'Detalle comercial',
        'Gastos operativos'
      ]);
      const gastos = XLSX.utils.sheet_to_json(b.Sheets['Gastos operativos'], { defval: null });
      assert.equal(gastos.length, 4);
      assert.equal(gastos[0]['Subtotal original'], 100);
      assert.equal(gastos[0]['Impuestos originales'], 13);
      assert.ok(
        gastos.some(
          (g) => g['Revisión'] === 'Por revisar' && g['Gasto deducible revisado'] === null
        )
      );
      assert.ok(
        gastos.some(
          (g) => g['Gasto deducible revisado'] === 100 && g['IVA acreditable revisado'] === 13
        )
      );
      assert.equal(
        XLSX.utils.sheet_to_json(b.Sheets.Documentos).find((d) => d.Tipo === 'Venta')[
          'Total comprobante'
        ],
        113.37
      );
    });
    test('el pago real y su método se reflejan sin otro registro ni otra compra', async () => {
      delete require.cache[
        require.resolve('../src/modules/pagos-proveedores/pagosProveedor.service')
      ];
      const metodo = (
        await db.query('SELECT id FROM metodo_pago WHERE activo AND NOT pide_referencia LIMIT 1')
      ).rows[0];
      await require('../src/modules/pagos-proveedores/pagosProveedor.service').registrarPago({
        metodoPagoId: metodo.id,
        aplicaciones: [{ cuentaPorPagarId: cuenta.id, monto: 10 }]
      });
      const r = await servicio.obtenerMes({ anio: 2031, mes: 3 });
      const g = r.gastos.find((g) => g.id === gastoId);
      assert.equal(g.saldo, 103);
      assert.equal(g.pagado, 10);
      assert.ok(g.metodos);
      assert.notEqual(r.huella, mes.huella);
      mes = r;
    });
    test('correo conjunto con respaldo y pendientes; una vista cambiada exige actualizar', async () => {
      await assert.rejects(
        servicio.enviarAlContador({ anio: 2031, mes: 3, contactoId: contacto.id, huella: 'vieja' }),
        (e) => e.status === 409
      );
      assert.equal(envios.length, 0);
      const r = await servicio.enviarAlContador({
        anio: 2031,
        mes: 3,
        contactoId: contacto.id,
        huella: mes.huella
      });
      assert.equal(envios.length, 1);
      assert.equal(envios[0].para, 'zz-contador@example.invalid');
      assert.equal(r.adjuntos.length, 2);
      assert.match(r.adjuntos[1], /\.zip$/);
      assert.equal(r.pendientes, 2);
      const respaldo = XLSX.CFB.read(envios[0].adjuntos[1].content, { type: 'buffer' });
      assert.equal(
        respaldo.FileIndex.find((f) => f.name === `gasto-${gastoId}.xml`).content.toString(),
        '<original>ZZ proveedor</original>'
      );
      assert.match(envios[0].texto, /pendientes de revisión/);
    });
  }
);

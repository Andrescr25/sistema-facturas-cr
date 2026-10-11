const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const {
  crearServicio,
} = require("../src/integrations/hacienda/emision.service");
const config = require("../src/integrations/hacienda/configuracion.service");
const { firmar } = require("../src/integrations/hacienda/firma/xades");
const { certificado, emisor, venta } = require("./helpers/hacienda");
const { generarVenta } = require("../src/integrations/hacienda/xml/v4.4");
const { guardarArchivo } = require("../src/integrations/almacenamiento");
// ROLLBACK, base local explícita y transporte simulado. No server ni cron.
test(
  "Hacienda: persistencia, aceptación, rechazo y compras en PostgreSQL",
  { skip: process.env.PROBAR_BASE_LOCAL !== "1" },
  async (t) => {
    const u = new URL(process.env.DATABASE_URL);
    assert.ok(["localhost", "127.0.0.1"].includes(u.hostname));
    const db = new Client({ connectionString: u.toString() });
    await db.connect();
    await db.query("BEGIN");
    let sec = 0;
    const pila = [];
    const puente = {
      query: async (sql, p) => {
        if (sql === "BEGIN") {
          const n = "fiscal_" + ++sec;
          pila.push(n);
          return db.query("SAVEPOINT " + n);
        }
        if (sql === "COMMIT")
          return db.query("RELEASE SAVEPOINT " + pila.pop());
        if (sql === "ROLLBACK") {
          const n = pila.pop();
          await db.query("ROLLBACK TO SAVEPOINT " + n);
          return db.query("RELEASE SAVEPOINT " + n);
        }
        return db.query(sql, p);
      },
      release() {},
    };
    const pool = { query: puente.query, connect: async () => puente },
      c = certificado();
    let facturaAceptada;
    let posts = 0,
      gets = 0,
      modo = "aceptada",
      timeout = false;
    const enviados = [];
    const respuesta = (clave) =>
      firmar(
        `<?xml version="1.0"?><MensajeHacienda xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeHacienda"><Clave>${clave}</Clave><NombreEmisor>ZZ</NombreEmisor><TipoIdentificacionEmisor>01</TipoIdentificacionEmisor><NumeroCedulaEmisor>123456789</NumeroCedulaEmisor><Mensaje>${modo === "rechazada" ? "3" : "1"}</Mensaje><EstadoMensaje>${modo === "rechazada" ? "Rechazado" : "Aceptado"}</EstadoMensaje><DetalleMensaje>ZZ respuesta simulada</DetalleMensaje><MontoTotalImpuesto>13</MontoTotalImpuesto><TotalFactura>${modo === "total" ? "114" : "113"}</TotalFactura></MensajeHacienda>`,
        c.p12,
        c.pin,
      );
    const transporte = {
      probar: async () => ({ conectado: true }),
      enviar: async (_, sobre) => {
        posts++;
        enviados.push(sobre);
        if (timeout) {
          timeout = false;
          throw Error("ZZ timeout");
        }
        return { status: 201 };
      },
      consultar: async (_, clave) => {
        gets++;
        if (modo === "404") return { status: 404 };
        // Así contesta el ambiente de pruebas a una clave que no conoce.
        if (modo === "400")
          return {
            status: 400,
            causa: `El comprobante [${clave}] no ha sido recibido.`,
          };
        return {
          status: 200,
          data: {
            clave,
            "ind-estado": modo === "rechazada" ? "rechazado" : "aceptado",
            "respuesta-xml": Buffer.from(
              respuesta(modo === "incorrecta" ? "9".repeat(50) : clave),
            ).toString("base64"),
          },
        };
      },
    };
    const s = crearServicio(pool, transporte);
    const sqlFalla = async (sql, p) => {
      await db.query("SAVEPOINT negativa");
      try {
        await assert.rejects(db.query(sql, p));
      } finally {
        await db.query("ROLLBACK TO SAVEPOINT negativa");
        await db.query("RELEASE SAVEPOINT negativa");
      }
    };
    try {
      await db.query(
        "UPDATE empresa SET nombre='ZZ emisor',tipo_identificacion='CF',identificacion='123456789',otras_senas='ZZ dirección de prueba',correo='zz@example.invalid' WHERE id=1",
      );
      const pago = (
        await db.query(
          "UPDATE metodo_pago SET codigo_medio_pago_hacienda='01' WHERE id=(SELECT min(id) FROM metodo_pago) RETURNING id",
        )
      ).rows[0].id;
      const impuesto = (
        await db.query(
          "UPDATE impuesto SET codigo_tarifa_hacienda='08' WHERE id=(SELECT min(id) FROM impuesto WHERE tarifa=13) RETURNING id",
        )
      ).rows[0].id;
      for (const a of ["pruebas", "produccion"])
        await config.guardar(
          puente,
          a,
          {
            ...emisor,
            pin: c.pin,
            // Como los entrega Hacienda: "@stag." en pruebas y "@prod." en
            // producción. Esta prueba usaba el dominio a secas para
            // producción —un formato que no existe— y por eso la regla mala
            // pasaba (ver haciendaUsuarioAmbiente.test.js).
            usuario:
              "cpf-01-2345-6789@" +
              (a === "pruebas" ? "stag." : "prod.") +
              "comprobanteselectronicos.go.cr",
            clave: "zz-password",
            habilitada: true,
          },
          c.p12,
        );
      const crear = async () => {
        const f = (
          await db.query(
            "INSERT INTO factura(numero,estado,fecha,cliente_nombre,cliente_identificacion,cliente_tipo_identificacion,actividad_economica,condicion_venta,metodo_pago_id,subtotal,impuesto,total) VALUES('ZZ-hacienda','emitida',CURRENT_DATE,'ZZ receptor','123456789','CF','123456','contado',$1,100,13,113) RETURNING id",
            [pago],
          )
        ).rows[0].id;
        await db.query(
          "INSERT INTO factura_linea(factura_id,numero_linea,nombre,cabys,unidad,cantidad,precio_unitario,impuesto_id,tarifa,impuesto_monto,total) VALUES($1,1,'ZZ producto','1234567890123','Unid',1,100,$2,13,13,113)",
          [f, impuesto],
        );
        return f;
      };
      const inventario = async () =>
        (
          await db.query(
            "SELECT md5(string_agg(producto_id::text||':'||existencia::text,',' ORDER BY producto_id)) AS huella,(SELECT count(*) FROM movimiento_inventario) AS movimientos FROM inventario_saldo",
          )
        ).rows[0];
      const antes = await inventario();
      await t.test(
        "configuración pública no expone PIN, p12 ni contraseña",
        async () => {
          const pub = JSON.stringify(await config.obtener(puente, "pruebas"));
          for (const secreto of [
            "zz-password",
            "zz-pin",
            c.p12.toString("base64"),
          ])
            assert.ok(!pub.includes(secreto));
        },
      );
      await t.test(
        "sandbox idempotente: 201 no acepta y XML de otra clave no cambia la venta",
        async () => {
          const f = await crear(),
            p = await s.preparar("factura", f, { ambiente: "pruebas" });
          assert.equal(
            p.id,
            (await s.preparar("factura", f, { ambiente: "pruebas" })).id,
          );
          assert.equal((await s.enviar(p.id)).estado, "recibida");
          const cuenta = posts;
          await s.enviar(p.id);
          assert.equal(posts, cuenta);
          modo = "incorrecta";
          await assert.rejects(
            s.consultar(p.id),
            (e) => e.code === "RESPUESTA_INVALIDA",
          );
          assert.equal((await s.obtener(p.id)).estado, "recibida");
          modo = "aceptada";
          assert.equal((await s.consultar(p.id)).estado, "aceptada");
          const row = (
            await db.query(
              "SELECT electronica,hacienda_estado,total FROM factura WHERE id=$1",
              [f],
            )
          ).rows[0];
          assert.equal(row.electronica, false);
          assert.equal(row.hacienda_estado, null);
          assert.equal(row.total, "113.00");
          assert.ok((await s.archivo(p.id, true)).includes("ZZ respuesta"));
          assert.deepEqual(await inventario(), antes);
        },
      );
      await t.test(
        "timeout consulta primero y reenvía los mismos bytes y clave",
        async () => {
          const p = await s.preparar("factura", await crear(), {
            ambiente: "pruebas",
          });
          timeout = true;
          await assert.rejects(s.enviar(p.id));
          assert.equal((await s.obtener(p.id)).estado, "incierta");
          const consultas = gets;
          modo = "404";
          assert.equal((await s.enviar(p.id)).estado, "recibida");
          assert.ok(gets > consultas);
          assert.deepEqual(enviados.at(-1), enviados.at(-2));
          assert.equal(enviados.at(-1).clave, p.clave);
          modo = "aceptada";
        },
      );
      await t.test(
        "un 400 'no ha sido recibido' también permite reenviar los mismos bytes",
        async () => {
          const p = await s.preparar("factura", await crear(), {
            ambiente: "pruebas",
          });
          timeout = true;
          await assert.rejects(s.enviar(p.id));
          modo = "400";
          assert.equal((await s.enviar(p.id)).estado, "recibida");
          assert.deepEqual(enviados.at(-1), enviados.at(-2));
          modo = "aceptada";
        },
      );
      await t.test(
        "reserva real protege cabecera y líneas; solo respuesta fiscal acepta",
        async () => {
          const f = await crear(),
            p = await s.preparar("factura", f, { ambiente: "produccion" });
          await sqlFalla("UPDATE factura SET cliente_nombre=$2 WHERE id=$1", [
            f,
            "Otro",
          ]);
          await sqlFalla(
            "UPDATE factura_linea SET nombre=$2 WHERE factura_id=$1",
            [f, "Otro"],
          );
          await sqlFalla(
            "INSERT INTO factura_linea(factura_id,numero_linea,nombre,unidad,cantidad,precio_unitario,total) VALUES($1,2,'Otra','Unid',1,1,1)",
            [f],
          );
          await sqlFalla("DELETE FROM factura WHERE id=$1", [f]);
          assert.equal((await s.enviar(p.id)).estado, "recibida");
          assert.equal(
            (await db.query("SELECT electronica FROM factura WHERE id=$1", [f]))
              .rows[0].electronica,
            false,
          );
          assert.equal((await s.consultar(p.id)).estado, "aceptada");
          const row = (
            await db.query(
              "SELECT electronica,hacienda_estado,total,clave_hacienda FROM factura WHERE id=$1",
              [f],
            )
          ).rows[0];
          assert.equal(row.electronica, true);
          assert.equal(row.hacienda_estado, "aceptada");
          assert.equal(row.clave_hacienda, p.clave);
          facturaAceptada = f;
          assert.equal(row.total, "113.00");
          await sqlFalla(
            "UPDATE hacienda_comprobante SET estado='preparada' WHERE id=$1",
            [p.id],
          );
          await sqlFalla("DELETE FROM hacienda_comprobante WHERE id=$1", [
            p.id,
          ]);
          assert.deepEqual(await inventario(), antes);
        },
      );
      await t.test(
        "nota fiscal referencia la factura aceptada sin repetir su devolución",
        async () => {
          assert.ok(facturaAceptada);
          await db.query(
            "UPDATE factura SET anulada_por_nota=TRUE WHERE id=$1",
            [facturaAceptada],
          );
          const nc = (
            await db.query(
              "INSERT INTO nota_credito(numero,fecha,cliente_nombre,cliente_identificacion,motivo,motivo_texto,subtotal,impuesto,total) VALUES('ZZ-nota-fiscal',CURRENT_DATE,'ZZ receptor','123456789','devolucion','ZZ devolución',100,13,113) RETURNING id",
            )
          ).rows[0].id;
          await db.query(
            "INSERT INTO nota_credito_linea(nota_credito_id,numero_linea,nombre,cabys,unidad,cantidad,precio_unitario,impuesto_id,tarifa,impuesto_monto,total) VALUES($1,1,'ZZ producto','1234567890123','Unid',1,100,$2,13,13,113)",
            [nc, impuesto],
          );
          await db.query(
            "INSERT INTO nota_credito_factura(nota_credito_id,factura_id,monto) VALUES($1,$2,113)",
            [nc, facturaAceptada],
          );
          const p = await s.preparar("nota_credito", nc, {
            ambiente: "produccion",
            codigoReferencia: "06",
          });
          assert.equal(p.tipo, "03");
          await s.enviar(p.id);
          assert.equal((await s.consultar(p.id)).estado, "aceptada");
          assert.equal(
            (
              await db.query(
                "SELECT electronica FROM nota_credito WHERE id=$1",
                [nc],
              )
            ).rows[0].electronica,
            true,
          );
          assert.deepEqual(await inventario(), antes);
        },
      );
      await t.test(
        "rechazo conserva original y sustitución usa nueva clave y referencia 16",
        async () => {
          const f = await crear(),
            p = await s.preparar("factura", f, { ambiente: "produccion" });
          await s.enviar(p.id);
          modo = "rechazada";
          assert.equal((await s.consultar(p.id)).estado, "rechazada");
          await db.query(
            "UPDATE factura SET cliente_nombre='ZZ corregido' WHERE id=$1",
            [f],
          );
          assert.equal(
            (await s.preparar("factura", f, { ambiente: "produccion" })).id,
            p.id,
          );
          const nuevo = await s.preparar("factura", f, {
            ambiente: "produccion",
            sustituir: true,
          });
          assert.notEqual(nuevo.clave, p.clave);
          assert.equal(nuevo.revisionDocumento, 2);
          assert.equal((await s.obtener(p.id)).estado, "rechazada");
          const xml = await s.archivo(nuevo.id);
          assert.ok(xml.includes("<TipoDocIR>10</TipoDocIR>"));
          assert.ok(xml.includes("<Codigo>16</Codigo>"));
          assert.ok(xml.includes(p.clave));
          modo = "aceptada";
          assert.deepEqual(await inventario(), antes);
        },
      );
      await t.test(
        "serie histórica usa la clave y el numerador nunca la reutiliza",
        async () => {
          const {
            clave,
            identificacion,
            fechaCR,
          } = require("../src/integrations/hacienda/xml/v4.4");
          const {
            normalizarSeriesHistoricas,
          } = require("../src/integrations/hacienda/historico");
          const f = await crear(),
            k = clave(
              "00100001010000009900",
              identificacion("CF", "123456789"),
              fechaCR(),
            );
          await db.query(
            "UPDATE factura SET alegra_id='zz-serie-historica',serie='00100001',consecutivo=9900,clave_hacienda=$2 WHERE id=$1",
            [f, k],
          );
          await normalizarSeriesHistoricas(puente, "factura");
          const original = (
            await db.query(
              "SELECT serie,numero,total,electronica FROM factura WHERE id=$1",
              [f],
            )
          ).rows[0];
          assert.equal(original.serie, "0010000101");
          assert.equal(original.numero, "ZZ-hacienda");
          assert.equal(original.total, "113.00");
          assert.equal(original.electronica, false);
          const p = await s.preparar("factura", await crear(), {
            ambiente: "produccion",
          });
          assert.equal(p.consecutivo, "00100001010000009901");
          assert.deepEqual(await inventario(), antes);
        },
      );
      await t.test(
        "histórico no se reemite y el error de CABYS revierte el numerador",
        async () => {
          const f = await crear();
          await db.query(
            "UPDATE factura SET alegra_id='zz-hacienda' WHERE id=$1",
            [f],
          );
          await assert.rejects(
            s.preparar("factura", f, { ambiente: "pruebas" }),
            (e) => e.code === "HISTORICO_NO_REEMITIR",
          );
          const f2 = await crear();
          await db.query(
            "UPDATE factura_linea SET cabys=NULL WHERE factura_id=$1",
            [f2],
          );
          const n = (
            await db.query(
              "SELECT siguiente::text FROM hacienda_numerador WHERE ambiente='pruebas' AND tipo='01'",
            )
          ).rows[0];
          await assert.rejects(
            s.preparar("factura", f2, { ambiente: "pruebas" }),
          );
          assert.deepEqual(
            (
              await db.query(
                "SELECT siguiente::text FROM hacienda_numerador WHERE ambiente='pruebas' AND tipo='01'",
              )
            ).rows[0],
            n,
          );
        },
      );
      await t.test(
        "mensaje receptor conserva clave del proveedor y no registra otra entrada",
        async () => {
          const proveedor = (
              await db.query("SELECT id FROM proveedor ORDER BY id LIMIT 1")
            ).rows[0].id,
            d = venta(),
            xml = firmar(generarVenta(d), c.p12, c.pin),
            a = await guardarArchivo({
              carpeta: "zz-pruebas",
              prefijo: "xml",
              extension: "xml",
              buffer: Buffer.from(xml),
              maximoBytes: 2 * 1024 * 1024,
            });
          const compra = (
            await db.query(
              "INSERT INTO compra(proveedor_id,clave,fecha_emision,total,xml_ruta) VALUES($1,$2,CURRENT_DATE,113,$3) RETURNING id",
              [proveedor, d.clave, a.ruta],
            )
          ).rows[0].id;
          const m = await s.preparar("compra", compra, {
            ambiente: "pruebas",
            mensaje: "1",
            detalle: "ZZ aceptación",
            condicionImpuesto: "01",
            impuestoAcreditar: "13",
            gastoAplicable: "100",
          });
          assert.equal(m.clave, d.clave);
          assert.equal(m.tipo, "05");
          await s.enviar(m.id);
          assert.equal(enviados.at(-1).consecutivoReceptor, m.consecutivo);
          assert.equal(enviados.at(-1).fecha, d.fecha);
          assert.equal((await s.consultar(m.id)).estado, "aceptada");
          assert.deepEqual(await inventario(), antes);
          await assert.rejects(
            s.compraDeBuzon("123"),
            (e) => e.code === "ID_INVALIDO",
          );
        },
      );
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  },
);

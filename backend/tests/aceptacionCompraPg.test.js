const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const { crearServicio } = require("../src/integrations/hacienda/emision.service");
const config = require("../src/integrations/hacienda/configuracion.service");
const numeracion = require("../src/integrations/hacienda/numeracion");
const { firmar } = require("../src/integrations/hacienda/firma/xades");
const { generarVenta } = require("../src/integrations/hacienda/xml/v4.4");
const { guardarArchivo } = require("../src/integrations/almacenamiento");
const { certificado, emisor, venta } = require("./helpers/hacienda");

/**
 * La compra se acepta sola ante Hacienda, contra PostgreSQL.
 *
 * QUÉ SE PIDIÓ (2026-10-12): que al registrar una compra en Revisión de
 * Precios el formulario de «Respuesta a Hacienda» «se haga solo», «siempre
 * como totalmente aceptada y ya en producción», y que la compra «NO se
 * duplique, sino que salga que yo le hice recepción». Acá se cuida:
 *  - que sin elegir la condición del IVA no salga nada ni se gaste un número;
 *  - que salga UNA aceptación por compra, en producción, citando la clave de
 *    la factura del proveedor, con la fecha de la confirmación;
 *  - que lo declarado (crédito de IVA y gasto) sea lo que dice la condición;
 *  - que el seguimiento mande sola la que quedó sin salir, sin tocar ventas;
 *  - que una compra sin el XML del proveedor lo diga y se pueda completar.
 *
 * Todo dentro de una transacción que se revierte, con Hacienda simulada. Se
 * salta sin PROBAR_BASE_LOCAL=1 (ver haciendaPg.test.js).
 */
test(
  "Hacienda: la compra se acepta sola al registrarla",
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
          const n = "compra_" + ++sec;
          pila.push(n);
          return db.query("SAVEPOINT " + n);
        }
        if (sql === "COMMIT") return db.query("RELEASE SAVEPOINT " + pila.pop());
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

    // Hacienda de mentira. `eco` decide cómo devuelve la clave consultada.
    let modo = "aceptada",
      caida = false,
      eco = (clave) => clave;
    const enviados = [];
    // LA RESPUESTA ES COMO LA REAL. Así contestó Hacienda a la primera
    // aceptación de verdad (2026-10-12): nombres en blanco, tipo del emisor
    // «01» aunque el proveedor era jurídico (02), los NÚMEROS de las dos
    // partes, «.» de detalle y el total con cinco decimales.
    const proveedorDe = new Map();
    const respuesta = (clave, aceptada) =>
      firmar(
        `<?xml version="1.0"?><MensajeHacienda xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeHacienda"><Clave>${clave}</Clave><NombreEmisor> </NombreEmisor><TipoIdentificacionEmisor>01</TipoIdentificacionEmisor><NumeroCedulaEmisor>${proveedorDe.get(clave) || "123456789"}</NumeroCedulaEmisor><NombreReceptor> </NombreReceptor><TipoIdentificacionReceptor>01</TipoIdentificacionReceptor><NumeroCedulaReceptor>123456789</NumeroCedulaReceptor><Mensaje>${aceptada ? 1 : 3}</Mensaje><EstadoMensaje>${aceptada ? "Aceptado" : "Rechazado"}</EstadoMensaje><DetalleMensaje>${aceptada ? "." : "ZZ rechazo de prueba"}</DetalleMensaje><MontoTotalImpuesto>13.00000</MontoTotalImpuesto><TotalFactura>113.00000</TotalFactura></MensajeHacienda>`,
        c.p12,
        c.pin,
      );
    const transporte = {
      probar: async () => ({ conectado: true }),
      enviar: async (_, sobre) => {
        if (caida) throw Error("ZZ sin red usuario=zz-secreto");
        enviados.push(sobre);
        return { status: 201 };
      },
      consultar: async (_, clave, consecutivoReceptor) =>
        modo === "404"
          ? { status: 404 }
          : {
              status: 200,
              data: {
                clave: eco(clave, consecutivoReceptor),
                "ind-estado": modo === "rechazada" ? "rechazado" : "aceptado",
                "respuesta-xml": Buffer.from(respuesta(clave, modo !== "rechazada")).toString("base64"),
              },
            },
    };
    const s = crearServicio(pool, transporte);
    const nodo = (xml, n) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(xml)?.[1];
    const comprobantes = async (compra) =>
      (
        await db.query(
          "SELECT id, ambiente, tipo, estado, clave, consecutivo, sobre, intentos, creada_por FROM hacienda_comprobante WHERE origen='compra' AND origen_id=$1 ORDER BY revision_documento",
          [compra],
        )
      ).rows;
    const condicion = (valor) => config.guardar(puente, "produccion", { condicion_iva_compras: valor });

    try {
      await db.query(
        "UPDATE empresa SET nombre='ZZ emisor',tipo_identificacion='CF',identificacion='123456789',otras_senas='ZZ dirección de prueba',correo='zz@example.invalid' WHERE id=1",
      );
      const usuarioId = (await db.query("SELECT min(id) AS id FROM usuario")).rows[0].id;
      for (const a of ["pruebas", "produccion"])
        await config.guardar(
          puente,
          a,
          {
            ...emisor,
            pin: c.pin,
            usuario: "cpf-01-2345-6789@" + (a === "pruebas" ? "stag." : "prod.") + "comprobanteselectronicos.go.cr",
            clave: "zz-password",
            habilitada: true,
          },
          c.p12,
        );
      // El proveedor ZZ es quien firmó la factura; el receptor es la empresa.
      const proveedor = (
        await db.query("UPDATE proveedor SET identificacion='123456789' WHERE id=(SELECT min(id) FROM proveedor) RETURNING id")
      ).rows[0].id;
      let n = 0;
      /** Una compra ZZ registrada, con (o sin) el XML de su proveedor. Total 113, IVA 13. */
      const comprar = async ({ conXml = true, juridico = false } = {}) => {
        const d = venta();
        // Cada factura del proveedor tiene su propia clave.
        d.clave = d.clave.slice(0, 41 - String(++n).length) + String(n) + d.clave.slice(41);
        // La mayoría de los proveedores son sociedades: cédula jurídica (02).
        if (juridico) d.emisor = { ...d.emisor, tipo_identificacion: "CJ", identificacion: "3101123456" };
        proveedorDe.set(d.clave, d.emisor.identificacion);
        const xml = firmar(generarVenta(d), c.p12, c.pin);
        const a = conXml
          ? await guardarArchivo({ carpeta: "zz-pruebas", prefijo: "xml", extension: "xml", buffer: Buffer.from(xml), maximoBytes: 2 * 1024 * 1024 })
          : null;
        const id = (
          await db.query("INSERT INTO compra(proveedor_id,clave,fecha_emision,total,xml_ruta) VALUES($1,$2,CURRENT_DATE,113,$3) RETURNING id", [
            proveedor,
            d.clave,
            a?.ruta || null,
          ])
        ).rows[0].id;
        return { id, clave: d.clave, fechaProveedor: d.fecha, xml };
      };

      await t.test("sin elegir la condición del IVA no sale nada ni se gasta un número", async () => {
        const compra = await comprar();
        const e = await s.estadoDeCompra(compra.id);
        assert.equal(e.condicion, null);
        assert.match(e.motivoNoEmitible, /Falta elegir con qué condición de IVA/);
        const r = await s.alRegistrarCompra(compra.id, usuarioId);
        assert.equal(r.estado, "pendiente");
        assert.match(r.motivo, /Falta elegir con qué condición de IVA/);
        assert.deepEqual(await comprobantes(compra.id), []);
        assert.equal(enviados.length, 0);
        await assert.rejects(s.aceptarCompra(compra.id), (x) => x.code === "NO_EMITIBLE" && x.status === 409);
      });

      await t.test("la condición se guarda en Configuración, y solo las que se pueden declarar solas", async () => {
        for (const mala of ["02", "03", "99", "crédito"])
          await assert.rejects(condicion(mala), (x) => x.code === "DATO_INVALIDO", mala);
        assert.equal((await condicion("04")).datos.condicion_iva_compras, "04");
        // Guardar otra cosa no la borra…
        assert.equal((await config.guardar(puente, "produccion", { sucursal: "001" })).datos.condicion_iva_compras, "04");
        // …y dejarla vacía es «todavía no».
        assert.equal((await condicion("")).datos.condicion_iva_compras, "");
        assert.equal((await condicion("01")).datos.condicion_iva_compras, "01");
        // No se confunde con la de pruebas: allá no se acepta nada.
        assert.equal((await config.obtener(puente, "pruebas")).datos.condicion_iva_compras, undefined);
      });

      let primera;
      await t.test("al registrar: UNA aceptación total, en producción, sobre la clave del proveedor", async () => {
        const compra = (primera = await comprar());
        const r = await s.alRegistrarCompra(compra.id, usuarioId);
        assert.equal(r.estado, "enviada");
        assert.equal(r.comprobante.estado, "recibida");
        const [fila, ...mas] = await comprobantes(compra.id);
        assert.equal(mas.length, 0);
        assert.equal(fila.ambiente, "produccion");
        assert.equal(fila.tipo, "05", "no salió como aceptación total");
        assert.equal(fila.clave, compra.clave, "la aceptación no cita la factura del proveedor");
        assert.match(fila.consecutivo, /^0010000105\d{10}$/);
        assert.equal(fila.creada_por, usuarioId);

        // Lo que viajó a Hacienda: la clave del proveedor, nuestro número de
        // aceptación, él como emisor y nosotros como receptor.
        const sobre = enviados.at(-1);
        assert.equal(sobre.clave, compra.clave);
        assert.equal(sobre.consecutivoReceptor, fila.consecutivo);
        assert.equal(sobre.emisor.numeroIdentificacion, "123456789");
        assert.equal(sobre.receptor.numeroIdentificacion, "123456789");
        const xml = Buffer.from(sobre.comprobanteXml, "base64").toString("utf8");
        assert.match(xml, /<MensajeReceptor /);
        assert.equal(nodo(xml, "Mensaje"), "1");
        assert.equal(nodo(xml, "NumeroConsecutivoReceptor"), fila.consecutivo);
        // La fecha es la de la CONFIRMACIÓN, en el XML y en el sobre, y no la
        // de la factura del proveedor.
        assert.equal(nodo(xml, "FechaEmisionDoc"), sobre.fecha);
        assert.notEqual(sobre.fecha, compra.fechaProveedor);
        assert.ok(Math.abs(Date.now() - new Date(sobre.fecha).getTime()) < 5 * 60 * 1000, sobre.fecha);
        // Condición 01: todo el IVA es crédito; el gasto es el resto.
        assert.equal(nodo(xml, "CondicionImpuesto"), "01");
        assert.equal(nodo(xml, "MontoTotalImpuestoAcreditar"), "13.00000");
        assert.equal(nodo(xml, "MontoTotalDeGastoAplicable"), "100.00000");
        assert.doesNotMatch(xml, /DetalleMensaje/);
      });

      await t.test("registrar otra vez, o dos clics, no crean una segunda aceptación", async () => {
        const antes = enviados.length;
        const r = await s.alRegistrarCompra(primera.id, usuarioId);
        assert.equal(r.estado, "enviada");
        assert.equal((await s.aceptarCompra(primera.id)).id, r.comprobante.id);
        assert.equal((await comprobantes(primera.id)).length, 1, "la compra quedó con dos aceptaciones");
        assert.equal(enviados.length, antes, "se le mandó dos veces lo mismo a Hacienda");
      });

      await t.test("la compra muestra lo que se declaró y, al contestar Hacienda, que quedó aceptada", async () => {
        const e = await s.estadoDeCompra(primera.id);
        assert.equal(e.comprobante.estado, "recibida");
        assert.equal(e.motivoNoEmitible, null);
        assert.deepEqual(e.declarado, {
          condicion: "01",
          impuesto: "13.00000",
          impuestoAcreditar: "13.00000",
          gastoAplicable: "100.00000",
          total: "113.00000",
        });
        assert.equal((await s.consultar(e.comprobante.id)).estado, "aceptada");
        assert.equal((await s.estadoDeCompra(primera.id)).comprobante.estado, "aceptada");
        // Ya aceptada, cambiar la condición no la toca ni pide nada.
        await condicion("");
        assert.equal((await s.estadoDeCompra(primera.id)).motivoNoEmitible, null);
        await condicion("01");
      });

      // LA PRIMERA ACEPTACIÓN REAL (2026-10-12): Hacienda la aceptó y este
      // sistema no lo anotó —«Los datos de la respuesta fiscal no corresponden
      // al comprobante»— porque exigía que el tipo de identificación del
      // emisor fuera el del proveedor (02) y Hacienda responde 01.
      await t.test("un proveedor con cédula jurídica: la respuesta real de Hacienda se reconoce como aceptada", async () => {
        const compra = await comprar({ juridico: true });
        const r = await s.alRegistrarCompra(compra.id, usuarioId);
        assert.equal(r.estado, "enviada");
        assert.deepEqual(enviados.at(-1).emisor, { tipoIdentificacion: "02", numeroIdentificacion: "3101123456" });
        // Como la devuelve Hacienda: la clave con el consecutivo pegado.
        eco = (clave, consecutivo) => `${clave}-${consecutivo}`;
        try {
          assert.equal((await s.consultar(r.comprobante.id)).estado, "aceptada");
        } finally {
          eco = (clave) => clave;
        }
        const e = await s.estadoDeCompra(compra.id);
        assert.equal(e.comprobante.estado, "aceptada");
        assert.equal(e.comprobante.tieneRespuesta, true, "no se guardó la respuesta de Hacienda");
        // El NÚMERO del emisor sí se compara: la respuesta de otro proveedor no pasa.
        const otra = await comprar({ juridico: true });
        const r2 = await s.alRegistrarCompra(otra.id, usuarioId);
        proveedorDe.set(otra.clave, "3101999999");
        await assert.rejects(s.consultar(r2.comprobante.id), (x) => x.code === "RESPUESTA_INVALIDA");
        proveedorDe.set(otra.clave, "3101123456");
        assert.equal((await s.consultar(r2.comprobante.id)).estado, "aceptada");
      });

      await t.test("Hacienda puede devolver la clave como «clave-consecutivo»: es el mismo mensaje", async () => {
        const compra = await comprar();
        const r = await s.alRegistrarCompra(compra.id, usuarioId);
        eco = (clave, consecutivo) => `${clave}-${consecutivo}`;
        try {
          assert.equal((await s.consultar(r.comprobante.id)).estado, "aceptada");
        } finally {
          eco = (clave) => clave;
        }
        // Otra clave cualquiera sigue sin aceptarse.
        const otra = await comprar();
        const r2 = await s.alRegistrarCompra(otra.id, usuarioId);
        eco = () => "9".repeat(50);
        try {
          await assert.rejects(s.consultar(r2.comprobante.id), (x) => x.code === "RESPUESTA_INVALIDA");
        } finally {
          eco = (clave) => clave;
        }
      });

      await t.test("cada condición declara lo suyo", async () => {
        await condicion("04");
        const gasto = await comprar();
        await s.alRegistrarCompra(gasto.id, usuarioId);
        assert.deepEqual(
          [(await s.estadoDeCompra(gasto.id)).declarado].map((d) => [d.condicion, d.impuestoAcreditar, d.gastoAplicable]),
          [["04", "0.00000", "113.00000"]],
        );
        await condicion("05");
        const proporcional = await comprar();
        await s.alRegistrarCompra(proporcional.id, usuarioId);
        const d = (await s.estadoDeCompra(proporcional.id)).declarado;
        assert.deepEqual([d.condicion, d.impuestoAcreditar, d.gastoAplicable], ["05", null, null]);
        await condicion("01");
      });

      await t.test("si Hacienda no atiende, la compra queda con su aceptación firmada y el seguimiento la manda sola", async () => {
        const compra = await comprar();
        caida = true;
        const r = await s.alRegistrarCompra(compra.id, usuarioId);
        caida = false;
        assert.equal(r.estado, "pendiente");
        assert.doesNotMatch(JSON.stringify(r), /zz-secreto/);
        assert.equal(r.comprobante.estado, "preparada");
        const id = r.comprobante.id;
        const estado = async () => (await db.query("SELECT estado FROM hacienda_comprobante WHERE id=$1", [id])).rows[0].estado;
        assert.equal(await estado(), "incierta", "un envío sin confirmar tiene que quedar marcado, no como si nada");

        // Hacienda no la tiene (404): el seguimiento manda otra vez LOS MISMOS
        // bytes, sin gastar otro número.
        modo = "404";
        await db.query("UPDATE hacienda_comprobante SET proxima_consulta=now()-interval '1 minute' WHERE id=$1", [id]);
        const antes = enviados.length;
        await s.pendientes();
        modo = "aceptada";
        assert.equal(enviados.length, antes + 1, "el seguimiento no reintentó el envío de la aceptación");
        assert.equal(enviados.at(-1).consecutivoReceptor, r.comprobante.consecutivo);
        assert.equal(await estado(), "recibida");
        assert.equal((await comprobantes(compra.id)).length, 1);
      });

      await t.test("el seguimiento manda una aceptación que quedó solo firmada, pero no una recién hecha ni una venta", async () => {
        const compra = await comprar();
        const p = await s.aceptarCompra(compra.id, {}, usuarioId);
        assert.equal(p.estado, "preparada");
        const estado = async () => (await db.query("SELECT estado FROM hacienda_comprobante WHERE id=$1", [p.id])).rows[0].estado;
        // Recién firmada: la está mandando quien registró la compra.
        await s.pendientes();
        assert.equal(await estado(), "preparada");
        // Pasaron unos minutos y nadie la mandó.
        await db.query("UPDATE hacienda_comprobante SET actualizado_en=now()-interval '5 minutes', proxima_consulta=now()-interval '1 minute' WHERE id=$1", [p.id]);
        await s.pendientes();
        assert.equal(await estado(), "recibida");

        // Con cinco intentos ya no se insiste sola.
        const otra = await comprar();
        const q = await s.aceptarCompra(otra.id, {}, usuarioId);
        await db.query("UPDATE hacienda_comprobante SET intentos=5, actualizado_en=now()-interval '5 minutes', proxima_consulta=now()-interval '1 minute' WHERE id=$1", [q.id]);
        const antes = enviados.length;
        await s.pendientes();
        assert.equal(enviados.length, antes);

        // Una venta preparada no se manda sola: la sigue quien factura.
        const venta1 = (
          await db.query(
            "INSERT INTO hacienda_comprobante(ambiente,origen,origen_id,tipo,clave,consecutivo,fecha,xml_ruta,xml_sha256,sobre,revision_documento,actualizado_en,proxima_consulta) SELECT 'produccion','factura',origen_id,'01',$2,'00100001010000099999',fecha,xml_ruta,xml_sha256,sobre,99,now()-interval '5 minutes',now()-interval '1 minute' FROM hacienda_comprobante WHERE id=$1 RETURNING id",
            [p.id, "8".repeat(50)],
          )
        ).rows[0].id;
        await s.pendientes();
        assert.equal((await db.query("SELECT estado FROM hacienda_comprobante WHERE id=$1", [venta1])).rows[0].estado, "preparada");
        assert.equal(enviados.length, antes);
      });

      await t.test("si Hacienda la rechaza, «volver a enviar» saca otra con otro número", async () => {
        const compra = await comprar();
        modo = "rechazada";
        const r = await s.alRegistrarCompra(compra.id, usuarioId);
        assert.equal((await s.consultar(r.comprobante.id)).estado, "rechazada");
        modo = "aceptada";
        const e = await s.estadoDeCompra(compra.id);
        assert.equal(e.comprobante.estado, "rechazada");
        assert.equal(e.motivoNoEmitible, null);
        // Sin pedirlo no se reemplaza: devuelve la rechazada.
        assert.equal((await s.aceptarCompra(compra.id)).id, r.comprobante.id);
        const nueva = await s.aceptarCompra(compra.id, { sustituir: true }, usuarioId);
        assert.notEqual(nueva.id, r.comprobante.id);
        assert.notEqual(nueva.consecutivo, r.comprobante.consecutivo);
        assert.equal(nueva.clave, compra.clave);
        assert.equal((await comprobantes(compra.id)).length, 2);
      });

      await t.test("una compra sin el XML del proveedor lo dice, y se completa subiendo el archivo correcto", async () => {
        const compra = await comprar({ conXml: false });
        const e = await s.estadoDeCompra(compra.id);
        assert.equal(e.necesitaXml, true);
        assert.match(e.motivoNoEmitible, /no conserva el XML del proveedor/);
        const r = await s.alRegistrarCompra(compra.id, usuarioId);
        assert.equal(r.estado, "pendiente");
        assert.match(r.motivo, /XML del proveedor/);
        assert.deepEqual(await comprobantes(compra.id), []);
        // El XML de OTRA factura no sirve.
        await assert.rejects(s.subirOriginal(compra.id, Buffer.from(primera.xml), usuarioId), (x) => x.code === "XML_OTRO_DOCUMENTO");
        assert.deepEqual(await s.subirOriginal(compra.id, Buffer.from(compra.xml), usuarioId), { xmlConservado: true });
        const listo = await s.estadoDeCompra(compra.id);
        assert.equal(listo.necesitaXml, false);
        assert.equal(listo.motivoNoEmitible, null);
        assert.equal((await s.alRegistrarCompra(compra.id, usuarioId)).estado, "enviada");
        // Ya con respuesta fiscal, el XML no se reemplaza.
        await assert.rejects(s.subirOriginal(compra.id, Buffer.from(compra.xml), usuarioId), (x) => x.code === "XML_YA_EXISTE");
      });

      await t.test("con producción deshabilitada no se acepta en pruebas: se dice qué falta", async () => {
        const compra = await comprar();
        await db.query("UPDATE hacienda_configuracion SET habilitada=FALSE WHERE ambiente='produccion'");
        const r = await s.alRegistrarCompra(compra.id, usuarioId);
        await db.query("UPDATE hacienda_configuracion SET habilitada=TRUE WHERE ambiente='produccion'");
        assert.equal(r.estado, "pendiente");
        assert.match(r.motivo, /Habilitá Producción/);
        assert.deepEqual(await comprobantes(compra.id), [], "salió una aceptación de prueba para una compra real");
      });

      await t.test("la numeración de las aceptaciones se ve y se puede mover desde Configuración", async () => {
        const de = async () => (await numeracion.ver(pool, "produccion")).find((x) => x.tipo === "05");
        const actual = await de();
        assert.equal(actual.nombre, "Aceptación de compra");
        // Si antes se aceptaban compras desde otro sistema, se sigue desde su número.
        const siguiente = String(BigInt(actual.proximo) + 500n);
        await numeracion.fijar(puente, "produccion", { tipo: "05", siguiente }, usuarioId);
        const compra = await comprar();
        const r = await s.alRegistrarCompra(compra.id, usuarioId);
        assert.equal(r.comprobante.consecutivo, "0010000105" + siguiente.padStart(10, "0"));
        assert.equal((await de()).proximo, String(BigInt(siguiente) + 1n));
      });
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  },
);

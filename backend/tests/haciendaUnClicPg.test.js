const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const { crearServicio } = require("../src/integrations/hacienda/emision.service");
const config = require("../src/integrations/hacienda/configuracion.service");
const { firmar } = require("../src/integrations/hacienda/firma/xades");
const { certificado, emisor } = require("./helpers/hacienda");

/**
 * Emitir de un clic, contra PostgreSQL: lo que decide el servidor solo y el
 * correo al cliente cuando Hacienda acepta.
 *
 * QUÉ SE PIDIÓ (2026-10-11): un botón que emita sin modal, y que la factura
 * aceptada le llegue al cliente con el PDF y los dos XML. Acá se cuida:
 *  - que el clic elija bien ambiente y tipo, y no gaste dos números;
 *  - que el correo salga UNA vez, justo cuando la factura pasa a aceptada, y
 *    solo en producción;
 *  - que un correo que falla no deshaga ni tumbe la aceptación;
 *  - que lo que pasó con el correo quede anotado, porque es lo que después
 *    muestra la factura.
 *
 * Todo dentro de una transacción que se revierte, con Hacienda y el correo
 * simulados. Se salta sin PROBAR_BASE_LOCAL=1 (ver haciendaPg.test.js).
 */
test(
  "Hacienda de un clic: emisión sin preguntar y correo al aceptar",
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
          const n = "unclic_" + ++sec;
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

    // Hacienda de mentira: recibe todo y contesta lo que diga `modo`.
    let modo = "aceptada",
      posts = 0;
    const respuesta = (clave, total) =>
      firmar(
        `<?xml version="1.0"?><MensajeHacienda xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeHacienda"><Clave>${clave}</Clave><NombreEmisor>ZZ</NombreEmisor><TipoIdentificacionEmisor>01</TipoIdentificacionEmisor><NumeroCedulaEmisor>123456789</NumeroCedulaEmisor><Mensaje>${modo === "rechazada" ? "3" : "1"}</Mensaje><EstadoMensaje>${modo === "rechazada" ? "Rechazado" : "Aceptado"}</EstadoMensaje><DetalleMensaje>ZZ respuesta simulada</DetalleMensaje><MontoTotalImpuesto>13</MontoTotalImpuesto><TotalFactura>${total}</TotalFactura></MensajeHacienda>`,
        c.p12,
        c.pin,
      );
    const totales = new Map();
    // Para simular dos consultas a la vez: lo que se ponga acá corre cuando
    // Hacienda ya contestó la primera y todavía no se guardó nada.
    let enMedio = null;
    const transporte = {
      probar: async () => ({ conectado: true }),
      enviar: async () => (posts++, { status: 201 }),
      consultar: async (_, clave) => {
        const otra = enMedio;
        enMedio = null;
        if (otra) await otra();
        return contestar(clave);
      },
    };
    const contestar = (clave) =>
        modo === "procesando"
          ? { status: 200, data: { clave, "ind-estado": "procesando" } }
          : {
              status: 200,
              data: {
                clave,
                "ind-estado": modo === "rechazada" ? "rechazado" : "aceptado",
                "respuesta-xml": Buffer.from(respuesta(clave, totales.get(clave) || "113")).toString("base64"),
              },
            };

    // El correo de mentira: anota a qué factura lo llamaron y contesta `correo`.
    const entregas = [];
    let correo = { estado: "enviado", para: "zz-cliente@example.invalid" };
    const s = crearServicio(pool, transporte, {
      alAceptarFactura: async (facturaId) => {
        entregas.push(facturaId);
        if (correo instanceof Error) throw correo;
        return correo;
      },
    });
    const sinCorreo = crearServicio(pool, transporte);

    const habilitar = (ambiente, habilitada) =>
      db.query("UPDATE hacienda_configuracion SET habilitada=$2 WHERE ambiente=$1", [ambiente, habilitada]);
    const anotados = async (comprobanteId) =>
      (
        await db.query(
          "SELECT despues, usuario_id FROM bitacora_cambio WHERE entidad='hacienda_comprobante' AND entidad_id=$1 AND accion='correo' ORDER BY id",
          [String(comprobanteId)],
        )
      ).rows;

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
      const usuarioId = (await db.query("SELECT min(id) AS id FROM usuario")).rows[0].id;
      // Otro medio, distinto del de `pago` (01), para ver cuál se declara.
      const sinpe = (
        await db.query(
          "UPDATE metodo_pago SET codigo_medio_pago_hacienda='06', activo=TRUE WHERE id=(SELECT min(id) FROM metodo_pago WHERE id<>$1) RETURNING id",
          [pago],
        )
      ).rows[0].id;
      const plazo = (await db.query("SELECT min(id) AS id FROM plazo_credito WHERE dias > 0")).rows[0].id;
      /** Un cobro vigente de esa factura, con ese medio. */
      const cobrar = async (f, metodo, monto = 113) => {
        const p = (
          await db.query(
            "INSERT INTO pago(fecha,cliente_nombre,metodo_pago_id,metodo_pago_texto,monto) VALUES(CURRENT_DATE,'ZZ receptor',$1,'ZZ',$2) RETURNING id",
            [metodo, monto],
          )
        ).rows[0].id;
        await db.query("INSERT INTO pago_factura(pago_id,factura_id,factura_numero,monto) VALUES($1,$2,'ZZ-un-clic',$3)", [p, f.id, monto]);
        return p;
      };
      const medioDeclarado = async (comprobanteId) =>
        /<TipoMedioPago>(\d{2})<\/TipoMedioPago>/.exec(await s.archivo(comprobanteId))?.[1] || null;
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

      /**
       * Una factura ZZ de una línea; `cedula` vacía = cliente sin identificar.
       * `medio: null` = como nacen hoy las facturas: sin medio de pago.
       */
      const crear = async ({ cedula = "123456789", descuento = 0, extra = "", medio = pago, credito = false } = {}) => {
        const base = 100 - descuento,
          iva = Math.round(base * 13) / 100,
          total = base + iva;
        const f = (
          await db.query(
            `INSERT INTO factura(numero,estado,fecha,cliente_nombre,cliente_identificacion,cliente_tipo_identificacion,actividad_economica,condicion_venta,plazo_credito_id,metodo_pago_id,subtotal,descuento,impuesto,total${extra ? "," + extra : ""}) VALUES('ZZ-un-clic','emitida',CURRENT_DATE,'ZZ receptor',$2,$3,'123456',$8,$9,$1,$4,$5,$6,$7${extra ? ",'zz-alegra-1'" : ""}) RETURNING id`,
            [medio, cedula || null, cedula ? "CF" : null, base, descuento, iva, total, credito ? "credito" : "contado", credito ? plazo : null],
          )
        ).rows[0].id;
        await db.query(
          "INSERT INTO factura_linea(factura_id,numero_linea,nombre,cabys,unidad,cantidad,precio_unitario,descuento_monto,impuesto_id,tarifa,impuesto_monto,total) VALUES($1,1,'ZZ producto','1234567890123','Unid',1,100,$3,$2,13,$4,$5)",
          [f, impuesto, descuento, iva, total],
        );
        return { id: f, total: String(total) };
      };
      /** Un clic completo, como lo encadena la pantalla. */
      const clic = async (f, datos) => {
        const p = await s.emitirFactura(f.id, datos, usuarioId);
        totales.set(p.clave, f.total);
        await s.enviar(p.id);
        return s.consultar(p.id);
      };

      await t.test("el clic elige el ambiente: producción si está habilitada; si no, pruebas", async () => {
        const f = await crear();
        assert.equal((await s.estadoDeFactura(f.id)).ambiente, "produccion");
        await habilitar("produccion", false);
        assert.equal((await s.estadoDeFactura(f.id)).ambiente, "pruebas");
        await habilitar("pruebas", false);
        const e = await s.estadoDeFactura(f.id);
        assert.equal(e.ambiente, null);
        assert.match(e.motivoNoEmitible, /Habilitá un ambiente/);
        await assert.rejects(s.emitirFactura(f.id), (x) => x.code === "NO_EMITIBLE" && x.status === 409);
        await habilitar("pruebas", true);
        await habilitar("produccion", true);
      });

      await t.test("factura si el cliente tiene cédula, tiquete si no", async () => {
        const conCedula = await crear(),
          sinCedula = await crear({ cedula: "" });
        assert.equal((await s.estadoDeFactura(conCedula.id)).tipo, "01");
        assert.equal((await s.estadoDeFactura(sinCedula.id)).tipo, "04");
        assert.equal((await s.emitirFactura(sinCedula.id)).tipo, "04");
      });

      await t.test("dos clics seguidos no gastan dos números", async () => {
        const f = await crear();
        const a = await s.emitirFactura(f.id),
          b = await s.emitirFactura(f.id);
        assert.equal(a.id, b.id);
        assert.equal(a.clave, b.clave);
        assert.equal(a.ambiente, "produccion");
        assert.equal(a.tipo, "01");
        assert.equal(a.estado, "preparada");
        const e = await s.estadoDeFactura(f.id);
        assert.equal(e.comprobante.id, a.id);
        assert.equal(e.motivoNoEmitible, null);
        assert.equal(e.correo, null, "todavía no la aceptó nadie");
      });

      await t.test("al aceptarla Hacienda en producción, el correo sale UNA vez y queda anotado", async () => {
        const f = await crear();
        const antes = entregas.length;
        const r = await clic(f);
        assert.equal(r.estado, "aceptada");
        assert.deepEqual(r.correo, { estado: "enviado", para: "zz-cliente@example.invalid" });
        assert.deepEqual(entregas.slice(antes), [f.id], "el correo no recibió la factura aceptada");
        // Consultar de nuevo (otra persona, el seguimiento de cada minuto) no reenvía.
        const otra = await s.consultar(r.id);
        assert.equal(otra.estado, "aceptada");
        assert.equal(otra.correo, undefined);
        assert.equal(entregas.length, antes + 1, "el cliente recibió la factura dos veces");
        const notas = await anotados(r.id);
        assert.equal(notas.length, 1);
        assert.deepEqual(notas[0].despues, { estado: "enviado", para: "zz-cliente@example.invalid" });
        // Y es lo que después lee la factura.
        const e = await s.estadoDeFactura(f.id);
        assert.equal(e.comprobante.estado, "aceptada");
        assert.deepEqual(e.correo, { estado: "enviado", para: "zz-cliente@example.invalid" });
        assert.equal(e.motivoNoEmitible, null);
        // Aunque alguien pida sustituirla, una aceptada devuelve la misma:
        // solo un rechazo prepara otro comprobante.
        assert.equal((await s.emitirFactura(f.id, { sustituir: true })).id, r.id, "se preparó otro comprobante para una aceptada");
      });

      await t.test("dos consultas a la vez (la persona y el seguimiento) mandan un solo correo", async () => {
        const f = await crear();
        const p = await s.emitirFactura(f.id);
        totales.set(p.clave, f.total);
        await s.enviar(p.id);
        const antes = entregas.length;
        // Mientras esta consulta espera a Hacienda, otra entera la acepta.
        let ganadora;
        enMedio = async () => { ganadora = await s.consultar(p.id); };
        const perdedora = await s.consultar(p.id);
        assert.equal(ganadora.estado, "aceptada");
        assert.equal(ganadora.correo.estado, "enviado");
        assert.equal(perdedora.estado, "aceptada");
        assert.equal(perdedora.correo, undefined, "la consulta que llegó segunda también mandó el correo");
        assert.equal(entregas.length, antes + 1, "el cliente recibió la factura dos veces");
        assert.equal((await anotados(p.id)).length, 1);
      });

      await t.test("mientras Hacienda la procesa no sale ningún correo", async () => {
        const f = await crear();
        const antes = entregas.length;
        modo = "procesando";
        const r = await clic(f);
        assert.equal(r.estado, "procesando");
        assert.equal(entregas.length, antes);
        modo = "aceptada";
        assert.equal((await s.consultar(r.id)).correo.estado, "enviado");
        assert.equal(entregas.length, antes + 1);
      });

      await t.test("una aceptación de PRUEBAS no le manda nada al cliente", async () => {
        await habilitar("produccion", false);
        const f = await crear();
        const antes = entregas.length;
        const r = await clic(f);
        assert.equal(r.ambiente, "pruebas");
        assert.equal(r.estado, "aceptada");
        assert.equal(r.correo, undefined);
        assert.equal(entregas.length, antes);
        assert.deepEqual(await anotados(r.id), []);
        await assert.rejects(s.reenviarCorreo(f.id), (x) => x.code === "SIN_ACEPTAR" && x.status === 409);
        await habilitar("produccion", true);
      });

      await t.test("un rechazo tampoco, y volver a emitir prepara otro que referencia al rechazado", async () => {
        const f = await crear();
        const antes = entregas.length;
        modo = "rechazada";
        const r = await clic(f);
        modo = "aceptada";
        assert.equal(r.estado, "rechazada");
        assert.equal(entregas.length, antes);
        const e = await s.estadoDeFactura(f.id);
        assert.equal(e.comprobante.estado, "rechazada");
        assert.equal(e.motivoNoEmitible, null, "un rechazo se puede volver a emitir");
        // Sin pedirlo explícitamente no se gasta otro número.
        assert.equal((await s.emitirFactura(f.id)).id, r.id);
        const nuevo = await s.emitirFactura(f.id, { sustituir: true }, usuarioId);
        assert.notEqual(nuevo.id, r.id);
        assert.notEqual(nuevo.consecutivo, r.consecutivo);
        assert.ok((await s.archivo(nuevo.id)).includes(r.clave), "el nuevo no referencia al rechazado");
        assert.equal((await s.estadoDeFactura(f.id)).comprobante.id, nuevo.id);
      });

      await t.test("si el correo falla, la factura queda aceptada igual y el fallo se ve", async () => {
        const f = await crear();
        correo = new Error("ZZ smtp caído contraseña-de-prueba");
        const r = await clic(f);
        assert.equal(r.estado, "aceptada");
        assert.equal(r.correo.estado, "error");
        assert.doesNotMatch(JSON.stringify(r.correo), /contraseña-de-prueba/);
        assert.equal(
          (await db.query("SELECT electronica, hacienda_estado FROM factura WHERE id=$1", [f.id])).rows[0].electronica,
          true,
        );
        assert.equal((await s.estadoDeFactura(f.id)).correo.estado, "error");

        // La persona lo vuelve a mandar desde la factura, y queda quién fue.
        correo = { estado: "enviado", para: "zz-cliente@example.invalid" };
        const antes = entregas.length;
        assert.deepEqual(await s.reenviarCorreo(f.id, usuarioId), correo);
        assert.equal(entregas.length, antes + 1);
        const notas = await anotados(r.id);
        assert.deepEqual(notas.map((n) => n.despues.estado), ["error", "enviado"]);
        assert.equal(notas[1].usuario_id, usuarioId);
        assert.equal((await s.estadoDeFactura(f.id)).correo.estado, "enviado", "la factura muestra un envío viejo");
      });

      await t.test("un cliente sin correo se anota como tal, no como enviado", async () => {
        const f = await crear();
        correo = { estado: "sin_correo", motivo: "El cliente no tiene un correo válido en su ficha." };
        const r = await clic(f);
        assert.equal(r.estado, "aceptada");
        assert.equal((await s.estadoDeFactura(f.id)).correo.estado, "sin_correo");
        correo = { estado: "enviado", para: "zz-cliente@example.invalid" };
      });

      await t.test("sin correo enchufado (otro proceso), aceptar no falla y reenviar lo dice", async () => {
        const f = await crear();
        const p = await sinCorreo.emitirFactura(f.id);
        await sinCorreo.enviar(p.id);
        const r = await sinCorreo.consultar(p.id);
        assert.equal(r.estado, "aceptada");
        assert.equal(r.correo, undefined);
        await assert.rejects(sinCorreo.reenviarCorreo(f.id), (x) => x.code === "CORREO_NO_DISPONIBLE" && x.status === 503);
      });

      await t.test("una factura con descuento no sale sin su motivo, y con él sí", async () => {
        const f = await crear({ descuento: 10 });
        const e = await s.estadoDeFactura(f.id);
        assert.deepEqual(e.pendientes.map((p) => [p.numeroLinea, p.falta]), [[1, ["el motivo del descuento"]]]);
        const numeros = async () =>
          (await db.query("SELECT count(*)::int AS n FROM hacienda_comprobante WHERE origen='factura' AND origen_id=$1", [f.id])).rows[0].n;
        await assert.rejects(
          s.emitirFactura(f.id),
          (x) => x.code === "DATOS_FISCALES_PENDIENTES" && x.status === 409 && /motivo del descuento de «ZZ producto»/.test(x.message),
        );
        assert.equal(await numeros(), 0, "se reservó un número para una factura que no se pudo emitir");
        const p = await s.emitirFactura(f.id, { lineas: [{ numeroLinea: 1, codigoDescuento: "07" }] });
        assert.equal(p.estado, "preparada");
        const xml = await s.archivo(p.id);
        assert.match(xml, /<CodigoDescuento>07<\/CodigoDescuento>/);
        assert.match(xml, /<MontoDescuento>10\.00000<\/MontoDescuento>/);
        // Ya preparada, seguir no vuelve a pedir el dato.
        assert.equal((await s.emitirFactura(f.id)).id, p.id);
      });

      // --- EL MEDIO DE PAGO (2026-10-11): «Medio de pago: falta un dato
      // fiscal válido», con la factura de contado a la vista. La factura
      // nace sin cobrar y ya no trae medio; Hacienda lo pide en contado.
      await t.test("contado sin medio de pago: no se inventa efectivo, se le pregunta a quien emite", async () => {
        const f = await crear({ medio: null });
        const e = await s.estadoDeFactura(f.id);
        assert.equal(e.faltaMedioPago, true);
        assert.ok(e.mediosPago.some((m) => m.id === sinpe) && e.mediosPago.every((m) => m.id && m.nombre));
        await assert.rejects(
          s.emitirFactura(f.id),
          (x) => x.code === "DATOS_FISCALES_PENDIENTES" && x.status === 409 && /con qué paga el cliente/.test(x.message),
        );
        assert.equal(
          (await db.query("SELECT count(*)::int AS n FROM hacienda_comprobante WHERE origen='factura' AND origen_id=$1", [f.id])).rows[0].n,
          0,
          "se reservó un número para una factura que no se pudo emitir",
        );
        const p = await s.emitirFactura(f.id, { metodoPagoId: sinpe });
        assert.equal(await medioDeclarado(p.id), "06");
        // Elegirlo NO cobra la factura ni le cambia nada.
        const despues = (await db.query("SELECT metodo_pago_id, (SELECT count(*)::int FROM pago_factura WHERE factura_id=$1) AS cobros FROM factura WHERE id=$1", [f.id])).rows[0];
        assert.deepEqual(despues, { metodo_pago_id: null, cobros: 0 });
        // Ya emitida, consultar su estado no vuelve a pedir el dato.
        assert.equal((await s.estadoDeFactura(f.id)).faltaMedioPago, false);
      });

      await t.test("un medio que no está en la lista se rechaza", async () => {
        const f = await crear({ medio: null });
        await assert.rejects(s.emitirFactura(f.id, { metodoPagoId: 999999 }), (x) => x.code === "MEDIO_PAGO_INVALIDO");
        await db.query("UPDATE metodo_pago SET activo=FALSE WHERE id=$1", [sinpe]);
        await assert.rejects(s.emitirFactura(f.id, { metodoPagoId: sinpe }), (x) => x.code === "MEDIO_PAGO_INVALIDO");
        await db.query("UPDATE metodo_pago SET activo=TRUE WHERE id=$1", [sinpe]);
      });

      await t.test("si ya se cobró, sale con el medio del cobro y no pregunta nada", async () => {
        const f = await crear({ medio: null });
        const cobro = await cobrar(f, sinpe);
        assert.equal((await s.estadoDeFactura(f.id)).faltaMedioPago, false);
        // Un cobro ANULADO no cuenta: vuelve a hacer falta.
        await db.query("UPDATE pago SET anulado=TRUE WHERE id=$1", [cobro]);
        assert.equal((await s.estadoDeFactura(f.id)).faltaMedioPago, true);
        await db.query("UPDATE pago SET anulado=FALSE WHERE id=$1", [cobro]);
        assert.equal(await medioDeclarado((await s.emitirFactura(f.id)).id), "06");
      });

      await t.test("con dos cobros se declara el del monto mayor", async () => {
        const f = await crear({ medio: null });
        await cobrar(f, pago, 13);
        await cobrar(f, sinpe, 100);
        assert.equal(await medioDeclarado((await s.emitirFactura(f.id)).id), "06");
      });

      await t.test("el medio anotado en la factura manda sobre el del cobro", async () => {
        const f = await crear();
        await cobrar(f, sinpe);
        assert.equal(await medioDeclarado((await s.emitirFactura(f.id)).id), "01");
      });

      await t.test("a crédito y sin cobrar sale SIN medio de pago, y no se pregunta", async () => {
        const f = await crear({ medio: null, credito: true });
        const e = await s.estadoDeFactura(f.id);
        assert.equal(e.faltaMedioPago, false);
        assert.deepEqual(e.mediosPago, []);
        const p = await s.emitirFactura(f.id);
        const xml = await s.archivo(p.id);
        assert.match(xml, /<CondicionVenta>02<\/CondicionVenta>/);
        assert.doesNotMatch(xml, /MedioPago/);
      });

      await t.test("al volver a emitir un rechazo se usa el medio ya declarado, sin preguntar otra vez", async () => {
        const f = await crear({ medio: null });
        modo = "rechazada";
        const p = await s.emitirFactura(f.id, { metodoPagoId: sinpe });
        totales.set(p.clave, f.total);
        await s.enviar(p.id);
        assert.equal((await s.consultar(p.id)).estado, "rechazada");
        modo = "aceptada";
        assert.equal((await s.estadoDeFactura(f.id)).faltaMedioPago, false, "el rechazo hizo olvidar el medio que ya se había dicho");
        const nuevo = await s.emitirFactura(f.id, { sustituir: true });
        assert.notEqual(nuevo.id, p.id);
        assert.equal(await medioDeclarado(nuevo.id), "06");
      });

      await t.test("una histórica de Alegra no se emite", async () => {
        const f = await crear({ extra: "alegra_id" });
        const e = await s.estadoDeFactura(f.id);
        assert.match(e.motivoNoEmitible, /histórico o ya electrónico/);
        await assert.rejects(s.emitirFactura(f.id), (x) => x.code === "NO_EMITIBLE");
        await assert.rejects(s.estadoDeFactura(999999999), (x) => x.code === "NO_EXISTE" && x.status === 404);
      });

      assert.ok(posts > 0);
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  },
);

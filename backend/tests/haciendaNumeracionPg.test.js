const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const { crearServicio } = require("../src/integrations/hacienda/emision.service");
const numeracion = require("../src/integrations/hacienda/numeracion");
const config = require("../src/integrations/hacienda/configuracion.service");
const { certificado, emisor } = require("./helpers/hacienda");

/**
 * La numeración fiscal contra PostgreSQL, con el caso que pasó en producción.
 *
 * EL CASO (2026-10-11). Alegra tenía la serie de facturas electrónicas en el
 * 2480 y dos sueltas con los números 4902 y 4946. Con "el mayor + 1", la
 * primera factura propia salió con el 4947. El usuario decidió seguir desde
 * el 2481. Acá se cuida:
 *  - que al fijar 2481 la siguiente salga con 2481, y no vuelva al 4948;
 *  - que al llegar a un número ya usado se salte, sea de Alegra (por serie o
 *    por clave) o propio;
 *  - que no se pueda retroceder al medio de una numeración ya usada;
 *  - que pruebas y producción no se mezclen, y que el cambio quede anotado.
 *
 * Usa una sucursal y una terminal que no existen (009/00009) para que la
 * serie esté vacía y no dependa de lo que traiga la copia. Todo se revierte.
 * Se salta sin PROBAR_BASE_LOCAL=1 (ver haciendaPg.test.js).
 */
test(
  "Hacienda: la numeración sigue donde dice el numerador y salta lo usado",
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
          const n = "num_" + ++sec;
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
    // Solo se prepara: Hacienda no hace falta para numerar.
    const s = crearServicio(pool, { probar: async () => ({ conectado: true }) });
    const SERIE = "0090000901"; // sucursal 009 + terminal 00009 + tipo 01

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
      for (const a of ["pruebas", "produccion"])
        await config.guardar(
          puente,
          a,
          {
            ...emisor,
            sucursal: "009",
            terminal: "00009",
            pin: c.pin,
            usuario: "cpf-01-2345-6789@" + (a === "pruebas" ? "stag." : "prod.") + "comprobanteselectronicos.go.cr",
            clave: "zz-password",
            habilitada: true,
          },
          c.p12,
        );

      let n = 0;
      /** Una factura ZZ propia, lista para emitir. */
      const propia = async () => {
        const f = (
          await db.query(
            "INSERT INTO factura(numero,estado,fecha,cliente_nombre,cliente_identificacion,cliente_tipo_identificacion,condicion_venta,metodo_pago_id,subtotal,impuesto,total) VALUES($2,'emitida',CURRENT_DATE,'ZZ receptor','123456789','CF','contado',$1,100,13,113) RETURNING id",
            [pago, "ZZ-num-" + ++n],
          )
        ).rows[0].id;
        await db.query(
          "INSERT INTO factura_linea(factura_id,numero_linea,nombre,cabys,unidad,cantidad,precio_unitario,impuesto_id,tarifa,impuesto_monto,total) VALUES($1,1,'ZZ producto','1234567890123','Unid',1,100,$2,13,13,113)",
          [f, impuesto],
        );
        return f;
      };
      /** Una factura como las que dejó Alegra: ya numerada en la serie fiscal. */
      const deAlegra = (consecutivo) =>
        db.query(
          "INSERT INTO factura(numero,serie,consecutivo,estado,fecha,cliente_nombre,subtotal,impuesto,total,alegra_id) VALUES($1,$2,$3,'emitida',CURRENT_DATE,'ZZ de Alegra',100,13,113,$4)",
          ["ZZ-alegra-" + consecutivo, SERIE, consecutivo, "zz-alegra-" + consecutivo],
        );
      /** El número con que sale la próxima factura electrónica de ese ambiente. */
      const emitir = async (ambiente = "produccion") =>
        Number((await s.preparar("factura", await propia(), { ambiente })).consecutivo.slice(-10));
      const de = async (ambiente, tipo = "01") =>
        (await numeracion.ver(pool, ambiente)).find((x) => x.tipo === tipo);
      const fijar = (ambiente, siguiente, tipo = "01") =>
        numeracion.fijar(puente, ambiente, { tipo, siguiente }, usuarioId);

      // Como estaba producción: la serie en el 2480 y dos sueltas muy adelante.
      for (const consecutivo of [2478, 2479, 2480, 4902, 4946]) await deAlegra(consecutivo);

      await t.test("una serie sin numerador arranca después de TODO lo que usó Alegra", async () => {
        assert.equal((await de("produccion")).proximo, "4947");
        assert.equal(await emitir(), 4947, "así salió la primera factura real");
        assert.equal((await de("produccion")).proximo, "4948");
      });

      await t.test("al fijar 2481, la siguiente sale con 2481 y no vuelve al 4948", async () => {
        const despues = (await fijar("produccion", "2481")).find((x) => x.tipo === "01");
        assert.equal(despues.proximo, "2481");
        assert.equal(despues.usadosAdelante, 3);
        assert.deepEqual(despues.primerosUsados, ["4902", "4946", "4947"]);
        assert.equal(await emitir(), 2481, "los números sueltos de más adelante arrastraron la serie");
        assert.equal(await emitir(), 2482);
        assert.equal((await de("produccion")).proximo, "2483");
      });

      await t.test("al llegar a un número ya usado lo salta: de Alegra o propio", async () => {
        await fijar("produccion", "4901");
        assert.equal(await emitir(), 4901);
        assert.equal(await emitir(), 4903, "repitió el 4902 de Alegra");
        await fijar("produccion", "4945");
        assert.equal(await emitir(), 4945);
        assert.equal(await emitir(), 4948, "repitió el 4946 de Alegra o el 4947 propio");
        assert.equal(await emitir(), 4949);
      });

      await t.test("un número que solo consta en la CLAVE de una factura también se salta", async () => {
        // Las ventas de Alegra con numeración comercial guardan el número
        // fiscal únicamente dentro de la clave de Hacienda.
        await db.query(
          "INSERT INTO factura(numero,estado,fecha,cliente_nombre,subtotal,impuesto,total,alegra_id,clave_hacienda) VALUES('ZZ-clave-6000','emitida',CURRENT_DATE,'ZZ de Alegra',100,13,113,'zz-alegra-clave',$1)",
          ["506" + "111026" + "000123456789" + SERIE + "0000006000" + "1" + "12345678"],
        );
        await fijar("produccion", "5999");
        assert.equal(await emitir(), 5999);
        assert.equal(await emitir(), 6001);
      });

      await t.test("si después se carga un documento de Alegra con un número de adelante, se salta ese y nada más", async () => {
        const proximo = Number((await de("produccion")).proximo);
        await deAlegra(proximo + 2);
        assert.equal(await emitir(), proximo);
        assert.equal(await emitir(), proximo + 1);
        assert.equal(await emitir(), proximo + 3, "repitió el número del documento recién cargado");
      });

      await t.test("no deja retroceder al medio de una numeración ya usada", async () => {
        for (let i = 0; i <= numeracion.USADOS_TOLERADOS; i++) await deAlegra(3000 + i);
        const antes = (await de("produccion")).proximo;
        await assert.rejects(
          fijar("produccion", "2990"),
          (e) => e.code === "NUMERACION_YA_USADA" && e.status === 409 && /en medio de una numeración que ya se usó/.test(e.message) && /uno mayor a \d+/.test(e.message),
        );
        assert.equal((await de("produccion")).proximo, antes, "el rechazo movió la numeración");
        // Hacia adelante siempre se puede.
        assert.equal((await fijar("produccion", "70000")).find((x) => x.tipo === "01").proximo, "70000");
        assert.equal(await emitir(), 70000);
      });

      await t.test("lo que no es un número, un tipo o un ambiente válido se rechaza sin tocar nada", async () => {
        const antes = (await de("produccion")).proximo;
        for (const siguiente of ["", "0", "abc", "2.481", "99999999999", null])
          await assert.rejects(fijar("produccion", siguiente), (e) => e.code === "NUMERO_INVALIDO", String(siguiente));
        await assert.rejects(fijar("produccion", "500000", "05"), (e) => e.code === "TIPO_INVALIDO");
        await assert.rejects(fijar("otro", "500000"), (e) => e.code === "AMBIENTE_INVALIDO");
        assert.equal((await de("produccion")).proximo, antes);
      });

      await t.test("pruebas lleva su propia cuenta: las ventas reales no le gastan números", async () => {
        assert.equal((await de("pruebas")).proximo, "1");
        assert.equal(await emitir("pruebas"), 1);
        // En pruebas la misma cuenta de Hacienda se comparte entre copias:
        // poder adelantarla evita chocar con números que usó otra copia.
        await fijar("pruebas", "2478");
        assert.equal(await emitir("pruebas"), 2478, "saltó un número por una factura REAL de producción");
        assert.equal(await emitir("pruebas"), 2479);
        // Y producción no se enteró.
        assert.equal(await emitir(), 70001);
      });

      await t.test("tiquete y nota de crédito tienen cada uno su numeración", async () => {
        const todos = await numeracion.ver(pool, "produccion");
        assert.deepEqual(todos.map((x) => [x.tipo, x.nombre]), [
          ["01", "Factura electrónica"],
          ["04", "Tiquete electrónico"],
          ["03", "Nota de crédito"],
        ]);
        await fijar("produccion", "1970", "04");
        const sinCedula = await propia();
        await db.query("UPDATE factura SET cliente_identificacion=NULL, cliente_tipo_identificacion=NULL WHERE id=$1", [sinCedula]);
        const tiquete = await s.preparar("factura", sinCedula, { ambiente: "produccion", tipo: "04" });
        assert.equal(tiquete.consecutivo, "0090000904" + "0000001970");
        assert.equal((await de("produccion", "04")).proximo, "1971");
        assert.equal((await de("produccion")).proximo, "70002", "cambiar el tiquete movió la factura");
      });

      await t.test("cada cambio queda en la bitácora, con quién lo hizo", async () => {
        const filas = (
          await db.query(
            "SELECT antes, despues, usuario_id, motivo FROM bitacora_cambio WHERE entidad='hacienda_numerador' AND entidad_id=$1 ORDER BY id",
            ["produccion-009-00009-01"],
          )
        ).rows;
        assert.deepEqual(filas[0].antes, { siguiente: "4948" });
        assert.deepEqual(filas[0].despues, { siguiente: "2481" });
        assert.equal(filas[0].usuario_id, usuarioId);
        assert.match(filas[0].motivo, /factura electrónica en produccion/);
        assert.ok(filas.length >= 5);
      });

      await t.test("sin sucursal y terminal guardadas no hay serie que numerar, y se dice", async () => {
        await db.query("UPDATE hacienda_configuracion SET datos = datos - 'sucursal' WHERE ambiente='pruebas'");
        await assert.rejects(numeracion.ver(pool, "pruebas"), (e) => e.code === "NUMERACION_SIN_DATOS" && e.status === 409);
        await assert.rejects(fijar("pruebas", "9"), (e) => e.code === "NUMERACION_SIN_DATOS");
      });
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  },
);

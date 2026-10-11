const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { certificado, venta, emisor } = require("./helpers/hacienda");
const { firmar } = require("../src/integrations/hacienda/firma/xades");
const { generarVenta } = require("../src/integrations/hacienda/xml/v4.4");
const { validarXml } = require("../src/integrations/hacienda/xml/validar");

/**
 * El medio de pago en el XML fiscal.
 *
 * EL ERROR (2026-10-11, producción). Al emitir: «Medio de pago: falta un dato
 * fiscal válido», con la factura de contado a la vista. El XML exigía el
 * medio de pago SIEMPRE, y desde que la factura nace sin cobrar (antes nacía
 * marcada "Efectivo" y por eso salía pagada sola) ninguna lo trae. Quedó
 * bloqueada toda emisión: de contado y de crédito.
 *
 * LA REGLA, medida contra las 247 facturas 4.4 que Hacienda ya aceptó: las
 * 145 de contado declaran medio de pago; de las 102 de crédito, una salió sin
 * él. El esquema lo hace opcional. Entonces: en contado se exige (y si nadie
 * lo dijo, se le pregunta a quien emite: ver emisionUnClic y
 * haciendaUnClicPg); en crédito sin cobrar se omite el nodo.
 */

const xml = (documento, tipo = "01") => {
  const v = venta(tipo);
  return generarVenta({
    ...v,
    documento: { ...v.documento, ...documento },
    emisor,
    consecutivo: "0010000101" + "0000000001",
    fecha: new Date().toISOString(),
    clave: "5".repeat(50),
    opciones: {},
  });
};
const firmado = (documento, tipo) => {
  const c = certificado();
  return firmar(xml(documento, tipo), c.p12, c.pin);
};

describe("en una venta de contado el medio de pago se exige", () => {
  test("con medio, sale declarado por el total", () => {
    const x = xml({ codigo_medio_pago_hacienda: "06" });
    assert.match(x, /<CondicionVenta>01<\/CondicionVenta>/);
    assert.match(x, /<MedioPago><TipoMedioPago>06<\/TipoMedioPago><TotalMedioPago>113\.00000<\/TotalMedioPago><\/MedioPago>/);
  });

  test("sin medio no se emite, y el mensaje dice qué falta y por qué", () => {
    for (const vacio of [undefined, null, "", "  "]) {
      assert.throws(
        () => xml({ codigo_medio_pago_hacienda: vacio }),
        (e) => e.code === "MEDIO_PAGO_FALTANTE" && /venta de contado/.test(e.message),
        `aceptó ${JSON.stringify(vacio)}`,
      );
    }
  });

  test("no se inventa «efectivo»: sin dato no hay un 01 en el XML", () => {
    let texto = "";
    try {
      texto = xml({ codigo_medio_pago_hacienda: undefined });
    } catch {
      /* es lo esperado */
    }
    assert.doesNotMatch(texto, /<TipoMedioPago>01/);
  });

  test("un código que no existe, o «99 Otros», tampoco pasa", () => {
    assert.throws(() => xml({ codigo_medio_pago_hacienda: "08" }));
    assert.throws(() => xml({ codigo_medio_pago_hacienda: "1" }));
    assert.throws(() => xml({ codigo_medio_pago_hacienda: "99" }), (e) => e.code === "MEDIO_PAGO_OTRO");
  });
});

describe("en una venta a crédito sin cobrar no hay medio que declarar", () => {
  const credito = { condicion_venta: "credito", plazo_dias: 30 };

  test("sale sin el nodo, en vez de fallar o de inventar uno", () => {
    const x = xml({ ...credito, codigo_medio_pago_hacienda: null });
    assert.match(x, /<CondicionVenta>02<\/CondicionVenta>/);
    assert.match(x, /<PlazoCredito>30<\/PlazoCredito>/);
    assert.doesNotMatch(x, /MedioPago/);
  });

  test("si el medio se conoce (ya se cobró), se declara igual", () => {
    assert.match(xml({ ...credito, codigo_medio_pago_hacienda: "04" }), /<TipoMedioPago>04<\/TipoMedioPago>/);
  });

  test("el esquema oficial acepta la factura, el tiquete y la nota sin medio de pago", async () => {
    for (const tipo of ["01", "04", "03"]) {
      const documento = { ...credito, codigo_medio_pago_hacienda: null };
      const opciones = tipo === "03"
        ? { referencias: [{ tipo: "01", clave: "5".repeat(50), fecha: new Date().toISOString(), codigo: "01", razon: "ZZ anula" }] }
        : {};
      const v = venta(tipo);
      const c = certificado();
      const x = firmar(
        generarVenta({
          ...v, documento: { ...v.documento, ...documento }, emisor, opciones,
          consecutivo: "00100001" + tipo + "0000000001", fecha: new Date().toISOString(), clave: "5".repeat(50),
        }),
        c.p12, c.pin,
      );
      assert.doesNotMatch(x, /MedioPago/);
      await validarXml(x, tipo);
    }
  });

  test("y con medio de pago sigue siendo válida", async () => {
    await validarXml(firmado({ ...credito, codigo_medio_pago_hacienda: "04" }), "01");
    await validarXml(firmado({ codigo_medio_pago_hacienda: "06" }), "01");
  });
});

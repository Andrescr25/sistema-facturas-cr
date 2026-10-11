const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { certificado, venta } = require("./helpers/hacienda");
const { firmar } = require("../src/integrations/hacienda/firma/xades");
const { generarVenta } = require("../src/integrations/hacienda/xml/v4.4");
const {
  validarXml,
  elementosRechazados,
} = require("../src/integrations/hacienda/xml/validar");

/**
 * El validador del XML fiscal no depende de un programa del servidor.
 *
 * EL ERROR (2026-10-11, primera prueba de Hacienda en producción). Para
 * validar cada XML contra el esquema oficial se ejecutaba el programa
 * `xmllint`. La máquina de desarrollo lo trae; Render no, y con el entorno de
 * Node ahí no se instala nada. Preparar un comprobante contestaba «Instale
 * libxml2 (xmllint) en el servidor para validar los XML», y las catorce
 * pruebas de Hacienda estaban en verde: corren donde el programa sí existe.
 *
 * Ahora es el mismo libxml2 compilado a WebAssembly, como dependencia del
 * módulo. Acá se cuida:
 *  - que no vuelva a ejecutarse nada del sistema, y que la librería esté
 *    declarada donde el servidor la instala;
 *  - que acepte y rechace lo mismo que antes;
 *  - que al rechazar diga CUÁL elemento, y nunca su valor (el diagnóstico
 *    crudo trae cédulas y montos).
 *
 * La comparación contra los 247 comprobantes reales ya aceptados por
 * Hacienda se hizo aparte (los dos validadores coincidieron en todos); esos
 * archivos son del negocio y no viven en el repositorio.
 */

const MODULO = path.join(__dirname, "..", "src", "integrations", "hacienda");
const ESQUEMAS = path.join(MODULO, "esquemas", "v4.4");
const NOMBRE = { "01": "FacturaElectronica", "03": "NotaCreditoElectronica", "04": "TiqueteElectronico" };

const firmado = (tipo = "01", cambios = (v) => v) => {
  const c = certificado();
  return firmar(generarVenta(cambios(venta(tipo))), c.p12, c.pin);
};
const veredicto = (xml, tipo) =>
  validarXml(xml, tipo).then(
    () => ({ valido: true }),
    (e) => ({ valido: false, code: e.code, status: e.status, mensaje: e.message }),
  );

/** El programa de antes, si esta máquina lo tiene: sirve de referencia. */
const hayXmllint = spawnSync("xmllint", ["--version"]).error === undefined;
const programaAnterior = (xml, tipo) =>
  spawnSync(
    "xmllint",
    ["--nonet", "--noout", "--schema", path.join(ESQUEMAS, NOMBRE[tipo] + ".xsd"), "-"],
    { input: xml },
  ).status === 0;

// Cada una rompe el esquema de una manera distinta.
const ALTERACIONES = {
  "un monto con letras": (x) =>
    x.replace(/<TotalComprobante>[^<]*<\/TotalComprobante>/, "<TotalComprobante>ciento trece</TotalComprobante>"),
  "falta un elemento obligatorio": (x) => x.replace(/<TotalComprobante>[^<]*<\/TotalComprobante>/, ""),
  "un elemento que el esquema no conoce": (x) =>
    x.replace("<TotalComprobante>", "<CampoInventado>1</CampoInventado><TotalComprobante>"),
  // El largo de la cédula según su tipo lo revisa Hacienda, no el esquema
  // (acepta hasta veinte caracteres, por los extranjeros). El TIPO sí es una
  // lista cerrada.
  "un tipo de identificación que no existe": (x) =>
    x.replace(/(<Receptor>[\s\S]*?<Tipo>)[^<]*(<\/Tipo>)/, "$199$2"),
  "un código CAByS de doce dígitos": (x) =>
    x.replace(/<CodigoCABYS>[^<]*<\/CodigoCABYS>/, "<CodigoCABYS>987654321098</CodigoCABYS>"),
  "una clave de 49 dígitos": (x) => x.replace(/<Clave>\d{50}<\/Clave>/, `<Clave>${"7".repeat(49)}</Clave>`),
};

describe("no depende del servidor", () => {
  test("no ejecuta ningún programa del sistema", () => {
    const fuente = fs.readFileSync(path.join(MODULO, "xml", "validar.js"), "utf8");
    assert.doesNotMatch(fuente, /child_process/);
    assert.doesNotMatch(fuente, /\bspawn\(|\bexecFile\(|\bexecSync\(/);
  });

  test("valida aunque en el servidor no exista xmllint", async () => {
    const camino = process.env.PATH;
    process.env.PATH = path.join(__dirname, "no-existe");
    try {
      assert.deepEqual(await veredicto(firmado("04"), "04"), { valido: true });
    } finally {
      process.env.PATH = camino;
    }
  });

  test("la librería está declarada donde el servidor la instala, con versión exacta", () => {
    const paquete = JSON.parse(fs.readFileSync(path.join(MODULO, "package.json"), "utf8"));
    assert.match(paquete.dependencies["xmllint-wasm"], /^\d+\.\d+\.\d+$/, "sin versión exacta, cada despliegue puede traer otra");
    const candado = JSON.parse(fs.readFileSync(path.join(MODULO, "package-lock.json"), "utf8"));
    assert.equal(candado.packages["node_modules/xmllint-wasm"].version, paquete.dependencies["xmllint-wasm"]);
    // El servidor instala esta carpeta con `npm ci`, que exige el candado al día.
    const raiz = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(raiz.scripts.postinstall, /hacienda:instalar/);
    assert.match(raiz.scripts["hacienda:instalar"], /npm ci --prefix src\/integrations\/hacienda/);
  });

  test("los esquemas oficiales se usan tal cual, con su importación de la firma", () => {
    for (const nombre of Object.values(NOMBRE)) {
      const xsd = fs.readFileSync(path.join(ESQUEMAS, nombre + ".xsd"), "utf8");
      assert.match(xsd, /schemaLocation="\.\.\/\.\.\/xmldsig-core-schema\.xsd"/);
    }
    assert.ok(fs.existsSync(path.join(MODULO, "xmldsig-core-schema.xsd")));
  });
});

describe("acepta y rechaza lo mismo que antes", () => {
  test("factura, tiquete y nota de crédito firmados cumplen el esquema", async () => {
    for (const tipo of ["01", "04", "03"]) {
      assert.deepEqual(await veredicto(firmado(tipo), tipo), { valido: true }, `tipo ${tipo}`);
    }
  });

  for (const [caso, alterar] of Object.entries(ALTERACIONES)) {
    test(`rechaza ${caso}`, async () => {
      const original = firmado("01");
      const xml = alterar(original);
      assert.notEqual(xml, original, "la alteración no cambió nada: la prueba no prueba");
      const v = await veredicto(xml, "01");
      assert.equal(v.valido, false);
      assert.equal(v.code, "XSD_INVALIDO");
      assert.equal(v.status, 400);
    });
  }

  test("coincide con el programa xmllint en cada caso", { skip: hayXmllint ? false : "esta máquina no tiene xmllint" }, async () => {
    for (const tipo of ["01", "04", "03"]) {
      const bueno = firmado(tipo);
      assert.equal((await veredicto(bueno, tipo)).valido, programaAnterior(bueno, tipo), `válido, tipo ${tipo}`);
      for (const [caso, alterar] of Object.entries(ALTERACIONES)) {
        const xml = alterar(bueno);
        assert.equal((await veredicto(xml, tipo)).valido, programaAnterior(xml, tipo), `${caso}, tipo ${tipo}`);
      }
    }
  });

  test("un comprobante de 300 líneas entra en memoria y en tiempo", async () => {
    const grande = firmado("01", (v) => ({
      ...v,
      lineas: Array.from({ length: 300 }, (_, i) => ({ ...v.lineas[0], numero_linea: i + 1 })),
      documento: { ...v.documento, total: String(113 * 300), impuesto: String(13 * 300) },
    }));
    assert.ok(grande.length > 150000, "el comprobante de prueba no es grande");
    assert.deepEqual(await veredicto(grande, "01"), { valido: true });
  });

  test("varias validaciones a la vez no se pisan", async () => {
    const bueno = firmado("01");
    const malo = ALTERACIONES["un monto con letras"](bueno);
    const resultados = await Promise.all([bueno, malo, bueno, malo, bueno].map((x) => veredicto(x, "01")));
    assert.deepEqual(resultados.map((r) => r.valido), [true, false, true, false, true]);
  });
});

describe("al rechazar dice cuál elemento, nunca su valor", () => {
  test("el mensaje nombra el elemento que falló", async () => {
    const v = await veredicto(ALTERACIONES["un monto con letras"](firmado("01")), "01");
    assert.match(v.mensaje, /TotalComprobante/);
    assert.match(v.mensaje, /esquema oficial 4\.4/);
  });

  test("y no repite el dato: el diagnóstico crudo trae cédulas y montos", async () => {
    const monto = await veredicto(ALTERACIONES["un monto con letras"](firmado("01")), "01");
    assert.doesNotMatch(monto.mensaje, /ciento trece/);
    const cabys = await veredicto(ALTERACIONES["un código CAByS de doce dígitos"](firmado("01")), "01");
    assert.match(cabys.mensaje, /CodigoCABYS/);
    assert.doesNotMatch(cabys.mensaje, /987654321098/);
    const clave = await veredicto(ALTERACIONES["una clave de 49 dígitos"](firmado("01")), "01");
    assert.match(clave.mensaje, /Clave/);
    assert.doesNotMatch(clave.mensaje, /7{10}/);
  });

  test("solo salen nombres de elementos, sin espacio de nombres ni texto libre", () => {
    const crudo = [
      { message: "Element '{https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica}Numero': [facet 'pattern'] The value '1234' is not accepted by the pattern '\\d{9}'." },
      { message: "Element '{https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica}Numero': '1234' is not a valid value of the local atomic type." },
      { message: "Element 'TotalComprobante': 'abc' is not a valid value of the atomic type 'xs:decimal'." },
      { rawMessage: "documento.xml fails to validate" },
    ];
    assert.deepEqual(elementosRechazados(crudo), ["Numero", "TotalComprobante"]);
    assert.deepEqual(elementosRechazados([]), []);
    assert.deepEqual(elementosRechazados(undefined), []);
  });
});

describe("lo que no es un problema del esquema se dice distinto", () => {
  test("un XML mal formado no llega al validador", () => {
    assert.throws(() => validarXml("<FacturaElectronica><sin-cerrar>", "01"));
  });

  test("un tipo de comprobante que no existe se rechaza de entrada", () => {
    assert.throws(() => validarXml(firmado("01"), "99"), (e) => e.code === "TIPO_NO_IMPLEMENTADO");
  });
});

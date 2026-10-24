const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { certificado, venta } = require("./helpers/hacienda");
const {
  firmar,
  verificar,
  verificarRespuesta,
  HASH_POLITICA,
} = require("../src/integrations/hacienda/firma/xades");
const { abrir } = require("../src/integrations/hacienda/firma/certificado");
const {
  generarVenta,
  llevaReceptor,
  generarMensaje,
  montosDeAceptacion,
  decimal,
  fechaCR,
  clave,
  identificacion,
} = require("../src/integrations/hacienda/xml/v4.4");
const { validarXml } = require("../src/integrations/hacienda/xml/validar");
const { parsear } = require("../src/integrations/hacienda/xml/util");
const { desdeAlegra } = require("../src/integrations/hacienda/historico");
const almacen = require("../src/integrations/hacienda/seguridad/almacen");

test("abrir .p12 y verificar firmas no usa el verificador RSA vulnerable de Forge", (t) => {
  const forge = require("../src/integrations/hacienda/node_modules/node-forge");
  const c = certificado(),
    original = forge.pki.publicKeyFromAsn1;
  let certificadosDecodificados = 0;
  t.mock.method(forge.pki, "publicKeyFromAsn1", (...args) => {
    const key = original(...args);
    certificadosDecodificados++;
    key.verify = () => {
      throw new Error("No usar el verificador RSA de Forge");
    };
    return key;
  });
  const xml = firmar(generarVenta(venta()), c.p12, c.pin);
  assert.ok(
    certificadosDecodificados > 0,
    "la prueba debe interceptar el certificado del .p12",
  );
  assert.equal(verificarRespuesta(xml), true);
  const alterado = xml.replace(
    "<TotalComprobante>113.00000</TotalComprobante>",
    "<TotalComprobante>114.00000</TotalComprobante>",
  );
  assert.notEqual(alterado, xml);
  assert.equal(verificarRespuesta(alterado), false);
});

test("FE, TE y NC cumplen los XSD actuales y una firma verificable", async () => {
  const c = certificado();
  for (const tipo of ["01", "04", "03"]) {
    const x = firmar(generarVenta(venta(tipo)), c.p12, c.pin);
    await validarXml(x, tipo);
    assert.equal(verificar(x, c.pem), true);
    assert.equal(verificarRespuesta(x), true);
    // Un tiquete no lleva receptor (ver el test de abajo): se altera otro dato.
    const [de, a] = tipo === "04" ? ["ZZ producto", "OTRO producto"] : ["ZZ receptor", "OTRO receptor"];
    assert.notEqual(x.replace(de, a), x, "la alteración tiene que cambiar algo");
    assert.equal(verificarRespuesta(x.replace(de, a)), false);
    assert.equal(verificar(x.replace(de, a), c.pem), false);
    assert.equal(
      verificar(
        x.replace(HASH_POLITICA, HASH_POLITICA.replace("D", "A")),
        c.pem,
      ),
      false,
    );
    assert.equal(verificar(x.replace("113.00000", "114.00000"), c.pem), false);
  }
});
// 2026-10-24. El primer tiquete real se mandó con la cédula del cliente, de
// relleno («100000000»), y Hacienda lo rechazó: -38 «El número de
// identificación del receptor no corresponde a un registro válido». Un
// tiquete no se dirige a nadie, y el esquema oficial deja el receptor opcional
// en el tiquete y en la nota de crédito (no en la factura).
test("el tiquete va sin receptor aunque el cliente tenga cédula, y la factura sí lo lleva", async () => {
  const c = certificado();
  for (const [tipo, referencias, lleva] of [
    ["01", [], true],
    ["04", [], false],
    ["03", [{ tipo: "01", clave: "5".repeat(50), fecha: "2026-10-05T10:00:00-06:00", codigo: "06", razon: "ZZ" }], true],
    ["03", [{ tipo: "04", clave: "5".repeat(50), fecha: "2026-10-05T10:00:00-06:00", codigo: "06", razon: "ZZ" }], false],
  ]) {
    const d = venta(tipo);
    d.documento.cliente_identificacion = "100000000"; // la cédula de relleno del caso real
    d.documento.actividad_economica = "123456";
    d.opciones = { referencias };
    const xml = generarVenta(d);
    assert.equal(llevaReceptor(tipo, referencias), lleva, `${tipo} → llevaReceptor`);
    assert.equal(/<Receptor>/.test(xml), lleva, `${tipo}: ${lleva ? "lleva" : "no lleva"} <Receptor>`);
    assert.equal(/CodigoActividadReceptor/.test(xml), lleva, `${tipo}: la actividad del receptor sigue al receptor`);
    assert.equal(xml.includes("100000000"), lleva, `${tipo}: la cédula solo viaja si hay receptor`);
    await validarXml(firmar(xml, c.p12, c.pin), tipo);
  }
});
test("no firma con PIN incorrecto, p12 corrupto o certificado fuera de vigencia", () => {
  const c = certificado();
  assert.throws(
    () => abrir(c.p12, "malo"),
    (e) => e.code === "CERTIFICADO_INVALIDO",
  );
  assert.throws(() => abrir(Buffer.from("texto"), c.pin));
  assert.throws(
    () => abrir(c.p12, c.pin, new Date("2036-01-01")),
    (e) => e.code === "CERTIFICADO_VENCIDO",
  );
});
// 2026-10-10. La actividad inscrita de la empresa es "4752.1" y así la
// devuelve la consulta pública de Hacienda. Con la regla de "seis dígitos" no
// se podía guardar ni probar la conexión. Las 207 facturas 4.4 de este emisor
// que llevan ese texto fueron aceptadas.
test("la actividad económica va como la publica Hacienda, con su punto", async () => {
  for (const tipo of ["01", "04", "03"]) {
    const d = venta(tipo);
    d.emisor.actividad_economica = "4752.1";
    d.documento.actividad_economica = "4711.1";
    const xml = generarVenta(d);
    assert.match(
      xml,
      /<CodigoActividadEmisor>4752\.1<\/CodigoActividadEmisor>/,
    );
    if (tipo === "01")
      assert.match(
        xml,
        /<CodigoActividadReceptor>4711\.1<\/CodigoActividadReceptor>/,
      );
    const c = certificado();
    await validarXml(firmar(xml, c.p12, c.pin), tipo);
  }
  // El código anterior de seis dígitos sigue siendo válido.
  const d = venta();
  d.emisor.actividad_economica = "523402";
  assert.match(generarVenta(d), /<CodigoActividadEmisor>523402</);
});

test("los datos fiscales incompletos y los importes que no cuadran no se inventan", () => {
  for (const cambiar of [
    // Así quedó en la base al copiar de Alegra: sin el punto no son seis.
    (d) => (d.emisor.actividad_economica = "47521"),
    (d) => (d.emisor.actividad_economica = "4752-1"),
    (d) => (d.lineas[0].cabys = null),
    (d) => (d.lineas[0].codigo_tarifa_hacienda = "02"),
    (d) => (d.documento.total = "114"),
    (d) => (d.documento.moneda = "USD"),
  ]) {
    const d = venta();
    cambiar(d);
    assert.throws(() => generarVenta(d));
  }
  const d = venta();
  d.lineas[0].descuento_monto = "10";
  d.lineas[0].impuesto_monto = "11.70";
  d.lineas[0].total = "101.70";
  d.documento.total = "101.70";
  d.documento.descuento = "10";
  d.documento.impuesto = "11.70";
  assert.throws(
    () => generarVenta(d),
    (e) => e.code === "DATO_FISCAL_FALTANTE",
  );
  d.opciones.lineas = [{ numeroLinea: 1, codigoDescuento: "06" }];
  assert.match(generarVenta(d), /<CodigoDescuento>06/);
});
// 2026-10-11, decisión del usuario: la actividad económica del RECEPTOR no se
// pide. Se exigía para la factura electrónica y el modal de emisión la pedía a
// mano cada vez. El esquema oficial la trae con minOccurs="0", y 243 de las
// 247 facturas 4.4 de este emisor que Hacienda aceptó no la llevan. La del
// EMISOR sigue siendo obligatoria (arriba).
test("la factura electrónica se emite sin la actividad del receptor, y cumple el esquema", async () => {
  const c = certificado();
  for (const tipo of ["01", "03"]) {
    const d = venta(tipo);
    delete d.documento.actividad_economica;
    const xml = generarVenta(d);
    assert.doesNotMatch(xml, /CodigoActividadReceptor/);
    assert.match(xml, /<CodigoActividadEmisor>/);
    await validarXml(firmar(xml, c.p12, c.pin), tipo);
  }
});

test("una actividad del receptor mal escrita se omite: ni se manda ni bloquea la venta", async () => {
  const c = certificado();
  // "47112" es como quedó en la base al copiar de Alegra: sin el punto no son
  // seis dígitos. Mandarla sería inventar un código; exigirla, pedir un dato
  // que ya nadie tiene dónde escribir.
  for (const mala of ["47112", "4711-1", "abc", "   ", null]) {
    const d = venta("01");
    d.documento.actividad_economica = mala;
    const xml = generarVenta(d);
    assert.doesNotMatch(xml, /CodigoActividadReceptor/, `se mandó "${mala}"`);
    await validarXml(firmar(xml, c.p12, c.pin), "01");
  }
});

test("si el documento ya trae una actividad del receptor bien escrita, se conserva", () => {
  for (const buena of ["4711.1", "471101"]) {
    const d = venta("01");
    d.documento.actividad_economica = buena;
    assert.match(generarVenta(d), new RegExp(`<CodigoActividadReceptor>${buena.replace(".", "\\.")}</CodigoActividadReceptor>`));
  }
  // El tiquete no tiene ese elemento en su esquema, la traiga o no.
  const tiquete = venta("04");
  tiquete.documento.actividad_economica = "4711.1";
  assert.doesNotMatch(generarVenta(tiquete), /CodigoActividadReceptor/);
});

test("ninguna pantalla pide ni exige la actividad del receptor", () => {
  const leer = (...partes) =>
    require("node:fs").readFileSync(path.join(__dirname, "..", "..", "frontend", "src", ...partes), "utf8");
  const sinComentarios = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  // El modal que la pedía ya no existe: ni la factura ni la compra abren uno.
  assert.equal(
    require("node:fs").existsSync(path.join(__dirname, "..", "..", "frontend", "src", "integrations", "hacienda", "DocumentoFiscal.jsx")),
    false,
  );
  // La ficha del cliente conserva el dato, pero ya no dice que sin él no se puede facturar.
  const ficha = sinComentarios(leer("components", "clientes", "ModalCliente.jsx"));
  assert.match(ficha, /cliente-actividad_economica/);
  assert.doesNotMatch(ficha, /no se puede emitir una factura/);
});

test("clave de 50 dígitos y fecha con hora de Costa Rica", () => {
  const d = venta();
  assert.equal(
    fechaCR(new Date("2026-10-06T03:00:00Z")),
    "2026-10-05T21:00:00-06:00",
  );
  const k = clave(
    d.consecutivo,
    identificacion("CF", "123456789"),
    d.fecha,
    "12345678",
  );
  assert.match(k, /^506051026\d{41}$/);
  assert.equal(k.slice(21, 41), d.consecutivo);
});
test("mensajes receptor: clave del proveedor, receptor real y crédito explícito", async () => {
  const d = venta(),
    c = certificado(),
    original = firmar(generarVenta(d), c.p12, c.pin);
  for (const mensaje of ["1", "2", "3"]) {
    const m = generarMensaje({
      original,
      emisor: d.emisor,
      consecutivo: "00100001050000000001",
      fecha: d.fecha,
      opciones: {
        mensaje,
        detalle: "ZZ respuesta",
        condicionImpuesto: "01",
        impuestoAcreditar: mensaje === "3" ? "0" : "13",
        gastoAplicable: mensaje === "3" ? "0" : "100",
      },
    });
    await validarXml(
      firmar(m.xml, c.p12, c.pin),
      mensaje === "1" ? "05" : mensaje === "2" ? "06" : "07",
    );
    assert.equal(m.clave, d.clave);
  }
  assert.throws(
    () =>
      generarMensaje({
        original,
        emisor: { ...d.emisor, identificacion: "987654321" },
        consecutivo: d.consecutivo,
        fecha: d.fecha,
        opciones: {
          mensaje: "1",
          detalle: "ZZ",
          condicionImpuesto: "01",
          impuestoAcreditar: "13",
          gastoAplicable: "100",
        },
      }),
    (e) => e.code === "RECEPTOR_NO_COINCIDE",
  );
});
// LA COMPRA SE ACEPTA SOLA (2026-10-12). El usuario pidió que el formulario
// de la respuesta al proveedor «se haga solo» al registrar la compra. Lo que
// antes escribía una persona ahora lo deduce el mensaje; las reglas son las
// del anexo de Hacienda (formato del mensaje receptor y su nota 18).
test("aceptación sin formulario: los montos de IVA salen de la condición", () => {
  const iva = decimal("13"),
    total = decimal("113");
  // 01: todo el IVA es crédito; el gasto es el resto del comprobante.
  assert.deepEqual(montosDeAceptacion("01", iva, total), { acreditar: iva, gasto: decimal("100") });
  // 04: el IVA no se acredita y forma parte del gasto.
  assert.deepEqual(montosDeAceptacion("04", iva, total), { acreditar: 0n, gasto: total });
  // 05: todavía no se sabe; no van montos.
  assert.deepEqual(montosDeAceptacion("05", iva, total), { acreditar: null, gasto: null });
  // Una factura del proveedor sin impuesto: nada que acreditar, todo es gasto.
  assert.deepEqual(montosDeAceptacion("01", 0n, total), { acreditar: 0n, gasto: total });
  // Crédito parcial y bienes de capital dependen de cada compra: no se deducen.
  for (const condicion of ["02", "03"])
    assert.throws(() => montosDeAceptacion(condicion, iva, total), (e) => e.code === "MENSAJE_IMPORTES_FALTANTES");
});
test("aceptación sin formulario: XML válido, con la fecha de la CONFIRMACIÓN y sin detalle", async () => {
  const d = venta(),
    c = certificado(),
    original = firmar(generarVenta(d), c.p12, c.pin),
    confirmada = "2026-10-12T18:30:00-06:00";
  assert.notEqual(confirmada, d.fecha, "la prueba necesita dos fechas distintas");
  const aceptar = (condicionImpuesto, extra = {}) =>
    generarMensaje({
      original,
      emisor: d.emisor,
      consecutivo: "00100001050000000001",
      fecha: confirmada,
      opciones: { mensaje: "1", condicionImpuesto, ...extra },
    });
  const nodo = (xml, n) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(xml)?.[1];

  const m = aceptar("01");
  await validarXml(firmar(m.xml, c.p12, c.pin), "05");
  // El anexo: «Fecha y hora de emisión de la confirmación». Salía la fecha
  // de la factura del proveedor: una aceptación de hoy decía ser de ese día.
  assert.equal(nodo(m.xml, "FechaEmisionDoc"), confirmada);
  assert.equal(m.fecha, confirmada, "el sobre del envío tiene que llevar la misma fecha que el XML");
  assert.equal(m.clave, d.clave, "la aceptación no cita la clave de la factura del proveedor");
  assert.equal(nodo(m.xml, "Mensaje"), "1");
  // «En los casos que la factura es aceptada no es necesario su uso».
  assert.doesNotMatch(m.xml, /DetalleMensaje/);
  assert.equal(nodo(m.xml, "CondicionImpuesto"), "01");
  assert.equal(nodo(m.xml, "MontoTotalImpuesto"), "13.00000");
  assert.equal(nodo(m.xml, "MontoTotalImpuestoAcreditar"), "13.00000");
  assert.equal(nodo(m.xml, "MontoTotalDeGastoAplicable"), "100.00000");
  assert.equal(nodo(m.xml, "TotalFactura"), "113.00000");
  assert.equal(nodo(m.xml, "CodigoActividad"), d.emisor.actividad_economica);

  const gasto = aceptar("04");
  await validarXml(firmar(gasto.xml, c.p12, c.pin), "05");
  assert.equal(nodo(gasto.xml, "MontoTotalImpuestoAcreditar"), "0.00000");
  assert.equal(nodo(gasto.xml, "MontoTotalDeGastoAplicable"), "113.00000");

  // Proporcionalidad: «no se debe de utilizar» el código de actividad, y los
  // montos no hacen falta.
  const proporcional = aceptar("05");
  await validarXml(firmar(proporcional.xml, c.p12, c.pin), "05");
  assert.doesNotMatch(proporcional.xml, /CodigoActividad|MontoTotalImpuestoAcreditar|MontoTotalDeGastoAplicable/);
  assert.equal(nodo(proporcional.xml, "CondicionImpuesto"), "05");

  // Lo que escribe una persona sigue mandando sobre lo deducido.
  const aMano = aceptar("02", { impuestoAcreditar: "4", gastoAplicable: "109", detalle: "ZZ crédito parcial" });
  await validarXml(firmar(aMano.xml, c.p12, c.pin), "05");
  assert.equal(nodo(aMano.xml, "MontoTotalImpuestoAcreditar"), "4.00000");
  assert.equal(nodo(aMano.xml, "DetalleMensaje"), "ZZ crédito parcial");
  // Y sin esos montos, una condición que los necesita no se inventa.
  assert.throws(() => aceptar("02"), (e) => e.code === "MENSAJE_IMPORTES_FALTANTES");
  assert.throws(() => aceptar(""), (e) => e.code === "DATO_FISCAL_FALTANTE");
  // El proveedor puede escribir nuestra cédula rellenada con ceros: es la misma.
  const rellenada = generarMensaje({
    original: firmar(generarVenta({ ...d, documento: { ...d.documento, cliente_identificacion: "123456789" } }), c.p12, c.pin)
      .replace(/(<Receptor>[\s\S]*?<Numero>)123456789(<\/Numero>)/, "$1000123456789$2"),
    emisor: d.emisor,
    consecutivo: "00100001050000000001",
    fecha: confirmada,
    opciones: { mensaje: "1", condicionImpuesto: "01" },
  });
  assert.equal(nodo(rellenada.xml, "NumeroCedulaReceptor"), d.emisor.identificacion);
  // Un comprobante del proveedor sin receptor no se confirma: se dice por qué.
  assert.throws(
    () =>
      generarMensaje({
        original: original.replace(/<Receptor>[\s\S]*?<\/Receptor>/, ""),
        emisor: d.emisor,
        consecutivo: "00100001050000000001",
        fecha: confirmada,
        opciones: { mensaje: "1", condicionImpuesto: "01" },
      }),
    (e) => e.code === "RECEPTOR_NO_COINCIDE" && /no trae receptor/.test(e.message),
  );
  // Rechazar o aceptar en parte sí exige decir el motivo.
  for (const mensaje of ["2", "3"])
    assert.throws(
      () =>
        generarMensaje({
          original, emisor: d.emisor, consecutivo: "00100001050000000001", fecha: confirmada,
          opciones: { mensaje, condicionImpuesto: "01", impuestoAcreditar: "0", gastoAplicable: "0" },
        }),
      (e) => e.code === "DATO_FISCAL_FALTANTE",
    );
});
test("XML no procesa entidades externas ni documentos enormes", () => {
  assert.throws(() => parsear('<!DOCTYPE x SYSTEM "file:///etc/passwd"><x/>'));
  assert.throws(() => parsear("<x>&mal;</x>"));
  assert.throws(() => parsear("x".repeat(3 * 1024 * 1024)));
});
test("una plantilla electrónica no demuestra aceptación del documento histórico", () => {
  const base = {
    numberTemplate: { isElectronic: true },
    stamp: { uuid: "5".repeat(50) },
  };
  assert.equal(desdeAlegra(base).electronica, false);
  assert.equal(desdeAlegra(base).hacienda_estado, null);
  assert.equal(
    desdeAlegra({
      ...base,
      stamp: { ...base.stamp, legalStatus: "STAMPED_AND_ACCEPTED" },
    }).electronica,
    true,
  );
  assert.equal(
    desdeAlegra({
      ...base,
      stamp: { ...base.stamp, legalStatus: "STAMPED_AND_REJECTED" },
    }).hacienda_estado,
    "rechazada",
  );
  assert.equal(
    desdeAlegra({
      ...base,
      stamp: { ...base.stamp, legalStatus: "DESCONOCIDO" },
    }).electronica,
    false,
  );
});
test("esquemas oficiales conservan las huellas registradas y códigos 2026", async () => {
  const dir = path.join(
      __dirname,
      "../src/integrations/hacienda/esquemas/v4.4",
    ),
    m = JSON.parse(await fs.readFile(path.join(dir, "fuentes.json")));
  for (const a of m.archivos)
    assert.equal(
      crypto
        .createHash("sha256")
        .update(await fs.readFile(path.join(dir, a.archivo)))
        .digest("hex"),
      a.sha256,
    );
  const x = await fs.readFile(
    path.join(dir, "NotaCreditoElectronica.xsd"),
    "utf8",
  );
  assert.ok(x.includes("error material"));
  assert.ok(x.includes('value="16"'));
});
test("secretos cifrados por ambiente, archivos privados e integridad del XML", async () => {
  const previo = process.env.HACIENDA_ALMACEN_PRIVADO,
    dir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "zz-hacienda-")),
    );
  process.env.HACIENDA_ALMACEN_PRIVADO = dir;
  try {
    const secreto = { pin: "zz-pin", clave: "zz-password", p12: "zz-cert" },
      c = await almacen.cifrar(secreto, "pruebas");
    assert.ok(!c.includes("zz-password"));
    assert.deepEqual(await almacen.descifrar(c, "pruebas"), secreto);
    await assert.rejects(almacen.descifrar(c, "produccion"));
    const a = await almacen.guardarXml("<ZZ/>");
    assert.equal(await almacen.leerXml(a.ruta, a.sha256), "<ZZ/>");
    assert.equal((await fs.stat(path.join(dir, a.ruta))).mode & 0o077, 0);
    await fs.writeFile(path.join(dir, a.ruta), "<OTRO/>");
    await assert.rejects(almacen.leerXml(a.ruta, a.sha256));
    await assert.rejects(almacen.leerXml("../../.env"));
  } finally {
    if (previo === undefined) delete process.env.HACIENDA_ALMACEN_PRIVADO;
    else process.env.HACIENDA_ALMACEN_PRIVADO = previo;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("redondeos comerciales de portal conservan precio, impuesto y total cobrado", () => {
  const d = venta();
  Object.assign(d.lineas[0], {
    cantidad: "2",
    precio_unitario: "33451.32743",
    impuesto_monto: "8697.35",
    total: "75600",
  });
  Object.assign(d.documento, { total: "75600", impuesto: "8697.35" });
  const x = generarVenta(d);
  assert.ok(x.includes("<PrecioUnitario>33451.32743"));
  assert.ok(x.includes("<MontoTotal>66902.65000"));
  assert.ok(x.includes("<TotalComprobante>75600.00000"));
  d.lineas[0].impuesto_monto = "8698.35";
  assert.throws(() => generarVenta(d));
});

test("prefijo abreviado de Alegra no mezcla consecutivos fiscales y comerciales", () => {
  const {
    numeracionDesdeAlegra,
  } = require("../src/integrations/hacienda/historico");
  const d = venta();
  const k = clave(
    "00100001010000004946",
    identificacion("CF", "123456789"),
    d.fecha,
    "12345678",
  );
  assert.deepEqual(
    numeracionDesdeAlegra(
      {
        numberTemplate: {
          prefix: "00100001",
          number: "4946",
          isElectronic: true,
        },
        stamp: { uuid: k },
      },
      "01",
    ),
    { serie: "0010000101", consecutivo: 4946 },
  );
  assert.deepEqual(
    numeracionDesdeAlegra(
      {
        numberTemplate: {
          prefix: "00100001",
          number: "4946",
          isElectronic: false,
        },
      },
      "01",
    ),
    { serie: "00100001", consecutivo: 4946 },
  );
});

test("firma verifica el filtro XPath exacto del ejemplo oficial sin evaluar otros filtros", async () => {
  const c = certificado(),
    { XMLSerializer } = require("../src/integrations/hacienda/xml/util");
  const {
    ExclusiveCanonicalization,
  } = require("../src/integrations/hacienda/node_modules/xml-crypto");
  const DS = "http://www.w3.org/2000/09/xmldsig#",
    doc = parsear(firmar(generarVenta(venta()), c.p12, c.pin));
  const t = doc
    .getElementsByTagNameNS(DS, "Reference")[0]
    .getElementsByTagNameNS(DS, "Transform")[0];
  t.setAttribute("Algorithm", "http://www.w3.org/TR/1999/REC-xpath-19991116");
  const x = doc.createElementNS(DS, "ds:XPath");
  x.textContent = "not(ancestor-or-self::ds:Signature)";
  t.appendChild(x);
  const si = doc.getElementsByTagNameNS(DS, "SignedInfo")[0];
  doc.getElementsByTagNameNS(DS, "SignatureValue")[0].textContent = crypto
    .sign(
      "RSA-SHA256",
      Buffer.from(new ExclusiveCanonicalization().process(si, {})),
      abrir(c.p12, c.pin).key,
    )
    .toString("base64");
  const xml = new XMLSerializer().serializeToString(doc);
  assert.equal(verificarRespuesta(xml), true);
  await validarXml(xml, "01");
  assert.equal(
    verificarRespuesta(
      xml.replace("not(ancestor-or-self::ds:Signature)", "true()"),
    ),
    false,
  );
});

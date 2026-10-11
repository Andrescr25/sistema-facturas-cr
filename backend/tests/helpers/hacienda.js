const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const forge = createRequire(
  require.resolve("../../src/integrations/hacienda/package.json"),
)("node-forge");
let cache;
function certificado() {
  if (cache) return cache;
  const k = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const key = forge.pki.privateKeyFromPem(k.privateKey),
    cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(k.publicKey);
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2020-01-01");
  cert.validity.notAfter = new Date("2035-01-01");
  cert.setSubject([
    { name: "commonName", value: "ZZ prueba fiscal" },
    { type: "2.5.4.5", value: "CPF-123456789" },
  ]);
  cert.setIssuer(cert.subject.attributes);
  cert.sign(key, forge.md.sha256.create());
  cache = {
    p12: Buffer.from(
      forge.asn1
        .toDer(
          forge.pkcs12.toPkcs12Asn1(key, [cert], "zz-pin", {
            algorithm: "3des",
          }),
        )
        .getBytes(),
      "binary",
    ),
    pin: "zz-pin",
    pem: forge.pki.certificateToPem(cert),
  };
  return cache;
}
const emisor = {
  nombre: "ZZ emisor",
  tipo_identificacion: "CF",
  identificacion: "123456789",
  actividad_economica: "123456",
  provincia_codigo: "1",
  canton_codigo: "01",
  distrito_codigo: "01",
  otras_senas: "ZZ dirección de prueba",
  correo: "zz@example.invalid",
  proveedor_sistemas: "123456789",
  sucursal: "001",
  terminal: "00001",
};
function venta(tipo = "01") {
  return {
    tipo,
    documento: {
      cliente_nombre: "ZZ receptor",
      cliente_identificacion: "123456789",
      cliente_tipo_identificacion: "CF",
      actividad_economica: "123456",
      codigo_medio_pago_hacienda: "01",
      total: "113",
      descuento: "0",
      impuesto: "13",
    },
    lineas: [
      {
        numero_linea: 1,
        nombre: "ZZ producto",
        unidad: "Unid",
        cabys: "1234567890123",
        cantidad: "1",
        precio_unitario: "100",
        descuento_monto: "0",
        impuesto_monto: "13",
        total: "113",
        codigo_tarifa_hacienda: "08",
        tarifa: "13",
      },
    ],
    emisor: { ...emisor },
    consecutivo: "00100001" + tipo + "0000000001",
    fecha: "2026-10-05T10:00:00-06:00",
    clave: "5".repeat(50),
    opciones:
      tipo === "03"
        ? {
            referencias: [
              {
                tipo: "01",
                clave: "5".repeat(50),
                fecha: "2026-10-05T10:00:00-06:00",
                codigo: "06",
                razon: "Devolución prueba",
              },
            ],
          }
        : {},
  };
}
module.exports = { certificado, venta, emisor };

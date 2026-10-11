"use strict";
const forge = require("node-forge");
const crypto = require("node:crypto");
const { error } = require("../errores");
// Forge solo decodifica PKCS#12/ASN.1. No usar publicKey.verify ni cert.verify:
// GHSA-86w9-cpqp-85rv afecta su verificador RSA (sin parche al 2026-10-05).
// Las firmas se crean/verifican con crypto de Node y xml-crypto, en xades.js.
function abrir(p12, pin, ahora = new Date()) {
  try {
    if (
      !Buffer.isBuffer(p12) ||
      !p12.length ||
      p12.length > 256 * 1024 ||
      typeof pin !== "string" ||
      pin.length > 200
    )
      throw new Error();
    const cont = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(p12.toString("binary")),
      false,
      pin,
    );
    const llaves = [
      ...(cont.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] || []),
      ...(cont.getBags({ bagType: forge.pki.oids.keyBag })[
        forge.pki.oids.keyBag
      ] || []),
    ].filter((b) => b.key);
    const certs =
      cont.getBags({ bagType: forge.pki.oids.certBag })[
        forge.pki.oids.certBag
      ] || [];
    if (llaves.length !== 1) throw new Error();
    const key = llaves[0].key,
      cert = certs
        .map((b) => b.cert)
        .find(
          (c) => c?.publicKey?.n?.equals(key.n) && c.publicKey.e.equals(key.e),
        );
    if (!cert || ![2048, 4096].includes(key.n.bitLength())) throw new Error();
    if (ahora < cert.validity.notBefore || ahora >= cert.validity.notAfter)
      throw error("CERTIFICADO_VENCIDO", "El certificado no está vigente.");
    const pem = forge.pki.certificateToPem(cert),
      x509 = new crypto.X509Certificate(pem);
    const serial =
      cert.subject.attributes.find((a) => a.type === "2.5.4.5")?.value || null;
    return {
      key: forge.pki.privateKeyToPem(key),
      pem,
      der: Buffer.from(
        forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
        "binary",
      ),
      issuer: x509.issuer.split("\n").reverse().join(","),
      serial: BigInt("0x" + cert.serialNumber).toString(),
      meta: {
        huella: x509.fingerprint256,
        vence: cert.validity.notAfter.toISOString(),
        identificacionCertificado: serial,
      },
    };
  } catch (e) {
    if (e.code === "CERTIFICADO_VENCIDO") throw e;
    throw error(
      "CERTIFICADO_INVALIDO",
      "No se pudo abrir el .p12 con ese PIN, o no contiene una llave RSA válida y su certificado.",
    );
  }
}
module.exports = { abrir };

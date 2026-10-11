"use strict";
const crypto = require("node:crypto");
const { ExclusiveCanonicalization, SignedXml } = require("xml-crypto");
const { abrir } = require("./certificado");
const { escapar, parsear, XMLSerializer } = require("../xml/util");
const { error } = require("../errores");
const DS = "http://www.w3.org/2000/09/xmldsig#",
  XA = "http://uri.etsi.org/01903/v1.3.2#";
const C14N = "http://www.w3.org/2001/10/xml-exc-c14n#",
  SHA = "http://www.w3.org/2001/04/xmlenc#sha256";
// Política y hash del ejemplo oficial de Anexos 4.4, Anexo 2. No se usa
// SignaturePolicyImplied: Hacienda exige XAdES-EPES con política explícita.
const POLITICA =
  "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf";
const HASH_POLITICA = "DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=";
const canon = (n) => new ExclusiveCanonicalization().process(n, {});
const digest = (s) => crypto.createHash("sha256").update(s).digest("base64");
function firmar(xml, p12, pin, ahora = new Date()) {
  const cert = abrir(p12, pin, ahora),
    doc = parsear(xml);
  if (doc.getElementsByTagNameNS(DS, "Signature").length)
    throw error("YA_FIRMADO", "El XML ya está firmado.");
  const id = "sig-" + crypto.randomUUID(),
    prop = id + "-props",
    key = id + "-key";
  const ref = (uri, type = "", enveloped = false) =>
    `<ds:Reference${enveloped ? ' Id="ref-documento"' : ""} URI="${uri}"${type ? ` Type="${type}"` : ""}><ds:Transforms>${enveloped ? '<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>' : ""}<ds:Transform Algorithm="${C14N}"/></ds:Transforms><ds:DigestMethod Algorithm="${SHA}"/><ds:DigestValue/></ds:Reference>`;
  const firma = `<ds:Signature xmlns:ds="${DS}" xmlns:xades="${XA}" Id="${id}"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="${C14N}"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>${ref("", "", true)}${ref("#" + prop, "http://uri.etsi.org/01903#SignedProperties")}${ref("#" + key)}</ds:SignedInfo><ds:SignatureValue/><ds:KeyInfo Id="${key}"><ds:X509Data><ds:X509Certificate>${cert.der.toString("base64")}</ds:X509Certificate></ds:X509Data></ds:KeyInfo><ds:Object><xades:QualifyingProperties Target="#${id}"><xades:SignedProperties Id="${prop}"><xades:SignedSignatureProperties><xades:SigningTime>${ahora.toISOString()}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="${SHA}"/><ds:DigestValue>${digest(cert.der)}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${escapar(cert.issuer)}</ds:X509IssuerName><ds:X509SerialNumber>${cert.serial}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate><xades:SignaturePolicyIdentifier><xades:SignaturePolicyId><xades:SigPolicyId><xades:Identifier>${POLITICA}</xades:Identifier></xades:SigPolicyId><xades:SigPolicyHash><ds:DigestMethod Algorithm="${SHA}"/><ds:DigestValue>${HASH_POLITICA}</ds:DigestValue></xades:SigPolicyHash></xades:SignaturePolicyId></xades:SignaturePolicyIdentifier></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#ref-documento"><xades:MimeType>application/octet-stream</xades:MimeType></xades:DataObjectFormat></xades:SignedDataObjectProperties></xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature>`;
  const unsigned = digest(canon(doc.documentElement));
  const sig = doc.importNode(parsear(firma).documentElement, true);
  doc.documentElement.appendChild(sig);
  const refs = sig.getElementsByTagNameNS(DS, "Reference");
  [
    unsigned,
    digest(canon(sig.getElementsByTagNameNS(XA, "SignedProperties")[0])),
    digest(canon(sig.getElementsByTagNameNS(DS, "KeyInfo")[0])),
  ].forEach((v, i) => {
    refs[i].getElementsByTagNameNS(DS, "DigestValue")[0].textContent = v;
  });
  sig.getElementsByTagNameNS(DS, "SignatureValue")[0].textContent = crypto
    .sign(
      "RSA-SHA256",
      Buffer.from(canon(sig.getElementsByTagNameNS(DS, "SignedInfo")[0])),
      cert.key,
    )
    .toString("base64");
  const salida = new XMLSerializer().serializeToString(doc);
  if (!verificar(salida, cert.pem))
    throw error(
      "FIRMA_INVALIDA",
      "La firma local no pasó su verificación.",
      500,
    );
  return salida;
}
function verificar(xml, pem) {
  try {
    const doc = parsear(xml),
      s = doc.getElementsByTagNameNS(DS, "Signature");
    if (s.length !== 1) return false;
    const v = new SignedXml({
      publicCert: pem,
      getCertFromKeyInfo: () => null,
    });
    // El ejemplo oficial usa este filtro XPath. Con una sola Signature es
    // equivalente a enveloped; no se evalúan expresiones XPath arbitrarias.
    const algoritmoXPath = "http://www.w3.org/TR/1999/REC-xpath-19991116";
    for (const filtro of Array.from(s[0].getElementsByTagNameNS(DS, "XPath"))) {
      const tr = filtro.parentNode,
        ref = tr.parentNode?.parentNode,
        root = doc.documentElement;
      const rootId =
        root.getAttribute("Id") ||
        root.getAttribute("ID") ||
        root.getAttribute("id");
      if (
        filtro.textContent.replace(/\s/g, "") !==
          "not(ancestor-or-self::ds:Signature)" ||
        filtro.lookupNamespaceURI("ds") !== DS ||
        tr.getAttribute("Algorithm") !== algoritmoXPath ||
        ref?.localName !== "Reference" ||
        !(
          ref.getAttribute("URI") === "" ||
          (rootId && ref.getAttribute("URI") === "#" + rootId)
        )
      )
        return false;
    }
    // Sin filtro, un algoritmo XPath declarado no es una transformación válida.
    for (const tr of Array.from(s[0].getElementsByTagNameNS(DS, "Transform")))
      if (
        tr.getAttribute("Algorithm") === algoritmoXPath &&
        tr.getElementsByTagNameNS(DS, "XPath").length !== 1
      )
        return false;
    v.CanonicalizationAlgorithms[algoritmoXPath] = class {
      getAlgorithmName() {
        return algoritmoXPath;
      }
      process(node) {
        // xml-crypto entrega un clon; retirar su Signature, no la del DOM original.
        for (const firma of Array.from(
          node.getElementsByTagNameNS(DS, "Signature"),
        ))
          firma.parentNode.removeChild(firma);
        return node;
      }
    };
    v.loadSignature(s[0]);
    return v.checkSignature(xml);
  } catch {
    return false;
  }
}
function verificarRespuesta(xml) {
  // Solo se llama con XML recibido por el API autenticado y TLS verificado.
  // El certificado incluido comprueba integridad; la identidad de Hacienda
  // proviene del canal, no de confiar en cualquier certificado autofirmado.
  try {
    const doc = parsear(xml),
      s = doc.getElementsByTagNameNS(DS, "Signature");
    if (s.length !== 1) return false;
    const cert = s[0].getElementsByTagNameNS(DS, "X509Certificate")[0];
    const referencias = s[0]
      .getElementsByTagNameNS(DS, "SignedInfo")[0]
      .getElementsByTagNameNS(DS, "Reference");
    const root = doc.documentElement,
      rootId =
        root.getAttribute("Id") ||
        root.getAttribute("ID") ||
        root.getAttribute("id");
    if (
      !Array.from(referencias).some(
        (r) =>
          r.getAttribute("URI") === "" ||
          (rootId && r.getAttribute("URI") === "#" + rootId),
      )
    )
      return false;
    const pem = new crypto.X509Certificate(
      Buffer.from(cert.textContent.replace(/\s/g, ""), "base64"),
    ).toString();
    return verificar(xml, pem);
  } catch {
    return false;
  }
}
module.exports = {
  firmar,
  verificar,
  verificarRespuesta,
  POLITICA,
  HASH_POLITICA,
};

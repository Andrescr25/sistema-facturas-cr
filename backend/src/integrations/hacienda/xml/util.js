"use strict";
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const { error } = require("../errores");
function escapar(v) {
  return String(v).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}
function nodo(n, v) {
  return v === null || v === undefined || v === ""
    ? ""
    : `<${n}>${escapar(v)}</${n}>`;
}
function parsear(xml) {
  if (
    typeof xml !== "string" ||
    Buffer.byteLength(xml) > 2 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    throw error(
      "XML_INVALIDO",
      "El XML no es válido o contiene entidades externas.",
    );
  try {
    return new DOMParser({
      onError: () => {
        throw new Error();
      },
    }).parseFromString(xml, "text/xml");
  } catch {
    throw error("XML_INVALIDO", "El XML no está bien formado.");
  }
}
function texto(doc, n) {
  const els = doc.getElementsByTagNameNS("*", n);
  return els[0]?.textContent?.trim() || "";
}
module.exports = { escapar, nodo, parsear, texto, XMLSerializer };

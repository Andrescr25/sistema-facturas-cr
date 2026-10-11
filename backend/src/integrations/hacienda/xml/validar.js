"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const { parsear } = require("./util");
const { error } = require("../errores");
const ESQUEMAS = {
  "01": "FacturaElectronica",
  "03": "NotaCreditoElectronica",
  "04": "TiqueteElectronico",
  "05": "MensajeReceptor",
  "06": "MensajeReceptor",
  "07": "MensajeReceptor",
  respuesta: "MensajeHacienda",
};
function validarXml(xml, tipo) {
  parsear(xml);
  const e = ESQUEMAS[tipo];
  if (!e)
    throw error(
      "TIPO_NO_IMPLEMENTADO",
      "Ese tipo de comprobante no está implementado.",
    );
  return new Promise((resolve, reject) => {
    // --nonet: ningún XML o esquema puede iniciar lecturas de red durante la
    // validación. Las importaciones del XSD oficial están versionadas locales.
    const child = spawn(
      "xmllint",
      [
        "--nonet",
        "--noout",
        "--schema",
        path.join(__dirname, "../esquemas/v4.4", e + ".xsd"),
        "-",
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let done = false;
    const fin = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(true);
    };
    const timer = setTimeout(() => {
      child.kill();
      fin(error("XSD_TIEMPO", "La validación del XML excedió su tiempo.", 500));
    }, 10000);
    // El diagnóstico puede contener cédulas o datos fiscales: no se imprime.
    child.stderr.resume();
    child.on("error", () =>
      fin(
        error(
          "XSD_NO_DISPONIBLE",
          "Instale libxml2 (xmllint) en el servidor para validar los XML.",
          503,
        ),
      ),
    );
    child.on("close", (code) =>
      fin(
        code === 0
          ? null
          : error(
              "XSD_INVALIDO",
              "El XML no cumple el esquema oficial 4.4. Revise los datos fiscales y el detalle.",
            ),
      ),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(xml);
  });
}
module.exports = { validarXml };

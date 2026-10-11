"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parsear } = require("./util");
const { error } = require("../errores");

/**
 * Validar un XML contra el esquema oficial 4.4 ANTES de firmarlo o guardarlo.
 *
 * POR QUÉ YA NO SE LLAMA AL `xmllint` DEL SERVIDOR (2026-10-11)
 * Se ejecutaba el programa `xmllint` de libxml2. En la máquina de desarrollo
 * existe (macOS lo trae); en Render no, y con el entorno de Node ahí no se
 * puede instalar nada: la primera prueba en producción contestó «Instale
 * libxml2 (xmllint) en el servidor para validar los XML» y no se pudo
 * preparar ningún comprobante. Era una dependencia del servidor que ninguna
 * prueba veía, porque las pruebas corren donde sí está.
 *
 * Ahora el validador es el mismo libxml2, compilado a WebAssembly y traído
 * como dependencia del módulo (`xmllint-wasm`, en el package.json de esta
 * carpeta). Corre igual en cualquier servidor con Node, y lo que se prueba
 * es lo que se ejecuta.
 *
 * SIN RED. El validador corre en memoria, sin acceso al disco ni a la red:
 * solo ve los archivos que se le pasan. Las importaciones del XSD oficial
 * están versionadas acá y se le entregan con la misma ruta relativa que
 * tienen en el repositorio (`../../xmldsig-core-schema.xsd` desde
 * `esquemas/v4.4/`), así que los XSD se usan tal como los publica Hacienda.
 */
const ESQUEMAS = {
  "01": "FacturaElectronica",
  "03": "NotaCreditoElectronica",
  "04": "TiqueteElectronico",
  "05": "MensajeReceptor",
  "06": "MensajeReceptor",
  "07": "MensajeReceptor",
  respuesta: "MensajeHacienda",
};

const RAIZ = path.join(__dirname, "..");
const FIRMA = "xmldsig-core-schema.xsd";
const TIEMPO_MS = 10000;

// Los XSD pesan ~120 KB y no cambian mientras el proceso vive.
const leidos = new Map();
function archivo(relativo) {
  if (!leidos.has(relativo)) {
    leidos.set(relativo, {
      fileName: relativo,
      contents: fs.readFileSync(path.join(RAIZ, relativo), "utf8"),
    });
  }
  return leidos.get(relativo);
}

/** El validador, cargado la primera vez que hace falta. */
function validador() {
  try {
    return require("xmllint-wasm").validateXML;
  } catch {
    throw error(
      "XSD_NO_DISPONIBLE",
      "Falta el validador de XML del sistema. En el servidor, reinstale las dependencias (npm install) y vuelva a intentar.",
      503,
    );
  }
}

/**
 * Los nombres de los elementos que el esquema rechazó, sin sus valores.
 *
 * El diagnóstico completo de libxml2 trae cédulas y montos ("The value
 * '1234' is not accepted…"): no se registra ni se devuelve. El NOMBRE del
 * elemento sí se puede decir, y es lo que permite corregir el dato en vez de
 * adivinar cuál de los cuarenta campos está mal.
 */
function elementosRechazados(errores) {
  const nombres = new Set();
  for (const e of errores || []) {
    const m = /Element '(?:\{[^}]*\})?([A-Za-z0-9_]+)'/.exec(
      e.message || e.rawMessage || "",
    );
    if (m) nombres.add(m[1]);
    if (nombres.size === 4) break;
  }
  return [...nombres];
}

async function contraEsquema(xml, esquema) {
  const validateXML = validador();

  let reloj;
  const limite = new Promise((_, reject) => {
    reloj = setTimeout(
      () =>
        reject(
          error("XSD_TIEMPO", "La validación del XML excedió su tiempo.", 500),
        ),
      TIEMPO_MS,
    );
  });

  let resultado;
  try {
    resultado = await Promise.race([
      validateXML({
        xml: [{ fileName: "documento.xml", contents: xml }],
        schema: [archivo(`esquemas/v4.4/${esquema}.xsd`)],
        preload: [archivo(FIRMA)],
        // Un comprobante con cientos de líneas no cabe en los 32 MiB por omisión.
        maxMemoryPages: 4096,
      }),
      limite,
    ]);
  } catch (fallo) {
    if (fallo && fallo.code === "XSD_TIEMPO") throw fallo;
    // El validador no pudo correr (memoria, módulo dañado): no es un XML
    // inválido, y decir "revise los datos" mandaría a buscar donde no es.
    throw error(
      "XSD_NO_DISPONIBLE",
      "No se pudo ejecutar el validador de XML. Vuelva a intentar; si se repite, avise a soporte.",
      503,
    );
  } finally {
    clearTimeout(reloj);
  }

  if (resultado.valid) return true;
  const donde = elementosRechazados(resultado.errors);
  throw error(
    "XSD_INVALIDO",
    "El XML no cumple el esquema oficial 4.4" +
      (donde.length ? ` (${donde.join(", ")})` : "") +
      ". Revise los datos fiscales y el detalle.",
  );
}

function validarXml(xml, tipo) {
  parsear(xml);
  const e = ESQUEMAS[tipo];
  if (!e)
    throw error(
      "TIPO_NO_IMPLEMENTADO",
      "Ese tipo de comprobante no está implementado.",
    );
  return contraEsquema(xml, e);
}

module.exports = { validarXml, elementosRechazados };

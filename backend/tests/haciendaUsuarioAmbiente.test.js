const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { revisar, USUARIO_API } = require("../src/integrations/hacienda/configuracion.service");
const { certificado, emisor } = require("./helpers/hacienda");

/**
 * El usuario del API de Hacienda dice de qué ambiente es.
 *
 * EL ERROR (2026-10-11, al habilitar producción por primera vez). Hacienda
 * entrega "…@stag.comprobanteselectronicos.go.cr" para pruebas y
 * "…@prod.comprobanteselectronicos.go.cr" para producción. La regla de
 * producción pedía el dominio a secas, sin "prod.": con el usuario real
 * respondía «El usuario del API no corresponde a este ambiente» y no dejaba
 * guardar. Las pruebas usaban un usuario inventado con la forma equivocada,
 * así que la regla mala pasaba. Producción era un camino que nadie había
 * recorrido con datos de verdad.
 *
 * La regla sigue haciendo su trabajo —que las credenciales de un ambiente no
 * se guarden en el otro— y ahora el mensaje dice cómo tiene que terminar.
 */

const DOMINIO = "comprobanteselectronicos.go.cr";
// Con la forma real: cpf-NN-NNNN-NNNN para físicas, cpj-N-NNN-NNNNNN para jurídicas.
const DE_PRUEBAS = `cpf-01-2345-6789@stag.${DOMINIO}`;
const DE_PRODUCCION = `cpf-01-2345-6789@prod.${DOMINIO}`;

function configuracion(ambiente, usuario) {
  const c = certificado();
  return {
    ambiente,
    secretos: { p12: c.p12.toString("base64"), pin: c.pin, usuario, clave: "zz-clave" },
    emisor: { ...emisor },
  };
}
const rechazo = (ambiente, usuario) => {
  try { revisar(configuracion(ambiente, usuario)); return null; } catch (e) { return e; }
};

describe("el usuario real de cada ambiente se acepta en el suyo", () => {
  test("producción acepta el usuario de producción, como lo entrega Hacienda", () => {
    assert.equal(rechazo("produccion", DE_PRODUCCION), null);
    assert.equal(rechazo("produccion", `cpj-3-101-123456@prod.${DOMINIO}`), null, "una jurídica");
  });

  test("pruebas acepta el usuario de pruebas", () => {
    assert.equal(rechazo("pruebas", DE_PRUEBAS), null);
  });

  test("da igual si viene en mayúsculas o con un espacio pegado al copiarlo", () => {
    assert.equal(rechazo("produccion", ` ${DE_PRODUCCION.toUpperCase()} `), null);
    assert.equal(rechazo("pruebas", `${DE_PRUEBAS}\n`), null);
  });
});

describe("las credenciales de un ambiente no entran en el otro", () => {
  test("el usuario de pruebas no se guarda en producción, y el mensaje dice cómo debe terminar", () => {
    const e = rechazo("produccion", DE_PRUEBAS);
    assert.equal(e?.code, "USUARIO_OTRO_AMBIENTE");
    assert.match(e.message, /@prod\.comprobanteselectronicos\.go\.cr/);
  });

  test("el usuario de producción no se guarda en pruebas", () => {
    const e = rechazo("pruebas", DE_PRODUCCION);
    assert.equal(e?.code, "USUARIO_OTRO_AMBIENTE");
    assert.match(e.message, /@stag\.comprobanteselectronicos\.go\.cr/);
  });

  test("el dominio a secas —la forma que antes se exigía— no es de ningún ambiente", () => {
    assert.equal(rechazo("produccion", `cpf-01-2345-6789@${DOMINIO}`)?.code, "USUARIO_OTRO_AMBIENTE");
    assert.equal(rechazo("pruebas", `cpf-01-2345-6789@${DOMINIO}`)?.code, "USUARIO_OTRO_AMBIENTE");
  });

  test("un dominio que solo se parece no pasa", () => {
    for (const usuario of [
      `cpf@prod.${DOMINIO}.ejemplo.com`, `cpf@otro.prod.${DOMINIO}`, `prod.${DOMINIO}`,
      `cpf@prod.${DOMINIO} extra`, `a@b@prod.${DOMINIO}`, "", "   "
    ]) {
      const e = rechazo("produccion", usuario);
      assert.ok(e, `aceptó "${usuario}"`);
    }
  });

  test("hay una regla por cada ambiente que la pantalla ofrece", () => {
    assert.deepEqual(Object.keys(USUARIO_API).sort(), ["produccion", "pruebas"]);
  });
});

describe("lo que se guarda", () => {
  const fuente = fs.readFileSync(path.join(__dirname, "..", "src", "integrations", "hacienda", "configuracion.service.js"), "utf8");

  test("el usuario se guarda sin espacios de borde; la contraseña y el PIN, tal cual", () => {
    assert.match(fuente, /secretos\[campo\] = campo === "usuario" \? datos\[campo\]\.trim\(\) : datos\[campo\]/);
  });

  test("las direcciones de producción son las oficiales, distintas de las de pruebas", () => {
    const cliente = fs.readFileSync(path.join(__dirname, "..", "src", "integrations", "hacienda", "transporte", "cliente.js"), "utf8");
    assert.match(cliente, /realms\/rut\/protocol\/openid-connect\/token/);
    assert.match(cliente, /https:\/\/api\.comprobanteselectronicos\.go\.cr\/recepcion\/v1\//);
    assert.match(cliente, /clientId: "api-prod"/);
  });
});

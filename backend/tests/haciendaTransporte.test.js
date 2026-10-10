const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  crearCliente,
  permitir,
} = require("../src/integrations/hacienda/transporte/cliente");
const c = {
  ambiente: "pruebas",
  revision: 1,
  secretos: {
    usuario: "zz@stag.comprobanteselectronicos.go.cr",
    clave: "zz-secreto",
  },
};
test("pruebas tiene una guarda que no abre producción ni otros canales", () => {
  assert.throws(
    () => permitir("pruebas", {}),
    (e) => e.status === 423,
  );
  permitir("pruebas", { HACIENDA_PERMITIR_PRUEBAS: "true" });
  assert.throws(
    () => permitir("produccion", { HACIENDA_PERMITIR_PRUEBAS: "true" }),
    (e) => e.status === 423,
  );
});
test("OAuth reutiliza un token concurrente, caduca y renueva sin seguir redirecciones", async () => {
  let now = 0,
    posts = 0;
  const destinos = [];
  const t = crearCliente({
    entorno: () => ({ HACIENDA_PERMITIR_PRUEBAS: "true" }),
    ahora: () => now,
    http: {
      post: async (url, body, opts) => {
        posts++;
        destinos.push(url);
        assert.equal(opts.maxRedirects, 0);
        assert.equal(opts.httpsAgent.options.rejectUnauthorized, true);
        assert.equal(new URLSearchParams(body).get("client_id"), "api-stag");
        return {
          status: 200,
          data: { access_token: "zz-token", expires_in: 300 },
        };
      },
      request: async (opts) => {
        assert.ok(
          opts.url.startsWith(
            "https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1/",
          ),
        );
        return {
          status: 400,
          data: "",
          headers: { "x-error-cause": "ZZ causa de Hacienda" },
        };
      },
    },
  });
  await Promise.all([t.probar(c), t.probar(c), t.probar(c)]);
  assert.equal(posts, 1);
  now = 280000;
  await t.probar(c);
  assert.equal(posts, 2);
  const r = await t.consultar(c, "5".repeat(50), "00100001050000000001");
  // El motivo de Hacienda llega a quien lo necesita para corregir.
  assert.equal(r.status, 400);
  assert.equal(r.causa, "ZZ causa de Hacienda");
  assert.ok(destinos.every((u) => u.includes("/rut-stag/")));
});
test("errores de autenticación/red no contienen secretos ni Axios original", async () => {
  const e = Object.assign(new Error("password=zz-secreto"), {
    config: { headers: { Authorization: "Bearer zz-token" } },
  });
  const t = crearCliente({
    entorno: () => ({ HACIENDA_PERMITIR_PRUEBAS: "true" }),
    http: {
      post: async () => {
        throw e;
      },
    },
  });
  await assert.rejects(
    t.probar(c),
    (err) =>
      !err.message.includes("zz-secreto") &&
      !err.cause &&
      !err.config &&
      err.code === "HACIENDA_AUTENTICACION",
  );
});
test("un POST incierto no se repite automáticamente y 401 solo renueva una vez", async () => {
  let requests = 0,
    posts = 0;
  const t = crearCliente({
    entorno: () => ({ HACIENDA_PERMITIR_PRUEBAS: "true" }),
    http: {
      post: async () => ({
        status: 200,
        data: { access_token: "zz-token", expires_in: 300 },
      }),
      request: async () => {
        requests++;
        throw new Error("password=zz-secreto");
      },
    },
  });
  await assert.rejects(t.enviar(c, {}), (e) => e.code === "HACIENDA_RED");
  assert.equal(requests, 1);
  const u = crearCliente({
    entorno: () => ({ HACIENDA_PERMITIR_PRUEBAS: "true" }),
    http: {
      post: async () => {
        posts++;
        return {
          status: 200,
          data: { access_token: "zz-token", expires_in: 300 },
        };
      },
      request: async () => ({ status: 401 }),
    },
  });
  await assert.rejects(
    u.consultar(c, "5".repeat(50)),
    (e) => e.code === "HACIENDA_CREDENCIALES" && e.status === 502,
  );
  assert.equal(posts, 2);
});

test("la copia aislada bloquea preparación de producción antes de reservar una venta", async () => {
  const {
    crearServicio,
  } = require("../src/integrations/hacienda/emision.service");
  const t = crearCliente({ entorno: () => ({ MODO_AISLADO: "true" }) });
  const s = crearServicio(
    {
      connect: async () => {
        throw Error("No debe abrir transacción");
      },
    },
    t,
  );
  await assert.rejects(
    s.preparar("factura", 1, { ambiente: "produccion" }),
    (e) => e.code === "HACIENDA_SALIDA_BLOQUEADA",
  );
});

// 2026-10-10. Con la contraseña del API mal guardada, "Probar conexión"
// respondía 401. El frontend toma cualquier 401 como "venció tu sesión": borra
// el token y manda a /ingresar, así que el mensaje de Hacienda nunca se veía.
test("credenciales que Hacienda rechaza no cierran la sesión de quien las prueba", async () => {
  const t = crearCliente({
    entorno: () => ({ HACIENDA_PERMITIR_PRUEBAS: "true" }),
    http: {
      post: async () => ({
        status: 401,
        data: { error: "invalid_grant" },
      }),
    },
  });
  await assert.rejects(
    t.probar(c),
    (e) =>
      e.code === "HACIENDA_CREDENCIALES" &&
      e.status === 422 &&
      /contraseña/.test(e.message),
  );
});

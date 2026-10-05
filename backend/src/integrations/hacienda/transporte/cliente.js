"use strict";
const axios = require("axios");
const https = require("node:https");
const AGENTE_TLS = new https.Agent({ rejectUnauthorized: true });
const { error } = require("../errores");
const { salidasBloqueadas } = require("../../../../config/aislado");
const DESTINOS = Object.freeze({
  pruebas: Object.freeze({
    token:
      "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token",
    api: "https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1/",
    clientId: "api-stag",
  }),
  produccion: Object.freeze({
    token:
      "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token",
    api: "https://api.comprobanteselectronicos.go.cr/recepcion/v1/",
    clientId: "api-prod",
  }),
});
function permitir(a, env = process.env) {
  // La llave de Hacienda no abre WhatsApp, correo ni Alegra. Pruebas tiene
  // permiso separado y nunca puede escoger endpoints de producción.
  if (a === "pruebas" && env.HACIENDA_PERMITIR_PRUEBAS === "true") return;
  if (a === "produccion" && !salidasBloqueadas(env)) return;
  throw error(
    "HACIENDA_SALIDA_BLOQUEADA",
    a === "pruebas"
      ? "Las conexiones a Hacienda en pruebas están deshabilitadas en este servidor."
      : "La emisión a Hacienda en producción está bloqueada en esta copia aislada.",
    423,
  );
}
function crearCliente({
  http = axios,
  entorno = () => process.env,
  ahora = () => Date.now(),
} = {}) {
  const tokens = new Map(),
    pendientes = new Map();
  async function token(config) {
    const a = config.ambiente,
      d = DESTINOS[a];
    if (!d) throw error("AMBIENTE_INVALIDO", "Ambiente inválido.");
    permitir(a, entorno());
    const k = a + ":" + config.revision,
      prev = tokens.get(k);
    if (prev && prev.hasta > ahora()) return prev.token;
    if (pendientes.has(k)) return pendientes.get(k);
    const p = (async () => {
      try {
        const body = new URLSearchParams({
          grant_type: "password",
          client_id: d.clientId,
          username: config.secretos.usuario,
          password: config.secretos.clave,
        });
        const r = await http.post(d.token, body.toString(), {
          httpsAgent: AGENTE_TLS,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 12000,
          maxRedirects: 0,
          maxContentLength: 128 * 1024,
          validateStatus: (s) => s < 500,
        });
        if (r.status !== 200 || !r.data?.access_token)
          throw error(
            "HACIENDA_CREDENCIALES",
            "Hacienda no aceptó las credenciales de este ambiente.",
            401,
          );
        tokens.clear();
        tokens.set(k, {
          token: r.data.access_token,
          hasta:
            ahora() + Math.max(1, Number(r.data.expires_in || 300) - 30) * 1000,
        });
        return r.data.access_token;
      } catch (e) {
        if (e.code === "HACIENDA_CREDENCIALES") throw e;
        throw error(
          "HACIENDA_AUTENTICACION",
          "No se pudo autenticar con Hacienda. Reintente después.",
          502,
        );
      }
    })().finally(() => pendientes.delete(k));
    pendientes.set(k, p);
    return p;
  }
  async function request(config, metodo, ruta, body) {
    permitir(config.ambiente, entorno());
    const d = DESTINOS[config.ambiente];
    if (!d) throw error("AMBIENTE_INVALIDO", "Ambiente inválido.");
    try {
      let r;
      for (let i = 0; i < 2; i++) {
        const t = await token(config);
        r = await http.request({
          method: metodo,
          url: d.api + ruta,
          httpsAgent: AGENTE_TLS,
          headers: {
            Authorization: "Bearer " + t,
            "Content-Type": "application/json",
          },
          data: body,
          timeout: 15000,
          maxRedirects: 0,
          maxContentLength: 3 * 1024 * 1024,
          validateStatus: () => true,
        });
        if (r.status !== 401 || i) break;
        tokens.clear();
      }
      if (r.status === 429)
        throw error(
          "HACIENDA_LIMITE",
          "Hacienda limitó temporalmente las consultas. Reintente después.",
          429,
        );
      if (r.status === 401)
        throw error(
          "HACIENDA_CREDENCIALES",
          "La sesión ante Hacienda no fue aceptada.",
          401,
        );
      return { status: r.status, data: r.data };
    } catch (e) {
      if (["HACIENDA_LIMITE", "HACIENDA_CREDENCIALES"].includes(e.code))
        throw e;
      // No devolver AxiosError: contiene usuario, password o token.
      throw error(
        "HACIENDA_RED",
        "No se pudo confirmar la respuesta de Hacienda. Consulte el estado antes de reenviar.",
        502,
      );
    }
  }
  return {
    verificarSalida: (a) => permitir(a, entorno()),
    probar: async (c) => {
      await token(c);
      return { conectado: true, ambiente: c.ambiente };
    },
    enviar: (c, sobre) => request(c, "POST", "recepcion", sobre),
    consultar: (c, clave, consecutivoReceptor) => {
      if (
        !/^\d{50}$/.test(clave) ||
        (consecutivoReceptor && !/^\d{20}$/.test(consecutivoReceptor))
      )
        throw error("CLAVE_INVALIDA", "Clave de consulta inválida.");
      return request(
        c,
        "GET",
        "recepcion/" +
          clave +
          (consecutivoReceptor ? "-" + consecutivoReceptor : ""),
      );
    },
  };
}
module.exports = { crearCliente, DESTINOS, permitir };

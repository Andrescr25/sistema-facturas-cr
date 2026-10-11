"use strict";
const { cifrar, descifrar } = require("./seguridad/almacen");
const { abrir } = require("./firma/certificado");
const { error } = require("./errores");
const { ACTIVIDAD } = require("./xml/v4.4");
const { registrarCambio } = require("../../utils/bitacora");
const CAMPOS = [
  "actividad_economica",
  "proveedor_sistemas",
  "provincia_codigo",
  "canton_codigo",
  "distrito_codigo",
  "sucursal",
  "terminal",
];
function ambiente(v) {
  if (!["pruebas", "produccion"].includes(v))
    throw error("AMBIENTE_INVALIDO", "Elija pruebas o producción.");
  return v;
}
function publica(r) {
  return {
    ambiente: r.ambiente,
    habilitada: r.habilitada,
    datos: r.datos,
    certificado: r.certificado,
    tieneCredenciales: Boolean(r.secretos_cifrados),
    revision: r.revision,
  };
}
async function obtener(db, a) {
  const r = (
    await db.query("SELECT * FROM hacienda_configuracion WHERE ambiente=$1", [
      ambiente(a),
    ])
  ).rows[0];
  if (!r)
    throw error(
      "MIGRACION_FALTANTE",
      "Aplique la migración 043 de Hacienda.",
      503,
    );
  return publica(r);
}
async function privada(db, a) {
  const r = (
    await db.query("SELECT * FROM hacienda_configuracion WHERE ambiente=$1", [
      ambiente(a),
    ])
  ).rows[0];
  if (!r)
    throw error(
      "MIGRACION_FALTANTE",
      "Falta la configuración de Hacienda.",
      503,
    );
  const secretos = await descifrar(r.secretos_cifrados, "hacienda:" + a);
  const empresa = (await db.query("SELECT * FROM empresa WHERE id=1")).rows[0];
  if (!empresa)
    throw error(
      "EMPRESA_FALTANTE",
      "Complete los datos de la empresa en Configuración.",
    );
  return { ...r, secretos, emisor: { ...empresa, ...r.datos } };
}
function revisar(c) {
  if (
    !c.secretos?.p12 ||
    !c.secretos?.pin ||
    !c.secretos?.usuario ||
    !c.secretos?.clave
  )
    throw error(
      "CREDENCIALES_FALTANTES",
      "Cargue el .p12, PIN y credenciales del API para este ambiente.",
    );
  const p12 = Buffer.from(c.secretos.p12, "base64"),
    cert = abrir(p12, c.secretos.pin);
  const id = String(c.emisor.identificacion || ""),
    serial = cert.meta.identificacionCertificado;
  // No afirmar que un certificado sin identificación pertenece a la empresa.
  if (
    !serial ||
    serial.replace(/\D/g, "").replace(/^0+/, "") !== id.replace(/^0+/, "") ||
    !id
  )
    throw error(
      "CERTIFICADO_OTRO_EMISOR",
      "La identificación del certificado no coincide con la empresa.",
    );
  const patron =
    c.ambiente === "pruebas"
      ? /@stag\.comprobanteselectronicos\.go\.cr$/i
      : /@comprobanteselectronicos\.go\.cr$/i;
  if (!patron.test(c.secretos.usuario))
    throw error(
      "USUARIO_OTRO_AMBIENTE",
      "El usuario del API no corresponde a este ambiente.",
    );
  for (const [campo, patron2] of [
    ["actividad_economica", ACTIVIDAD],
    ["proveedor_sistemas", /^\d{9,12}$/],
    ["provincia_codigo", /^[1-7]$/],
    ["canton_codigo", /^\d{2}$/],
    ["distrito_codigo", /^\d{2}$/],
    ["sucursal", /^\d{3}$/],
    ["terminal", /^\d{5}$/],
  ])
    if (!patron2.test(c.emisor[campo] || ""))
      throw error(
        "DATO_FISCAL_FALTANTE",
        `Complete ${campo.replaceAll("_", " ")}.`,
      );
  return cert;
}
async function guardar(db, a, datos, archivo, usuarioId) {
  a = ambiente(a);
  const r = (
    await db.query(
      "SELECT * FROM hacienda_configuracion WHERE ambiente=$1 FOR UPDATE",
      [a],
    )
  ).rows[0];
  if (!r)
    throw error(
      "MIGRACION_FALTANTE",
      "Aplique la migración 043 de Hacienda.",
      503,
    );
  const secretos = await descifrar(r.secretos_cifrados, "hacienda:" + a),
    nuevos = { ...r.datos };
  for (const campo of CAMPOS)
    if (Object.hasOwn(datos, campo)) {
      if (typeof datos[campo] !== "string" || datos[campo].length > 40)
        throw error("DATO_INVALIDO", "Dato fiscal inválido.");
      nuevos[campo] = datos[campo].trim();
    }
  for (const campo of ["usuario", "clave", "pin"])
    if (datos[campo]) {
      if (typeof datos[campo] !== "string" || datos[campo].length > 300)
        throw error("DATO_INVALIDO", "Credencial inválida.");
      secretos[campo] = datos[campo];
    }
  let cert = r.certificado;
  if (archivo) {
    cert = abrir(archivo, secretos.pin).meta;
    secretos.p12 = archivo.toString("base64");
  }
  if (datos.pin && secretos.p12)
    cert = abrir(Buffer.from(secretos.p12, "base64"), secretos.pin).meta;
  const habilitada = datos.habilitada === true || datos.habilitada === "true";
  if (
    datos.habilitada !== undefined &&
    ![true, false, "true", "false"].includes(datos.habilitada)
  )
    throw error("DATO_INVALIDO", "Habilitación inválida.");
  const empresa =
    (await db.query("SELECT * FROM empresa WHERE id=1")).rows[0] || {};
  if (datos.habilitada === undefined ? r.habilitada : habilitada)
    revisar({ ambiente: a, secretos, emisor: { ...empresa, ...nuevos } });
  const cifrado = Object.keys(secretos).length
    ? await cifrar(secretos, "hacienda:" + a)
    : null;
  const fila = (
    await db.query(
      "UPDATE hacienda_configuracion SET datos=$2,secretos_cifrados=$3,certificado=$4,habilitada=$5,revision=revision+1,actualizado_en=now() WHERE ambiente=$1 RETURNING *",
      [
        a,
        nuevos,
        cifrado,
        cert,
        datos.habilitada === undefined ? r.habilitada : habilitada,
      ],
    )
  ).rows[0];
  // Nunca registrar PIN, password, token, p12 ni texto cifrado en bitácora.
  await registrarCambio(db, {
    entidad: "hacienda_configuracion",
    entidadId: a,
    accion: "configurar",
    antes: publica(r),
    despues: publica(fila),
    usuarioId,
  });
  return publica(fila);
}
module.exports = { ambiente, publica, obtener, privada, revisar, guardar };

"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { error } = require("../errores");

// Fuera de Git y del directorio público /archivos. La llave debe respaldarse
// junto a la base; perderla impide recuperar el PIN y las credenciales.
function raiz() {
  return path.resolve(
    process.env.HACIENDA_ALMACEN_PRIVADO ||
      path.join(os.homedir(), ".local/share/sistema-facturas-cr/hacienda"),
  );
}
async function directorio() {
  const r = raiz();
  if (
    r
      .split(path.sep)
      .some((p) => [".git", "archivos", "node_modules"].includes(p))
  )
    throw error("ALMACEN_INVALIDO", "El almacén fiscal debe ser privado.", 500);
  // Comprobar el ancestro real antes de crear nada: un volumen privado no
  // puede terminar dentro de un worktree mediante enlaces intermedios.
  let ancestro = r;
  while (true) {
    try {
      ancestro = await fs.realpath(ancestro);
      break;
    } catch (e) {
      if (e.code !== "ENOENT")
        throw error("ALMACEN_INVALIDO", "Almacén fiscal inaccesible.", 500);
      const padre = path.dirname(ancestro);
      if (padre === ancestro) throw e;
      ancestro = padre;
    }
  }
  if (
    ancestro
      .split(path.sep)
      .some((p) => [".git", "archivos", "node_modules"].includes(p))
  )
    throw error(
      "ALMACEN_INVALIDO",
      "El almacén fiscal debe estar fuera de archivos públicos y dependencias.",
      500,
    );
  for (let p = ancestro; ; p = path.dirname(p)) {
    try {
      await fs.lstat(path.join(p, ".git"));
      throw error(
        "ALMACEN_INVALIDO",
        "El almacén fiscal debe estar fuera del repositorio.",
        500,
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (path.dirname(p) === p) break;
  }
  await fs.mkdir(r, { recursive: true, mode: 0o700 });
  const st = await fs.lstat(r);
  if (!st.isDirectory() || st.isSymbolicLink())
    throw error(
      "ALMACEN_INVALIDO",
      "El almacén fiscal no puede ser un enlace.",
      500,
    );
  await fs.chmod(r, 0o700);
  return r;
}
async function llave(crear = false) {
  const r = await directorio(),
    p = path.join(r, "llave-cifrado");
  try {
    if (crear)
      await fs.writeFile(p, crypto.randomBytes(32), {
        flag: "wx",
        mode: 0o600,
      });
  } catch (e) {
    if (e.code !== "EEXIST")
      throw error(
        "ALMACEN_INVALIDO",
        "No se pudo preparar el almacén fiscal.",
        500,
      );
  }
  const h = await fs.open(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = await h.stat(),
      b = await h.readFile();
    if (!st.isFile() || st.mode & 0o077 || b.length !== 32)
      throw error(
        "LLAVE_INVALIDA",
        "La llave de cifrado debe tener 32 bytes y permisos privados.",
        500,
      );
    return b;
  } finally {
    await h.close();
  }
}
async function cifrar(datos, contexto) {
  const iv = crypto.randomBytes(12),
    c = crypto.createCipheriv("aes-256-gcm", await llave(true), iv);
  c.setAAD(Buffer.from(contexto));
  const contenido = Buffer.concat([
    c.update(JSON.stringify(datos), "utf8"),
    c.final(),
  ]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    datos: contenido.toString("base64"),
  });
}
async function descifrar(valor, contexto) {
  if (!valor) return {};
  try {
    const e = JSON.parse(valor);
    if (e.v !== 1) throw new Error();
    const c = crypto.createDecipheriv(
      "aes-256-gcm",
      await llave(),
      Buffer.from(e.iv, "base64"),
    );
    c.setAAD(Buffer.from(contexto));
    c.setAuthTag(Buffer.from(e.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        c.update(Buffer.from(e.datos, "base64")),
        c.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw error(
      "SECRETOS_NO_DISPONIBLES",
      "No se pudo descifrar la configuración. Restaure la llave de cifrado correspondiente.",
      500,
    );
  }
}
async function guardarXml(xml) {
  const nombre = `${crypto.randomUUID()}.xml`,
    r = await directorio();
  await fs.writeFile(path.join(r, nombre), xml, { flag: "wx", mode: 0o600 });
  return {
    ruta: nombre,
    sha256: crypto.createHash("sha256").update(xml).digest("hex"),
  };
}
async function leerXml(nombre, huella) {
  if (!/^[a-f0-9-]{36}\.xml$/.test(nombre || ""))
    throw error("ARCHIVO_INVALIDO", "Archivo fiscal inválido.", 500);
  const h = await fs.open(
    path.join(await directorio(), nombre),
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const st = await h.stat();
    if (!st.isFile() || st.size > 2 * 1024 * 1024) throw new Error();
    const b = await h.readFile();
    if (
      huella &&
      crypto.createHash("sha256").update(b).digest("hex") !== huella
    )
      throw new Error();
    return b.toString("utf8");
  } catch {
    throw error(
      "ARCHIVO_INVALIDO",
      "El archivo fiscal no coincide con su huella.",
      500,
    );
  } finally {
    await h.close();
  }
}
module.exports = { raiz, cifrar, descifrar, guardarXml, leerXml };

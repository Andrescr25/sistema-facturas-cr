"use strict";
/**
 * LA NUMERACIÓN FISCAL: con qué número sale el próximo comprobante, y cómo
 * se cambia.
 *
 * LA REGLA. Manda el numerador (`hacienda_numerador.siguiente`): el próximo
 * comprobante sale con ese número, y si ese número ya salió se toma el
 * primero libre que le sigue. Nunca se repite un número que este sistema
 * conozca: los de las facturas cargadas de Alegra (por serie y por clave) y
 * los de los comprobantes propios.
 *
 * QUÉ REEMPLAZA (2026-10-11). Antes, en producción, el número era siempre
 * "el mayor que exista + 1", releído en cada reserva. Alegra dejó dos
 * facturas electrónicas con los números 4902 y 4946 (nacieron como tiquete)
 * cuando su serie iba por el 2480: con esa regla la primera factura propia
 * salió con el 4947 y la numeración quedó dos mil números adelante. El
 * usuario decidió, textual: «empieza la factura electrónica con 2481». Con la
 * regla vieja no se podía: cualquier número menor al máximo se ignoraba.
 *
 * Saltar los usados protege igual que "el mayor + 1" —si después se carga un
 * documento de Alegra con un número de más adelante, se salta ese y nada
 * más— sin que un número suelto arrastre toda la serie.
 *
 * POR QUÉ SE CAMBIA DESDE LA PANTALLA (Configuración → Hacienda). El número
 * es una decisión fiscal del dueño, y hasta ahora solo existía dentro de la
 * base. Cada cambio queda en la bitácora con quién lo hizo.
 *
 * LO QUE NO SE PUEDE: retroceder a la mitad de una numeración ya usada. De
 * los números viejos esta base conoce solo una parte (502 de los 2.480 de
 * Alegra), así que "libre" ahí no quiere decir "sin usar". Por eso se
 * rechaza un número que tenga adelante más de `USADOS_TOLERADOS` ya usados.
 */
const { error } = require("./errores");
const { registrarCambio } = require("../../utils/bitacora");

/** Los comprobantes que numera este sistema para sus ventas. */
const TIPOS = Object.freeze({
  "01": "Factura electrónica",
  "04": "Tiquete electrónico",
  "03": "Nota de crédito",
});
/** El último número que cabe en diez dígitos queda de tope, sin usar. */
const TOPE = 9999999998n;
/**
 * Cuántos números ya usados se aceptan por delante del elegido. Tres sueltos
 * (4902, 4946, 4947) son una rareza que se salta; quinientos son otra
 * numeración entera, y meterse en medio es repetir números que esta base no
 * conoce.
 */
const USADOS_TOLERADOS = 10;

/** El primer número desde `desde` que no esté entre los `usados`. */
function primerLibre(desde, usados) {
  const ocupados = new Set([...(usados || [])].map((u) => BigInt(u)));
  let n = BigInt(desde);
  while (ocupados.has(n)) n++;
  return n;
}

/** Lo escrito en la pantalla → un número de comprobante válido. */
function numeroValido(valor) {
  const texto = String(valor ?? "").trim();
  if (!/^\d{1,10}$/.test(texto) || BigInt(texto) < 1n || BigInt(texto) > TOPE)
    throw error("NUMERO_INVALIDO", "Escribí un número entero entre 1 y 9.999.999.998.");
  return BigInt(texto);
}

const tablaDe = (tipo) => (tipo === "03" ? "nota_credito" : "factura");

/**
 * Los números de esa serie que ya salieron, de `desde` en adelante, en orden.
 * En pruebas solo cuentan los comprobantes propios de ESE ambiente: las
 * ventas reales no gastan números de prueba.
 */
async function usados(db, { ambiente, pref, identificacion, tipo }, desde) {
  const propios = `SELECT substring(consecutivo from 11 for 10)::bigint AS n FROM hacienda_comprobante
     WHERE ambiente=$1 AND consecutivo ~ '^[0-9]{20}$' AND left(consecutivo,10)=$2`;
  const [sql, parametros] =
    ambiente === "produccion"
      ? [
          `SELECT n::text FROM (
             ${propios}
             UNION SELECT consecutivo::bigint FROM ${tablaDe(tipo)} WHERE serie=$2 AND consecutivo IS NOT NULL
             UNION SELECT substring(clave_hacienda from 32 for 10)::bigint FROM ${tablaDe(tipo)}
               WHERE clave_hacienda ~ '^506[0-9]{47}$' AND substring(clave_hacienda from 22 for 10)=$2
                 AND substring(clave_hacienda from 10 for 12)=$4
           ) u WHERE n >= $3 ORDER BY n`,
          [ambiente, pref, String(desde), String(identificacion).padStart(12, "0")],
        ]
      : [`SELECT n::text FROM (${propios}) u WHERE n >= $3 ORDER BY n`, [ambiente, pref, String(desde)]];
  return (await db.query(sql, parametros)).rows.map((r) => r.n);
}

/**
 * Dónde arranca una serie que todavía no tiene numerador. En producción,
 * después de todo lo que Alegra ya usó; en pruebas, en 1.
 */
async function inicio(db, { ambiente, pref, identificacion, tipo }) {
  if (ambiente !== "produccion") return 1n;
  const tabla = tablaDe(tipo);
  const r = await db.query(
    `SELECT GREATEST(COALESCE((SELECT max(consecutivo)+1 FROM ${tabla} WHERE serie=$1),1),COALESCE((SELECT max(siguiente) FROM serie_consecutivo WHERE serie=$1),1),COALESCE((SELECT max(substring(clave_hacienda from 32 for 10)::bigint)+1 FROM ${tabla} WHERE clave_hacienda ~ '^506[0-9]{47}$' AND substring(clave_hacienda from 22 for 10)=$1 AND substring(clave_hacienda from 10 for 12)=$2),1))::text AS siguiente`,
    [pref, String(identificacion).padStart(12, "0")],
  );
  return BigInt(r.rows[0].siguiente);
}

/** La serie de un tipo de comprobante en ese ambiente: sucursal + terminal + tipo. */
function serieDe(c, tipo) {
  return {
    ambiente: c.ambiente,
    sucursal: c.emisor.sucursal,
    terminal: c.emisor.terminal,
    pref: c.emisor.sucursal + c.emisor.terminal + tipo,
    identificacion: c.emisor.identificacion,
    tipo,
  };
}

/**
 * Reserva el número del próximo comprobante. Corre DENTRO de la transacción
 * que prepara el comprobante: el numerador queda bloqueado hasta que termina,
 * así que dos preparaciones a la vez no reciben el mismo número.
 */
async function reservar(db, c, tipo) {
  const s = serieDe(c, tipo);
  const llave = [s.ambiente, s.sucursal, s.terminal, tipo];
  const leer = async () =>
    (
      await db.query(
        "SELECT siguiente::text FROM hacienda_numerador WHERE ambiente=$1 AND sucursal=$2 AND terminal=$3 AND tipo=$4 FOR UPDATE",
        llave,
      )
    ).rows[0];
  let fila = await leer();
  if (!fila) {
    await db.query(
      "INSERT INTO hacienda_numerador(ambiente,sucursal,terminal,tipo,siguiente) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [...llave, String(await inicio(db, s))],
    );
    fila = await leer();
  }
  const numero = primerLibre(fila.siguiente, await usados(db, s, fila.siguiente));
  if (numero > TOPE) throw error("SERIE_AGOTADA", "La serie fiscal llegó a su límite.");
  await db.query(
    "UPDATE hacienda_numerador SET siguiente=$5 WHERE ambiente=$1 AND sucursal=$2 AND terminal=$3 AND tipo=$4",
    [...llave, String(numero + 1n)],
  );
  return s.pref + String(numero).padStart(10, "0");
}

/** Lo que hace falta del ambiente para numerar, sin abrir sus secretos. */
async function ambienteParaNumerar(db, ambiente) {
  if (!["pruebas", "produccion"].includes(ambiente))
    throw error("AMBIENTE_INVALIDO", "Elija pruebas o producción.");
  const fila = (await db.query("SELECT datos FROM hacienda_configuracion WHERE ambiente=$1", [ambiente])).rows[0];
  const empresa = (await db.query("SELECT identificacion FROM empresa WHERE id=1")).rows[0];
  const sucursal = String(fila?.datos?.sucursal || ""),
    terminal = String(fila?.datos?.terminal || "");
  if (!/^\d{3}$/.test(sucursal) || !/^\d{5}$/.test(terminal) || !empresa?.identificacion)
    throw error(
      "NUMERACION_SIN_DATOS",
      "Guardá primero la sucursal y la terminal de este ambiente.",
      409,
    );
  return { ambiente, emisor: { sucursal, terminal, identificacion: empresa.identificacion } };
}

/** Cómo está la numeración de un tipo: dónde apunta y qué número saldría. */
async function estadoDe(db, c, tipo) {
  const s = serieDe(c, tipo);
  const fila = (
    await db.query(
      "SELECT siguiente::text FROM hacienda_numerador WHERE ambiente=$1 AND sucursal=$2 AND terminal=$3 AND tipo=$4",
      [s.ambiente, s.sucursal, s.terminal, tipo],
    )
  ).rows[0];
  const desde = fila ? BigInt(fila.siguiente) : await inicio(db, s);
  const adelante = await usados(db, s, desde);
  return {
    tipo,
    nombre: TIPOS[tipo],
    // El número con que sale el próximo, ya saltados los usados.
    proximo: String(primerLibre(desde, adelante)),
    // Los ya usados de ahí en adelante: se saltan solos al llegar.
    usadosAdelante: adelante.length,
    primerosUsados: adelante.slice(0, 5),
  };
}

/** La numeración de las ventas en ese ambiente, para mostrarla en Configuración. */
async function ver(db, ambiente) {
  const c = await ambienteParaNumerar(db, ambiente);
  const tipos = [];
  for (const tipo of Object.keys(TIPOS)) tipos.push(await estadoDe(db, c, tipo));
  // Factura, tiquete, nota: el orden en que se usan.
  return tipos.sort((a, b) => ["01", "04", "03"].indexOf(a.tipo) - ["01", "04", "03"].indexOf(b.tipo));
}

/**
 * Cambiar con qué número sale el próximo comprobante de un tipo. Corre en
 * una transacción (la abre quien llama): bloquea el numerador igual que una
 * reserva, para no cruzarse con una factura que se esté emitiendo.
 */
async function fijar(db, ambiente, datos = {}, usuarioId) {
  const c = await ambienteParaNumerar(db, ambiente);
  const tipo = String(datos.tipo || "");
  if (!TIPOS[tipo]) throw error("TIPO_INVALIDO", "Elegí factura, tiquete o nota de crédito.");
  const numero = numeroValido(datos.siguiente);
  const s = serieDe(c, tipo);
  const llave = [s.ambiente, s.sucursal, s.terminal, tipo];

  const adelante = await usados(db, s, numero);
  if (adelante.length > USADOS_TOLERADOS)
    throw error(
      "NUMERACION_YA_USADA",
      `Del ${numero} en adelante ya hay ${adelante.length} números usados (el último, ${adelante.at(-1)}): ` +
        "ese número cae en medio de una numeración que ya se usó. " +
        `Elegí el que sigue al último número de esa numeración, o uno mayor a ${adelante.at(-1)}.`,
      409,
    );

  const antes = (
    await db.query(
      "SELECT siguiente::text FROM hacienda_numerador WHERE ambiente=$1 AND sucursal=$2 AND terminal=$3 AND tipo=$4 FOR UPDATE",
      llave,
    )
  ).rows[0];
  await db.query(
    `INSERT INTO hacienda_numerador(ambiente,sucursal,terminal,tipo,siguiente) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (ambiente,sucursal,terminal,tipo) DO UPDATE SET siguiente=EXCLUDED.siguiente`,
    [...llave, String(numero)],
  );
  await registrarCambio(db, {
    entidad: "hacienda_numerador",
    entidadId: llave.join("-"),
    accion: "editar",
    antes: { siguiente: antes ? antes.siguiente : null },
    despues: { siguiente: String(numero) },
    usuarioId,
    motivo: `Numeración de ${TIPOS[tipo].toLowerCase()} en ${ambiente}`,
  });
  return ver(db, ambiente);
}

module.exports = { TIPOS, USADOS_TOLERADOS, primerLibre, numeroValido, usados, reservar, ver, fijar };

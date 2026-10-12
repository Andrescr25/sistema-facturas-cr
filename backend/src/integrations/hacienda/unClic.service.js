"use strict";
/**
 * EMITIR DE UN CLIC: lo que el sistema decide solo para que el botón no
 * pregunte, y lo que la pantalla necesita saber de cada documento.
 *
 * POR QUÉ ES UN ARCHIVO APARTE (2026-10-11). Todo esto nació dentro de
 * `emision.service.js`, que pasó de 786 a 1.218 líneas en un día: la factura
 * de un clic, el medio de pago, la nota de crédito y el correo al cliente.
 * Ese archivo es el camino fiscal —preparar, enviar, consultar— y tiene que
 * poder leerse entero. Acá va lo que se apoya en ese camino sin ser parte de
 * él:
 *   · a qué ambiente y con qué tipo sale una factura;
 *   · qué dato falta antes de emitir (descuento, medicamento, medio de pago,
 *     qué hace una nota de crédito);
 *   · cómo va la emisión de una factura o de una nota, para pintarla;
 *   · entregarle al cliente su factura o su nota de crédito aceptada.
 *
 * No prepara, firma ni envía nada: para eso llama a `preparar`, que le pasa
 * el servicio de emisión al armarlo (ver `crearUnClic`).
 */
const almacen = require("./seguridad/almacen");
const { registrarCambio } = require("../../utils/bitacora");
const { error } = require("./errores");

/**
 * UN CLIC EMITE (2026-10-11). El modal preguntaba ambiente y tipo de
 * comprobante en cada factura. El usuario pidió que el botón emita sin
 * preguntar; estas tres reglas contestan lo que antes se elegía a mano.
 */

/** A qué ambiente va el clic: producción si está habilitada; si no, pruebas. */
function ambienteDeEmision(filas) {
  const habilitado = (a) => (filas || []).some((r) => r.ambiente === a && r.habilitada === true);
  return habilitado("produccion") ? "produccion" : habilitado("pruebas") ? "pruebas" : null;
}

/**
 * Factura electrónica si el cliente tiene identificación; si no, tiquete.
 * Es lo que ya hacía este negocio en Alegra: 558 facturas electrónicas a
 * clientes identificados y tiquete para el que no da cédula.
 */
function tipoDeFactura(factura) {
  return String(factura?.cliente_identificacion ?? "").trim() ? "01" : "04";
}

/**
 * Las líneas que necesitan un dato que solo una persona puede dar. Con una
 * sola, el clic NO emite: la factura pide ese dato ahí mismo y sigue.
 *  - el motivo de un descuento: Hacienda lo exige y cambia cómo se declara
 *    (una regalía no es un descuento comercial), no se adivina;
 *  - el registro sanitario y la forma farmacéutica de un medicamento, si la
 *    ficha del producto no los trae.
 * Es raro: al 2026-10-11, una de las últimas mil facturas tenía descuento y
 * diez productos de dos mil son medicamentos.
 *
 * `dadas` es lo que la persona ya contestó ([{ numeroLinea, codigoDescuento,
 * naturalezaDescuento, registroMedicamento, formaFarmaceutica }]): con eso
 * la línea deja de estar pendiente.
 */
function datosPendientes(lineas, dadas = []) {
  const pendientes = [];
  for (const l of lineas || []) {
    const d =
      (Array.isArray(dadas) ? dadas : []).find(
        (x) => Number(x?.numeroLinea) === Number(l.numero_linea),
      ) || {};
    const descuento = Number(l.descuento_monto) > 0,
      medicamento = l.es_medicamento === true,
      codigo = String(d.codigoDescuento || ""),
      registro = String(d.registroMedicamento || l.registro_sanitario || "").trim(),
      forma = String(d.formaFarmaceutica || l.forma_farmaceutica || "").trim();
    const falta = [];
    if (descuento && !/^(0[1-9]|99)$/.test(codigo)) falta.push("el motivo del descuento");
    else if (descuento && codigo === "99" && !String(d.naturalezaDescuento || "").trim())
      falta.push("la descripción del descuento");
    if (medicamento && !(registro && /^\d{3}$/.test(forma))) falta.push("los datos del medicamento");
    if (falta.length)
      pendientes.push({
        numeroLinea: l.numero_linea,
        nombre: l.nombre,
        falta,
        descuento,
        medicamento,
        // Lo que la ficha ya trae, para no hacerlo escribir de nuevo.
        registroSanitario: l.registro_sanitario || "",
        formaFarmaceutica: l.forma_farmaceutica || "",
      });
  }
  return pendientes;
}

/** Solo los cinco campos conocidos de cada línea, como texto y con tope. */
function lineasDadas(dadas) {
  const t = (v, largo) => String(v ?? "").trim().slice(0, largo);
  return (Array.isArray(dadas) ? dadas : []).slice(0, 500).map((d) => ({
    numeroLinea: Number(d?.numeroLinea),
    codigoDescuento: t(d?.codigoDescuento, 2),
    naturalezaDescuento: t(d?.naturalezaDescuento, 80),
    registroMedicamento: t(d?.registroMedicamento, 60),
    formaFarmaceutica: t(d?.formaFarmaceutica, 3),
  }));
}

/**
 * Lo que una nota de crédito puede declarar que hace sobre su factura
 * (anexo 4.4, `CodigoReferenciaType`). Quedan fuera los que no son de una
 * nota sobre una venta: 05 contingencia, 07/15/16 sustituciones (las arma el
 * sistema al volver a emitir un rechazo), 08 endoso, 10 débito, 11 proveedor
 * no domiciliado.
 */
const REFERENCIAS_DE_NOTA = Object.freeze(["01", "02", "04", "06", "09", "12", "13", "14", "99"]);

/**
 * @param {object} d
 * @param {object} d.pool      el pool de la base (o su doble en pruebas)
 * @param {object} d.ganchos   `alAceptarFactura(facturaId)` y `alAceptarNota(notaId)`:
 *                             quién le manda el correo al cliente
 * @param {Function} d.preparar  del servicio de emisión: reserva número, firma y guarda
 * @param {Function} d.vista   fila de comprobante → lo que ve la pantalla
 * @param {Function} d.id      valida un identificador
 */
function crearUnClic({ pool, ganchos = {}, preparar, vista, id }) {
  /**
   * EL MEDIO DE PAGO QUE SE LE DECLARA A HACIENDA, en código (01 efectivo,
   * 04 transferencia, 06 SINPE…) o null si no se sabe.
   *
   * POR QUÉ NO ALCANZA CON EL DE LA FACTURA (2026-10-11). Antes toda factura
   * de contado nacía marcada "Efectivo" —y por eso salía cobrada sola—. Desde
   * que nace sin cobrar no trae medio, y emitir respondía «Medio de pago:
   * falta un dato fiscal válido». Se busca, en este orden:
   *   1. lo que la persona contestó al emitir (`metodoPagoId`);
   *   2. el medio anotado en la factura, si lo tiene;
   *   3. el que ya se declaró para esta factura en este ambiente (su
   *      comprobante anterior): así la nota de crédito dice lo mismo que su
   *      factura, y volver a emitir un rechazo no pregunta de nuevo;
   *   4. el del cobro vigente más grande.
   * Si nada lo dice, NO se inventa "efectivo": una venta de contado lo pide
   * (ver `estadoDeFactura`) y una a crédito sale sin ese dato.
   * "99 Otros" no cuenta como respuesta: Hacienda quiere el medio específico.
   */
  async function medioDePago(db, factura, ambiente, metodoPagoId) {
    const especifico = (c) => (/^0[1-7]$/.test(String(c || "")) ? String(c) : null);
    if (metodoPagoId !== undefined && metodoPagoId !== null && metodoPagoId !== "") {
      const elegido = (
        await db.query(
          "SELECT codigo_medio_pago_hacienda FROM metodo_pago WHERE id=$1 AND activo",
          [id(metodoPagoId)],
        )
      ).rows[0];
      if (!especifico(elegido?.codigo_medio_pago_hacienda))
        throw error("MEDIO_PAGO_INVALIDO", "Elegí un medio de pago de la lista.");
      return elegido.codigo_medio_pago_hacienda;
    }
    if (factura.metodo_pago_id) {
      const propio = (
        await db.query("SELECT codigo_medio_pago_hacienda FROM metodo_pago WHERE id=$1", [
          factura.metodo_pago_id,
        ])
      ).rows[0];
      if (especifico(propio?.codigo_medio_pago_hacienda)) return propio.codigo_medio_pago_hacienda;
    }
    const anterior = (
      await db.query(
        "SELECT xml_ruta, xml_sha256 FROM hacienda_comprobante WHERE ambiente=$1 AND origen='factura' AND origen_id=$2 ORDER BY revision_documento DESC LIMIT 1",
        [ambiente, factura.id],
      )
    ).rows[0];
    if (anterior) {
      const declarado = /<TipoMedioPago>(\d{2})<\/TipoMedioPago>/.exec(
        String(await almacen.leerXml(anterior.xml_ruta, anterior.xml_sha256)),
      );
      if (especifico(declarado?.[1])) return declarado[1];
    }
    const cobro = (
      await db.query(
        `SELECT mp.codigo_medio_pago_hacienda AS codigo
           FROM pago_factura pf JOIN pago p ON p.id=pf.pago_id JOIN metodo_pago mp ON mp.id=p.metodo_pago_id
          WHERE pf.factura_id=$1 AND p.anulado=FALSE AND mp.codigo_medio_pago_hacienda ~ '^0[1-7]$'
          GROUP BY mp.codigo_medio_pago_hacienda ORDER BY sum(pf.monto) DESC, mp.codigo_medio_pago_hacienda LIMIT 1`,
        [factura.id],
      )
    ).rows[0];
    return cobro ? cobro.codigo : null;
  }
  /** Los medios que se pueden elegir al emitir: activos y con código específico. */
  async function mediosDePago(db) {
    return (
      await db.query(
        "SELECT id, nombre FROM metodo_pago WHERE activo AND codigo_medio_pago_hacienda ~ '^0[1-7]$' ORDER BY orden, id",
      )
    ).rows;
  }

  /** Quién entrega cada documento: el nombre de su gancho. */
  const GANCHO = { factura: "alAceptarFactura", nota_credito: "alAceptarNota" };

  /**
   * Entregarle al cliente su comprobante aceptado: el PDF con los dos XML.
   *
   * Una FACTURA o una NOTA DE CRÉDITO aceptada en PRODUCCIÓN. Un comprobante
   * de pruebas no tiene validez y no se le manda a nadie; la respuesta a una
   * compra no es de este camino. La nota se sumó el 2026-10-11: el usuario
   * notó que «está faltando enviar la nota de crédito por correo al cliente».
   *
   * El envío lo hace quien armó el servicio (`ganchos.alAceptarFactura` o
   * `ganchos.alAceptarNota`, que reciben el id del documento): este módulo no
   * importa correo. El resultado se anota SIEMPRE en la bitácora del
   * comprobante —enviado, sin correo en la ficha, o por qué falló— porque es
   * lo que después dice la pantalla, y nunca tumba la consulta: el documento
   * ya está aceptado aunque el correo no salga. No se reintenta solo.
   */
  async function entregar(comprobante, usuarioId) {
    const gancho = ganchos[GANCHO[comprobante.origen]];
    if (typeof gancho !== "function" || comprobante.ambiente !== "produccion") return null;
    let correo;
    try {
      correo = await gancho(comprobante.origenId);
    } catch {
      correo = { estado: "error", motivo: "No se pudo enviar el correo al cliente." };
    }
    if (!correo) return null;
    try {
      await registrarCambio(pool, {
        entidad: "hacienda_comprobante",
        entidadId: comprobante.id,
        accion: "correo",
        despues: correo,
        usuarioId,
      });
    } catch {
      // Sin bitácora la pantalla no lo va a recordar, pero el correo ya salió.
    }
    return correo;
  }
  async function ultimoCorreo(comprobanteId) {
    const r = (
      await pool.query(
        "SELECT despues FROM bitacora_cambio WHERE entidad='hacienda_comprobante' AND entidad_id=$1 AND accion='correo' ORDER BY id DESC LIMIT 1",
        [String(comprobanteId)],
      )
    ).rows[0];
    return r ? r.despues : null;
  }

  /**
   * Todo lo que la factura necesita saber de su emisión electrónica: a qué
   * ambiente iría un clic, qué comprobante saldría, si le falta algún dato,
   * y cómo va el que ya se preparó (con su correo al cliente).
   */
  async function estadoDeFactura(n, dadas = []) {
    const f = (
      await pool.query(
        "SELECT id, numero, estado, electronica, alegra_id, cliente_identificacion, hacienda_comprobante_id, condicion_venta, metodo_pago_id FROM factura WHERE id=$1",
        [id(n)],
      )
    ).rows[0];
    if (!f) throw error("NO_EXISTE", "No existe esa factura.", 404);
    const a = ambienteDeEmision(
      (await pool.query("SELECT ambiente, habilitada FROM hacienda_configuracion")).rows,
    );
    const lineas = (
      await pool.query(
        "SELECT l.numero_linea,l.nombre,l.descuento_monto,p.es_medicamento,p.registro_sanitario,p.forma_farmaceutica FROM factura_linea l LEFT JOIN producto p ON p.id=l.producto_id WHERE l.factura_id=$1 ORDER BY l.numero_linea",
        [f.id],
      )
    ).rows;
    // El comprobante que cuenta: el que la factura ya tiene reservado en
    // producción; si no, el último del ambiente al que iría el clic.
    const c = f.hacienda_comprobante_id
      ? (await pool.query("SELECT * FROM hacienda_comprobante WHERE id=$1", [f.hacienda_comprobante_id])).rows[0]
      : a
        ? (
            await pool.query(
              "SELECT * FROM hacienda_comprobante WHERE ambiente=$1 AND origen='factura' AND origen_id=$2 ORDER BY revision_documento DESC LIMIT 1",
              [a, f.id],
            )
          ).rows[0]
        : null;
    const motivoNoEmitible = c && c.estado !== "rechazada"
      ? null
      : f.estado !== "emitida"
        ? "Solo se emite electrónicamente una factura emitida."
        : f.alegra_id || f.electronica
          ? "Es un documento histórico o ya electrónico: no se vuelve a emitir."
          : !a
            ? "Habilitá un ambiente en Configuración → Hacienda."
            : null;
    // En contado Hacienda pide el medio de pago; si ni la factura ni sus
    // cobros lo dicen, lo tiene que decir quien emite.
    const ambiente = c?.ambiente || a;
    const faltaMedioPago =
      f.condicion_venta !== "credito" && Boolean(ambiente) && !(await medioDePago(pool, f, ambiente));
    return {
      ambiente,
      tipo: tipoDeFactura(f),
      pendientes: datosPendientes(lineas, dadas),
      faltaMedioPago,
      mediosPago: faltaMedioPago ? await mediosDePago(pool) : [],
      motivoNoEmitible,
      comprobante: vista(c),
      correo: c ? await ultimoCorreo(c.id) : null,
    };
  }

  /**
   * El botón "Emitir electrónicamente": prepara y firma el comprobante sin
   * preguntar nada. Enviar y consultar son los pasos de siempre, que la
   * pantalla encadena para ir mostrando el avance.
   */
  async function emitirFactura(n, datos = {}, usuarioId) {
    const lineas = lineasDadas(datos.lineas);
    const e = await estadoDeFactura(n, lineas);
    if (e.motivoNoEmitible) throw error("NO_EMITIBLE", e.motivoNoEmitible, 409);
    // Con un comprobante en curso no se pide nada: `preparar` devuelve ese
    // mismo, sin firmar otro ni gastar otro número.
    const enCurso = e.comprobante && e.comprobante.estado !== "rechazada";
    if (!enCurso && e.pendientes.length)
      throw error(
        "DATOS_FISCALES_PENDIENTES",
        "Esta factura necesita un dato más antes de emitirse: " +
          e.pendientes
            .slice(0, 3)
            .map((p) => `${p.falta.join(" y ")} de «${p.nombre}»`)
            .join("; ") +
          (e.pendientes.length > 3 ? "…" : "."),
        409,
      );
    const eligioMedio = datos.metodoPagoId !== undefined && datos.metodoPagoId !== null && datos.metodoPagoId !== "";
    if (!enCurso && e.faltaMedioPago && !eligioMedio)
      throw error(
        "DATOS_FISCALES_PENDIENTES",
        "Falta decir con qué paga el cliente: en una venta de contado Hacienda pide el medio de pago.",
        409,
      );
    return preparar(
      "factura",
      n,
      {
        ambiente: e.ambiente,
        tipo: e.tipo,
        sustituir: datos.sustituir === true,
        lineas,
        ...(eligioMedio ? { metodoPagoId: datos.metodoPagoId } : {}),
      },
      usuarioId,
    );
  }

  /**
   * LA NOTA DE CRÉDITO, DE UN CLIC (2026-10-11). Mismo camino que la
   * factura: qué falta, a qué ambiente iría y cómo va su comprobante.
   *
   * Lo que cambia respecto de la factura:
   *  - solo va a Hacienda si su factura es electrónica (o fue aceptada en ese
   *    ambiente). Una nota sobre una factura de venta común no se emite, y se
   *    dice por qué en vez de ofrecer un botón que va a fallar;
   *  - Hacienda pide QUÉ HACE la nota (anula, devolución, corrige el monto…).
   *    Eso lo contesta una persona: no se convierte "error" en "anula";
   *  - el medio de pago es el de su factura (ver `medioDePago`).
   */
  async function estadoDeNota(n, dadas = []) {
    const nota = (
      await pool.query("SELECT id, numero, estado, electronica, alegra_id FROM nota_credito WHERE id=$1", [id(n)])
    ).rows[0];
    if (!nota) throw error("NO_EXISTE", "No existe esa nota de crédito.", 404);
    const facturas = (
      await pool.query(
        "SELECT f.id, f.numero, f.electronica, f.clave_hacienda, f.condicion_venta, f.metodo_pago_id FROM nota_credito_factura nf JOIN factura f ON f.id=nf.factura_id WHERE nf.nota_credito_id=$1",
        [nota.id],
      )
    ).rows;
    const a = ambienteDeEmision(
      (await pool.query("SELECT ambiente, habilitada FROM hacienda_configuracion")).rows,
    );
    const lineas = (
      await pool.query(
        "SELECT l.numero_linea,l.nombre,l.descuento_monto,p.es_medicamento,p.registro_sanitario,p.forma_farmaceutica FROM nota_credito_linea l LEFT JOIN producto p ON p.id=l.producto_id WHERE l.nota_credito_id=$1 ORDER BY l.numero_linea",
        [nota.id],
      )
    ).rows;
    // El comprobante que cuenta: el de producción si ya existe (una nota
    // emitida de verdad no "vuelve" a pruebas); si no, el del ambiente del clic.
    const c = (
      await pool.query(
        "SELECT * FROM hacienda_comprobante WHERE origen='nota_credito' AND origen_id=$1 AND ambiente = ANY($2::text[]) ORDER BY (ambiente='produccion') DESC, revision_documento DESC LIMIT 1",
        [nota.id, a === "produccion" || !a ? ["produccion"] : ["produccion", a]],
      )
    ).rows[0];
    const ambiente = c?.ambiente || a;
    const factura = facturas.length === 1 ? facturas[0] : null;
    // ¿La factura tiene una clave contra la cual referenciar la nota?
    const aceptadaAca =
      factura && ambiente
        ? (
            await pool.query(
              "SELECT 1 FROM hacienda_comprobante WHERE ambiente=$1 AND origen='factura' AND origen_id=$2 AND estado='aceptada'",
              [ambiente, factura.id],
            )
          ).rows.length > 0
        : false;
    const enCurso = c && c.estado !== "rechazada";
    const motivoNoEmitible = enCurso
      ? null
      : nota.estado !== "emitida"
        ? "La nota está anulada: no se emite."
        : nota.alegra_id || nota.electronica
          ? "Es una nota histórica o ya electrónica: no se vuelve a emitir."
          : !factura
            ? "La emisión de esta nota requiere una sola factura de referencia."
            : !aceptadaAca && !factura.clave_hacienda
              ? "La factura no es electrónica: esta nota no va a Hacienda."
              : !a
                ? "Habilitá un ambiente en Configuración → Hacienda."
                : null;
    const faltaMedioPago =
      !enCurso && !motivoNoEmitible && factura.condicion_venta !== "credito" && !(await medioDePago(pool, factura, ambiente));
    return {
      ambiente,
      tipo: "03",
      pendientes: datosPendientes(lineas, dadas),
      faltaMedioPago,
      mediosPago: faltaMedioPago ? await mediosDePago(pool) : [],
      // Qué hace la nota ante Hacienda se pregunta siempre que haya que
      // preparar un comprobante nuevo.
      faltaReferencia: !enCurso && !motivoNoEmitible,
      motivoNoEmitible,
      comprobante: vista(c),
      correo: c ? await ultimoCorreo(c.id) : null,
    };
  }

  async function emitirNota(n, datos = {}, usuarioId) {
    const lineas = lineasDadas(datos.lineas);
    const e = await estadoDeNota(n, lineas);
    if (e.motivoNoEmitible) throw error("NO_EMITIBLE", e.motivoNoEmitible, 409);
    const enCurso = e.comprobante && e.comprobante.estado !== "rechazada";
    const codigo = String(datos.codigoReferencia || "").trim();
    const otro = String(datos.referenciaOtro || "").trim().slice(0, 100);
    if (!enCurso) {
      if (!REFERENCIAS_DE_NOTA.includes(codigo))
        throw error(
          "DATOS_FISCALES_PENDIENTES",
          "Falta decir qué hace esta nota ante Hacienda: anula la factura, es una devolución, corrige el monto…",
          409,
        );
      if (codigo === "99" && !otro)
        throw error("DATOS_FISCALES_PENDIENTES", "Describí qué hace la nota (elegiste «Otro»).", 409);
      if (e.pendientes.length)
        throw error(
          "DATOS_FISCALES_PENDIENTES",
          "Esta nota necesita un dato más antes de emitirse: " +
            e.pendientes
              .slice(0, 3)
              .map((p) => `${p.falta.join(" y ")} de «${p.nombre}»`)
              .join("; ") +
            (e.pendientes.length > 3 ? "…" : "."),
          409,
        );
    }
    const eligioMedio = datos.metodoPagoId !== undefined && datos.metodoPagoId !== null && datos.metodoPagoId !== "";
    if (!enCurso && e.faltaMedioPago && !eligioMedio)
      throw error(
        "DATOS_FISCALES_PENDIENTES",
        "Falta decir con qué pagó el cliente la factura: en una venta de contado Hacienda pide el medio de pago.",
        409,
      );
    return preparar(
      "nota_credito",
      n,
      {
        ambiente: e.ambiente,
        codigoReferencia: codigo,
        ...(codigo === "99" ? { referenciaOtro: otro } : {}),
        sustituir: datos.sustituir === true,
        lineas,
        ...(eligioMedio ? { metodoPagoId: datos.metodoPagoId } : {}),
      },
      usuarioId,
    );
  }

  /** Volver a mandarle el comprobante al cliente, a pedido de una persona. */
  async function reenviar(e, documento, usuarioId) {
    if (e.comprobante?.estado !== "aceptada" || e.comprobante.ambiente !== "produccion")
      throw error(
        "SIN_ACEPTAR",
        `Solo se le manda al cliente una ${documento} aceptada por Hacienda en producción.`,
        409,
      );
    const correo = await entregar(e.comprobante, usuarioId);
    if (!correo) throw error("CORREO_NO_DISPONIBLE", "El envío de correo no está disponible en este servidor.", 503);
    return correo;
  }
  const reenviarCorreo = async (n, usuarioId) => reenviar(await estadoDeFactura(n), "factura", usuarioId);
  const reenviarCorreoNota = async (n, usuarioId) =>
    reenviar(await estadoDeNota(n), "nota de crédito", usuarioId);

  return {
    // Lo que usa el camino fiscal (emision.service.js) por dentro…
    medioDePago,
    entregar,
    // …y lo que el servicio de emisión expone tal cual a las rutas.
    publico: { estadoDeFactura, emitirFactura, reenviarCorreo, estadoDeNota, emitirNota, reenviarCorreoNota },
  };
}

module.exports = {
  crearUnClic,
  ambienteDeEmision,
  tipoDeFactura,
  datosPendientes,
  lineasDadas,
  REFERENCIAS_DE_NOTA,
};

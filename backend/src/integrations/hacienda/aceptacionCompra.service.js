"use strict";
/**
 * ACEPTAR SOLA LA COMPRA ANTE HACIENDA.
 *
 * QUÉ SE PIDIÓ (2026-10-12). El usuario registró una compra en Revisión de
 * Precios y le apareció un formulario —ambiente, respuesta, detalle,
 * condición del IVA, IVA a acreditar, gasto aplicable— que por omisión
 * apuntaba a pruebas. Textual: «que una vez termine de revisar precio y la
 * registre, ese formulario se haga solo», «que siempre salga como totalmente
 * aceptada y ya en producción», y que la compra «NO se duplique, sino que
 * salga que yo le hice recepción».
 *
 * POR QUÉ NO SE DUPLICA NADA. La factura del proveedor ya está en Hacienda:
 * la emitió él. Lo que sale de acá NO es otra compra: es un «mensaje
 * receptor», una confirmación firmada que cita la CLAVE de esa factura y
 * dice «la acepto». Hacienda la une a la factura que ya tiene. Y de este
 * lado hay una sola por compra: `preparar` devuelve la que ya exista.
 *
 * LO QUE SE DECIDE SOLO, para que nadie llene nada:
 *  - el ambiente: PRODUCCIÓN, siempre. En pruebas Hacienda no conoce la
 *    factura real del proveedor; una aceptación de prueba no sirve de nada;
 *  - la respuesta: aceptación total. Una compra registrada es una compra que
 *    se aceptó; el rechazo o la aceptación parcial no salen de acá;
 *  - los montos de IVA: se deducen de la condición (xml/v4.4.js,
 *    `montosDeAceptacion`).
 *
 * LO ÚNICO QUE NO SE DECIDE SOLO: la CONDICIÓN del IVA. Es una declaración
 * fiscal y se elige una vez en Configuración → Hacienda, sin valor por
 * omisión (configuracion.service.js). Mientras falte, la compra se registra
 * igual y queda sin aceptar, diciendo por qué.
 *
 * SIN EL XML DEL PROVEEDOR NO HAY ACEPTACIÓN: la clave, el total y el
 * impuesto se leen de ese archivo, no se inventan. Las compras nuevas lo
 * traen del buzón; las anteriores al 2026-10-10 no, y hay que subirlo
 * (`subirOriginal`).
 *
 * No firma ni envía por su cuenta: usa `preparar` y `enviar`, que le pasa el
 * servicio de emisión al armarlo.
 */
const almacen = require("./seguridad/almacen");
const { CONDICIONES_IVA_COMPRAS } = require("./configuracion.service");
const { parsear, texto } = require("./xml/util");
const { validarXml } = require("./xml/validar");
const { decimal } = require("./xml/v4.4");
const { registrarCambio } = require("../../utils/bitacora");
const { error } = require("./errores");

const AMBIENTE = "produccion";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Por qué una compra todavía no se puede aceptar, o null si se puede. Pura:
 * recibe lo ya leído. El orden es el de lo que hay que arreglar primero.
 */
function motivoDeNoAceptar({ compra, habilitada, condicion }) {
  if (compra.estado !== "registrada") return "La compra no está registrada: no se acepta ante Hacienda.";
  if (!compra.xml_ruta) return "Esta compra no conserva el XML del proveedor. Subilo para poder aceptarla.";
  if (!habilitada) return "Habilitá Producción en Configuración → Hacienda.";
  if (!condicion)
    return "Falta elegir con qué condición de IVA se aceptan las compras, en Configuración → Hacienda.";
  return null;
}

/**
 * @param {object} d
 * @param {object} d.pool        el pool de la base (o su doble en pruebas)
 * @param {Function} d.tx        corre un trabajo en una transacción
 * @param {Function} d.preparar  del servicio de emisión: reserva número, firma y guarda
 * @param {Function} d.enviar    del servicio de emisión: manda a Hacienda lo preparado
 * @param {Function} d.vista     fila de comprobante → lo que ve la pantalla
 * @param {Function} d.id        valida un identificador
 */
function crearAceptacion({ pool, tx, preparar, enviar, vista, id }) {
  /** La compra, por su id o por el de la factura del buzón de la que nació. */
  async function compraDe(ref) {
    const porBuzon = UUID.test(String(ref));
    const d = (
      await pool.query(
        `SELECT id, estado, xml_ruta FROM compra WHERE ${porBuzon ? "factura_proveedor_id" : "id"}=$1`,
        [porBuzon ? String(ref) : id(ref)],
      )
    ).rows[0];
    if (!d)
      throw error(
        porBuzon ? "COMPRA_NO_REGISTRADA" : "NO_EXISTE",
        porBuzon ? "Registrá la compra antes de aceptarla ante Hacienda." : "No existe esa compra.",
        404,
      );
    return d;
  }

  /** Lo que la aceptación le declaró a Hacienda, leído de su XML firmado. */
  async function declaradoEn(c) {
    const doc = parsear(await almacen.leerXml(c.xml_ruta, c.xml_sha256));
    return {
      condicion: texto(doc, "CondicionImpuesto") || null,
      impuesto: texto(doc, "MontoTotalImpuesto") || null,
      impuestoAcreditar: texto(doc, "MontoTotalImpuestoAcreditar") || null,
      gastoAplicable: texto(doc, "MontoTotalDeGastoAplicable") || null,
      total: texto(doc, "TotalFactura") || null,
    };
  }

  /**
   * Cómo va la aceptación de una compra: si ya se puede, por qué no, y el
   * comprobante que ya exista con lo que declaró.
   */
  async function estadoDeCompra(ref) {
    const compra = await compraDe(ref);
    const configurado = (
      await pool.query("SELECT habilitada, datos FROM hacienda_configuracion WHERE ambiente=$1", [AMBIENTE])
    ).rows[0];
    const elegida = configurado?.datos?.condicion_iva_compras;
    const condicion = CONDICIONES_IVA_COMPRAS.includes(elegida) ? elegida : null;
    const c = (
      await pool.query(
        "SELECT * FROM hacienda_comprobante WHERE ambiente=$1 AND origen='compra' AND origen_id=$2 ORDER BY revision_documento DESC LIMIT 1",
        [AMBIENTE, compra.id],
      )
    ).rows[0];
    // Con una aceptación en curso no hay nada que arreglar: se sigue con esa.
    const enCurso = Boolean(c) && c.estado !== "rechazada";
    return {
      compraId: compra.id,
      ambiente: AMBIENTE,
      tipo: "05",
      condicion,
      necesitaXml: !enCurso && compra.estado === "registrada" && !compra.xml_ruta,
      motivoNoEmitible: enCurso
        ? null
        : motivoDeNoAceptar({ compra, habilitada: configurado?.habilitada === true, condicion }),
      comprobante: vista(c),
      declarado: c ? await declaradoEn(c) : null,
    };
  }

  /**
   * Prepara y firma la aceptación total, sin preguntar nada. Con una en
   * curso devuelve esa misma: dos clics no gastan dos números.
   */
  async function aceptarCompra(ref, datos = {}, usuarioId) {
    const e = await estadoDeCompra(ref);
    if (e.motivoNoEmitible) throw error("NO_EMITIBLE", e.motivoNoEmitible, 409);
    return preparar(
      "compra",
      e.compraId,
      { ambiente: AMBIENTE, mensaje: "1", condicionImpuesto: e.condicion, sustituir: datos.sustituir === true },
      usuarioId,
    );
  }

  /**
   * Lo que corre apenas se registra una compra: preparar la aceptación y
   * mandarla. La respuesta de Hacienda llega después (el seguimiento la
   * consulta solo, y la pantalla también).
   *
   * NO LANZA. La compra ya quedó registrada —costos, precios, cuenta por
   * pagar— y eso no depende de Hacienda: devuelve qué pasó para decirlo.
   *   { estado: 'enviada', comprobante }
   *   { estado: 'pendiente', motivo, comprobante? }  se preparó o ni eso
   */
  async function alRegistrar(compraId, usuarioId) {
    let preparado = null;
    try {
      preparado = await aceptarCompra(compraId, {}, usuarioId);
      return { estado: "enviada", comprobante: await enviar(preparado.id) };
    } catch (e) {
      return {
        estado: "pendiente",
        // Solo el texto de un error propio; cualquier otro puede traer datos
        // de la conexión con Hacienda.
        motivo: e?.status && e?.code ? e.message : "No se pudo enviar la aceptación a Hacienda.",
        ...(preparado ? { comprobante: preparado } : {}),
      };
    }
  }

  /**
   * Conservar el XML original del proveedor de una compra que no lo tiene.
   * Solo se acepta el que corresponde: misma clave, mismo proveedor, mismo
   * receptor y mismo total. No reemplaza uno ya guardado.
   */
  async function subirOriginal(ref, buffer, usuarioId) {
    const { guardarArchivo } = require("../almacenamiento");
    const doc = parsear(buffer.toString("utf8"));
    const compraId = (await compraDe(ref)).id;
    return tx(async (db) => {
      const d = (await db.query("SELECT * FROM compra WHERE id=$1 FOR UPDATE", [compraId])).rows[0];
      if (d.xml_ruta)
        throw error("XML_YA_EXISTE", "Esta compra ya conserva su XML original. No se reemplaza.", 409);
      if ((await db.query("SELECT 1 FROM hacienda_comprobante WHERE origen='compra' AND origen_id=$1", [d.id])).rows.length)
        throw error("DOCUMENTO_RESERVADO", "Esta compra ya tiene una respuesta fiscal preparada.", 409);
      const emisor = doc.getElementsByTagNameNS("*", "Emisor")[0],
        receptor = doc.getElementsByTagNameNS("*", "Receptor")[0];
      const empresa = (await db.query("SELECT identificacion FROM empresa WHERE id=1")).rows[0],
        proveedor = (await db.query("SELECT identificacion FROM proveedor WHERE id=$1", [d.proveedor_id])).rows[0];
      if (
        texto(doc, "Clave") !== d.clave ||
        texto(emisor, "Numero") !== proveedor?.identificacion ||
        texto(receptor, "Numero") !== empresa?.identificacion
      )
        throw error("XML_OTRO_DOCUMENTO", "El XML no corresponde a la clave, proveedor y receptor de esta compra.");
      if (decimal(texto(doc, "TotalComprobante")) !== decimal(d.total))
        throw error("XML_OTRO_DOCUMENTO", "El total del XML no coincide con la compra.");
      const tipo = { FacturaElectronica: "01", NotaCreditoElectronica: "03" }[doc.documentElement.localName];
      if (!tipo) throw error("XML_INVALIDO", "Suba la factura electrónica original del proveedor.");
      await validarXml(buffer.toString("utf8"), tipo);
      const archivo = await guardarArchivo({
        carpeta: "compras-proveedor",
        prefijo: "xml",
        extension: "xml",
        buffer,
        maximoBytes: 2 * 1024 * 1024,
      });
      await db.query("UPDATE compra SET xml_ruta=$2 WHERE id=$1", [d.id, archivo.ruta]);
      await registrarCambio(db, {
        entidad: "compra",
        entidadId: d.id,
        accion: "cargar_xml_original",
        despues: { xmlConservado: true },
        usuarioId,
      });
      return { xmlConservado: true };
    });
  }

  return {
    alRegistrar,
    // Lo que el servicio de emisión expone tal cual a las rutas.
    publico: { estadoDeCompra, aceptarCompra, subirOriginal },
  };
}

module.exports = { crearAceptacion, motivoDeNoAceptar, AMBIENTE };

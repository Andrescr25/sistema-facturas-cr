"use strict";
const { leerArchivoPrivado } = require("../almacenamiento");
const configuracion = require("./configuracion.service");
const almacen = require("./seguridad/almacen");
const {
  generarVenta,
  generarMensaje,
  fechaCR,
  clave,
  identificacion,
} = require("./xml/v4.4");
const { firmar, verificarRespuesta } = require("./firma/xades");
const { validarXml } = require("./xml/validar");
const { parsear, texto } = require("./xml/util");
const { crearCliente } = require("./transporte/cliente");
const numeracion = require("./numeracion");
const { crearUnClic } = require("./unClic.service");
const { enTransaccion } = require("../../utils/transaccion");
const { registrarCambio } = require("../../utils/bitacora");
const { error } = require("./errores");
function id(v) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw error("ID_INVALIDO", "Identificador inválido.");
  return n;
}
function vista(r) {
  if (!r) return null;
  return {
    id: r.id,
    ambiente: r.ambiente,
    origen: r.origen,
    origenId: r.origen_id,
    tipo: r.tipo,
    clave: r.clave,
    consecutivo: r.consecutivo,
    fecha: r.fecha,
    version: r.version,
    estado: r.estado,
    mensaje: r.mensaje,
    intentos: r.intentos,
    revisionDocumento: r.revision_documento,
    tieneRespuesta: Boolean(r.respuesta_ruta),
  };
}

function crearServicio(pool, transporte = crearCliente(), ganchos = {}) {
  const tx = (fn) => enTransaccion(pool, fn);
  // Lo que el botón de un clic decide solo, y el correo al cliente, viven en
  // unClic.service.js. Este servicio le presta `preparar` y le pide dos
  // cosas: el medio de pago al armar el XML y entregar la factura al aceptarse.
  const unClic = crearUnClic({ pool, ganchos, preparar, vista, id });
  // El número lo da numeracion.js: manda el numerador y se saltan los ya
  // usados (decisión del usuario del 2026-10-11, explicada ahí).
  const numerar = (db, c, tipo) => numeracion.reservar(db, c, tipo);
  async function preparar(origen, origenId, datos, usuarioId) {
    if (!["factura", "nota_credito", "compra"].includes(origen))
      throw error("ORIGEN_INVALIDO", "Origen fiscal inválido.");
    const a = configuracion.ambiente(datos.ambiente),
      n = id(origenId);
    // No congelar una venta real en una copia que no podrá enviar a producción.
    if (a === "produccion") transporte.verificarSalida?.(a);
    return tx(async (db) => {
      // Mismo bloqueo que la edición comercial: doble clic reserva una sola
      // clave. La red no se llama dentro de esta transacción.
      const tabla =
        origen === "nota_credito"
          ? "nota_credito"
          : origen === "compra"
            ? "compra"
            : "factura";
      const d = (
        await db.query(`SELECT * FROM ${tabla} WHERE id=$1 FOR UPDATE`, [n])
      ).rows[0];
      if (!d) throw error("NO_EXISTE", "No existe ese documento.", 404);
      const previo = (
        await db.query(
          "SELECT * FROM hacienda_comprobante WHERE ambiente=$1 AND origen=$2 AND origen_id=$3 ORDER BY revision_documento DESC LIMIT 1",
          [a, origen, n],
        )
      ).rows[0];
      if (previo && (previo.estado !== "rechazada" || datos.sustituir !== true))
        return vista(previo);
      if (previo && origen !== "compra")
        datos = {
          ...datos,
          referencias: [
            {
              tipo: "10",
              clave: previo.clave,
              fecha: fechaCR(new Date(previo.fecha)),
              codigo: "16",
              razon: "Sustituye comprobante rechazado por Hacienda",
            },
          ],
        };
      if (d.estado !== (origen === "compra" ? "registrada" : "emitida"))
        throw error(
          "ESTADO_INVALIDO",
          "El documento debe estar emitido o la compra registrada.",
        );
      if (origen !== "compra" && (d.electronica || d.alegra_id))
        throw error(
          "HISTORICO_NO_REEMITIR",
          "Un documento histórico o ya electrónico no se vuelve a emitir.",
        );
      await db.query(
        "SELECT ambiente FROM hacienda_configuracion WHERE ambiente=$1 FOR UPDATE",
        [a],
      );
      const c = await configuracion.privada(db, a);
      if (!c.habilitada)
        throw error(
          "HACIENDA_DESHABILITADA",
          "Habilite este ambiente en Configuración → Hacienda.",
        );
      configuracion.revisar(c);
      let tipo, xml, emisor, receptor, llave;
      const fecha = fechaCR();
      let fechaSobre = fecha;
      let documento = { ...d };
      if (origen === "compra")
        tipo = { 1: "05", 2: "06", 3: "07" }[datos.mensaje];
      else
        tipo =
          origen === "nota_credito" ? "03" : datos.tipo === "04" ? "04" : "01";
      if (!tipo)
        throw error(
          "TIPO_INVALIDO",
          "Elija aceptación, aceptación parcial o rechazo.",
        );
      const consecutivo = await numerar(db, c, tipo);
      if (origen === "compra") {
        // Solo rutas del almacén privado del buzón, nunca una ruta enviada por
        // el navegador. Sin XML original no se inventa un mensaje receptor.
        if (!d.xml_ruta)
          throw error(
            "XML_PROVEEDOR_FALTANTE",
            "Esta compra no conserva su XML original. Cargue el original en el buzón antes de responder.",
          );
        const archivoOriginal = await leerArchivoPrivado(d.xml_ruta);
        if (!archivoOriginal || archivoOriginal.length > 2 * 1024 * 1024)
          throw error(
            "XML_PROVEEDOR_FALTANTE",
            "El XML original no está disponible en el almacén privado.",
          );
        const original = archivoOriginal.toString("utf8");
        const m = generarMensaje({
          original,
          emisor: c.emisor,
          consecutivo,
          fecha,
          opciones: datos,
        });
        xml = m.xml;
        fechaSobre = m.fecha;
        llave = m.clave;
        emisor = m.emisor;
        receptor = m.receptor;
      } else {
        let factura = d;
        if (origen === "nota_credito") {
          const ref = (
            await db.query(
              "SELECT f.* FROM nota_credito_factura nf JOIN factura f ON f.id=nf.factura_id WHERE nf.nota_credito_id=$1",
              [n],
            )
          ).rows;
          if (ref.length !== 1)
            throw error(
              "REFERENCIAS_INVALIDAS",
              "La emisión de esta nota requiere una sola factura de referencia.",
            );
          factura = ref[0];
          const referencia = (
            await db.query(
              "SELECT * FROM hacienda_comprobante WHERE ambiente=$1 AND origen='factura' AND origen_id=$2 AND estado='aceptada'",
              [a, factura.id],
            )
          ).rows[0];
          if (!referencia && !factura.clave_hacienda)
            throw error(
              "REFERENCIA_FALTANTE",
              "La factura original no tiene una clave fiscal.",
            );
          // Motivo fiscal lo elige la persona; no convertir "error" en anula.
          if (!datos.codigoReferencia)
            throw error(
              "REFERENCIA_FALTANTE",
              "Elija el código fiscal de referencia de la nota.",
            );
          datos = {
            ...datos,
            referencias: [
              ...(datos.referencias || []),
              {
                tipo:
                  referencia?.tipo ||
                  (factura.tipo_documento === "tiquete" ? "04" : "01"),
                clave: referencia?.clave || factura.clave_hacienda,
                fecha: referencia
                  ? fechaCR(new Date(referencia.fecha))
                  : factura.hacienda_origen?.fecha ||
                    fechaCR(new Date(factura.emitida_en || factura.fecha)),
                codigo: datos.codigoReferencia,
                razon: d.motivo_texto,
                otro: datos.referenciaOtro,
              },
            ],
          };
          documento = {
            ...factura,
            ...d,
            moneda: factura.moneda,
            cliente_tipo_identificacion: factura.cliente_tipo_identificacion,
            cliente_correo: factura.cliente_correo,
            actividad_economica: factura.actividad_economica,
            condicion_venta: factura.condicion_venta,
          };
        }
        const plazo = (
          await db.query("SELECT dias FROM plazo_credito WHERE id=$1", [
            factura.plazo_credito_id,
          ])
        ).rows[0];
        documento.codigo_medio_pago_hacienda = await unClic.medioDePago(db, factura, a, datos.metodoPagoId);
        documento.plazo_dias = plazo?.dias;
        const tablaLinea =
            origen === "nota_credito" ? "nota_credito_linea" : "factura_linea",
          fk = origen === "nota_credito" ? "nota_credito_id" : "factura_id";
        const lineas = (
          await db.query(
            `SELECT l.*,i.codigo_tarifa_hacienda,p.registro_sanitario,p.es_medicamento,p.forma_farmaceutica FROM ${tablaLinea} l LEFT JOIN impuesto i ON i.id=l.impuesto_id LEFT JOIN producto p ON p.id=l.producto_id WHERE l.${fk}=$1 ORDER BY l.numero_linea`,
            [n],
          )
        ).rows;
        emisor = identificacion(
          c.emisor.tipo_identificacion,
          c.emisor.identificacion,
        );
        receptor =
          tipo !== "04" || documento.cliente_identificacion
            ? identificacion(
                documento.cliente_tipo_identificacion,
                documento.cliente_identificacion,
              )
            : undefined;
        llave = clave(consecutivo, emisor, fecha);
        xml = generarVenta({
          tipo,
          documento,
          lineas,
          emisor: c.emisor,
          opciones: datos,
          consecutivo,
          fecha,
          clave: llave,
        });
      }
      const firmado = firmar(
        xml,
        Buffer.from(c.secretos.p12, "base64"),
        c.secretos.pin,
      );
      await validarXml(firmado, tipo);
      const archivo = await almacen.guardarXml(firmado);
      const sobre = {
        clave: llave,
        fecha: fechaSobre,
        emisor,
        ...(receptor ? { receptor } : {}),
        ...(origen === "compra" ? { consecutivoReceptor: consecutivo } : {}),
      };
      const r = (
        await db.query(
          `INSERT INTO hacienda_comprobante(ambiente,origen,origen_id,tipo,clave,consecutivo,fecha,xml_ruta,xml_sha256,sobre,creada_por,revision_documento) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            a,
            origen,
            n,
            tipo,
            llave,
            consecutivo,
            fecha,
            archivo.ruta,
            archivo.sha256,
            sobre,
            usuarioId || null,
            (previo?.revision_documento || 0) + 1,
          ],
        )
      ).rows[0];
      if (origen === "factura" && a === "produccion")
        await db.query(
          "UPDATE factura SET hacienda_estado='pendiente',hacienda_comprobante_id=$2 WHERE id=$1",
          [n, r.id],
        );
      await registrarCambio(db, {
        entidad: "hacienda_comprobante",
        entidadId: r.id,
        accion: "preparar",
        despues: vista(r),
        usuarioId,
      });
      return vista(r);
    });
  }
  async function obtener(n) {
    return vista(await fila(n));
  }
  async function fila(n, db = pool) {
    const r = (
      await db.query("SELECT * FROM hacienda_comprobante WHERE id=$1", [id(n)])
    ).rows[0];
    if (!r) throw error("NO_EXISTE", "No existe ese comprobante.", 404);
    return r;
  }
  async function consultar(n) {
    let r = await fila(n);
    if (["aceptada", "rechazada"].includes(r.estado)) return vista(r);
    if (r.estado === "preparada") return vista(r);
    const c = await configuracion.privada(pool, r.ambiente);
    const respuesta = await transporte.consultar(
      c,
      r.clave,
      r.origen === "compra" ? r.consecutivo : undefined,
    );
    // El ambiente de pruebas contesta 400 con esta causa a una clave que no
    // conoce, no 404. Sin reconocerla, un envío fallido no se podía repetir.
    if (
      respuesta.status === 404 ||
      (respuesta.status === 400 &&
        /no ha sido recibido/i.test(respuesta.causa || ""))
    ) {
      await pool.query(
        "UPDATE hacienda_comprobante SET proxima_consulta=now()+interval '1 minute' WHERE id=$1",
        [r.id],
      );
      // Una ausencia tras timeout permite reenviar LOS MISMOS bytes. No se
      // crea otro número ni se presupone que el POST anterior no llegó.
      return { ...vista(r), noEncontrada: true };
    }
    if (respuesta.status !== 200)
      throw error(
        "HACIENDA_CONSULTA",
        "Hacienda no confirmó el estado. Reintente después.",
        502,
      );
    const d = respuesta.data,
      estado = {
        recibido: "recibida",
        procesando: "procesando",
        aceptado: "aceptada",
        rechazado: "rechazada",
        error: "error",
      }[d?.["ind-estado"]];
    if (!estado || d.clave !== r.clave)
      throw error(
        "RESPUESTA_INVALIDA",
        "La respuesta de Hacienda no corresponde a la clave consultada.",
        502,
      );
    let archivo = null,
      mensaje = null;
    if (["aceptada", "rechazada"].includes(estado)) {
      if (
        typeof d["respuesta-xml"] !== "string" ||
        d["respuesta-xml"].length > 3 * 1024 * 1024
      )
        throw error(
          "RESPUESTA_INVALIDA",
          "Hacienda no entregó un XML de respuesta válido.",
          502,
        );
      const xml = Buffer.from(d["respuesta-xml"], "base64").toString("utf8"),
        doc = parsear(xml);
      await validarXml(xml, "respuesta");
      if (!verificarRespuesta(xml))
        throw error(
          "RESPUESTA_INVALIDA",
          "La firma del XML de respuesta no es válida.",
          502,
        );
      const original = parsear(await almacen.leerXml(r.xml_ruta, r.xml_sha256));
      const { decimal } = require("./xml/v4.4");
      const totalOriginal = texto(
        original,
        r.origen === "compra" ? "TotalFactura" : "TotalComprobante",
      );
      if (
        decimal(texto(doc, "TotalFactura")) !== decimal(totalOriginal) ||
        texto(doc, "TipoIdentificacionEmisor") !==
          r.sobre.emisor.tipoIdentificacion ||
        (texto(doc, "NumeroCedulaReceptor") &&
          r.sobre.receptor &&
          texto(doc, "NumeroCedulaReceptor").replace(/^0+/, "") !==
            r.sobre.receptor.numeroIdentificacion.replace(/^0+/, ""))
      )
        throw error(
          "RESPUESTA_INVALIDA",
          "Los datos de la respuesta fiscal no corresponden al comprobante.",
          502,
        );
      if (
        texto(doc, "Clave") !== r.clave ||
        texto(doc, "Mensaje") !== (estado === "aceptada" ? "1" : "3") ||
        texto(doc, "NumeroCedulaEmisor").replace(/^0+/, "") !==
          r.sobre.emisor.numeroIdentificacion.replace(/^0+/, "")
      )
        throw error(
          "RESPUESTA_INVALIDA",
          "El estado y el XML fiscal de respuesta no coinciden.",
          502,
        );
      mensaje = texto(doc, "DetalleMensaje").slice(0, 2000);
      archivo = await almacen.guardarXml(xml);
    }
    // Solo la consulta que HACE el cambio a "aceptada" entrega al cliente:
    // las que lleguen después encuentran el estado ya puesto y salen arriba.
    let acabaDeAceptarse = false;
    const resultado = await tx(async (db) => {
      r = (
        await db.query(
          "SELECT * FROM hacienda_comprobante WHERE id=$1 FOR UPDATE",
          [id(n)],
        )
      ).rows[0];
      if (["aceptada", "rechazada"].includes(r.estado)) return vista(r);
      acabaDeAceptarse = estado === "aceptada";
      r = (
        await db.query(
          "UPDATE hacienda_comprobante SET estado=$2,respuesta_ruta=COALESCE($3,respuesta_ruta),respuesta_sha256=COALESCE($5,respuesta_sha256),mensaje=$4,proxima_consulta=now()+interval '1 minute',actualizado_en=now() WHERE id=$1 RETURNING *",
          [
            r.id,
            estado,
            archivo?.ruta || null,
            mensaje,
            archivo?.sha256 || null,
          ],
        )
      ).rows[0];
      if (r.ambiente === "produccion" && r.origen === "factura") {
        await db.query(
          `UPDATE factura SET hacienda_estado=$2::text,electronica=$3,clave_hacienda=$4,xml_ruta=$5,hacienda_mensaje=$6,hacienda_respondida_en=CASE WHEN $3 OR $2='rechazada' THEN now() ELSE NULL END WHERE id=$1`,
          [
            r.origen_id,
            estado === "aceptada"
              ? "aceptada"
              : estado === "rechazada"
                ? "rechazada"
                : "enviada",
            estado === "aceptada",
            r.clave,
            r.xml_ruta,
            mensaje,
          ],
        );
      }
      if (
        r.ambiente === "produccion" &&
        r.origen === "nota_credito" &&
        estado === "aceptada"
      )
        await db.query(
          "UPDATE nota_credito SET electronica=TRUE,clave_hacienda=$2,hacienda_estado='aceptada' WHERE id=$1",
          [r.origen_id, r.clave],
        );
      await registrarCambio(db, {
        entidad: "hacienda_comprobante",
        entidadId: r.id,
        accion: "respuesta",
        despues: vista(r),
      });
      return vista(r);
    });
    // Fuera de la transacción: la aceptación ya quedó guardada y un correo
    // que falla no la deshace.
    if (acabaDeAceptarse && resultado.estado === "aceptada") {
      const correo = await unClic.entregar(resultado);
      if (correo) return { ...resultado, correo };
    }
    return resultado;
  }

  async function enviar(n) {
    let r = await fila(n);
    if (["aceptada", "rechazada", "recibida", "procesando"].includes(r.estado))
      return vista(r);
    if (
      r.estado === "enviando" ||
      r.estado === "incierta" ||
      (r.estado === "error" && r.intentos > 0)
    ) {
      const v = await consultar(n);
      if (!v.noEncontrada) return v;
      if (
        r.estado === "enviando" &&
        Date.now() - new Date(r.actualizado_en).getTime() < 60000
      )
        throw error(
          "ENVIO_EN_CURSO",
          "Ya hay un envío en curso. Consulte el estado en un minuto.",
          409,
        );
    }
    const c = await configuracion.privada(pool, r.ambiente);
    if (!c.habilitada)
      throw error(
        "HACIENDA_DESHABILITADA",
        "Este ambiente está deshabilitado.",
      );
    configuracion.revisar(c);
    // Autenticación y guardas antes de reservar el envío. No se marca incierta
    // por faltar credenciales ni por estar bloqueada la copia de desarrollo.
    await transporte.probar(c);
    const xml = await almacen.leerXml(r.xml_ruta, r.xml_sha256);
    r = await tx(async (db) => {
      const actual = (
        await db.query(
          "SELECT * FROM hacienda_comprobante WHERE id=$1 FOR UPDATE",
          [id(n)],
        )
      ).rows[0];
      if (
        ["aceptada", "rechazada", "recibida", "procesando"].includes(
          actual.estado,
        )
      )
        return actual;
      if (
        actual.estado === "enviando" &&
        Date.now() - new Date(actual.actualizado_en).getTime() < 60000
      )
        throw error("ENVIO_EN_CURSO", "Ya hay un envío en curso.", 409);
      return (
        await db.query(
          "UPDATE hacienda_comprobante SET estado='enviando',intentos=intentos+1,actualizado_en=now(),proxima_consulta=now()+interval '1 minute' WHERE id=$1 RETURNING *",
          [actual.id],
        )
      ).rows[0];
    });
    if (r.estado !== "enviando") return vista(r);
    let respuesta;
    try {
      respuesta = await transporte.enviar(c, {
        ...r.sobre,
        comprobanteXml: Buffer.from(xml).toString("base64"),
      });
    } catch (e) {
      await pool.query(
        "UPDATE hacienda_comprobante SET estado='incierta',mensaje='No se confirmó la recepción; consultar la misma clave.',actualizado_en=now() WHERE id=$1 AND estado='enviando'",
        [r.id],
      );
      throw e;
    }
    const estado =
      respuesta.status === 201 || respuesta.status === 202
        ? "recibida"
        : respuesta.status === 400 || respuesta.status === 409
          ? "incierta"
          : respuesta.status >= 500
            ? "incierta"
            : "error";
    await pool.query(
      "UPDATE hacienda_comprobante SET estado=$2,mensaje=$3,actualizado_en=now() WHERE id=$1 AND estado='enviando'",
      [
        r.id,
        estado,
        // El motivo que dio Hacienda es lo único que permite corregir.
        respuesta.causa && estado !== "recibida"
          ? ("Hacienda respondió: " + respuesta.causa).slice(0, 500)
          : estado === "error"
            ? "Hacienda no recibió el comprobante. Revise la configuración y consulte el estado."
            : null,
      ],
    );
    if (r.ambiente === "produccion" && r.origen === "factura")
      await pool.query(
        "UPDATE factura SET hacienda_estado='enviada',hacienda_enviada_en=now() WHERE id=$1 AND hacienda_estado='pendiente'",
        [r.origen_id],
      );
    return obtener(r.id);
  }
  async function listar(a) {
    return (
      await pool.query(
        "SELECT * FROM hacienda_comprobante WHERE ambiente=$1 ORDER BY id DESC LIMIT 100",
        [configuracion.ambiente(a)],
      )
    ).rows.map(vista);
  }
  async function datosDocumento(origen, n) {
    if (!["factura", "nota_credito", "compra"].includes(origen))
      throw error("ORIGEN_INVALIDO", "Origen inválido.");
    const d = (await pool.query(`SELECT * FROM ${origen} WHERE id=$1`, [id(n)]))
      .rows[0];
    if (!d) throw error("NO_EXISTE", "Documento no encontrado.", 404);
    const lineas =
      origen === "compra"
        ? []
        : (
            await pool.query(
              `SELECT l.numero_linea,l.nombre,l.descuento_monto,p.es_medicamento,p.registro_sanitario FROM ${origen}_linea l LEFT JOIN producto p ON p.id=l.producto_id WHERE l.${origen}_id=$1 ORDER BY l.numero_linea`,
              [id(n)],
            )
          ).rows;
    return {
      id: d.id,
      numero: d.numero || d.numero_consecutivo,
      actividadEconomica: d.actividad_economica,
      necesitaXml: origen === "compra" && !d.xml_ruta,
      lineas: lineas.map((l) => ({
        numeroLinea: l.numero_linea,
        nombre: l.nombre,
        descuentoMonto: l.descuento_monto,
        esMedicamento: l.es_medicamento,
        registroSanitario: l.registro_sanitario,
      })),
    };
  }
  async function compraDeBuzon(n) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        String(n),
      )
    )
      throw error("ID_INVALIDO", "Identificador de buzón inválido.");
    const d = (
      await pool.query("SELECT id FROM compra WHERE factura_proveedor_id=$1", [
        n,
      ])
    ).rows[0];
    if (!d)
      throw error(
        "COMPRA_NO_REGISTRADA",
        "Registre la compra antes de responder a Hacienda.",
      );
    return datosDocumento("compra", d.id);
  }
  async function subirOriginal(n, buffer, usuarioId) {
    const { guardarArchivo } = require("../almacenamiento");
    const doc = parsear(buffer.toString("utf8"));
    return tx(async (db) => {
      const d = (
        await db.query("SELECT * FROM compra WHERE id=$1 FOR UPDATE", [id(n)])
      ).rows[0];
      if (!d) throw error("NO_EXISTE", "Compra no encontrada.", 404);
      if (d.xml_ruta)
        throw error(
          "XML_YA_EXISTE",
          "Esta compra ya conserva su XML original. No se reemplaza.",
          409,
        );
      if (
        (
          await db.query(
            "SELECT 1 FROM hacienda_comprobante WHERE origen='compra' AND origen_id=$1",
            [d.id],
          )
        ).rows.length
      )
        throw error(
          "DOCUMENTO_RESERVADO",
          "Esta compra ya tiene una respuesta fiscal preparada.",
          409,
        );
      const emisor = doc.getElementsByTagNameNS("*", "Emisor")[0],
        receptor = doc.getElementsByTagNameNS("*", "Receptor")[0];
      const empresa = (
          await db.query("SELECT identificacion FROM empresa WHERE id=1")
        ).rows[0],
        proveedor = (
          await db.query("SELECT identificacion FROM proveedor WHERE id=$1", [
            d.proveedor_id,
          ])
        ).rows[0];
      if (
        texto(doc, "Clave") !== d.clave ||
        texto(emisor, "Numero") !== proveedor?.identificacion ||
        texto(receptor, "Numero") !== empresa?.identificacion
      )
        throw error(
          "XML_OTRO_DOCUMENTO",
          "El XML no corresponde a la clave, proveedor y receptor de esta compra.",
        );
      const { decimal } = require("./xml/v4.4");
      if (decimal(texto(doc, "TotalComprobante")) !== decimal(d.total))
        throw error(
          "XML_OTRO_DOCUMENTO",
          "El total del XML no coincide con la compra.",
        );
      const tipo = { FacturaElectronica: "01", NotaCreditoElectronica: "03" }[
        doc.documentElement.localName
      ];
      if (!tipo)
        throw error(
          "XML_INVALIDO",
          "Suba la factura electrónica original del proveedor.",
        );
      await validarXml(buffer.toString("utf8"), tipo);
      const archivo = await guardarArchivo({
        carpeta: "compras-proveedor",
        prefijo: "xml",
        extension: "xml",
        buffer,
        maximoBytes: 2 * 1024 * 1024,
      });
      await db.query("UPDATE compra SET xml_ruta=$2 WHERE id=$1", [
        d.id,
        archivo.ruta,
      ]);
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
  async function archivo(n, respuesta = false) {
    const r = await fila(n),
      p = respuesta ? r.respuesta_ruta : r.xml_ruta;
    if (!p)
      throw error(
        "RESPUESTA_PENDIENTE",
        "Hacienda todavía no entregó su respuesta.",
        404,
      );
    return almacen.leerXml(p, respuesta ? r.respuesta_sha256 : r.xml_sha256);
  }
  async function pendientes() {
    const rs = (
      await pool.query(
        "SELECT id FROM hacienda_comprobante WHERE estado IN ('enviando','incierta','recibida','procesando') AND proxima_consulta<=now() ORDER BY proxima_consulta LIMIT 10",
      )
    ).rows;
    for (const r of rs) {
      try {
        await consultar(r.id);
      } catch {
        await pool.query(
          "UPDATE hacienda_comprobante SET proxima_consulta=now()+interval '5 minutes' WHERE id=$1",
          [r.id],
        );
      }
    }
  }
  return {
    preparar,
    obtener,
    consultar,
    enviar,
    listar,
    archivo,
    pendientes,
    datosDocumento,
    compraDeBuzon,
    subirOriginal,
    estadoDeFactura: unClic.estadoDeFactura,
    emitirFactura: unClic.emitirFactura,
    reenviarCorreo: unClic.reenviarCorreo,
    estadoDeNota: unClic.estadoDeNota,
    emitirNota: unClic.emitirNota,
  };
}
module.exports = { crearServicio, vista, id };

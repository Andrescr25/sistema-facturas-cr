"use strict";
const express = require("express");
const multer = require("multer");
const { pool } = require("../../../config/database");
const config = require("./configuracion.service");
const { crearServicio } = require("./emision.service");
const { crearCliente } = require("./transporte/cliente");
const numeracion = require("./numeracion");
const { enTransaccion } = require("../../utils/transaccion");
const { error } = require("./errores");
// EL CORREO SE ENCHUFA ACÁ, no dentro del servicio fiscal: el módulo de
// Hacienda no importa correo. Cuándo se entrega (solo una factura aceptada en
// producción) lo decide el servicio; acá solo se dice CON QUÉ. El `require`
// va adentro porque el servicio de correo importa a su vez este módulo.
const servicio = crearServicio(pool, undefined, {
    alAceptarFactura: (facturaId) =>
      require("../../modules/facturacion/facturaCorreo.service").entregarFacturaElectronica(facturaId),
  }),
  cliente = crearCliente();
const configuracion = express.Router(),
  ventas = express.Router(),
  compras = express.Router();
function envolver(fn) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await fn(req, res);
    } catch (e) {
      const conocido = Boolean(e.status && e.code),
        s = conocido ? e.status : e.code === "P0001" ? 409 : 500;
      const message = conocido
        ? e.message
        : s === 409
          ? "El documento ya está reservado ante Hacienda."
          : "No se pudo completar la operación fiscal.";
      // Ni AxiosError, ni req.body, ni SQL/parametros se imprimen o devuelven.
      res
        .status(s)
        .json({
          success: false,
          error: message,
          message,
          code: conocido ? e.code : "HACIENDA_OPERACION",
        });
    }
  };
}
const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024, files: 1, fields: 20, fieldSize: 1024 },
  fileFilter: (req, file, cb) =>
    cb(
      /\.p12$/i.test(file.originalname)
        ? null
        : error("CERTIFICADO_INVALIDO", "Seleccione un archivo .p12."),
      true,
    ),
}).single("certificado");
configuracion.get(
  "/:ambiente",
  envolver(async (req, res) =>
    res.json({
      success: true,
      data: await config.obtener(pool, req.params.ambiente),
    }),
  ),
);
configuracion.put(
  "/:ambiente",
  (req, res, next) =>
    subir(req, res, (e) =>
      e
        ? res
            .status(400)
            .json({
              success: false,
              error: "Suba un único archivo .p12 de hasta 256 KB.",
            })
        : next(),
    ),
  envolver(async (req, res) => {
    try {
      const data = await enTransaccion(pool, (db) =>
        config.guardar(
          db,
          req.params.ambiente,
          req.body || {},
          req.file?.buffer,
          req.usuario?.id,
        ),
      );
      res.json({ success: true, data });
    } finally {
      req.file?.buffer.fill(0);
    }
  }),
);
// Con qué número sale el próximo comprobante de cada tipo, y cambiarlo. Es
// una decisión fiscal del dueño: ver numeracion.js.
configuracion.get(
  "/:ambiente/numeracion",
  envolver(async (req, res) =>
    res.json({ success: true, data: await numeracion.ver(pool, req.params.ambiente) }),
  ),
);
configuracion.put(
  "/:ambiente/numeracion",
  envolver(async (req, res) =>
    res.json({
      success: true,
      data: await enTransaccion(pool, (db) =>
        numeracion.fijar(db, req.params.ambiente, req.body || {}, req.usuario?.id),
      ),
    }),
  ),
);
configuracion.post(
  "/:ambiente/probar",
  envolver(async (req, res) => {
    const c = await config.privada(pool, req.params.ambiente);
    config.revisar(c);
    res.json({ success: true, data: await cliente.probar(c) });
  }),
);
configuracion.get(
  "/:ambiente/comprobantes",
  envolver(async (req, res) =>
    res.json({
      success: true,
      data: await servicio.listar(req.params.ambiente),
    }),
  ),
);
for (const [router, origen, ruta] of [
  [ventas, "factura", "facturas"],
  [ventas, "nota_credito", "notas-credito"],
  [compras, "compra", "compras"],
]) {
  router.get(
    `/${ruta}/:id/datos`,
    envolver(async (req, res) =>
      res.json({
        success: true,
        data: await servicio.datosDocumento(origen, req.params.id),
      }),
    ),
  );
  router.post(
    `/${ruta}/:id/preparar`,
    envolver(async (req, res) =>
      res.json({
        success: true,
        data: await servicio.preparar(
          origen,
          req.params.id,
          req.body || {},
          req.usuario?.id,
        ),
      }),
    ),
  );
}
// Un clic desde la factura: el estado para pintar el avance, emitir sin
// preguntar ambiente ni tipo, y volver a mandarle el comprobante al cliente.
ventas.get(
  "/facturas/:id/estado",
  envolver(async (req, res) =>
    res.json({
      success: true,
      data: {
        ...(await servicio.estadoDeFactura(req.params.id)),
        // ¿Este servidor consulta solo a Hacienda cada minuto? La pantalla
        // solo promete "sigue consultando solo" si es cierto.
        seguimiento: process.env.HACIENDA_TRABAJADOR === "true",
      },
    }),
  ),
);
ventas.post(
  "/facturas/:id/emitir",
  envolver(async (req, res) =>
    res.json({
      success: true,
      data: await servicio.emitirFactura(req.params.id, req.body || {}, req.usuario?.id),
    }),
  ),
);
// La nota de crédito, igual que la factura: cómo va y emitir de un clic.
ventas.get(
  "/notas-credito/:id/estado",
  envolver(async (req, res) =>
    res.json({
      success: true,
      data: {
        ...(await servicio.estadoDeNota(req.params.id)),
        seguimiento: process.env.HACIENDA_TRABAJADOR === "true",
      },
    }),
  ),
);
ventas.post(
  "/notas-credito/:id/emitir",
  envolver(async (req, res) =>
    res.json({
      success: true,
      data: await servicio.emitirNota(req.params.id, req.body || {}, req.usuario?.id),
    }),
  ),
);
ventas.post(
  "/facturas/:id/correo",
  envolver(async (req, res) =>
    res.json({ success: true, data: await servicio.reenviarCorreo(req.params.id, req.usuario?.id) }),
  ),
);
compras.get(
  "/buzon/:id",
  envolver(async (req, res) =>
    res.json({
      success: true,
      data: await servicio.compraDeBuzon(req.params.id),
    }),
  ),
);
const subirXml = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
}).single("xml");
compras.post(
  "/compras/:id/xml",
  (req, res, next) =>
    subirXml(req, res, (e) =>
      e
        ? res
            .status(400)
            .json({
              success: false,
              error: "Suba un XML original de hasta 2 MB.",
            })
        : next(),
    ),
  envolver(async (req, res) => {
    if (!req.file) throw error("XML_FALTANTE", "Seleccione el XML original.");
    res.json({
      success: true,
      data: await servicio.subirOriginal(
        req.params.id,
        req.file.buffer,
        req.usuario?.id,
      ),
    });
  }),
);
// Un usuario con Compras no puede abrir o enviar una venta por el id fiscal.
for (const [router, origenes] of [
  [ventas, ["factura", "nota_credito"]],
  [compras, ["compra"]],
]) {
  const conOrigen = (fn) =>
    envolver(async (req, res) => {
      const c = await servicio.obtener(req.params.id);
      if (!origenes.includes(c.origen))
        throw error(
          "SIN_PERMISO",
          "Este comprobante pertenece a otro módulo.",
          403,
        );
      await fn(req, res);
    });
  router.get(
    "/comprobantes/:id",
    conOrigen(async (req, res) =>
      res.json({ success: true, data: await servicio.obtener(req.params.id) }),
    ),
  );
  router.post(
    "/comprobantes/:id/enviar",
    conOrigen(async (req, res) =>
      res.json({ success: true, data: await servicio.enviar(req.params.id) }),
    ),
  );
  router.post(
    "/comprobantes/:id/consultar",
    conOrigen(async (req, res) =>
      res.json({
        success: true,
        data: await servicio.consultar(req.params.id),
      }),
    ),
  );
  router.get(
    "/comprobantes/:id/xml",
    conOrigen(async (req, res) => {
      res
        .type("application/xml")
        .attachment("comprobante.xml")
        .send(await servicio.archivo(req.params.id));
    }),
  );
  router.get(
    "/comprobantes/:id/respuesta",
    conOrigen(async (req, res) => {
      res
        .type("application/xml")
        .attachment("respuesta-hacienda.xml")
        .send(await servicio.archivo(req.params.id, true));
    }),
  );
}
module.exports = {
  configuracion,
  ventas,
  compras,
  iniciarSeguimiento: () => require("./trabajador").iniciar(servicio),
};

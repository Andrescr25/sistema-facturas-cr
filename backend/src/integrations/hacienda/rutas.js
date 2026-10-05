"use strict";
const express = require("express");
const multer = require("multer");
const { pool } = require("../../../config/database");
const config = require("./configuracion.service");
const { crearServicio } = require("./emision.service");
const { crearCliente } = require("./transporte/cliente");
const { enTransaccion } = require("../../utils/transaccion");
const { error } = require("./errores");
const servicio = crearServicio(pool),
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

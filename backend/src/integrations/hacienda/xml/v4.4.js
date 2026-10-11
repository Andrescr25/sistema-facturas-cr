"use strict";
const crypto = require("node:crypto");
const { nodo, parsear, texto } = require("./util");
const { error } = require("../errores");
const NS = "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/";
const RAICES = {
  "01": ["FacturaElectronica", "facturaElectronica"],
  "03": ["NotaCreditoElectronica", "notaCreditoElectronica"],
  "04": ["TiqueteElectronico", "tiqueteElectronico"],
};
const TIPOS = {
  CF: "01",
  CJ: "02",
  DIMEX: "03",
  NITE: "04",
  "01": "01",
  "02": "02",
  "03": "03",
  "04": "04",
};
// El XSD pide un TEXTO de seis caracteres, no seis dígitos. Hacienda publica
// la actividad CIIU 4 con punto ("4752.1") y así la acepta: 207 facturas de
// este emisor entre 2025-10 y 2026-10. Los seis dígitos anteriores también
// pasan. Exigir solo dígitos impedía cargar la actividad inscrita.
const ACTIVIDAD = /^(?:\d{6}|\d{4}\.\d)$/;
// Cinco decimales fiscales; la venta original se conserva. No se recalcula
// el IVA con una tarifa fija ni se ajusta un descuadre inventando un cargo.
function decimal(v) {
  const s = String(v ?? "");
  if (!/^\d+(?:\.\d{1,8})?$/.test(s))
    throw error("IMPORTE_INVALIDO", "Importe o cantidad fiscal inválido.");
  const [a, b = ""] = s.split(".");
  return (
    BigInt(a) * 100000n +
    BigInt((b + "00000").slice(0, 5)) +
    (Number(b[5] || 0) >= 5 ? 1n : 0n)
  );
}
const importe = (n) => `${n / 100000n}.${String(n % 100000n).padStart(5, "0")}`;
const mul = (a, b) => (a * b + 50000n) / 100000n;
// El negocio guarda importes a centavos. El anexo permite dos decimales:
// redondear cada importe calculado, sin cambiar precios ni el total cobrado.
const centavos = (n) => ((n + 500n) / 1000n) * 1000n;
function requerido(v, etiqueta, patron = null) {
  const s = String(v ?? "").trim();
  if (!s || (patron && !patron.test(s)))
    throw error(
      "DATO_FISCAL_FALTANTE",
      `${etiqueta}: falta un dato fiscal válido.`,
    );
  return s;
}
function identificacion(tipo, numero) {
  const t = TIPOS[tipo];
  if (!t)
    throw error(
      "IDENTIFICACION_INVALIDA",
      "Tipo de identificación fiscal desconocido.",
    );
  const n = requerido(
      numero,
      "Identificación",
      t === "02" ? /^[A-Z0-9]{10}$/ : /^\d{9,12}$/,
    ),
    largos = { "01": [9], "02": [10], "03": [11, 12], "04": [10] };
  if (!largos[t].includes(n.length) || n[0] === "0")
    throw error(
      "IDENTIFICACION_INVALIDA",
      "La identificación no corresponde a su tipo.",
    );
  return { tipoIdentificacion: t, numeroIdentificacion: n };
}
function fechaCR(ahora = new Date()) {
  // Fecha fiscal con hora y offset, no una fecha de calendario tomada de UTC.
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(ahora);
  return partes.replace(" ", "T") + "-06:00";
}
function clave(
  consecutivo,
  emisor,
  fecha,
  codigo = crypto.randomInt(0, 100000000).toString().padStart(8, "0"),
) {
  requerido(consecutivo, "Consecutivo", /^\d{20}$/);
  requerido(codigo, "Código de seguridad", /^\d{8}$/);
  const d = fecha.slice(8, 10) + fecha.slice(5, 7) + fecha.slice(2, 4);
  if (!/^\d+$/.test(emisor.numeroIdentificacion))
    throw error(
      "CLAVE_EMISOR_ALFANUMERICO",
      "La clave de un emisor alfanumérico requiere la codificación numérica oficial. No se convierte su cédula borrando letras.",
    );
  return (
    "506" +
    d +
    emisor.numeroIdentificacion.padStart(12, "0") +
    consecutivo +
    "1" +
    codigo
  );
}
function persona(e, ubicacion = false) {
  const i = identificacion(e.tipo_identificacion, e.identificacion);
  let s =
    nodo("Nombre", requerido(e.nombre, "Nombre legal")) +
    "<Identificacion>" +
    nodo("Tipo", i.tipoIdentificacion) +
    nodo("Numero", i.numeroIdentificacion) +
    "</Identificacion>";
  if (ubicacion)
    s +=
      "<Ubicacion>" +
      nodo(
        "Provincia",
        requerido(e.provincia_codigo, "Código de provincia", /^[1-7]$/),
      ) +
      nodo(
        "Canton",
        requerido(e.canton_codigo, "Código de cantón", /^\d{2}$/),
      ) +
      nodo(
        "Distrito",
        requerido(e.distrito_codigo, "Código de distrito", /^\d{2}$/),
      ) +
      nodo("OtrasSenas", requerido(e.otras_senas, "Otras señas")) +
      "</Ubicacion>";
  if (ubicacion)
    requerido(e.correo, "Correo del emisor", /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  return s + nodo("CorreoElectronico", e.correo);
}
function generarVenta({
  tipo,
  documento,
  lineas,
  emisor,
  opciones = {},
  consecutivo,
  fecha,
  clave: llave,
}) {
  const raiz = RAICES[tipo];
  if (!raiz)
    throw error("TIPO_NO_IMPLEMENTADO", "Tipo fiscal no implementado.");
  requerido(emisor.actividad_economica, "Actividad del emisor", ACTIVIDAD);
  const actividad = opciones.actividadReceptor || documento.actividad_economica;
  if (tipo === "01") requerido(actividad, "Actividad del receptor", ACTIVIDAD);
  if (documento.moneda && documento.moneda !== "CRC")
    throw error(
      "MONEDA_NO_IMPLEMENTADA",
      "La emisión inicial admite ventas en CRC. Configure un adaptador con tipo de cambio explícito para otras monedas.",
    );
  if (!lineas.length || lineas.length > 1000)
    throw error(
      "LINEAS_INVALIDAS",
      "El comprobante necesita entre 1 y 1000 líneas.",
    );
  let detalle = "",
    venta = 0n,
    descuento = 0n,
    impuesto = 0n,
    gravB = 0n,
    exB = 0n,
    gravS = 0n,
    exS = 0n;
  const desglose = new Map();
  for (const l of lineas) {
    const dato =
      (opciones.lineas || []).find(
        (d) => Number(d.numeroLinea) === Number(l.numero_linea),
      ) || {};
    const cabys = requerido(
      l.cabys,
      "CABYS de línea " + l.numero_linea,
      /^\d{13}$/,
    );
    const cantidad = decimal(l.cantidad),
      precio = decimal(l.precio_unitario),
      bruto = centavos(mul(cantidad, precio)),
      desc = decimal(l.descuento_monto),
      base = bruto - desc,
      iva = decimal(l.impuesto_monto),
      total = decimal(l.total);
    if (cantidad <= 0n || base < 0n || total !== base + iva)
      throw error(
        "TOTALES_NO_CUADRAN",
        `La línea ${l.numero_linea} no coincide con sus importes fiscales redondeados a centavos.`,
      );
    const tarifa = requerido(
      l.codigo_tarifa_hacienda,
      "Código de tarifa en línea " + l.numero_linea,
      /^(0[1-9]|10|11)$/,
    );
    if (tipo !== "03" && ["05", "06", "07"].includes(tarifa))
      throw error(
        "TARIFA_TRANSITORIA",
        "Las tarifas transitorias solo se utilizan en notas según el anexo vigente.",
      );
    const tasa = {
      "01": 0,
      "02": 1,
      "03": 2,
      "04": 4,
      "05": 0,
      "06": 4,
      "07": 8,
      "08": 13,
      "09": 0.5,
      10: 0,
      11: 0,
    }[tarifa];
    if (Number(l.tarifa) !== tasa)
      throw error(
        "TARIFA_NO_COINCIDE",
        `La tarifa de la línea ${l.numero_linea} no coincide con su código de Hacienda.`,
      );
    // El portal separa IVA desde un precio final: el redondeo inverso puede
    // diferir hasta un centavo. Se conservan IVA y total ya cobrados.
    const calculado = mul(base, decimal(l.tarifa)) / 100n;
    if ((calculado > iva ? calculado - iva : iva - calculado) > 1000n)
      throw error(
        "IMPUESTO_NO_CUADRA",
        `El IVA de la línea ${l.numero_linea} requiere revisión.`,
      );
    let s =
      nodo("NumeroLinea", l.numero_linea) +
      nodo("CodigoCABYS", cabys) +
      nodo("Cantidad", importe(cantidad)) +
      nodo(
        "UnidadMedida",
        requerido(l.unidad, "Unidad fiscal de línea " + l.numero_linea),
      ) +
      nodo("Detalle", requerido(l.nombre, "Detalle"));
    const registro = dato.registroMedicamento || l.registro_sanitario;
    if (l.es_medicamento)
      s +=
        nodo(
          "RegistroMedicamento",
          requerido(registro, "Registro del medicamento"),
        ) +
        nodo(
          "FormaFarmaceutica",
          requerido(
            dato.formaFarmaceutica || l.forma_farmaceutica,
            "Forma farmacéutica",
            /^\d{3}$/,
          ),
        );
    s +=
      nodo("PrecioUnitario", importe(precio)) +
      nodo("MontoTotal", importe(bruto));
    if (desc > 0n) {
      const cod = requerido(
        dato.codigoDescuento,
        "Motivo del descuento en línea " + l.numero_linea,
        /^(0[1-9]|99)$/,
      );
      s +=
        "<Descuento>" +
        nodo("MontoDescuento", importe(desc)) +
        nodo("CodigoDescuento", cod) +
        (cod === "99"
          ? nodo(
              "CodigoDescuentoOTRO",
              requerido(dato.naturalezaDescuento, "Detalle de otro descuento"),
            )
          : "") +
        nodo(
          "NaturalezaDescuento",
          dato.naturalezaDescuento || l.descuento_naturaleza,
        ) +
        "</Descuento>";
    }
    s +=
      nodo("SubTotal", importe(base)) +
      nodo("BaseImponible", importe(base)) +
      "<Impuesto>" +
      nodo("Codigo", "01") +
      nodo("CodigoTarifaIVA", tarifa) +
      nodo("Tarifa", importe(decimal(l.tarifa))) +
      nodo("Monto", importe(iva)) +
      "</Impuesto>" +
      nodo("ImpuestoAsumidoEmisorFabrica", "0.00000") +
      nodo("ImpuestoNeto", importe(iva)) +
      nodo("MontoTotalLinea", importe(total));
    detalle += "<LineaDetalle>" + s + "</LineaDetalle>";
    venta += bruto;
    descuento += desc;
    impuesto += iva;
    const servicio = Number(cabys[0]) >= 5,
      exento = tarifa === "10";
    if (servicio) {
      if (exento) exS += bruto;
      else gravS += bruto;
    } else {
      if (exento) exB += bruto;
      else gravB += bruto;
    }
    desglose.set(tarifa, (desglose.get(tarifa) || 0n) + iva);
  }
  if (
    decimal(documento.total) !== venta - descuento + impuesto ||
    decimal(documento.descuento) !== descuento ||
    decimal(documento.impuesto) !== impuesto
  )
    throw error(
      "TOTALES_NO_CUADRAN",
      "Los importes fiscales no coinciden con la venta. Revise los redondeos del documento.",
    );
  const receptor = {
    nombre: documento.cliente_nombre,
    tipo_identificacion: documento.cliente_tipo_identificacion,
    identificacion: documento.cliente_identificacion,
    correo: documento.cliente_correo,
  };
  const total = venta - descuento + impuesto;
  const pago = requerido(
    documento.codigo_medio_pago_hacienda,
    "Medio de pago",
    /^(0[1-7]|99)$/,
  );
  if (pago === "99")
    throw error(
      "MEDIO_PAGO_OTRO",
      "Configure un medio de pago fiscal específico para esta venta.",
    );
  const credito = documento.condicion_venta === "credito";
  let xml =
    nodo("Clave", llave) +
    nodo(
      "ProveedorSistemas",
      requerido(
        emisor.proveedor_sistemas,
        "Identificación del proveedor del sistema",
        /^\d{9,12}$/,
      ),
    ) +
    nodo("CodigoActividadEmisor", emisor.actividad_economica);
  if (actividad && tipo !== "04")
    xml += nodo(
      "CodigoActividadReceptor",
      requerido(actividad, "Actividad del receptor", ACTIVIDAD),
    );
  xml +=
    nodo("NumeroConsecutivo", consecutivo) +
    nodo("FechaEmision", fecha) +
    "<Emisor>" +
    persona(emisor, true) +
    "</Emisor>";
  if (tipo !== "04" || documento.cliente_identificacion)
    xml += "<Receptor>" + persona(receptor) + "</Receptor>";
  xml +=
    nodo("CondicionVenta", credito ? "02" : "01") +
    (credito
      ? nodo(
          "PlazoCredito",
          requerido(documento.plazo_dias, "Plazo de crédito", /^\d{1,4}$/),
        )
      : "") +
    "<DetalleServicio>" +
    detalle +
    "</DetalleServicio>";
  xml +=
    "<ResumenFactura><CodigoTipoMoneda>" +
    nodo("CodigoMoneda", "CRC") +
    nodo("TipoCambio", "1.00000") +
    "</CodigoTipoMoneda>" +
    nodo("TotalServGravados", importe(gravS)) +
    nodo("TotalServExentos", importe(exS)) +
    nodo("TotalMercanciasGravadas", importe(gravB)) +
    nodo("TotalMercanciasExentas", importe(exB)) +
    nodo("TotalGravado", importe(gravB + gravS)) +
    nodo("TotalExento", importe(exB + exS)) +
    nodo("TotalVenta", importe(venta)) +
    nodo("TotalDescuentos", importe(descuento)) +
    nodo("TotalVentaNeta", importe(venta - descuento));
  for (const [cod, m] of desglose)
    xml +=
      "<TotalDesgloseImpuesto>" +
      nodo("Codigo", "01") +
      nodo("CodigoTarifaIVA", cod) +
      nodo("TotalMontoImpuesto", importe(m)) +
      "</TotalDesgloseImpuesto>";
  xml +=
    nodo("TotalImpuesto", importe(impuesto)) +
    "<MedioPago>" +
    nodo("TipoMedioPago", pago) +
    nodo("TotalMedioPago", importe(total)) +
    "</MedioPago>" +
    nodo("TotalComprobante", importe(total)) +
    "</ResumenFactura>";
  for (const ref of opciones.referencias || [])
    xml +=
      "<InformacionReferencia>" +
      nodo("TipoDocIR", requerido(ref.tipo, "Tipo de referencia", /^\d{2}$/)) +
      nodo("Numero", requerido(ref.clave, "Clave de referencia", /^\d{50}$/)) +
      nodo("FechaEmisionIR", requerido(ref.fecha, "Fecha de referencia")) +
      nodo("Codigo", requerido(ref.codigo, "Código de referencia", /^\d{2}$/)) +
      (ref.codigo === "99"
        ? nodo(
            "CodigoReferenciaOTRO",
            requerido(ref.otro, "Detalle de otra referencia"),
          )
        : "") +
      nodo("Razon", requerido(ref.razon, "Razón de referencia")) +
      "</InformacionReferencia>";
  if (tipo === "03" && !(opciones.referencias || []).length)
    throw error(
      "REFERENCIA_FALTANTE",
      "La nota de crédito necesita la clave, fecha y motivo fiscal de la factura original.",
    );
  return `<?xml version="1.0" encoding="UTF-8"?><${raiz[0]} xmlns="${NS + raiz[1]}">${xml}</${raiz[0]}>`;
}
function generarMensaje({ original, emisor, consecutivo, fecha, opciones }) {
  const doc = parsear(original),
    llave = requerido(texto(doc, "Clave"), "Clave del proveedor", /^\d{50}$/);
  const root = doc.documentElement.localName;
  if (
    ![
      "FacturaElectronica",
      "NotaCreditoElectronica",
      "NotaDebitoElectronica",
    ].includes(root)
  )
    throw error(
      "XML_PROVEEDOR_INVALIDO",
      "El archivo no es un comprobante de proveedor compatible.",
    );
  const proveedor = doc.getElementsByTagNameNS("*", "Emisor")[0],
    receptor = doc.getElementsByTagNameNS("*", "Receptor")[0];
  if (texto(receptor, "Numero") !== emisor.identificacion)
    throw error(
      "RECEPTOR_NO_COINCIDE",
      "La factura del proveedor pertenece a otro receptor.",
    );
  const mensaje = requerido(
      opciones.mensaje,
      "Respuesta al proveedor",
      /^[123]$/,
    ),
    condicion = requerido(
      opciones.condicionImpuesto,
      "Condición del IVA",
      /^0[1-5]$/,
    );
  const iva = decimal(texto(doc, "TotalImpuesto") || "0"),
    acreditar = decimal(opciones.impuestoAcreditar),
    gasto = decimal(opciones.gastoAplicable),
    total = decimal(texto(doc, "TotalComprobante"));
  if (acreditar > iva || gasto > total)
    throw error(
      "MENSAJE_IMPORTES_INVALIDOS",
      "El crédito de IVA o gasto supera el comprobante del proveedor.",
    );
  if (mensaje === "3" && (acreditar !== 0n || gasto !== 0n))
    throw error(
      "MENSAJE_IMPORTES_INVALIDOS",
      "Un rechazo no puede acreditar IVA ni registrar gasto aplicable.",
    );
  const xml =
    nodo("Clave", llave) +
    nodo("NumeroCedulaEmisor", texto(proveedor, "Numero")) +
    nodo("FechaEmisionDoc", texto(doc, "FechaEmision")) +
    nodo("Mensaje", mensaje) +
    nodo(
      "DetalleMensaje",
      requerido(opciones.detalle, "Motivo de la respuesta"),
    ) +
    nodo("MontoTotalImpuesto", importe(iva)) +
    nodo("CodigoActividad", emisor.actividad_economica) +
    nodo("CondicionImpuesto", condicion) +
    nodo("MontoTotalImpuestoAcreditar", importe(acreditar)) +
    nodo("MontoTotalDeGastoAplicable", importe(gasto)) +
    nodo("TotalFactura", importe(total)) +
    nodo("NumeroCedulaReceptor", emisor.identificacion) +
    nodo("NumeroConsecutivoReceptor", consecutivo);
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?><MensajeReceptor xmlns="${NS}mensajeReceptor">${xml}</MensajeReceptor>`,
    clave: llave,
    fecha: texto(doc, "FechaEmision"),
    emisor: identificacion(
      texto(proveedor, "Tipo"),
      texto(proveedor, "Numero"),
    ),
    receptor: identificacion(emisor.tipo_identificacion, emisor.identificacion),
  };
}
module.exports = {
  ACTIVIDAD,
  generarVenta,
  generarMensaje,
  fechaCR,
  clave,
  identificacion,
  decimal,
  importe,
};

/**
 * Adaptador de consulta de facturas de electricidad del ICE.
 *
 * A diferencia de acueductoscr.com (WebForms con viewstate), acá NO hace
 * falta raspar HTML: la página /en-linea/consulta-de-facturas es una app
 * Angular que consume una API JSON pública. Se llegó a ella leyendo el
 * bundle main.js del portal, donde está literal:
 *
 *   wh_urlServElectrico = "https://apps.grupoice.com/FacturaElectrica/api/FactElecICE/"
 *   getElectricInvoice(t) { ... this.http.get(this.urlServElectrico + "?nise=" + t) }
 *
 * Es un GET sin sesión ni token — verificado en vivo: con un NISE
 * inexistente responde 200 con {"successful":true,"error":{"code":"2",...}}.
 *
 * Códigos de `error.code` observados en el propio bundle:
 *   "0" → hay facturas pendientes, vienen en `data[]`
 *   "2" → el NISE no tiene pendientes (no es un error: es "no debe nada")
 */

const axios = require('axios');

const URL_API = 'https://apps.grupoice.com/FacturaElectrica/api/FactElecICE/';

// User-Agent honesto, igual que en el adaptador de agua: son recibos propios
// y la API es pública, pero el servidor es ajeno y merece saber quién llama.
const USER_AGENT = 'TachiDistribuidora-ConsultaRecibos/1.0 (uso interno, consulta de recibos propios; contacto: javargas360@gmail.com)';
const TIMEOUT_MS = 25000;

const CODIGO_CON_FACTURAS = '0';
const CODIGO_SIN_PENDIENTES = '2';

class ConsultaFallida extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ConsultaFallida';
    this.status = 502;
  }
}

/** El NISE es numérico y de hasta 9 dígitos (el propio formulario lo valida así). */
function normalizarNise(valor) {
  const limpio = String(valor || '').replace(/\D/g, '');
  if (!limpio) throw new ConsultaFallida('Falta el número de servicio (NISE).');
  if (limpio.length > 9) throw new ConsultaFallida('El NISE no puede tener más de 9 dígitos.');
  return limpio;
}

/** 'YYYY-MM-DD' o ISO → 'DD-MM-YYYY', que es lo que espera el servicio. */
function aFechaCr(valor) {
  if (!valor) return '';
  const iso = String(valor).slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Si ya viniera en formato CR se devuelve tal cual.
  return /^\d{2}-\d{2}-\d{4}$/.test(String(valor)) ? String(valor) : '';
}

/** Período de consumo como 'MM-YYYY', del mes y año que devuelve la API. */
function aPeriodoCr(mes, anio) {
  const m = Number(mes);
  const a = Number(anio);
  if (!m || !a) return '';
  return `${String(m).padStart(2, '0')}-${a}`;
}

/**
 * Facturas pendientes de un servicio eléctrico.
 *
 * @param {{nise: string}} config
 * @returns {Promise<Array<{documento: string, periodo: string, monto: number, vencimiento: string}>>}
 *   Mismo contrato que el resto de adaptadores. Array vacío = no debe nada.
 */
async function consultarRecibos({ nise }) {
  const numero = normalizarNise(nise);

  let respuesta;
  try {
    respuesta = await axios.get(URL_API, {
      params: { nise: numero },
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' },
      timeout: TIMEOUT_MS
    });
  } catch (error) {
    throw new ConsultaFallida(`No se pudo consultar el ICE: ${error.message}`);
  }

  const cuerpo = respuesta.data || {};
  const codigo = String(cuerpo.error?.code ?? '');

  if (codigo === CODIGO_SIN_PENDIENTES) return [];

  if (codigo !== CODIGO_CON_FACTURAS) {
    throw new ConsultaFallida(cuerpo.error?.message || 'El ICE devolvió una respuesta inesperada.');
  }

  const facturas = Array.isArray(cuerpo.data) ? cuerpo.data : [];

  // Nombres de campo verificados contra una respuesta real (NISE 532117):
  //   { nise, ano_facty: "2026", mes_fact: "8", mes_factura: "AGOSTO",
  //     abonado, nombre, mfacturado: "16820", correo,
  //     fevencimiento: "2026-09-03 00:00:00.0", factura: "26081121911",
  //     estado_servicio: "ACTIVO", actividad: "RESIDENCIAL" }
  // El bundle de Angular usa otros nombres en su plantilla (monto,
  // fechaVencimiento) porque los remapea antes de pintar; los de la API son
  // estos. Se dejan alternativas por si el servicio cambia.
  return facturas.map((f) => ({
    documento: String(f.factura ?? f.numeroFactura ?? '').trim(),
    periodo: aPeriodoCr(f.mes_fact ?? f.nmes ?? f.mes, f.ano_facty ?? f.anno ?? f.anio),
    monto: Number(f.mfacturado ?? f.monto) || 0,
    vencimiento: aFechaCr(f.fevencimiento ?? f.fechaVencimiento)
  })).filter(r => r.vencimiento);
}

module.exports = {
  consultarRecibos,
  normalizarNise,
  aFechaCr,
  aPeriodoCr,
  ConsultaFallida,
  FUENTE: 'ice-electricidad'
};

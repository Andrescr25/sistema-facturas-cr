/**
 * Las líneas de un mes para el Reporte del Contador, leídas de las tablas
 * PROPIAS: `factura`, `nota_credito` y `compra`.
 *
 * Reemplaza a la importación desde Alegra (`/invoices`, `/credit-notes` y
 * `/bills`). Devuelve cada línea en el MISMO formato que producía aquella y
 * que produce el lector de Excel, para que el resto del módulo —duplicados,
 * exclusiones, exportar, mandar al contador— no distinga de dónde vino.
 *
 * LAS REGLAS, que son las que ya tenía el reporte:
 *
 *  · Solo documentos VIGENTES. Una factura anulada o un borrador no van.
 *  · En ventas, solo las líneas que llevan impuesto (`impuesto_id`). Una
 *    línea exenta SÍ va —lleva el impuesto "exento 0 %"—; la que no tiene
 *    ningún impuesto asignado no, porque este es un reporte de impuestos.
 *  · Las notas de crédito no se restan: van aparte, en positivo, marcadas por
 *    su tipo de documento, con la factura que rectifican.
 *  · Base e impuesto se redondean POR LÍNEA al colón, que es como cuadra con
 *    el reporte oficial.
 *
 * LO QUE CAMBIA RESPECTO DE ALEGRA, a propósito:
 *
 *  · EL IMPUESTO ES EL DEL DOCUMENTO (`impuesto_monto`), no base × tarifa
 *    vuelta a calcular. La factura ya dice cuánto impuesto cobró; recalcularlo
 *    puede dar un colón distinto y el reporte dejaría de calzar con el papel.
 *  · LA TARIFA DE UNA COMPRA SALE DE LA FACTURA DEL PROVEEDOR. `compra_linea`
 *    guarda el monto del impuesto que vino en el XML, no la tarifa, así que
 *    se despeja (impuesto ÷ base) y se lleva a la tarifa legal más cercana.
 *    En Alegra la tarifa de la compra era la del producto en Alegra, y por
 *    eso compras que el proveedor facturó al 1 % o al 2 % aparecían al 4 %,
 *    al 8 % o al 0,5 %.
 *  · En compras solo van las líneas con impuesto mayor que cero: sin la
 *    tarifa guardada, una línea exenta y una sin impuesto no se distinguen, y
 *    Alegra tampoco listaba las que no llevaban impuesto.
 */

const { query } = require('../../../config/database');

const TIPO_NOTA_CREDITO = 'Nota de crédito';

/** `impuesto.tipo` (nuestro) → el tipo de tarifa con el que trabaja el reporte. */
const TIPO_TARIFA = {
  general: 'GENERAL',
  reducido: 'REDUCED',
  exento: 'EXEMPT',
  transitorio: 'TRANSIENT',
  sin_credito: 'EXEMPT',
  bienes_usados: 'REDUCED'
};

const NOMBRE_IMPUESTO = {
  GENERAL: 'IVA',
  REDUCED: 'IVA reducido',
  EXEMPT: 'IVA exento',
  TRANSIENT: 'IVA transitorio'
};

// Cuánto puede alejarse el porcentaje despejado de una tarifa legal y seguir
// siendo esa tarifa. Los montos del XML vienen redondeados al céntimo y en una
// línea chica eso mueve el despeje: de 8.465 líneas con impuesto, 9 daban
// entre 13,26 y 13,48 (tres de ellas con base de ₡1). Medio punto las recoge.
// Se elige siempre la tarifa MÁS CERCANA, así que el 0,5 % y el 1 % no se
// confunden. Lo que se ajusta es la etiqueta: el monto del impuesto es el de
// la factura y no se toca.
const TOLERANCIA_TARIFA = 0.5;

function rangoDelMes(anio, mes) {
  const mm = String(mes).padStart(2, '0');
  const ultimo = new Date(anio, mes, 0).getDate();
  return [`${anio}-${mm}-01`, `${anio}-${mm}-${String(ultimo).padStart(2, '0')}`];
}

function tarifaComoTexto(tarifa) {
  return `${Number(tarifa) || 0}%`;
}

/** Una línea de factura o de nota de crédito propia, en el formato del reporte. */
function lineaDeVenta(fila, tipoDocumento) {
  const cantidad = Number(fila.cantidad) || 0;
  const precioUnitario = Number(fila.precio_unitario) || 0;
  const bruto = cantidad * precioUnitario;
  const descuento = Number(fila.descuento_monto) || 0;
  const tipoTarifa = TIPO_TARIFA[fila.impuesto_tipo] || 'GENERAL';

  return {
    tipoDocumento,
    fecha: fila.fecha,
    numero: fila.numero,
    documentoAsociado: fila.documento_asociado || null,
    esEmitida: Boolean(fila.electronica),
    contraparte: fila.contraparte || '',
    actividadEconomica: '',
    concepto: fila.concepto || '',
    cantidad,
    precioUnitario,
    precioTotal: bruto,
    descuento,
    nombreImpuesto: NOMBRE_IMPUESTO[tipoTarifa] || 'IVA',
    tipoImpuesto: 'IVA',
    tarifa: tarifaComoTexto(fila.tarifa),
    tipoTarifa,
    // Con derecho a crédito salvo la tarifa que dice explícitamente que no.
    acreditable: fila.impuesto_tipo === 'sin_credito' ? 'No' : 'Sí',
    baseGravable: Math.round(bruto - descuento),
    impuesto: Math.round(Number(fila.impuesto_monto) || 0)
  };
}

async function ventasDelMes(anio, mes) {
  const [desde, hasta] = rangoDelMes(anio, mes);

  const [facturas, notas] = await Promise.all([
    query(`
      SELECT f.numero, f.fecha::text AS fecha, f.electronica, f.cliente_nombre AS contraparte,
             l.nombre AS concepto, l.cantidad, l.precio_unitario, l.descuento_monto,
             l.tarifa, l.impuesto_monto, i.tipo AS impuesto_tipo
        FROM factura f
        JOIN factura_linea l ON l.factura_id = f.id
        JOIN impuesto i ON i.id = l.impuesto_id
       WHERE f.estado = 'emitida'
         AND f.fecha BETWEEN $1 AND $2
       ORDER BY f.fecha, f.numero, l.numero_linea;
    `, [desde, hasta]),
    query(`
      SELECT n.numero, n.fecha::text AS fecha, n.electronica, n.cliente_nombre AS contraparte,
             l.nombre AS concepto, l.cantidad, l.precio_unitario, l.descuento_monto,
             l.tarifa, l.impuesto_monto, i.tipo AS impuesto_tipo,
             (SELECT nf.factura_numero FROM nota_credito_factura nf
               WHERE nf.nota_credito_id = n.id ORDER BY nf.id LIMIT 1) AS documento_asociado
        FROM nota_credito n
        JOIN nota_credito_linea l ON l.nota_credito_id = n.id
        JOIN impuesto i ON i.id = l.impuesto_id
       WHERE n.estado = 'emitida'
         AND n.fecha BETWEEN $1 AND $2
       ORDER BY n.fecha, n.numero, l.numero_linea;
    `, [desde, hasta])
  ]);

  return [
    ...facturas.rows.map(f => lineaDeVenta(f, 'Factura')),
    ...notas.rows.map(n => lineaDeVenta(n, TIPO_NOTA_CREDITO))
  ];
}

/**
 * La tarifa legal de una línea de compra, despejada de sus montos.
 *
 * UNA BONIFICACIÓN PAGA IMPUESTO. El proveedor regala la mercadería (descuento
 * del 100 %) pero el IVA se cobra igual, sobre el precio sin descontar: la
 * base queda en cero y el impuesto no. Ahí se despeja contra el bruto.
 *
 * @param {{bruto:number, descuento:number, impuesto:number}} montos
 *        bruto = cantidad × precio; impuesto = el monto que vino en la factura
 * @param {Array<{tarifa:number,tipo:string}>} tarifas  las de la tabla `impuesto`
 * @returns {{tarifa:number, tipoTarifa:string, exacta:boolean}}
 */
function tarifaDeCompra({ bruto, descuento, impuesto }, tarifas) {
  const base = bruto - descuento;
  const sobre = base > 0 ? base : bruto;
  const despejada = sobre > 0 ? (impuesto / sobre) * 100 : 0;

  let mejor = null;
  for (const t of tarifas) {
    const distancia = Math.abs(Number(t.tarifa) - despejada);
    if (!mejor || distancia < mejor.distancia) mejor = { ...t, distancia };
  }

  if (mejor && mejor.distancia <= TOLERANCIA_TARIFA) {
    return { tarifa: Number(mejor.tarifa), tipoTarifa: TIPO_TARIFA[mejor.tipo] || 'GENERAL', exacta: true };
  }
  // No calza con ninguna tarifa legal (un impuesto que no es IVA, o un XML con
  // los montos mal): se deja el porcentaje que resulta, sin disfrazarlo de
  // una tarifa que no es. El contador lo ve y decide.
  return { tarifa: Math.round(despejada * 100) / 100, tipoTarifa: '', exacta: false };
}

async function comprasDelMes(anio, mes) {
  const [desde, hasta] = rangoDelMes(anio, mes);

  const [lineas, impuestos] = await Promise.all([
    query(`
      SELECT c.numero_consecutivo AS numero, c.fecha_emision::text AS fecha,
             p.nombre AS contraparte, l.descripcion AS concepto,
             l.cantidad, l.precio_unitario, l.descuento, l.impuesto
        FROM compra c
        JOIN compra_linea l ON l.compra_id = c.id
        LEFT JOIN proveedor p ON p.id = c.proveedor_id
       WHERE c.estado <> 'anulada'
         -- El IVA del gasto se revisa explícitamente en su ficha. No deducir
         -- derecho a crédito desde los impuestos originales del combustible.
         AND NOT EXISTS (SELECT 1 FROM gasto_operativo g WHERE g.compra_id=c.id)
         AND c.fecha_emision BETWEEN $1 AND $2
         AND l.impuesto > 0
       ORDER BY c.fecha_emision, c.numero_consecutivo, l.numero_linea;
    `, [desde, hasta]),
    // Solo las tarifas de IVA con porcentaje: contra esas se compara el despeje.
    query(`SELECT DISTINCT ON (tarifa) tarifa, tipo FROM impuesto
            WHERE activo AND tarifa > 0 ORDER BY tarifa, id;`)
  ]);

  const tarifas = impuestos.rows.map(t => ({ tarifa: Number(t.tarifa), tipo: t.tipo }));

  return lineas.rows.map((fila) => {
    const cantidad = Number(fila.cantidad) || 0;
    const precioUnitario = Number(fila.precio_unitario) || 0;
    const bruto = cantidad * precioUnitario;
    const descuento = Number(fila.descuento) || 0;
    const impuesto = Number(fila.impuesto) || 0;
    const { tarifa, tipoTarifa } = tarifaDeCompra({ bruto, descuento, impuesto }, tarifas);
    const numero = String(fila.numero || '').trim();

    return {
      tipoDocumento: 'Factura de proveedor',
      fecha: fila.fecha,
      numero,
      documentoAsociado: null,
      // Una compra entra al sistema desde la factura electrónica del proveedor.
      esEmitida: numero.replace(/\D/g, '').length >= 20,
      contraparte: fila.contraparte || '',
      actividadEconomica: '',
      concepto: fila.concepto || '',
      cantidad,
      precioUnitario,
      precioTotal: bruto,
      descuento,
      nombreImpuesto: NOMBRE_IMPUESTO[tipoTarifa] || 'IVA',
      tipoImpuesto: 'IVA',
      tarifa: tarifaComoTexto(tarifa),
      tipoTarifa,
      acreditable: 'Sí',
      baseGravable: Math.round(bruto - descuento),
      impuesto: Math.round(impuesto)
    };
  });
}

/**
 * @param {number} anio
 * @param {number} mes   1 a 12
 * @param {'ventas'|'compras'} tipo
 */
async function traerDelSistema(anio, mes, tipo) {
  return tipo === 'ventas' ? ventasDelMes(anio, mes) : comprasDelMes(anio, mes);
}

module.exports = { traerDelSistema, lineaDeVenta, tarifaDeCompra, rangoDelMes, TIPO_TARIFA, NOMBRE_IMPUESTO };

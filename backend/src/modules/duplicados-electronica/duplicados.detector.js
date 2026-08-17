/**
 * Detección de facturas duplicadas por conversión a electrónica.
 *
 * EL PROBLEMA
 * Al convertir una factura normal a electrónica, Alegra transforma el
 * registro original en su lugar — conserva su id y le pone la plantilla
 * electrónica y el timbre — pero deja atrás una copia no electrónica con un
 * id NUEVO. El resultado son dos facturas por una sola venta: la electrónica
 * (id menor, timbrada) y una copia muerta (id mayor, sin timbre).
 *
 * Esa copia aparece en Cuentas por Cobrar duplicando el monto a cobrar y en
 * Bodega como una segunda orden que alistar. Peor: si se le aplica el cobro,
 * el ingreso queda contado dos veces.
 *
 * POR QUÉ ESTE ARCHIVO NO TOCA LA RED
 * La consecuencia de un falso positivo es anular una factura de venta real.
 * La detección se mantiene pura — entra un arreglo de facturas de Alegra,
 * sale la lista de pares — justamente para poder probarla a fondo sin tener
 * que llamar a Alegra ni anular nada de verdad.
 */

/**
 * Una factura es la copia sobrante si NO es electrónica y no tiene timbre.
 * Se piden las dos cosas: `isElectronic` describe la plantilla de numeración
 * y `stamp` el envío real a Hacienda. Que discrepen significa que la factura
 * está en un estado que no entendemos, y ante la duda no se toca.
 */
function esNoElectronica(factura) {
  return factura?.numberTemplate?.isElectronic === false && !factura?.stamp;
}

/**
 * Y es la que se conserva si es electrónica Y Hacienda la aceptó. Un timbre
 * rechazado o pendiente no sirve como respaldo para anular a su gemela: si
 * la electrónica no llegó a existir legalmente, la copia normal puede ser el
 * único comprobante que queda.
 */
function esElectronicaAceptada(factura) {
  return factura?.numberTemplate?.isElectronic === true &&
    factura?.stamp?.legalStatus === 'STAMPED_AND_ACCEPTED';
}

function montoIgual(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

/**
 * Los ítems son la prueba decisiva. Dos ventas al mismo cliente por el mismo
 * monto el mismo día pueden ser reales; que además coincidan producto por
 * producto, en cantidad y precio, no.
 */
function huellaItems(factura) {
  return (factura.items || [])
    .map(i => `${i.id}:${Number(i.quantity)}:${Math.round(Number(i.price) * 100)}`)
    .sort()
    .join('|');
}

function mismosItems(a, b) {
  const ha = huellaItems(a);
  return ha.length > 0 && ha === huellaItems(b);
}

function pagada(factura) {
  return (Number(factura.totalPaid) || 0) > 0;
}

/**
 * Empareja cada copia sobrante con su electrónica.
 *
 * Todas estas condiciones a la vez: mismo cliente, mismo total al céntimo,
 * misma fecha de emisión, mismos ítems, una timbrada y aceptada y la otra
 * sin timbre, y la copia con id MAYOR que la electrónica (nació después, al
 * convertir). Sobre 33 casos reales de producción las cinco primeras ya
 * daban 33/33; las demás están para que un caso raro se descarte en vez de
 * anularse.
 */
function detectarPares(facturas) {
  const electronicas = facturas.filter(esElectronicaAceptada);
  const candidatas = facturas.filter(f => esNoElectronica(f) && f.status !== 'void');

  const pares = [];
  for (const copia of candidatas) {
    const gemela = electronicas.find(e =>
      String(e.client?.id) === String(copia.client?.id) &&
      String(e.client?.id) !== 'undefined' &&
      montoIgual(e.total, copia.total) &&
      e.date === copia.date &&
      Number(e.id) < Number(copia.id) &&
      mismosItems(e, copia)
    );
    if (!gemela) continue;

    pares.push({
      electronicaId: String(gemela.id),
      electronicaNumero: gemela.numberTemplate?.fullNumber || String(gemela.id),
      duplicadoId: String(copia.id),
      duplicadoNumero: copia.numberTemplate?.fullNumber || String(copia.id),
      clienteId: String(copia.client?.id),
      clienteNombre: copia.client?.name || 'Cliente sin nombre',
      fecha: copia.date,
      total: Number(copia.total) || 0,
      // Limpio = ninguna de las dos recibió plata. Es la única forma en que
      // anular no mueve nada del libro de ingresos: la copia se borra y el
      // cobro sigue pendiente, entero, sobre la electrónica.
      limpio: !pagada(gemela) && !pagada(copia),
      pagoEnDuplicado: Number(copia.totalPaid) || 0,
      pagoEnElectronica: Number(gemela.totalPaid) || 0
    });
  }

  return pares;
}

/**
 * Por qué un par NO se anula solo. El usuario decidió que el automatismo se
 * limite a los limpios; los demás se listan para que una persona resuelva
 * a dónde va la plata antes de tocar nada.
 */
function motivoRevisionManual(par) {
  if (par.limpio) return null;
  if (par.pagoEnDuplicado > 0 && par.pagoEnElectronica > 0) {
    return 'Las dos tienen el cobro aplicado: el ingreso está contado dos veces. Anular la copia también anula su pago.';
  }
  if (par.pagoEnDuplicado > 0) {
    return 'El cobro quedó aplicado a la copia, no a la electrónica. Hay que mover el pago antes de anular, o se pierde un cobro real.';
  }
  return 'Revisar antes de anular.';
}

module.exports = {
  detectarPares,
  motivoRevisionManual,
  esNoElectronica,
  esElectronicaAceptada,
  mismosItems
};

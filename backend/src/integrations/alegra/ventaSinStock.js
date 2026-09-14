/**
 * Dejar que un producto se pueda facturar aunque el stock esté en cero.
 *
 * POR QUÉ. La casa casi no maneja inventario: quedan artículos de antes de un
 * cambio interno que siguen marcados como "no facturar si no tiene stock", y
 * cuando entran varios pedidos se van a negativo. Alegra entonces rechaza la
 * factura con el cliente enfrente. El ajuste existe en Alegra —`negativeSale`
 * dentro de `inventory`— y lo que hace este módulo es prenderlo solo, para el
 * producto que está trabando la venta.
 *
 * SE LEE ANTES DE ESCRIBIR, y se manda lo MÍNIMO. En el objeto `inventory`,
 * `unit` y `unitCost` son obligatorios, y `warehouses` lleva `initialQuantity`:
 * mandar ese arreglo podría reescribir cantidades. Así que se reenvían la
 * unidad y el costo que ya tenía —para no borrarlos— y nada más.
 *
 * SE VERIFICA DESPUÉS. Se vuelve a leer el artículo y se comprueba que lo
 * único que cambió fue el permiso. Si cambió otra cosa queda gritado en el
 * log: son productos reales de la cuenta de la empresa.
 */

const NOMBRE_INVENTARIO = 'inventory';

/** ¿Este rechazo de Alegra es "el item no se puede facturar sin stock"? */
function esFaltaDeStock(error) {
  const mensaje = error?.response?.data?.message || '';
  return /no poder facturar si no tiene stock/i.test(mensaje);
}

/** ¿Está apagado el permiso de vender sin existencias? */
function bloqueadoSinStock(item) {
  const inv = item?.[NOMBRE_INVENTARIO];
  return Boolean(inv) && inv.negativeSale !== true;
}

/**
 * De los items de la factura, cuál nombra el mensaje de Alegra.
 *
 * Se elige por NOMBRE y no adivinando: Alegra dice cuál es, y tocar un
 * producto que no está trabando nada sería cambiar configuración que nadie
 * pidió. Si el texto cambia y no calza ninguno, se devuelve null y el error
 * sube tal cual.
 */
function itemDelMensaje(mensaje, items) {
  const texto = String(mensaje || '').toLowerCase();
  return items.find((i) => {
    const nombre = String(i?.name || '').trim().toLowerCase();
    return nombre.length > 3 && texto.includes(nombre);
  }) || null;
}

/**
 * Prende `negativeSale` en un artículo y comprueba que no cambió nada más.
 *
 * @returns {Promise<{cambiado: boolean, nombre: string, aviso?: string}>}
 */
async function permitirVentaSinStock(client, itemId) {
  const antes = await client.request('GET', `/items/${itemId}`);
  const inv = antes?.[NOMBRE_INVENTARIO];

  if (!inv) {
    return { cambiado: false, nombre: antes?.name || String(itemId), aviso: 'no es un artículo con inventario' };
  }
  if (inv.negativeSale === true) {
    return { cambiado: false, nombre: antes.name, aviso: 'ya estaba permitido' };
  }

  // El artículo COMPLETO queda escrito antes de tocarlo. Es la red: si el PUT
  // se lleva por delante algo que no se esperaba, acá está lo que tenía para
  // poder devolvérselo. Se escribe entero a propósito, no un resumen.
  console.log(`📋 Antes de habilitar la venta sin stock de "${antes.name}" (id ${itemId}): ${JSON.stringify(antes)}`);

  await client.request('PUT', `/items/${itemId}`, {
    inventory: {
      // La unidad y el costo van porque Alegra los exige dentro de
      // `inventory`; son los que el artículo YA tenía, no valores nuevos.
      unit: inv.unit,
      unitCost: inv.unitCost,
      negativeSale: true
    }
  });

  // Comprobar. Son productos reales de la cuenta de la empresa: si el PUT
  // tocó algo más, hay que enterarse ahora y no dentro de un mes.
  const despues = await client.request('GET', `/items/${itemId}`);
  const invDespues = despues?.[NOMBRE_INVENTARIO] || {};
  const avisos = [];
  if (invDespues.negativeSale !== true) avisos.push('el permiso no quedó puesto');
  if (String(invDespues.unitCost) !== String(inv.unitCost)) avisos.push(`el costo cambió de ${inv.unitCost} a ${invDespues.unitCost}`);
  if (despues?.name !== antes.name) avisos.push('el nombre cambió');
  if (String(invDespues.availableQuantity) !== String(inv.availableQuantity)) {
    avisos.push(`las existencias cambiaron de ${inv.availableQuantity} a ${invDespues.availableQuantity}`);
  }

  if (avisos.length) {
    console.error(`🚨 Al habilitar la venta sin stock de "${antes.name}" (id ${itemId}) cambió algo más: ${avisos.join('; ')}`);
    return { cambiado: invDespues.negativeSale === true, nombre: antes.name, aviso: avisos.join('; ') };
  }

  console.log(`🔓 "${antes.name}" (id ${itemId}) ya se puede facturar sin existencias.`);
  return { cambiado: true, nombre: antes.name };
}

module.exports = { esFaltaDeStock, bloqueadoSinStock, itemDelMensaje, permitirVentaSinStock };

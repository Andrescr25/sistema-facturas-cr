// Las cantidades se calculan desde el pedido original, también al recuperar
// una factura. Nunca se resta otra vez sobre una factura ya ajustada.
function referencia(valor) {
  if (valor && typeof valor === 'object') {
    return referencia(valor.code ?? valor.reference ?? valor.value);
  }
  return valor == null ? '' : String(valor).trim();
}

function idProducto(item) {
  return item.item?.id ?? item.productId ?? item.itemId ?? item.id;
}

function coincide(item, ajuste, codigos = new Map()) {
  const id = idProducto(item);
  if (ajuste.producto_alegra_id != null) {
    return String(id) === String(ajuste.producto_alegra_id);
  }
  const codigo = referencia(ajuste.producto_codigo);
  return Boolean(codigo && [item.reference, item.item?.reference, codigos.get(String(id))]
    .some(ref => referencia(ref) === codigo));
}

function prepararAjustes(items, ajustes, anteriores = [], codigos = new Map()) {
  const usados = new Set();
  return ajustes.map(ajuste => {
    const anterior = anteriores.find(a => ajuste.producto_alegra_id != null && a.producto_alegra_id != null
      ? String(a.producto_alegra_id) === String(ajuste.producto_alegra_id)
      : Boolean(referencia(ajuste.producto_codigo)) && referencia(a.producto_codigo) === referencia(ajuste.producto_codigo));
    const candidatos = items.filter(item => coincide(item, ajuste, codigos));
    if (candidatos.length > 1) {
      throw new Error(`El producto ${ajuste.producto_codigo} aparece en varias líneas; revisá las líneas de la factura antes de imprimir.`);
    }
    const original = anterior?.item_original ?? candidatos[0];
    if (!original) {
      throw new Error(`No se encontró el producto ${ajuste.producto_codigo} en la factura; revisá la referencia antes de imprimir.`);
    }
    const id = String(idProducto(original));
    if (usados.has(id)) throw new Error(`Hay más de un ajuste para el producto ${ajuste.producto_codigo}; revisá el pedido antes de imprimir.`);
    usados.add(id);
    const mismoAjuste = anterior && ['estado', 'cantidad_faltante', 'cantidad_entregada'].every(campo => String(anterior[campo]) === String(ajuste[campo]));
    return {
      ...ajuste,
      producto_alegra_id: idProducto(original),
      cantidad_original: anterior?.cantidad_original ?? Number(original.quantity),
      item_original: anterior?.item_original ?? original,
      cantidad_final_manual: mismoAjuste ? anterior.cantidad_final_manual : undefined
    };
  });
}

function cantidadFinal(ajuste) {
  const original = Number(ajuste.cantidad_original);
  const faltante = Number(ajuste.cantidad_faltante ?? ajuste.cantidad_faltante_original ?? 0);
  const entregada = Number(ajuste.cantidad_entregada ?? 0);
  if (![original, faltante, entregada].every(Number.isFinite) || original < 0 ||
      faltante < 0 || faltante > original || entregada < 0 || entregada > faltante ||
      !['completo', 'parcial', 'no_llego'].includes(ajuste.estado)) {
    throw new Error(`El ajuste de ${ajuste.producto_codigo} tiene cantidades o estado inválidos.`);
  }
  if (ajuste.cantidad_final_manual != null) {
    const manual = Number(ajuste.cantidad_final_manual);
    if (!Number.isFinite(manual) || manual < 0) throw new Error(`Cantidad manual inválida para ${ajuste.producto_codigo}.`);
    return manual;
  }
  return original - (ajuste.estado === 'completo' ? 0 : faltante - entregada);
}

module.exports = { referencia, idProducto, coincide, prepararAjustes, cantidadFinal };

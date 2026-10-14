const { generarPdfCompra } = require('./ordenProveedor.pdf');
const { hoyEnCostaRica } = require('../../utils/fechaCR');

/** Solo snapshots de la orden: jamás consultar mapeos o cantidades globales. */
function generarPdfOrden(o, { preferirDatosProveedor = true } = {}) {
  return generarPdfCompra({
    referencia: o.referencia,
    proveedor: o.proveedor_nombre,
    fecha: hoyEnCostaRica(),
    lineas: o.lineas.map(l => ({
      codigo: (preferirDatosProveedor ? l.codigo_proveedor : null) || l.codigo_interno || '—',
      descripcion: (preferirDatosProveedor ? l.nombre_proveedor : null) || l.producto_nombre,
      cantidad: l.cantidad_proveedor,
      factor: l.factor_conversion,
      seccion: !preferirDatosProveedor ? null : !l.mapping_id ? 'sin_mapeo' : !l.codigo_proveedor ? 'sin_codigo' : null
    }))
  });
}

module.exports = { generarPdfOrden };

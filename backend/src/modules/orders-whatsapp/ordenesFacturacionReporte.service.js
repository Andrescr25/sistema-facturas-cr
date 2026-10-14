const { comparacionEn: compararEn } = require('./facturacionOrdenProveedor.service');

/** La insignia resume el comprobante revisado en unidades propias. Una
 * factura recibida sin registrar/vincular todavía no prueba qué se facturó. */
async function comparacionEn(db, ordenId) {
  const { productos } = await compararEn(db, ordenId);
  return productos.map(p => ({
    productoId: p.productoId,
    estado: p.estado === 'sin_comprobante' ? 'sin_revisar'
      : p.facturado == null ? 'por_identificar'
        : p.facturado === 0 ? 'no_facturado'
          : p.facturado < p.solicitado ? 'parcial' : 'facturado',
    cantidadFacturada: p.facturado
  }));
}

module.exports = { comparacionEn };

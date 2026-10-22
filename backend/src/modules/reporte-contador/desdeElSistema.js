// Una lectura por clase de documento, con sus líneas. No se infiere emisión
// por el largo del número ni se filtran compras exentas o líneas sin impuesto.
// En factura/nota propias subtotal YA descuenta la rebaja: no restarla otra vez.
async function ventas(db, desde, hasta, nota = false) {
  const tabla = nota ? 'nota_credito' : 'factura';
  const tipo = nota ? 'Nota de crédito' : 'Venta';
  const { rows } = await db.query(
    `SELECT d.id, '${tipo}' AS tipo, d.numero,
    d.fecha::text AS fecha, d.cliente_nombre AS contraparte, d.cliente_identificacion AS cedula,
    ${nota ? "(SELECT string_agg(factura_numero, ', ' ORDER BY id) FROM nota_credito_factura WHERE nota_credito_id=d.id)" : 'NULL::text'} AS documento_asociado,
    d.clave_hacienda AS clave, ${nota ? "'CRC'" : 'd.moneda'} AS moneda, d.electronica,
    d.subtotal AS base, d.impuesto AS impuestos, d.total,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('descripcion', l.nombre, 'cantidad', l.cantidad,
      'precio', l.precio_unitario, 'descuento', l.descuento_monto, 'base', l.cantidad*l.precio_unitario-l.descuento_monto,
      'impuestos', l.impuesto_monto, 'tarifa', l.tarifa, 'total', l.total) ORDER BY l.numero_linea)
      FROM ${tabla}_linea l WHERE l.${tabla}_id=d.id), '[]'::jsonb) AS lineas
    FROM ${tabla} d WHERE d.estado='emitida' AND d.fecha BETWEEN $1 AND $2 ORDER BY d.fecha,d.id`,
    [desde, hasta]
  );
  return rows.map((r) => ({ ...r, identidad: `${tabla}-${r.id}` }));
}

async function compras(db, desde, hasta) {
  const { rows } = await db.query(
    `SELECT c.id, 'Compra' AS tipo, c.numero_consecutivo AS numero,
    c.fecha_emision::text AS fecha, p.nombre AS contraparte, p.identificacion AS cedula,
    c.clave, c.moneda, c.total, COALESCE(l.base,0) AS base, COALESCE(l.impuestos,0) AS impuestos,
    COALESCE(l.lineas,'[]'::jsonb) AS lineas FROM compra c JOIN proveedor p ON p.id=c.proveedor_id
    LEFT JOIN LATERAL (SELECT sum(cantidad*precio_unitario-descuento) AS base,sum(impuesto) AS impuestos,
      jsonb_agg(jsonb_build_object('descripcion',descripcion,'cantidad',cantidad,'precio',precio_unitario,
        'descuento',descuento,'base',cantidad*precio_unitario-descuento,'impuestos',impuesto,
        'total',total_linea) ORDER BY numero_linea) AS lineas FROM compra_linea WHERE compra_id=c.id) l ON TRUE
    WHERE c.estado <> 'anulada' AND c.fecha_emision BETWEEN $1 AND $2
      AND NOT EXISTS (SELECT 1 FROM gasto_operativo g WHERE g.compra_id=c.id)
    ORDER BY c.fecha_emision,c.id`,
    [desde, hasta]
  );
  return rows.map((r) => ({ ...r, identidad: `compra-${r.id}` }));
}

async function gastos(db, desde, siguiente) {
  return (
    await db.query(
      `SELECT g.id, g.categoria, g.descripcion,g.empleado,g.placa,g.version,g.decision,
    g.validacion,g.motivo_validacion,g.renta,g.gasto_deducible,g.iva,g.iva_credito,g.revisado_en,
    g.respuesta,g.motivo_fiscal,g.iva_maximo, f.numero_consecutivo AS numero,f.clave,
    f.fecha_emision::date::text AS fecha,f.proveedor_nombre AS contraparte,f.proveedor_cedula AS cedula,
    f.moneda,f.total_factura AS total,f.xml_ruta,f.pdf_ruta,
    g.originales->'resumen'->'totales' AS totales_originales,
    COALESCE(c.estado,'sin_registrar') AS estado,s.saldo,s.pagado,s.estado AS estado_pago,
    h.estado AS estado_hacienda, pagos.metodos
    FROM gasto_operativo g JOIN facturas_proveedores f ON f.id=g.factura_id
    LEFT JOIN compra c ON c.id=g.compra_id
    LEFT JOIN cuentas_por_pagar cp ON cp.factura_id=f.id
    LEFT JOIN cuenta_por_pagar_saldo s ON s.id=cp.id
    LEFT JOIN LATERAL (SELECT string_agg(DISTINCT p.metodo_pago_texto, ', ' ORDER BY p.metodo_pago_texto) AS metodos FROM pago_proveedor_cuenta pc
      JOIN pago_proveedor p ON p.id=pc.pago_id WHERE pc.cuenta_por_pagar_id=cp.id AND NOT p.anulado) pagos ON TRUE
    LEFT JOIN LATERAL (SELECT estado FROM hacienda_comprobante WHERE origen='compra' AND origen_id=g.compra_id
      AND ambiente='produccion' ORDER BY revision_documento DESC LIMIT 1) h ON TRUE
    WHERE f.fecha_emision >= $1::date AND f.fecha_emision < $2::date ORDER BY f.fecha_emision,g.id`,
      [desde, siguiente]
    )
  ).rows;
}

async function notasProveedor(db, desde, siguiente) {
  const { rows } = await db.query(
    `SELECT id,'Nota de crédito proveedor' AS tipo,numero_consecutivo AS numero,
    fecha_emision::date::text AS fecha,proveedor_nombre AS contraparte,proveedor_cedula AS cedula,
    clave,clave_referencia,moneda,monto_total AS total,COALESCE(lineas,'[]'::jsonb) AS originales
    FROM nota_credito_proveedor WHERE eliminada_en IS NULL AND fecha_emision >= $1::date
      AND fecha_emision < $2::date ORDER BY fecha_emision,id`,
    [desde, siguiente]
  );
  return rows.map(({ originales, ...r }) => ({
    ...r,
    identidad: `nota-proveedor-${r.id}`,
    documento_asociado: r.clave_referencia,
    base: null,
    impuestos: null,
    lineas: originales.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio: l.precioUnitario,
      descuento: null,
      impuestos: null,
      base: l.montoTotal,
      total: null
    }))
  }));
}
module.exports = { ventas, compras, gastos, notasProveedor };

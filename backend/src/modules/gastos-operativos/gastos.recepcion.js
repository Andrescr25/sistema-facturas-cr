const { randomUUID } = require('node:crypto');
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { crearGastoEn } = require('./gastos.registro');
const { cedula } = require('./gastos.originales');
const { CATEGORIAS } = require('./gastos.validacion');
const { diaEnCostaRica } = require('../../utils/fechaCR');

/** Una consulta antes de mapear: sólo proveedores configurados cambian de camino. */
async function tratamientoDelProveedor(identificacion, db = pool) {
  const filas = (await db.query(
    `SELECT id, tratamiento_facturas FROM proveedor WHERE
     ltrim(regexp_replace(identificacion, '[[:space:]-]', '', 'g'), '0')=$1`, [cedula(identificacion)]
  )).rows;
  // Desactivar una ficha no convierte combustible en mercadería. Si hay
  // identidades ambiguas se elige por factura, sin reutilizar mapeos.
  return filas.length === 1 ? filas[0].tratamiento_facturas : filas.length > 1 ? 'mixto' : 'comercial';
}

/** Transacción única para buzón, detalle, gasto y compra sin inventario.
 * Un XML que requiera revisión queda visible en Gastos, sin compra ni CxP liberada.
 */
async function recibirGasto(datos, archivoXML, emailId, xmlRuta, tratamiento) {
  if (!CATEGORIAS.includes(tratamiento)) return null;
  return enTransaccion(pool, async (db) => {
    // Serializa duplicados de correo antes de crear CxP, compra o gasto.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 61001))', [datos.clave]);
    const previa = (await db.query('SELECT id, estado FROM facturas_proveedores WHERE clave=$1', [datos.clave])).rows[0];
    if (previa) return { ...previa, productos: [], duplicada: true };
    const id = randomUUID();
    const t = datos.resumen.totales;
    const f = (await db.query(
      `INSERT INTO facturas_proveedores (id, clave, numero_consecutivo, fecha_emision,
         proveedor_nombre, proveedor_cedula, proveedor_email, proveedor_telefono,
         total_productos, total_factura, moneda, estado, archivo_xml, email_id,
         xml_ruta, tratamiento, total_otros_cargos, total_descuentos, total_iva_devuelto, otros_cargos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GASTO_RECURRENTE',$12,$13,$14,$15,$16,$17,$18,$19::jsonb)
       RETURNING *`,
      [id, datos.clave, datos.numeroConsecutivo, datos.fechaEmision.original,
        datos.emisor.nombre.trim(), datos.emisor.identificacion.numero, datos.emisor.correoElectronico,
        datos.emisor.telefono?.numero, datos.productos.length, t.comprobante, datos.resumen.moneda.codigo,
        archivoXML, emailId, xmlRuta, tratamiento, t.otrosCargos || 0, t.descuentos || 0, t.ivaDevuelto || 0,
        JSON.stringify(datos.otrosCargos || [])]
    )).rows[0];
    for (const l of datos.productos) {
      await db.query(
        `INSERT INTO productos_factura_proveedor (id, factura_id, numero_linea,
           codigo_proveedor, codigo_comercial, codigo_cabys, descripcion, cantidad,
           unidad_medida, precio_unitario, descuento, impuesto, total_linea, estado_relacionado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PENDIENTE')`,
        [randomUUID(), id, l.numeroLinea, l.codigo, l.codigoComercial?.codigo, l.codigoCabys,
          l.descripcion, l.cantidad, l.unidadMedida, l.precioUnitario, l.descuento?.monto || 0,
          l.impuesto?.monto || 0, l.montoTotalLinea]
      );
    }
    // Respetar crédito/vencimiento también en gastos. Contado no significa pagado.
    const plazo = Math.max(0, Number.parseInt(datos.plazoCredito, 10) || (datos.condicionVenta === '02' ? 30 : 0));
    if (plazo > 0) {
      await db.query(
        `INSERT INTO cuentas_por_pagar (factura_id, proveedor_nombre, proveedor_cedula,
          numero_consecutivo, condicion_venta, plazo_credito, fecha_emision, fecha_vencimiento,
          monto_total, saldo_pendiente, estado, liberada)
         VALUES ($1,$2,$3,$4,$5,$6,$7::date,$7::date+$6::int,$8,$8,'PENDIENTE',FALSE)`,
        [id, f.proveedor_nombre, f.proveedor_cedula, f.numero_consecutivo, datos.condicionVenta || '02',
          plazo, diaEnCostaRica(datos.fechaEmision.iso), t.comprobante]
      );
      f.fecha_vencimiento = (await db.query('SELECT fecha_vencimiento FROM cuentas_por_pagar WHERE factura_id=$1', [id])).rows[0].fecha_vencimiento;
      await db.query('UPDATE facturas_proveedores SET fecha_vencimiento=$2 WHERE id=$1', [id, f.fecha_vencimiento]);
    }
    const gasto = await crearGastoEn(db, f, { categoria: tratamiento }, null, datos);
    return { id, estado: 'GASTO_RECURRENTE', productos: [], gastoId: gasto.id };
  });
}

module.exports = { tratamientoDelProveedor, recibirGasto };

const { httpError, idValido } = require('../../utils/validacion');
const { revisarSiSePuedeTocar, COLUMNAS_LINEA } = require('./facturaPropia.service');
const { aplicarDescuentoEn } = require('./descuentoCliente.service');
const { sustituirLineas } = require('./sustitucionLineas');
const { reconciliarDocumentoEn } = require('../inventario/inventario.service');
const { registrarCambio } = require('../../utils/bitacora');
const { mapaVigentesPropios } = require('../../utils/descuentosExceso');

async function contextoFacturaEn(db, facturaId) {
  const { rows: [factura] } = await db.query('SELECT *, actualizado_en::text AS version_fecha FROM factura WHERE id=$1', [facturaId]);
  await revisarSiSePuedeTocar(db, factura, 'editar');
  if (factura.moneda !== 'CRC') throw httpError(409, 'El cambio de producto usa precios del catálogo en colones. Esta factura está en otra moneda.');
  const { rows: lineas } = await db.query('SELECT * FROM factura_linea WHERE factura_id=$1 ORDER BY numero_linea,id', [facturaId]);
  return { factura, lineas };
}

async function prepararSustitucionEn(db, contexto, originalId, productoId, cantidad) {
  const { rows: [producto] } = await db.query(`SELECT p.id,p.nombre,p.referencia,p.descripcion,p.cabys,p.unidad,p.activo,
    p.precio_sin_iva AS precio,p.costo_con_iva AS costo,p.impuesto_id,p.alegra_id,i.tarifa
    FROM producto p LEFT JOIN impuesto i ON i.id=p.impuesto_id WHERE p.id=$1`, [idValido(productoId)]);
  if (!producto?.activo) throw httpError(409, 'El producto sustituto no existe o está inactivo.');
  if (!(Number(producto.precio) > 0)) throw httpError(409, 'El producto sustituto todavía no tiene un precio de venta.');
  const { rows: [cliente] } = await db.query('SELECT descuento_global FROM cliente WHERE id=$1', [contexto.factura.cliente_id]);
  const ofertas = await mapaVigentesPropios(db);
  const [item] = await aplicarDescuentoEn(db, cliente || {}, [{ productoId: producto.id, precio: Number(producto.precio), descuento: ofertas.get(String(producto.id)) || 0 }],
    [producto], p => p.id);
  const descuento = Number(item.discount ?? item.descuento ?? 0);
  const armado = sustituirLineas(contexto.lineas, originalId, producto, cantidad, descuento);
  return { producto, descuento, armado };
}

async function aplicarSustitucionEn(db, contexto, propuesta, usuarioId) {
  const { factura, lineas } = contexto;
  const { armado, producto } = propuesta;
  const anteriores = new Map(lineas.map(l => [l.id, l]));
  for (const linea of armado.lineas) {
    if (linea.id && JSON.stringify(linea) === JSON.stringify(anteriores.get(linea.id))) continue;
    const columnas = COLUMNAS_LINEA.filter(c => c !== 'factura_id');
    if (linea.id) {
      await db.query(`UPDATE factura_linea SET ${columnas.map((c, i) => `${c}=$${i + 1}`).join(',')}
        WHERE id=$${columnas.length + 1} AND factura_id=$${columnas.length + 2}`,
      [...columnas.map(c => linea[c]), linea.id, factura.id]);
    } else {
      await db.query(`INSERT INTO factura_linea (${COLUMNAS_LINEA.join(',')}) VALUES (${COLUMNAS_LINEA.map((_, i) => `$${i + 1}`).join(',')})`,
        COLUMNAS_LINEA.map(c => c === 'factura_id' ? factura.id : linea[c]));
    }
  }
  await db.query(`UPDATE factura SET subtotal=$2,descuento=$3,impuesto=$4,total=$5,actualizado_en=CURRENT_TIMESTAMP WHERE id=$1`,
    [factura.id, armado.subtotal, armado.descuento, armado.impuesto, armado.total]);
  await reconciliarDocumentoEn(db, 'factura', factura.id, usuarioId);
  await registrarCambio(db, { entidad:'factura',entidadId:factura.id,accion:'editar',usuarioId,
    antes:{ total:Number(factura.total),lineas },despues:{ total:armado.total,lineas:armado.lineas },
    motivo:`Sustitución de producto en Reporte Clientes por ${producto.nombre}` });
}

module.exports = { contextoFacturaEn, prepararSustitucionEn, aplicarSustitucionEn };

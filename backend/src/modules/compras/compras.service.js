/**
 * Compras — Service.
 *
 * "Enviar a Alegra" pasa a ser "Registrar compra": una transacción propia
 * que crea la compra, mueve el costo y el precio de cada producto, y libera
 * la cuenta por pagar — sin tocar Alegra.
 *
 * EL CAMBIO DE FORMA MÁS GRANDE, frente al `enviarFacturaAlegra` que
 * reemplaza: aquel toleraba que crear la factura en Alegra fallara y
 * aplicaba los costos y precios de todos modos ("Continuar para actualizar
 * costos y precios incluso si falla la factura"). Acá eso ya no tiene
 * sentido — o entra todo en una sola transacción, o no entra nada. Una
 * compra a medio registrar es peor que una que no se intentó: deja el costo
 * de un producto actualizado sin que exista ningún comprobante que lo
 * respalde.
 *
 * SE HACE CON SQL Y NO CON PRISMA, mismo motivo que el resto de esta rama:
 * `node_modules` es un enlace al árbol de `main`/`developer`.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { calcularCostoUnitarioPropio } = require('../precios/costo');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idBuzonValido(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw httpError(400, 'Identificador de factura inválido.');
  return id;
}

function sinTiempos(fila) {
  if (!fila) return fila;
  const { creado_en: _c, actualizado_en: _a, ...resto } = fila;
  return resto;
}

/**
 * Costo y precio quedan aparte de INSERTAR la compra, a propósito: la
 * compra tiene que existir aunque una línea no tenga producto propio
 * (123 de 8.590 así, migración 020), y no todo lo que actualiza precio
 * necesita fallar la compra entera.
 */
async function actualizarProductoDeLinea(cliente, linea, precioAjustado, { compraId, usuarioId }) {
  if (!linea.producto_id) return { costoActualizado: false, precioActualizado: false };

  const { rows: previos } = await cliente.query(
    'SELECT * FROM producto WHERE id = $1 FOR UPDATE', [linea.producto_id]
  );
  const antes = previos[0];
  if (!antes) return { costoActualizado: false, precioActualizado: false }; // el producto se borró mientras tanto

  const factor = parseFloat(linea.factor_conversion) || 1;
  const { costoUnitario, costoSinIvaConDescuento } = calcularCostoUnitarioPropio(
    {
      precioUnitario: linea.precio_unitario,
      descuento: linea.descuento,
      impuesto: linea.impuesto,
      cantidad: linea.cantidad,
      totalLinea: linea.total_linea
    },
    factor
  );
  const costoSinIvaPropio = costoSinIvaConDescuento / factor;
  const costoNuevo = Math.round(costoUnitario * 100) / 100;

  const precioNuevo = precioAjustado && precioAjustado > 0 ? Math.round(precioAjustado * 100) / 100 : null;

  const cambios = precioNuevo !== null
    ? { costo_con_iva: costoNuevo, precio_sin_iva: precioNuevo }
    : { costo_con_iva: costoNuevo };

  const { rows: actualizados } = await cliente.query(
    `UPDATE producto SET costo_con_iva = $1, precio_sin_iva = COALESCE($2, precio_sin_iva),
        actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $3 RETURNING *`,
    [costoNuevo, precioNuevo, linea.producto_id]
  );
  const despues = actualizados[0];

  if (precioNuevo !== null) {
    const margen = precioNuevo > 0
      ? Math.round(((precioNuevo - costoSinIvaPropio) / precioNuevo) * 10000) / 100
      : null;
    await cliente.query(
      `INSERT INTO precio_historico (producto_id, precio_anterior, precio_nuevo, costo_al_momento, margen_resultante, origen, factura_id)
       VALUES ($1, $2, $3, $4, $5, 'compra', $6)`,
      [
        linea.producto_id,
        Number(antes.precio_sin_iva) > 0 ? Number(antes.precio_sin_iva) : null,
        precioNuevo,
        Math.round(costoSinIvaPropio * 10000) / 10000,
        margen,
        linea.factura_id
      ]
    );
  }

  await registrarCambio(cliente, {
    entidad: 'producto', entidadId: linea.producto_id, accion: 'editar',
    antes: sinTiempos(antes), despues: sinTiempos(despues), usuarioId,
    motivo: `compra ${compraId}`
  });

  return { costoActualizado: true, precioActualizado: precioNuevo !== null };
}

/**
 * Libera la cuenta por pagar de esta factura, si existe, y la cuelga de la
 * compra (migración 023).
 *
 * MISMO CÁLCULO que `pagosProveedoresService.liberarCuentaPorFactura`, pero
 * repetido en SQL crudo DENTRO de esta transacción — llamar a esa función
 * usaría la conexión de Prisma, que es OTRA conexión a la base: un rollback
 * acá no revertiría lo que esa llamada ya hubiera confirmado. Es la
 * duplicación que hay que aceptar mientras convivan las dos formas de hablar
 * con la base; se puede unificar cuando Prisma se retire de este camino.
 *
 * Una compra de CONTADO puede no tener cuenta por pagar — no es un error,
 * es la mayoría de las compras al contado.
 */
async function liberarCuentaPorPagar(cliente, facturaProveedorId, compraId) {
  const { rows } = await cliente.query(
    'SELECT * FROM cuentas_por_pagar WHERE factura_id = $1 FOR UPDATE', [facturaProveedorId]
  );
  const cxp = rows[0];
  if (!cxp) return null;

  const { rows: creditoRows } = await cliente.query(
    'SELECT COALESCE(SUM(monto), 0) AS total FROM nota_credito_aplicacion WHERE cuenta_por_pagar_id = $1',
    [cxp.id]
  );
  const credito = Number(creditoRows[0].total) || 0;
  const saldo = Math.max(0, Math.round((Number(cxp.monto_total) - credito) * 100) / 100);
  const vencida = cxp.fecha_vencimiento && new Date(cxp.fecha_vencimiento) < new Date();
  const estado = saldo <= 0 ? 'PAGADA' : (vencida ? 'VENCIDA' : 'PENDIENTE');

  const { rows: actualizada } = await cliente.query(
    `UPDATE cuentas_por_pagar
        SET liberada = true, estado = $1, saldo_pendiente = $2, compra_id = $3
      WHERE id = $4 RETURNING *`,
    [estado, saldo, compraId, cxp.id]
  );
  return actualizada[0];
}

/**
 * Registra la compra que nace de una factura del buzón ya revisada.
 *
 * @param {string} facturaProveedorId  id de `facturas_proveedores`
 * @param {Object} preciosAjustados    { [productoFacturaId]: precioNuevo }, mismo contrato que enviarFacturaAlegra
 * @param {number|null} usuarioId
 */
async function registrarCompra(facturaProveedorId, preciosAjustados = {}, usuarioId = null) {
  const id = idBuzonValido(facturaProveedorId);

  return enTransaccion(async (cliente) => {
    const { rows: facturas } = await cliente.query(
      'SELECT * FROM facturas_proveedores WHERE id = $1 FOR UPDATE', [id]
    );
    const factura = facturas[0];
    if (!factura) throw httpError(404, 'Factura no encontrada.');

    // GASTOS RECURRENTES TIENEN SU PROPIO CAMINO (checklist, ítem aparte):
    // no crean producto ni pasan por costo/precio de catálogo.
    if (factura.estado === 'GASTO_RECURRENTE') {
      throw httpError(409, `La factura ${factura.numero_consecutivo} es un gasto recurrente: no se registra por acá.`);
    }

    // NO SE REGISTRA DOS VECES. Antes la guarda era `factura.estado ===
    // 'ENVIADA'`; ahora es más directa: ¿ya existe una compra para este
    // buzón?
    const { rows: existentes } = await cliente.query(
      'SELECT id FROM compra WHERE factura_proveedor_id = $1', [id]
    );
    if (existentes[0]) {
      throw httpError(409,
        `La factura ${factura.numero_consecutivo} ya tiene una compra registrada (${existentes[0].id}). ` +
        'Volver a registrarla duplicaría el gasto.');
    }

    const { rows: proveedores } = await cliente.query(
      'SELECT id FROM proveedor WHERE identificacion = $1', [factura.proveedor_cedula]
    );
    const proveedor = proveedores[0];
    if (!proveedor) {
      throw httpError(422,
        `No hay proveedor propio con cédula ${factura.proveedor_cedula} (${factura.proveedor_nombre}). ` +
        'Hay que crearlo antes de registrar esta compra.');
    }

    const { rows: compraRows } = await cliente.query(
      `INSERT INTO compra (
         proveedor_id, clave, numero_consecutivo, fecha_emision, fecha_vencimiento, moneda, total,
         estado, factura_proveedor_id, xml_ruta, total_otros_cargos, total_descuentos,
         total_iva_devuelto, otros_cargos, registrada_por
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'registrada',$8,$9,$10,$11,$12,$13::jsonb,$14)
       RETURNING *`,
      [
        proveedor.id, factura.clave, factura.numero_consecutivo, factura.fecha_emision,
        factura.fecha_vencimiento, factura.moneda || 'CRC', factura.total_factura, id,
        factura.xml_ruta, factura.total_otros_cargos, factura.total_descuentos,
        factura.total_iva_devuelto, JSON.stringify(factura.otros_cargos || []), usuarioId
      ]
    );
    const compra = compraRows[0];
    await registrarCambio(cliente, { entidad: 'compra', entidadId: compra.id, accion: 'crear', despues: sinTiempos(compra), usuarioId });

    // Las líneas, del mismo lugar que usó la carga histórica (migración 020):
    // el buzón, con el mapeo que ya trae nuestro producto y el factor.
    const { rows: lineas } = await cliente.query(
      `SELECT l.*, m.producto_id, m.factor_conversion
         FROM productos_factura_proveedor l
         LEFT JOIN supplier_product_mapping m ON m.id = l.mapeo_id
        WHERE l.factura_id = $1
        ORDER BY l.numero_linea`,
      [id]
    );
    if (lineas.length === 0) throw httpError(422, 'Esta factura no tiene ninguna línea: no hay nada que registrar.');

    for (const l of lineas) {
      await cliente.query(
        `INSERT INTO compra_linea (
           compra_id, numero_linea, producto_id, descripcion, codigo_proveedor, codigo_cabys,
           cantidad, unidad, factor_conversion, precio_unitario, descuento, impuesto, total_linea
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          compra.id, l.numero_linea, l.producto_id, l.descripcion, l.codigo_proveedor, l.codigo_cabys,
          l.cantidad, l.unidad_medida, l.factor_conversion || 1, l.precio_unitario,
          l.descuento || 0, l.impuesto || 0, l.total_linea
        ]
      );
    }

    // INVENTARIO: NO SE MUEVE TODAVÍA. La sección 5 del checklist está
    // bloqueada por el conteo físico (bloqueo/conteo-fisico en el grafo).
    // `compra_linea.cantidad_propia` ya es una columna generada, lista para
    // cuando exista ese movimiento — este es el punto donde se engancharía.

    let costosActualizados = 0;
    let preciosActualizados = 0;
    let sinProductoPropio = 0;

    for (const l of lineas) {
      if (!l.producto_id) { sinProductoPropio++; continue; }
      const r = await actualizarProductoDeLinea(cliente, l, preciosAjustados[l.id], { compraId: compra.id, usuarioId });
      if (r.costoActualizado) costosActualizados++;
      if (r.precioActualizado) preciosActualizados++;
    }

    const cuentaLiberada = await liberarCuentaPorPagar(cliente, id, compra.id);

    // El nombre del estado se conserva por compatibilidad con las pantallas
    // que ya filtran y muestran por 'ENVIADA' — no porque algo se haya
    // enviado a ningún lado. Cambiarlo es un cambio de UI aparte, no de esta
    // transacción.
    await cliente.query(
      `UPDATE facturas_proveedores SET estado = 'ENVIADA' WHERE id = $1`, [id]
    );

    return {
      compra: sinTiempos(compra),
      lineas: lineas.length,
      costosActualizados,
      preciosActualizados,
      sinProductoPropio,
      cuentaLiberada: !!cuentaLiberada
    };
  });
}

module.exports = { registrarCompra, actualizarProductoDeLinea, liberarCuentaPorPagar };

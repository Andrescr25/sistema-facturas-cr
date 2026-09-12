/**
 * Notas de crédito propias, sin Alegra.
 *
 * Hoy se hacen a mano en Alegra (27, con motivos como "error" y "devolución").
 * Una nota de crédito es lo que permite deshacer una venta ya entregada sin
 * borrar la factura: el número de la factura se conserva —un hueco en la
 * numeración hay que explicárselo a Hacienda— y la nota dice qué se devuelve
 * y por qué.
 *
 * DECISIONES QUE NO SE VEN EN EL CÓDIGO
 *
 * 1. SE ACREDITA LO QUE SE COBRÓ, no lo que el producto vale hoy. El precio,
 *    el descuento y la tarifa salen de la LÍNEA DE LA FACTURA. Si el producto
 *    subió de precio la semana pasada, devolverlo al precio nuevo le regalaría
 *    plata al cliente; si bajó, se le quedaría debiendo.
 *
 * 2. NO SE PUEDE ACREDITAR MÁS DE LO FACTURADO. Ni en monto ni por línea: se
 *    descuenta lo que ya acreditaron otras notas vigentes. Sin esto, dos
 *    devoluciones parciales de la misma factura pueden sumar más que la venta.
 *
 * 3. UNA NOTA ANULADA NO DESAPARECE. Queda con su número y su estado, y el
 *    saldo de la factura vuelve solo, porque el saldo se calcula y no se
 *    guarda (ver facturaConsulta.service.js).
 *
 * 4. SERIE PROPIA, NO ELECTRÓNICA. Las 27 notas existentes van en la serie
 *    0010000103, que es formato de Hacienda y sigue viva; meter ahí un
 *    documento sin firmar sería un problema caro. La nuestra es 00100003 y
 *    empieza en 1 (migración independencia/012).
 *
 * TODAVÍA NO DEVUELVE AL INVENTARIO: no hay existencias propias —solo la
 * bandera `inventariable` en el producto—, porque el inventario está esperando
 * el conteo físico (sección 5 del checklist). La nota guarda la cantidad
 * devuelta por línea, que es justo lo que el inventario va a consumir cuando
 * exista. Se deja registrado, no simulado.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { tomarConsecutivo } = require('./consecutivo');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => Number(v) || 0;

const MOTIVOS = ['error', 'devolucion', 'anulacion', 'descuento', 'otro'];

/** Recorta a lo que cabe en la columna, sin reventar por un texto largo. */
function recortar(valor, largo) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s ? s.slice(0, largo) : null;
}

/**
 * La factura que se va a acreditar, con lo que ya le acreditaron.
 * Se lee con FOR UPDATE dentro de la transacción: dos devoluciones a la vez de
 * la misma factura no pueden pasar cada una su propia validación y sumar más
 * que la venta.
 */
async function traerFactura(cliente, facturaId) {
  const { rows } = await cliente.query(
    `SELECT f.*,
            COALESCE((SELECT SUM(nf.monto)
                        FROM nota_credito_factura nf
                        JOIN nota_credito nc ON nc.id = nf.nota_credito_id
                       WHERE nf.factura_id = f.id AND nc.estado <> 'anulada'), 0) AS ya_acreditado
       FROM factura f
      WHERE f.id = $1
      FOR UPDATE`,
    [facturaId]
  );

  const factura = rows[0];
  if (!factura) throw httpError(404, 'No existe esa factura.');
  if (factura.estado === 'anulada') {
    throw httpError(409, `La factura ${factura.numero} está anulada: no hay nada que acreditar.`);
  }
  if (factura.estado !== 'emitida') {
    throw httpError(409, `La factura ${factura.numero} todavía es un borrador. Emítala antes de acreditarla.`);
  }
  return factura;
}

/** Las líneas de la factura, con lo que ya se devolvió de cada una. */
async function traerLineas(cliente, facturaId) {
  const { rows } = await cliente.query(
    `SELECT l.*,
            COALESCE((SELECT SUM(ncl.cantidad)
                        FROM nota_credito_linea ncl
                        JOIN nota_credito nc ON nc.id = ncl.nota_credito_id
                        JOIN nota_credito_factura nf ON nf.nota_credito_id = nc.id
                       WHERE nf.factura_id = l.factura_id
                         AND ncl.producto_id IS NOT DISTINCT FROM l.producto_id
                         AND ncl.numero_linea = l.numero_linea
                         AND nc.estado <> 'anulada'), 0) AS ya_devuelto
       FROM factura_linea l
      WHERE l.factura_id = $1
      ORDER BY l.numero_linea`,
    [facturaId]
  );
  return rows;
}

/**
 * Arma las líneas de la nota a partir de las de la factura.
 *
 * `pedidas` es [{ numeroLinea, cantidad }]. Si viene vacío, se devuelve TODO
 * lo que quede por devolver de cada línea.
 */
function armarLineas(lineasFactura, pedidas) {
  const porNumero = new Map(lineasFactura.map(l => [Number(l.numero_linea), l]));
  const completa = !pedidas || pedidas.length === 0;

  const elegidas = completa
    ? lineasFactura.map(l => ({ numeroLinea: Number(l.numero_linea), cantidad: num(l.cantidad) - num(l.ya_devuelto) }))
    : pedidas.map(p => ({ numeroLinea: Number(p.numeroLinea), cantidad: num(p.cantidad) }));

  const lineas = [];
  let subtotal = 0;
  let descuentoTotal = 0;
  let impuestoTotal = 0;

  for (const elegida of elegidas) {
    const original = porNumero.get(elegida.numeroLinea);
    if (!original) {
      throw httpError(400, `La factura no tiene una línea ${elegida.numeroLinea}.`);
    }

    const cantidad = dinero(elegida.cantidad);
    if (completa && cantidad <= 0) continue;      // ya se devolvió entera
    if (cantidad <= 0) {
      throw httpError(400, `La cantidad a devolver de "${original.nombre}" tiene que ser mayor que cero.`);
    }

    const disponible = num(original.cantidad) - num(original.ya_devuelto);
    if (cantidad > disponible + 0.0001) {
      throw httpError(409,
        `De "${original.nombre}" se facturaron ${num(original.cantidad)} y ya se devolvieron ` +
        `${num(original.ya_devuelto)}: no se pueden devolver ${cantidad}.`);
    }

    // El precio, el descuento y la tarifa son los de la FACTURA. Acreditar al
    // precio de hoy le regalaría plata al cliente o se la quedaría debiendo.
    const precio = num(original.precio_unitario);
    const porcentajeDescuento = num(original.descuento_porcentaje);
    const bruto = cantidad * precio;
    const descuento = dinero(bruto * porcentajeDescuento / 100);
    const base = dinero(bruto - descuento);
    const tarifa = num(original.tarifa);
    const impuesto = dinero(base * tarifa / 100);

    subtotal += base;
    descuentoTotal += descuento;
    impuestoTotal += impuesto;

    lineas.push({
      numero_linea: elegida.numeroLinea,
      producto_id: original.producto_id,
      nombre: recortar(original.nombre, 250),
      referencia: recortar(original.referencia, 100),
      descripcion: original.descripcion,
      cabys: original.cabys,
      unidad: recortar(original.unidad, 20),
      cantidad,
      precio_unitario: precio,
      descuento_porcentaje: porcentajeDescuento,
      descuento_monto: descuento,
      impuesto_id: original.impuesto_id,
      tarifa,
      impuesto_monto: impuesto,
      total: dinero(base + impuesto),
      alegra_item_id: original.alegra_item_id
    });
  }

  if (lineas.length === 0) {
    throw httpError(409, 'No queda nada por devolver de esa factura.');
  }

  return {
    lineas,
    subtotal: dinero(subtotal),
    descuento: dinero(descuentoTotal),
    impuesto: dinero(impuestoTotal),
    total: dinero(subtotal + impuestoTotal)
  };
}

/**
 * Crear una nota de crédito contra una factura.
 *
 * @param {object} datos
 * @param {number} datos.facturaId
 * @param {string} datos.motivo        error | devolucion | anulacion | descuento | otro
 * @param {string} datos.motivoTexto   lo que escribió quien la hace
 * @param {Array}  datos.lineas        [{numeroLinea, cantidad}]; vacío = todo lo que quede
 */
async function crearNotaCredito(datos = {}, usuarioId = null) {
  const facturaId = idValido(datos.facturaId);

  const motivo = String(datos.motivo || '').trim();
  if (!MOTIVOS.includes(motivo)) {
    throw httpError(400, `El motivo tiene que ser uno de: ${MOTIVOS.join(', ')}.`);
  }
  // El motivo escrito no es decoración: en las 27 notas viejas hay 4 sin
  // ninguno y nadie sabe hoy por qué se hicieron.
  const motivoTexto = recortar(datos.motivoTexto, 120);
  if (!motivoTexto) {
    throw httpError(400, 'Escriba por qué se hace la nota de crédito.');
  }

  return enTransaccion(async (cliente) => {
    const factura = await traerFactura(cliente, facturaId);
    const lineasFactura = await traerLineas(cliente, facturaId);
    const armado = armarLineas(lineasFactura, datos.lineas);

    // Ni un colón por encima de lo facturado, contando lo ya acreditado.
    const porAcreditar = dinero(num(factura.total) - num(factura.ya_acreditado));
    if (armado.total > porAcreditar + 0.01) {
      throw httpError(409,
        `La factura ${factura.numero} es de ₡${num(factura.total)} y ya tiene ₡${num(factura.ya_acreditado)} ` +
        `acreditados: no se pueden acreditar ₡${armado.total} más.`);
    }

    const serie = await tomarConsecutivo(cliente, 'nota_credito', { electronica: false });

    const { rows } = await cliente.query(
      `INSERT INTO nota_credito
         (serie, consecutivo, numero, electronica, estado, fecha,
          cliente_id, cliente_nombre, cliente_identificacion,
          motivo, motivo_texto, subtotal, descuento, impuesto, total,
          total_aplicado, saldo, observaciones, creado_por)
       VALUES ($1, $2, $3, FALSE, 'emitida', CURRENT_DATE,
               $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, 0, $13, $14)
       RETURNING *`,
      [
        serie.serie, serie.consecutivo, serie.numero,
        factura.cliente_id, recortar(factura.cliente_nombre, 200), recortar(factura.cliente_identificacion, 20),
        motivo, motivoTexto,
        armado.subtotal, armado.descuento, armado.impuesto, armado.total,
        recortar(datos.observaciones, 2000), usuarioId
      ]
    );
    const nota = rows[0];

    for (const l of armado.lineas) {
      await cliente.query(
        `INSERT INTO nota_credito_linea
           (nota_credito_id, numero_linea, producto_id, nombre, referencia, descripcion, cabys, unidad,
            cantidad, precio_unitario, descuento_porcentaje, descuento_monto,
            impuesto_id, tarifa, impuesto_monto, total, alegra_item_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          nota.id, l.numero_linea, l.producto_id, l.nombre, l.referencia, l.descripcion, l.cabys, l.unidad,
          l.cantidad, l.precio_unitario, l.descuento_porcentaje, l.descuento_monto,
          l.impuesto_id, l.tarifa, l.impuesto_monto, l.total, l.alegra_item_id
        ]
      );
    }

    // La nota se aplica entera a la factura que la origina.
    await cliente.query(
      `INSERT INTO nota_credito_factura (nota_credito_id, factura_id, factura_numero, monto)
       VALUES ($1, $2, $3, $4)`,
      [nota.id, factura.id, factura.numero, armado.total]
    );

    await registrarCambio(cliente, {
      entidad: 'nota_credito', entidadId: nota.id, accion: 'crear',
      despues: {
        numero: nota.numero, factura: factura.numero, motivo,
        total: armado.total, lineas: armado.lineas.length
      },
      usuarioId
    });

    return { ...nota, lineas: armado.lineas, factura: { id: factura.id, numero: factura.numero } };
  });
}

/**
 * Anular una nota de crédito. No borra: conserva su número y su estado, y el
 * saldo de la factura vuelve solo porque se calcula.
 */
async function anularNotaCredito(id, { motivo } = {}, usuarioId = null) {
  const notaId = idValido(id);
  const razon = recortar(motivo, 120);
  if (!razon) throw httpError(400, 'Escriba por qué se anula la nota de crédito.');

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query('SELECT * FROM nota_credito WHERE id = $1 FOR UPDATE', [notaId]);
    const nota = rows[0];
    if (!nota) throw httpError(404, 'No existe esa nota de crédito.');
    // Anular lo ya anulado no es un error: el resultado es el que se pedía.
    if (nota.estado === 'anulada') return nota;

    const { rows: actualizada } = await cliente.query(
      `UPDATE nota_credito
          SET estado = 'anulada',
              observaciones = TRIM(COALESCE(observaciones, '') || E'\\nAnulada: ' || $2),
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $1
      RETURNING *`,
      [notaId, razon]
    );

    await registrarCambio(cliente, {
      entidad: 'nota_credito', entidadId: notaId, accion: 'anular',
      antes: { estado: nota.estado },
      despues: { estado: 'anulada', motivo: razon },
      usuarioId
    });

    return actualizada[0];
  });
}

module.exports = { crearNotaCredito, anularNotaCredito, armarLineas, MOTIVOS };

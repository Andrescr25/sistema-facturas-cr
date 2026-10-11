/**
 * Notas de crédito de proveedor.
 *
 * Una NC acredita una factura anterior y baja lo que se le debe al proveedor
 * por esa factura. Solo toca DINERO: el inventario queda a criterio de una
 * persona (ver `inventario_revisado`), porque el XML no permite distinguir
 * una devolución física de una corrección de precio — hay notas con razón
 * "no sirve precio" que igual listan las unidades.
 *
 * El vínculo con la factura es `clave_referencia` (InformacionReferencia.Numero
 * del XML) contra `facturas_proveedores.clave`.
 *
 * OJO con la tabla: existe también una `facturas` legacy (id integer, 1734
 * filas) que TAMBIÉN tiene columna `clave`. La que usa este módulo — y a la
 * que apunta cuentas_por_pagar.factura_id — es `facturas_proveedores`
 * (id uuid), que es donde mapea el modelo Factura de Prisma.
 */

const { query } = require('../config/database');
const almacenamiento = require('../src/integrations/almacenamiento');

/**
 * Guarda una NC ya parseada. Idempotente por la clave: si el mismo correo se
 * reprocesa (el monitoreo relee 30 días cada vez), no duplica ni revierte el
 * estado de aplicación.
 *
 * `xmlRuta` es la ruta del XML ya guardado en almacenamiento privado (ver
 * `emailService.saveXmlAttachment`). Con `ON CONFLICT DO NOTHING`, si la
 * nota ya existía el `INSERT` no toca nada y el XML recién guardado queda
 * huérfano — por eso se borra cuando `result.rows.length === 0`.
 */
async function guardarNotaCredito(nc, xmlRuta = null) {
  const result = await query(`
    INSERT INTO nota_credito_proveedor
      (clave, clave_referencia, numero_consecutivo, proveedor_nombre, proveedor_cedula,
       fecha_emision, monto_total, moneda, razon, codigo_referencia, lineas, xml_ruta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (clave) DO NOTHING
    RETURNING id;
  `, [
    nc.clave,
    nc.claveReferencia,
    nc.numeroConsecutivo || null,
    nc.emisor.nombre,
    nc.emisor.identificacion?.numero || '',
    nc.fechaEmision?.iso || new Date(),
    nc.montoTotal,
    nc.moneda || 'CRC',
    nc.razon || null,
    nc.codigoReferencia || null,
    JSON.stringify(nc.lineas || []),
    xmlRuta
  ]);

  const guardada = result.rows.length > 0;
  if (!guardada && xmlRuta) await almacenamiento.borrarPrivado(xmlRuta).catch(() => {});

  return { guardada, id: result.rows[0]?.id || null };
}

/**
 * Aplica al saldo las notas de crédito que todavía no se aplicaron y cuya
 * factura ya existe en el sistema.
 *
 * Se reintenta en cada corrida a propósito: una NC puede llegar por correo
 * antes que su factura (o la factura puede no haberse liberado todavía), y
 * en ese caso queda pendiente hasta que aparezca en vez de perderse.
 *
 * El saldo nunca baja de 0 — si el crédito supera lo que queda por pagar, se
 * consume lo que hay y el excedente queda reportado, no restado de más.
 */
async function aplicarNotasCreditoPendientes() {
  const pendientes = await query(`
    SELECT nc.*, cxp.id AS cuenta_id, v.saldo AS saldo_pendiente, cxp.monto_total AS cuenta_monto,
           cxp.numero_consecutivo AS cuenta_consecutivo
    FROM nota_credito_proveedor nc
    JOIN facturas_proveedores f ON f.clave = nc.clave_referencia
    JOIN cuentas_por_pagar cxp ON cxp.factura_id = f.id
    -- El saldo se calcula (migración 025): la columna saldo_pendiente ya no
    -- es la fuente.
    JOIN cuenta_por_pagar_saldo v ON v.id = cxp.id
    WHERE nc.aplicada = FALSE
      -- Una nota eliminada NO se vuelve a aplicar: sin esto, el correo la
      -- reingresa y le resta el saldo a la factura por segunda vez.
      AND nc.eliminada_en IS NULL
    ORDER BY nc.fecha_emision ASC;
  `);

  const aplicadas = [];
  // El saldo se leyó UNA vez, antes del ciclo. Si dos notas de la misma
  // corrida acreditan la misma factura, la segunda tiene que ver lo que dejó
  // la primera — si no, entre las dos descuentan más que el saldo.
  const saldoPorCuenta = new Map();

  for (const nc of pendientes.rows) {
    const saldoActual = saldoPorCuenta.has(nc.cuenta_id)
      ? saldoPorCuenta.get(nc.cuenta_id)
      : Number(nc.saldo_pendiente);
    const credito = Number(nc.monto_total);
    const yaAplicado = Number(nc.monto_aplicado) || 0;
    const porAplicar = Math.round((credito - yaAplicado) * 100) / 100;

    const aplicado = Math.min(porAplicar, saldoActual);

    // Si la factura ya está pagada no hay nada que descontar. La nota NO se
    // marca como aplicada: el crédito sigue vivo como saldo a favor del
    // proveedor hasta que haya contra qué aplicarlo. Marcarla acá haría
    // desaparecer plata real (pasó con 3 notas por ₡177.195 antes de este
    // arreglo).
    if (aplicado <= 0) continue;

    const acumulado = Math.round((yaAplicado + aplicado) * 100) / 100;
    const quedaPendiente = Math.round((credito - acumulado) * 100) / 100;

    const nuevoSaldo = await registrarAplicacion({
      notaId: nc.id,
      cuentaId: nc.cuenta_id,
      monto: aplicado,
      saldoActual,
      origen: 'automatica'
    });
    saldoPorCuenta.set(nc.cuenta_id, nuevoSaldo);

    aplicadas.push({
      clave: nc.clave,
      proveedor: nc.proveedor_nombre,
      facturaConsecutivo: nc.cuenta_consecutivo,
      credito,
      aplicado,
      saldoAnterior: saldoActual,
      saldoNuevo: nuevoSaldo,
      quedaPendiente,
      razon: nc.razon
    });

    console.log(`💳 NC aplicada: ${nc.proveedor_nombre} · ₡${aplicado} sobre factura ${nc.cuenta_consecutivo} → saldo ₡${nuevoSaldo}${quedaPendiente > 0 ? ` (₡${quedaPendiente} queda a favor)` : ''}`);
  }

  return aplicadas;
}

/**
 * Notas que no se pudieron aplicar todavía porque su factura no está en el
 * sistema. Es lo que hay que mirar cuando un saldo "no cuadra".
 */
async function listarHuerfanas() {
  const result = await query(`
    SELECT nc.clave, nc.clave_referencia, nc.proveedor_nombre, nc.monto_total,
           nc.fecha_emision, nc.razon,
           EXISTS (SELECT 1 FROM facturas_proveedores f WHERE f.clave = nc.clave_referencia) AS factura_existe
    FROM nota_credito_proveedor nc
    WHERE nc.aplicada = FALSE
      AND nc.eliminada_en IS NULL
    ORDER BY nc.fecha_emision DESC;
  `);

  return result.rows.map(r => ({
    clave: r.clave,
    claveReferencia: r.clave_referencia,
    proveedor: r.proveedor_nombre,
    monto: Number(r.monto_total),
    fechaEmision: r.fecha_emision,
    razon: r.razon,
    // Si la factura existe pero sigue sin aplicarse, es porque todavía no
    // tiene cuenta por pagar (factura no liberada).
    motivo: r.factura_existe
      ? 'La factura existe pero aún no tiene cuenta por pagar (sin liberar)'
      : 'La factura referenciada no está en el sistema'
  }));
}

/**
 * Notas aplicadas a una cuenta por pagar, para mostrarlas junto al saldo.
 */
async function listarPorCuentas(cuentaIds) {
  if (!cuentaIds || cuentaIds.length === 0) return new Map();

  // Del registro de aplicaciones y no del vínculo de la nota: una misma nota
  // puede estar repartida en varias facturas, y cada una tiene que ver solo
  // lo que se le descontó a ella.
  const result = await query(`
    SELECT a.cuenta_por_pagar_id, a.monto AS monto_aplicado, a.origen,
           nc.id, nc.clave, nc.numero_consecutivo, nc.monto_total,
           nc.razon, nc.fecha_emision, nc.lineas, nc.inventario_revisado
    FROM nota_credito_aplicacion a
    JOIN nota_credito_proveedor nc ON nc.id = a.nota_credito_id
    WHERE a.cuenta_por_pagar_id = ANY($1::uuid[])
      AND nc.eliminada_en IS NULL
    ORDER BY a.created_at ASC;
  `, [cuentaIds]);

  const porCuenta = new Map();
  for (const r of result.rows) {
    if (!porCuenta.has(r.cuenta_por_pagar_id)) porCuenta.set(r.cuenta_por_pagar_id, []);
    porCuenta.get(r.cuenta_por_pagar_id).push({
      id: r.id,
      clave: r.clave,
      numeroConsecutivo: r.numero_consecutivo,
      // `monto` es lo que de verdad se descontó del saldo — es lo que tiene
      // que cuadrar con el número que ve el usuario.
      monto: Number(r.monto_aplicado),
      montoNota: Number(r.monto_total),
      razon: r.razon,
      fechaEmision: r.fecha_emision,
      lineas: r.lineas || [],
      inventarioRevisado: r.inventario_revisado
    });
  }
  return porCuenta;
}

/**
 * Crédito que quedó sin aplicar, agrupado por proveedor: plata que te deben
 * y que se puede descontar de una próxima factura de ese proveedor. Sale de
 * las notas contra facturas ya pagadas o de excedentes.
 */
async function saldosAFavor() {
  const result = await query(`
    SELECT id, clave, numero_consecutivo, proveedor_cedula, proveedor_nombre,
           monto_total, monto_aplicado, fecha_emision, razon, clave_referencia, lineas,
           (monto_total - monto_aplicado) AS disponible,
           EXISTS (
             SELECT 1 FROM cuentas_por_pagar c
             JOIN cuenta_por_pagar_saldo v ON v.id = c.id
             WHERE c.proveedor_cedula = nota_credito_proveedor.proveedor_cedula
               AND c.liberada = TRUE AND v.saldo > 0
           ) AS hay_donde_aplicar
    FROM nota_credito_proveedor
    WHERE monto_total > monto_aplicado
      AND eliminada_en IS NULL
    ORDER BY (monto_total - monto_aplicado) DESC;
  `);

  const notas = result.rows.map(r => ({
    id: r.id,
    clave: r.clave,
    numeroConsecutivo: r.numero_consecutivo,
    proveedorCedula: r.proveedor_cedula,
    proveedorNombre: r.proveedor_nombre,
    montoTotal: Number(r.monto_total),
    montoAplicado: Number(r.monto_aplicado),
    disponible: Number(r.disponible),
    fechaEmision: r.fecha_emision,
    razon: r.razon,
    claveReferencia: r.clave_referencia,
    lineas: r.lineas || [],
    hayDondeAplicar: r.hay_donde_aplicar
  }));

  // Agrupado por proveedor para el resumen, y el detalle para poder actuar
  // sobre cada nota.
  const porProveedor = new Map();
  for (const n of notas) {
    if (!porProveedor.has(n.proveedorCedula)) {
      porProveedor.set(n.proveedorCedula, {
        proveedorCedula: n.proveedorCedula,
        proveedorNombre: n.proveedorNombre,
        aFavor: 0,
        notas: []
      });
    }
    const g = porProveedor.get(n.proveedorCedula);
    g.aFavor = Math.round((g.aFavor + n.disponible) * 100) / 100;
    g.notas.push(n);
  }

  return [...porProveedor.values()].sort((a, b) => b.aFavor - a.aFavor);
}

/**
 * Deja registrada la aplicación de `monto` de una nota a una cuenta. Es el
 * único punto que aplica notas de crédito — automática o manual pasan por
 * acá para que el registro quede siempre completo. El saldo de la cuenta no
 * se toca: se calcula a partir de este registro (vista cuenta_por_pagar_saldo).
 */
async function registrarAplicacion({ notaId, cuentaId, monto, saldoActual, origen }) {
  const nuevoSaldo = Math.round((saldoActual - monto) * 100) / 100;

  await query(`
    INSERT INTO nota_credito_aplicacion (nota_credito_id, cuenta_por_pagar_id, monto, origen)
    VALUES ($1, $2, $3, $4);
  `, [notaId, cuentaId, monto, origen]);

  await query(`
    UPDATE nota_credito_proveedor
    SET monto_aplicado = monto_aplicado + $1,
        aplicada = (monto_aplicado + $1) >= monto_total,
        fecha_aplicacion = CURRENT_TIMESTAMP,
        cuenta_por_pagar_id = COALESCE(cuenta_por_pagar_id, $2)
    WHERE id = $3;
  `, [monto, cuentaId, notaId]);

  return nuevoSaldo;
}

/**
 * Facturas del mismo proveedor a las que se le puede aplicar el crédito que
 * le queda a una nota. Solo cuentas liberadas y con saldo: aplicar contra una
 * factura ya pagada sería volver a perder el crédito.
 */
async function cuentasCandidatas(notaId) {
  const nota = await query(`SELECT * FROM nota_credito_proveedor WHERE id = $1;`, [notaId]);
  if (nota.rows.length === 0) {
    const e = new Error('Nota de crédito no encontrada.');
    e.status = 404;
    throw e;
  }
  const n = nota.rows[0];
  const disponible = Math.round((Number(n.monto_total) - Number(n.monto_aplicado)) * 100) / 100;

  const cuentas = await query(`
    SELECT cxp.id, cxp.numero_consecutivo, cxp.monto_total, v.saldo AS saldo_pendiente,
           cxp.fecha_emision, cxp.fecha_vencimiento, v.estado
    FROM cuentas_por_pagar cxp
    JOIN cuenta_por_pagar_saldo v ON v.id = cxp.id
    WHERE cxp.proveedor_cedula = $1 AND cxp.liberada = TRUE AND v.saldo > 0
    ORDER BY cxp.fecha_vencimiento ASC;
  `, [n.proveedor_cedula]);

  return {
    nota: {
      id: n.id,
      proveedorNombre: n.proveedor_nombre,
      montoTotal: Number(n.monto_total),
      montoAplicado: Number(n.monto_aplicado),
      disponible,
      razon: n.razon
    },
    cuentas: cuentas.rows.map(c => ({
      id: c.id,
      numeroConsecutivo: c.numero_consecutivo,
      montoTotal: Number(c.monto_total),
      saldoPendiente: Number(c.saldo_pendiente),
      fechaEmision: c.fecha_emision,
      fechaVencimiento: c.fecha_vencimiento,
      estado: c.estado,
      // Cuánto de esta nota entraría en esta factura.
      aplicaria: Math.min(disponible, Number(c.saldo_pendiente))
    }))
  };
}

/**
 * Aplica a mano el crédito restante de una nota a la factura que se elija.
 * Sirve para los créditos que quedaron a favor porque su factura original ya
 * estaba pagada.
 */
async function aplicarNotaACuenta(notaId, cuentaId, montoSolicitado) {
  const nota = await query(`SELECT * FROM nota_credito_proveedor WHERE id = $1;`, [notaId]);
  if (nota.rows.length === 0) {
    const e = new Error('Nota de crédito no encontrada.');
    e.status = 404;
    throw e;
  }
  const n = nota.rows[0];
  const disponible = Math.round((Number(n.monto_total) - Number(n.monto_aplicado)) * 100) / 100;
  if (disponible <= 0) {
    const e = new Error('Esta nota ya se aplicó por completo.');
    e.status = 400;
    throw e;
  }

  const cuenta = await query(`
    SELECT c.*, v.saldo AS saldo_pendiente
      FROM cuentas_por_pagar c
      JOIN cuenta_por_pagar_saldo v ON v.id = c.id
     WHERE c.id = $1;`, [cuentaId]);
  if (cuenta.rows.length === 0) {
    const e = new Error('Cuenta por pagar no encontrada.');
    e.status = 404;
    throw e;
  }
  const c = cuenta.rows[0];
  const saldo = Number(c.saldo_pendiente);
  if (saldo <= 0) {
    const e = new Error('Esa factura ya está pagada, no hay saldo que descontar.');
    e.status = 400;
    throw e;
  }
  if (c.proveedor_cedula !== n.proveedor_cedula) {
    const e = new Error('La nota es de otro proveedor. Un crédito solo se puede aplicar a facturas del mismo proveedor.');
    e.status = 400;
    throw e;
  }

  // Nunca más de lo disponible ni más de lo que la factura debe.
  const pedido = montoSolicitado ? Number(montoSolicitado) : disponible;
  const monto = Math.round(Math.min(pedido, disponible, saldo) * 100) / 100;
  if (!Number.isFinite(monto) || monto <= 0) {
    const e = new Error('Monto a aplicar inválido.');
    e.status = 400;
    throw e;
  }

  const nuevoSaldo = await registrarAplicacion({
    notaId, cuentaId, monto, saldoActual: saldo, origen: 'manual'
  });

  return {
    aplicado: monto,
    saldoAnterior: saldo,
    saldoNuevo: nuevoSaldo,
    quedaAFavor: Math.round((disponible - monto) * 100) / 100,
    facturaConsecutivo: c.numero_consecutivo
  };
}

/**
 * Elimina una nota de crédito DEVOLVIENDO a las facturas todo lo que se les
 * había descontado. Sin ese reverso, borrar una nota aplicada dejaría las
 * facturas con un saldo rebajado sin ninguna razón que lo respalde — y se
 * terminaría pagando de menos sin saber por qué.
 *
 * SE MARCA, NO SE BORRA
 * Antes era un DELETE de verdad, y la nota volvía sola: el monitoreo relee
 * los últimos 30 días de correo en cada corrida y guardarNotaCredito inserta
 * con ON CONFLICT (clave) DO NOTHING — sin la fila no hay conflicto que
 * frene nada. Peor todavía, al volver entraba como pendiente y
 * aplicarNotasCreditoPendientes le restaba el monto al saldo OTRA VEZ. Es
 * decir: borrar una nota equivocada terminaba, minutos después, con la nota
 * de vuelta y el saldo rebajado de nuevo.
 *
 * Dejando la fila con `eliminada_en`, la clave sigue ocupada y el correo
 * puede releerse las veces que sea. Y para un documento fiscal el rastro es
 * lo correcto: si alguien pregunta por qué cambió el saldo de una factura,
 * queda registrado que hubo una nota y que se descartó.
 */
async function eliminarNotaCredito(id) {
  const nota = await query(`SELECT * FROM nota_credito_proveedor WHERE id = $1;`, [id]);
  if (nota.rows.length === 0) {
    const e = new Error('Nota de crédito no encontrada.');
    e.status = 404;
    throw e;
  }
  // Eliminarla dos veces devolvería el saldo dos veces, inventando deuda.
  if (nota.rows[0].eliminada_en) {
    const e = new Error('Esa nota de crédito ya estaba eliminada.');
    e.status = 400;
    throw e;
  }

  const aplicaciones = await query(
    `SELECT cuenta_por_pagar_id, monto FROM nota_credito_aplicacion WHERE nota_credito_id = $1;`,
    [id]
  );

  // Borrar las aplicaciones ES devolverles el crédito a las facturas: el
  // saldo se calcula a partir de ellas (vista cuenta_por_pagar_saldo), así
  // que no hay ningún saldo que restaurar a mano — ni forma de restaurarlo
  // dos veces.
  await query(`DELETE FROM nota_credito_aplicacion WHERE nota_credito_id = $1;`, [id]);

  const cuentaIds = aplicaciones.rows.map((a) => a.cuenta_por_pagar_id);
  const despues = cuentaIds.length === 0 ? { rows: [] } : await query(`
    SELECT c.id, c.numero_consecutivo, v.saldo
      FROM cuentas_por_pagar c
      JOIN cuenta_por_pagar_saldo v ON v.id = c.id
     WHERE c.id = ANY($1::uuid[]);`, [cuentaIds]);
  const porId = new Map(despues.rows.map((r) => [r.id, r]));
  const revertidas = aplicaciones.rows
    .filter((a) => porId.has(a.cuenta_por_pagar_id))
    .map((a) => ({
      factura: porId.get(a.cuenta_por_pagar_id).numero_consecutivo,
      devuelto: Number(a.monto),
      saldoRestaurado: Number(porId.get(a.cuenta_por_pagar_id).saldo)
    }));

  // La nota se marca. El monto aplicado vuelve a 0 y deja de estar aplicada,
  // para que ninguna vista la siga contando.
  await query(`
    UPDATE nota_credito_proveedor
    SET eliminada_en = CURRENT_TIMESTAMP,
        aplicada = FALSE,
        monto_aplicado = 0
    WHERE id = $1;
  `, [id]);

  return {
    eliminada: true,
    clave: nota.rows[0].clave,
    proveedor: nota.rows[0].proveedor_nombre,
    revertidas
  };
}

async function marcarInventarioRevisado(id, revisado = true) {
  const result = await query(
    `UPDATE nota_credito_proveedor SET inventario_revisado = $1 WHERE id = $2 RETURNING clave;`,
    [Boolean(revisado), id]
  );
  if (result.rows.length === 0) {
    const error = new Error('Nota de crédito no encontrada.');
    error.status = 404;
    throw error;
  }
  return { ok: true };
}

module.exports = {
  guardarNotaCredito,
  aplicarNotasCreditoPendientes,
  listarHuerfanas,
  listarPorCuentas,
  saldosAFavor,
  cuentasCandidatas,
  aplicarNotaACuenta,
  eliminarNotaCredito,
  marcarInventarioRevisado
};

/**
 * Impresión sobre la factura PROPIA (sección 11 del checklist, paso 3; rama
 * independencia-alegra, 2026-09-30).
 *
 * Una factura de la cola se procesa así: se le rebaja lo que no llegó, se le
 * ponen los precios del catálogo (los de Revisión de Precios) y se marca como
 * impresa. Antes todo eso se hacía en Alegra, por el id de Alegra; ahora se
 * edita la factura propia con la MISMA edición de Facturación
 * (`editarFacturaEn`: no se puede si es electrónica, si tiene cobros o una
 * nota de crédito) y la cola se marca en la misma transacción.
 *
 * LO QUE SE REBAJA. Cada faltante recuerda cuánto se le quitó ya a la factura
 * (`faltantes.cantidad_rebajada`, migración 033), y procesar aplica solo la
 * diferencia. Antes se calculaba sobre la cantidad de hoy: una factura
 * recuperada y vuelta a procesar se rebajaba dos veces.
 *
 *   llegó todo  → no se rebaja nada
 *   llegó parte → lo que faltó (faltante − entregado)
 *   no llegó, o sin respuesta → el faltante entero: nada confirma que se entregó
 *
 * LOS PRECIOS. Se usa `producto.precio_sin_iva` —sin IVA, como el de la línea—
 * salvo en las que Bodega despachó completas ('sin_pendientes'), que solo se
 * imprimen. En la pantalla de edición la propuesta ya trae esos precios y lo
 * que se guarda respeta el precio escrito a mano. Las líneas que nadie tocó
 * consultan de nuevo el maestro al guardar: puede cambiar después de abrir
 * la propuesta. Los clientes anteriores, sin bandera, conservan su precio.
 */

const { query, pool } = require('../../../config/database');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { editarFacturaEn } = require('../facturacion/facturaPropia.service');
const { obtenerFactura } = require('../facturacion/facturaConsulta.service');
const { generarPdfFactura } = require('../facturacion/factura.pdf');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function idDeFactura(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Factura inválida.');
  return id;
}

const numero = (v) => Number(v) || 0;

/** Cuánto hay que haber rebajado de la factura por un faltante, según lo que llegó. */
function rebajaObjetivo({ cantidad_faltante, estado, cantidad_entregada }) {
  const faltante = numero(cantidad_faltante);
  if (estado === 'completo') return 0;
  if (estado === 'parcial') return Math.max(faltante - numero(cantidad_entregada), 0);
  return faltante;
}

/**
 * Las líneas como deberían quedar: las de hoy, con la diferencia de cada
 * faltante aplicada y, si toca, el precio del catálogo. Pura, para probarla.
 *
 * Una diferencia negativa (después llegó más de lo que se había rebajado) se
 * le devuelve a la línea; si la línea ya no estaba, vuelve con el precio del
 * catálogo.
 */
function proponerLineas(lineas, faltantes, { actualizarPrecios }) {
  const propuesta = lineas.map((l) => ({
    productoId: l.producto_id,
    nombre: l.nombre,
    referencia: l.referencia,
    nota: l.descripcion ?? null,
    cantidadOriginal: numero(l.cantidad),
    cantidad: numero(l.cantidad),
    precioOriginal: numero(l.precio_unitario),
    precio: actualizarPrecios && numero(l.precio_catalogo) > 0 ? numero(l.precio_catalogo) : numero(l.precio_unitario),
    descuento: numero(l.descuento_porcentaje),
    tarifa: numero(l.tarifa),
    rebaja: 0,
    agregada: false
  }));

  for (const f of faltantes) {
    let diferencia = rebajaObjetivo(f) - numero(f.cantidad_rebajada);
    if (diferencia > 0) {
      for (const l of propuesta) {
        if (diferencia <= 0) break;
        if (l.productoId !== f.producto_id) continue;
        const quita = Math.min(l.cantidad, diferencia);
        l.cantidad -= quita;
        l.rebaja += quita;
        diferencia -= quita;
      }
    } else if (diferencia < 0) {
      const devolver = -diferencia;
      const linea = propuesta.find((l) => l.productoId === f.producto_id);
      if (linea) {
        linea.cantidad += devolver;
        linea.rebaja -= devolver;
      } else {
        propuesta.push({
          productoId: f.producto_id, nombre: f.nombre, referencia: f.referencia, nota: null,
          cantidadOriginal: 0, cantidad: devolver, precioOriginal: null, precio: numero(f.precio_catalogo),
          descuento: 0, tarifa: numero(f.tarifa), rebaja: diferencia, agregada: true
        });
      }
    }
  }
  return propuesta;
}

/** ¿Las líneas finales son distintas de las de hoy? Si no, no se edita nada. */
function cambiaron(actuales, finales) {
  if (actuales.length !== finales.length) return true;
  return actuales.some((a, i) => {
    const f = finales[i];
    return a.producto_id !== f.productoId ||
      numero(a.cantidad) !== numero(f.cantidad) ||
      numero(a.precio_unitario) !== numero(f.precio) ||
      numero(a.descuento_porcentaje) !== numero(f.descuento) ||
      (a.descripcion ?? null) !== (f.nota ?? null);
  });
}

/** Las líneas que manda la pantalla de edición, validadas. Las de cantidad 0 se quitan. */
function lineasDePantalla(lineas) {
  if (!Array.isArray(lineas)) throw httpError(400, 'No vinieron las líneas de la factura.');
  return lineas.map((l, i) => {
    const productoId = Number(l.productoId);
    if (!Number.isInteger(productoId) || productoId <= 0) throw httpError(400, `La línea ${i + 1} no tiene un producto del catálogo.`);
    const cantidad = Number(l.cantidad);
    const precio = Number(l.precio);
    if (!Number.isFinite(cantidad) || cantidad < 0) throw httpError(400, `La línea ${i + 1}: la cantidad no es válida.`);
    if (!Number.isFinite(precio) || precio < 0) throw httpError(400, `La línea ${i + 1}: el precio no es válido.`);
    if (l.precioEditado !== undefined && typeof l.precioEditado !== 'boolean') {
      throw httpError(400, `La línea ${i + 1}: la marca de precio manual no es válida.`);
    }
    return { productoId, cantidad, precio, descuento: numero(l.descuento), nota: l.nota ?? null,
      ...(l.precioEditado === undefined ? {} : { precioEditado: l.precioEditado }) };
  }).filter((l) => l.cantidad > 0);
}

/** Solo refresca lo que la pantalla mostró automáticamente; cada clave es producto.id. */
function refrescarPreciosDePantalla(lineas, precios) {
  return lineas.map(linea => {
    const actual = numero(precios.get(linea.productoId));
    return linea.precioEditado === false && actual > 0 ? { ...linea, precio: actual } : linea;
  });
}

/** Todo lo que hace falta de una factura para procesarla. `db`: cliente de transacción o el módulo. */
async function cargar(db, facturaId) {
  // `ante_hacienda`: ya no se edita. Electrónica (también las de Alegra, que
  // no tienen comprobante propio), o con la condición del disparador
  // documento_en_hacienda (migración 043): un comprobante de producción que
  // no fue rechazado, aunque Hacienda todavía no haya contestado.
  const { rows: [factura] } = await db.query(`
    SELECT id, numero, estado, electronica, cliente_nombre, fecha::text AS fecha, subtotal, impuesto, total,
           (electronica OR EXISTS (SELECT 1 FROM hacienda_comprobante h
                    WHERE h.ambiente = 'produccion' AND h.origen = 'factura'
                      AND h.origen_id = factura.id AND h.estado <> 'rechazada')) AS ante_hacienda
      FROM factura WHERE id = $1
  `, [facturaId]);
  if (!factura) return { factura: null };

  const [lineas, faltantes, cola] = await Promise.all([
    db.query(`
      SELECT l.producto_id, l.nombre, l.referencia, l.descripcion, l.cantidad, l.precio_unitario,
             l.descuento_porcentaje, l.tarifa, p.precio_sin_iva AS precio_catalogo
        FROM factura_linea l
        LEFT JOIN producto p ON p.id = l.producto_id
       WHERE l.factura_id = $1
       ORDER BY l.numero_linea
    `, [facturaId]),
    db.query(`
      SELECT f.id, f.producto_propio_id AS producto_id, f.cantidad_faltante, f.cantidad_rebajada,
             aj.estado, aj.cantidad_entregada, p.nombre, p.referencia,
             p.precio_sin_iva AS precio_catalogo, i.tarifa
        FROM faltantes f
        JOIN producto p ON p.id = f.producto_propio_id
        LEFT JOIN impuesto i ON i.id = p.impuesto_id
        LEFT JOIN faltantes_ajustes aj ON aj.faltante_id = f.id
       WHERE f.factura_propia_id = $1
         AND f.estado = 'pendiente'
         AND f.tipo_faltante <> 'completo'
         AND f.cantidad_faltante > 0
       ORDER BY f.id
    `, [facturaId]),
    db.query(`
      SELECT id, categoria, ajustes_realizados
        FROM facturas_reimpresion
       WHERE factura_propia_id = $1 AND estado = 'pendiente'
       ORDER BY fecha_creacion DESC
       LIMIT 1
    `, [facturaId])
  ]);
  return { factura, lineas: lineas.rows, faltantes: faltantes.rows, cola: cola.rows[0] || null };
}

/**
 * GET /reimpresion/facturas/:facturaId — la factura con la propuesta de
 * líneas para la pantalla de edición.
 */
async function detalle(facturaIdCrudo) {
  const facturaId = idDeFactura(facturaIdCrudo);
  const datos = await cargar({ query }, facturaId);
  if (!datos.factura) throw httpError(404, 'Esa factura no existe.');
  const categoria = datos.cola?.categoria || null;
  const f = datos.factura;
  return {
    factura: {
      factura_id: f.id, numero_factura: f.numero, estado: f.estado, electronica: f.electronica,
      ante_hacienda: Boolean(f.ante_hacienda),
      cliente_nombre: f.cliente_nombre, fecha_emision: f.fecha,
      subtotal: numero(f.subtotal), impuesto: numero(f.impuesto), total: numero(f.total)
    },
    en_cola: Boolean(datos.cola),
    categoria,
    // Ante Hacienda se imprime como se emitió: no hay propuesta de cambios.
    lineas: f.ante_hacienda
      ? proponerLineas(datos.lineas, [], { actualizarPrecios: false })
      : proponerLineas(datos.lineas, datos.faltantes, { actualizarPrecios: categoria !== 'sin_pendientes' })
  };
}

/**
 * POST /reimpresion/facturas/:facturaId/procesar — { lineas?, actualizarPrecios? }
 *
 * Sin `lineas`, se aplica la propuesta tal cual ("procesar sin cambios"). Con
 * `lineas`, son las que dejó la persona en la pantalla de edición.
 */
async function procesar(facturaIdCrudo, { lineas: dePantalla = null, actualizarPrecios = true } = {}, usuario = {}) {
  const facturaId = idDeFactura(facturaIdCrudo);
  const pantalla = dePantalla ? lineasDePantalla(dePantalla) : null;

  return enTransaccion(async (c) => {
    await c.query('SELECT id FROM factura WHERE id = $1 FOR UPDATE', [facturaId]);
    const datos = await cargar(c, facturaId);
    if (!datos.factura) throw httpError(404, 'Esa factura no existe.');
    if (datos.factura.estado === 'anulada') throw httpError(409, `La factura ${datos.factura.numero} está anulada.`);
    if (!datos.cola) throw httpError(409, `La factura ${datos.factura.numero} no está en la cola de impresión.`);

    // ANTE HACIENDA NO SE EDITA (2026-10-20). Con un comprobante de producción
    // vigente la factura ya no cambia —el disparador documento_en_hacienda lo
    // impide—: se marca impresa como se emitió. Antes intentaba rebajarlos
    // editándola y la dejaba trabada en la cola.
    //
    // Sus faltantes se cierran igual, sin rebajar nada (2026-10-22). Al
    // dejarlos pendientes, Reporte Clientes volvía a ofrecer la factura y
    // daba la vuelta otra vez: la 15083 se procesó cuatro veces en un día.
    // Desde 4d44640 no se emite antes de Impresión, así que esto queda para
    // las que se emitieron antes; lo que no llegó se corrige con nota de
    // crédito, como dice el aviso de abajo.
    const anteHacienda = Boolean(datos.factura.ante_hacienda);
    if (anteHacienda && pantalla) {
      throw httpError(409, `La factura ${datos.factura.numero} ya está ante Hacienda: se imprime como se emitió. Lo que falte se corrige con una nota de crédito.`);
    }

    const soloImprimir = datos.cola.categoria === 'sin_pendientes';
    let finales = pantalla;
    if (finales && actualizarPrecios && !soloImprimir && finales.some(l => l.precioEditado === false)) {
      const ids = [...new Set(finales.filter(l => l.precioEditado === false).map(l => l.productoId))];
      const { rows } = await c.query('SELECT id, precio_sin_iva FROM producto WHERE id = ANY($1::int[])', [ids]);
      finales = refrescarPreciosDePantalla(finales, new Map(rows.map(p => [p.id, p.precio_sin_iva])));
    }
    if (!anteHacienda && !finales && !(soloImprimir && datos.faltantes.length === 0)) {
      finales = proponerLineas(datos.lineas, datos.faltantes, { actualizarPrecios: actualizarPrecios && !soloImprimir })
        .filter((l) => l.cantidad > 0);
    }

    let editada = false;
    let total = numero(datos.factura.total);
    if (finales) {
      if (finales.length === 0) {
        throw httpError(409, `La factura ${datos.factura.numero} quedaría sin productos: si no se entregó nada, se anula en Facturación.`);
      }
      if (cambiaron(datos.lineas, finales)) {
        const r = await editarFacturaEn(c, facturaId, {
          items: finales.map((l) => ({
            productoId: l.productoId, quantity: l.cantidad, price: l.precio, discount: l.descuento, description: l.nota
          })),
          motivo: 'Impresión: faltantes y precios de catálogo'
        }, usuario.id);
        editada = true;
        total = numero(r.total);
      }
    }

    for (const f of datos.faltantes) {
      await c.query(`
        UPDATE faltantes SET estado = 'procesado', cantidad_rebajada = $2, updated_at = ${AHORA_CR_SQL}
         WHERE id = $1
      `, [f.id, anteHacienda ? numero(f.cantidad_rebajada) : rebajaObjetivo(f)]);
    }
    await c.query(`
      UPDATE facturas_reimpresion SET estado = 'procesada', fecha_procesamiento = ${AHORA_CR_SQL}
       WHERE factura_propia_id = $1 AND estado = 'pendiente'
    `, [facturaId]);
    await c.query(`
      INSERT INTO procesamientos (total_facturas, facturas_para_historial, facturas_para_reimpresion, procesado_por, detalles)
      VALUES (1, 1, 1, $1, $2)
    `, [usuario.nombre || 'Impresión', JSON.stringify({
      factura_procesada: {
        factura_id: facturaId, numero_factura: datos.factura.numero, cliente_nombre: datos.factura.cliente_nombre,
        categoria: datos.cola.categoria, editada, ante_hacienda: anteHacienda, total_antes: numero(datos.factura.total), total_despues: total,
        faltantes: datos.faltantes.map((f) => ({ faltante_id: f.id, producto_id: f.producto_id, rebajado: anteHacienda ? 0 : rebajaObjetivo(f) }))
      }
    })]);

    return { factura_id: facturaId, numero_factura: datos.factura.numero, editada, total };
  });
}

/*
 * SIN «RECUPERAR» DESDE IMPRESIÓN (2026-10-24, pedido del usuario: «no quiero
 * que se pueda recuperar desde historial, quiero que el historial sea solo
 * para ver el PDF»). Una impresa no vuelve a la cola desde acá: se corrige con
 * nota de crédito o factura nueva. Antes había un botón (con pregunta y
 * bitácora desde el 22/10, porque la 15009 se procesó tres veces), y el mismo
 * día se limitó a 24 h; ahora no existe. Reporte Clientes conserva el suyo
 * mientras la factura está en Activos.
 */

/** GET /reimpresion/productos?q= — para agregar una línea en la edición. */
async function buscarProductos(texto) {
  const q = String(texto || '').trim();
  if (q.length < 2) return [];
  const patron = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { rows } = await query(`
    SELECT p.id, p.nombre, p.referencia, p.precio_sin_iva, i.tarifa
      FROM producto p
      LEFT JOIN impuesto i ON i.id = p.impuesto_id
     WHERE p.activo
       AND (p.referencia ILIKE $1 || '%' OR p.nombre ILIKE '%' || $1 || '%')
     ORDER BY (p.referencia = $2) DESC, (p.referencia ILIKE $1 || '%') DESC, length(p.nombre), p.nombre
     LIMIT 20
  `, [patron, q]);
  // En la forma que ya dibuja el buscador de la pantalla, más el id propio.
  return rows.map((p) => ({
    id: p.id, productoId: p.id, name: p.nombre, reference: p.referencia,
    price: numero(p.precio_sin_iva), tarifa: numero(p.tarifa)
  }));
}

/** GET /reimpresion/facturas/:facturaId/pdf — el mismo PDF de Facturación. */
async function pdf(facturaIdCrudo) {
  const factura = await obtenerFactura(idDeFactura(facturaIdCrudo));
  const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  return { numero: factura.numero, archivo: await generarPdfFactura(factura, rows[0] || null) };
}

module.exports = {
  detalle, procesar, buscarProductos, pdf,
  proponerLineas, rebajaObjetivo, cambiaron, lineasDePantalla, refrescarPreciosDePantalla
};

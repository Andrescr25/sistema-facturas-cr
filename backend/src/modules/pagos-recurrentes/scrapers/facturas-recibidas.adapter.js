/**
 * Fuente de recibos que NO consulta un sitio web: lee las facturas
 * electrónicas que ya llegaron por correo y están guardadas en
 * facturas_proveedores.
 *
 * Sirve para los servicios que mandan la factura por correo en vez de
 * publicarla en un portal —internet y planes móviles de Liberty es el caso
 * que la motivó—. Es mejor que raspar su sitio: el XML de Hacienda trae el
 * monto, el consecutivo y la condición de venta ya validados, y no hace falta
 * guardar credenciales de nadie.
 *
 * Se identifica al emisor por su cédula jurídica, que es lo único estable:
 * el nombre comercial cambia (Cabletica → Liberty) y el correo de envío
 * también.
 *
 * Efecto lateral importante y deliberado: al traer una factura acá se la
 * marca con estado GASTO_RECURRENTE, que es justo el estado que Revisión de
 * Precios no lista. Así una factura de internet deja de pedir que se la
 * relacione con un producto del catálogo, que era el ruido que se quería
 * evitar.
 *
 * LA COMPRA SE REGISTRA LOCAL, NO EN ALEGRA (2026-09-20). Antes creaba un
 * contacto y un servicio en Alegra y le mandaba un `POST /bills` — era el
 * único motivo por el que esta rama seguía escribiéndole a Alegra para un
 * gasto recurrente. `registrarComoCompra` hace lo mismo que
 * `compras.service.js.registrarCompra` (crea `compra` + `compra_linea` y
 * libera la cuenta por pagar), pero sin producto: estas líneas son
 * servicios, no inventario, así que `compra_linea.producto_id` queda en
 * NULL a propósito — la tabla ya lo soporta desde que se cargaron las 860
 * compras históricas.
 *
 * CONSECUENCIA QUE HAY QUE SABER: el Reporte Contador (sección 13 del
 * checklist, todavía sin migrar) sigue leyendo las compras DIRECTO de
 * Alegra. Un gasto recurrente registrado acá no va a aparecer ahí hasta que
 * esa sección también deje de depender de Alegra — el mismo hueco de
 * tránsito que tienen Cotizaciones, Inventario y Reportes con
 * `alegra_products_cache`.
 */

const { pool, query } = require('../../../../config/database');
const { enTransaccion: enTransaccionCon } = require('../../../utils/transaccion');
const { liberarCuentaPorPagar } = require('../../compras/liberarCuentaPorPagar');
const { registrarSinInventario } = require('../../compras/registrarSinInventario');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

/** Estado que saca la factura del flujo de compras sin borrarla. */
const ESTADO_GASTO_RECURRENTE = 'GASTO_RECURRENTE';

class ConsultaFallida extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ConsultaFallida';
    this.status = 502;
  }
}

function normalizarCedula(valor) {
  const limpio = String(valor || '').replace(/\D/g, '');
  if (!limpio) throw new ConsultaFallida('Falta la cédula del emisor.');
  return limpio;
}

/**
 * Fecha a componentes LOCALES, sin que la zona horaria corra el día.
 *
 * `new Date('2026-08-20')` es medianoche UTC, que en Costa Rica (UTC-6) cae
 * el 19 a las 18:00: leer getDate() de ahí devolvía el día anterior. Las
 * cadenas 'YYYY-MM-DD' se parten a mano; los Date que ya vienen del driver de
 * Postgres (que los entrega a medianoche local) se leen tal cual.
 */
function componentesLocales(fecha) {
  if (fecha instanceof Date) {
    if (Number.isNaN(fecha.getTime())) return null;
    return { anio: fecha.getFullYear(), mes: fecha.getMonth() + 1, dia: fecha.getDate() };
  }
  const m = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };

  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return { anio: d.getFullYear(), mes: d.getMonth() + 1, dia: d.getDate() };
}

/** 'YYYY-MM-DD' → 'DD-MM-YYYY', el formato que usa el resto de adaptadores. */
function aFechaCr(fecha) {
  const c = componentesLocales(fecha);
  if (!c) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(c.dia)}-${p(c.mes)}-${c.anio}`;
}

function aPeriodoCr(fecha) {
  const c = componentesLocales(fecha);
  if (!c) return '';
  return `${String(c.mes).padStart(2, '0')}-${c.anio}`;
}

/**
 * Período de consumo a 'MM-YYYY', desde el texto libre que declara el emisor
 * ("01 Jul 2026 al 31 Jul 2026"). Importa porque Liberty factura julio el 2
 * de agosto: en la nota del pago tiene que decir julio.
 */
const MESES_CR = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, set:9, oct:10, nov:11, dic:12 };

function periodoTextoAPeriodoCr(texto) {
  if (!texto) return null;
  const f = String(texto).match(/(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3})[a-z]*\s+(\d{4})/);
  if (!f) return null;
  const mes = MESES_CR[f[2].toLowerCase().slice(0, 3)];
  if (!mes) return null;
  return `${String(mes).padStart(2, '0')}-${f[3]}`;
}

/** Suma días trabajando en calendario local, no en UTC. */
function sumarDias(fecha, dias) {
  const c = componentesLocales(fecha);
  if (!c) return null;
  const d = new Date(c.anio, c.mes - 1, c.dia);
  d.setDate(d.getDate() + dias);
  return d;
}

/**
 * Facturas recibidas de un emisor.
 *
 * @param {{cedulaEmisor: string}} config
 * @returns {Promise<Array<{documento, periodo, monto, vencimiento}>>}
 */
async function consultarRecibos({ cedulaEmisor }) {
  const cedula = normalizarCedula(cedulaEmisor);

  // Solo las de los últimos 12 meses: más atrás no aporta a un control de
  // pagos del mes y agrandaría la respuesta sin motivo.
  // El XML completo no se guarda (basta el historial de Revisión de Precios):
  // el vencimiento y el período de consumo se persisten al parsear.
  const res = await query(`
    SELECT id, numero_consecutivo, fecha_emision, total_factura, estado,
           fecha_vencimiento, periodo_facturado
    FROM facturas_proveedores
    WHERE regexp_replace(COALESCE(proveedor_cedula, ''), '\\D', '', 'g') = $1
      AND tratamiento NOT IN ('combustible','alimentacion')
      AND fecha_emision >= CURRENT_DATE - INTERVAL '12 months'
    ORDER BY fecha_emision DESC;
  `, [cedula]);

  const recibos = [];
  const idsATomar = [];

  for (const f of res.rows) {
    const emision = f.fecha_emision;
    if (!emision) continue;

    // El vencimiento que declaró el emisor manda; si no lo declaró, se cae
    // a la fecha de emisión (contado).
    const vencimiento = f.fecha_vencimiento ? aFechaCr(f.fecha_vencimiento) : aFechaCr(emision);

    recibos.push({
      documento: String(f.numero_consecutivo || '').trim(),
      // El período de CONSUMO, no el de emisión: Liberty factura julio el 2
      // de agosto, y en la nota del pago tiene que decir julio.
      periodo: periodoTextoAPeriodoCr(f.periodo_facturado) || aPeriodoCr(emision),
      monto: Number(f.total_factura) || 0,
      vencimiento
    });
    idsATomar.push(f.id);
  }

  // Se sacan del flujo de compras: dejan de aparecer en Revisión de Precios
  // pidiendo que se las relacione con un producto del catálogo.
  if (idsATomar.length > 0) {
    await query(
      `UPDATE facturas_proveedores SET estado = $1 WHERE id = ANY($2::uuid[]) AND estado <> $1;`,
      [ESTADO_GASTO_RECURRENTE, idsATomar]
    );
  }

  return recibos.filter(r => r.vencimiento);
}

/** ¿Esta cédula está registrada como gasto recurrente? La usa el monitor de correo. */
async function esEmisorDeGastoRecurrente(cedula) {
  const limpia = String(cedula || '').replace(/\D/g, '');
  if (!limpia) return false;
  const res = await query(`
    SELECT 1 FROM gasto_recurrente
    WHERE activo = TRUE AND fuente_auto = $1
      AND regexp_replace(COALESCE(config_auto->>'cedulaEmisor', ''), '\\D', '', 'g') = $2
    LIMIT 1;
  `, ['facturas-recibidas', limpia]);
  return res.rows.length > 0;
}

// ==================== Registro contable local ====================

/**
 * Registra, como compra propia, las facturas de este emisor que todavía no
 * tengan una. Idempotente: se salta las que ya tienen fila en `compra`
 * (`NOT EXISTS`) — antes de esto, la misma idempotencia se apoyaba en
 * `alegra_bill_id IS NULL`.
 *
 * SIN PRODUCTO, A PROPÓSITO. Estas líneas son servicios (internet, planes
 * móviles), no inventario: no tiene sentido pedir que se las relacione con
 * un producto del catálogo —era justo el ruido que se quería evitar—, así
 * que `compra_linea.producto_id` queda en NULL. La tabla ya lo soporta: 123
 * de las 8.590 líneas históricas están así.
 *
 * SE COPIAN LAS LÍNEAS TAL CUAL, sin reconstruir "otros cargos" por
 * diferencia ni agrupar en servicios: eso hacía falta para que Alegra
 * aceptara un bill con items reales, pero `compra.total` es el del
 * comprobante y no depende de que las líneas sumen exacto (ver
 * [[decision/el-total-manda-sobre-las-lineas]] en el grafo) — así que copiar
 * el detalle sin transformarlo alcanza.
 */
async function registrarComoCompra({ cedulaEmisor }) {
  const cedula = normalizarCedula(cedulaEmisor);

  const pendientes = await query(`
    SELECT f.id, f.clave, f.numero_consecutivo, f.fecha_emision, f.fecha_vencimiento,
           f.moneda, f.total_factura, f.xml_ruta, f.total_otros_cargos, f.total_descuentos,
           f.total_iva_devuelto, f.otros_cargos, f.proveedor_cedula
      FROM facturas_proveedores f
     WHERE regexp_replace(COALESCE(f.proveedor_cedula, ''), '\D', '', 'g') = $1
       AND f.tratamiento NOT IN ('combustible','alimentacion')
       AND f.fecha_emision >= CURRENT_DATE - INTERVAL '12 months'
       AND NOT EXISTS (SELECT 1 FROM compra c WHERE c.factura_proveedor_id = f.id)
     ORDER BY f.fecha_emision ASC;
  `, [cedula]);

  if (pendientes.rows.length === 0) return { registradas: 0, fallidas: 0 };

  const proveedorRes = await query('SELECT id FROM proveedor WHERE identificacion = $1', [cedula]);
  const proveedor = proveedorRes.rows[0];
  if (!proveedor) {
    // No es un error de una factura puntual, es que falta dar de alta al
    // proveedor: se reporta una vez por todas las pendientes, no una por
    // cada una.
    const motivo = `No hay proveedor propio con cédula ${cedula}. Hay que crearlo antes de registrar este gasto.`;
    console.error(`   ❌ ${motivo}`);
    return {
      registradas: 0,
      fallidas: pendientes.rows.length,
      detalleFallos: pendientes.rows.map((f) => ({ consecutivo: f.numero_consecutivo, error: motivo }))
    };
  }

  let registradas = 0;
  const fallidas = [];

  for (const f of pendientes.rows) {
    try {
      // Una transacción POR FACTURA, no una sola para todas: un gasto de
      // enero que falla no puede dejar sin registrar el de febrero, que ya
      // se procesó bien.
      const creada = await enTransaccion(async (cliente) => {
        // Mismo bloqueo del buzón que gasto/revisión: dos sincronizaciones no
        // crean compras paralelas, ni toman una factura recién reclasificada.
        const bloqueada = (await cliente.query('SELECT * FROM facturas_proveedores WHERE id=$1 FOR UPDATE', [f.id])).rows[0];
        if (!bloqueada || ['combustible', 'alimentacion'].includes(bloqueada.tratamiento)) return;
        if ((await cliente.query('SELECT id FROM compra WHERE factura_proveedor_id=$1', [f.id])).rows.length) return;
        const compra = await registrarSinInventario(cliente, bloqueada, proveedor.id);
        await liberarCuentaPorPagar(cliente, f.id, compra.id);
        return true;
      });

      if (creada) {
        registradas++;
        console.log(`   ✅ Compra registrada: ${f.numero_consecutivo}`);
      }
    } catch (error) {
      // Un fallo acá NO tumba la sincronización: el pago ya quedó registrado
      // en Pagos Recurrentes, que es lo que el usuario ve. La compra se
      // reintenta en la próxima corrida porque sigue sin fila en `compra`.
      console.error(`   ❌ No se pudo registrar ${f.numero_consecutivo}: ${error.message}`);
      fallidas.push({ consecutivo: f.numero_consecutivo, error: error.message });
    }
  }

  return { registradas, fallidas: fallidas.length, detalleFallos: fallidas };
}

module.exports = {
  consultarRecibos,
  registrarComoCompra,
  periodoTextoAPeriodoCr,
  esEmisorDeGastoRecurrente,
  normalizarCedula,
  aFechaCr,
  aPeriodoCr,
  ConsultaFallida,
  ESTADO_GASTO_RECURRENTE,
  FUENTE: 'facturas-recibidas'
};

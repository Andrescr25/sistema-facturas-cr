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
 */

const { query } = require('../../../../config/database');
const { getContactService, getInvoiceService } = require('../../../integrations/alegra');
const { getInstance } = require('../../../integrations/alegra/alegra.client');

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

// ==================== Registro contable en Alegra ====================

/**
 * Los cargos que NO son base gravable ni IVA (impuesto Cruz Roja, servicio
 * 911) viajan en <OtrosCargos>, fuera del detalle. Se registran como una
 * línea propia al 0%: meterlos dentro de otra línea inflaría la base gravable
 * y falsearía el reporte del contador.
 */
/**
 * Los cargos que NO son base gravable ni IVA (impuesto Cruz Roja, servicio
 * 911) viajan en <OtrosCargos>, fuera del detalle, y el XML no se guarda.
 * Se recuperan por diferencia: total de la factura menos (base + impuesto)
 * de las líneas. Verificado contra una factura real de Liberty: da ₡187,39,
 * exactamente lo que dice el PDF.
 *
 * Van como línea propia al 0%: meterlos dentro de otra inflaría la base
 * gravable y falsearía el reporte del contador.
 */
function otrosCargosDeTotales(filas, totalFactura) {
  const base = filas.reduce((s, f) => s + (Number(f.precio_unitario) || 0) * (Number(f.cantidad) || 1), 0);
  const impuesto = filas.reduce((s, f) => s + (Number(f.impuesto) || 0), 0);
  const diferencia = Math.round((totalFactura - base - impuesto) * 100) / 100;
  // Menos de un colón es redondeo, no un cargo.
  return { total: diferencia >= 1 ? diferencia : 0, detalle: 'otros cargos' };
}

/**
 * Líneas de la factura, tomadas de productos_factura_proveedor — que es lo
 * que Revisión de Precios ya guarda de cada factura. El XML no se conserva.
 *
 * En el XML de Hacienda `precioUnitario` viene SIN IVA, que es justo lo que
 * espera Alegra; la tarifa real se deriva de impuesto/total para no asumir
 * 13% (Costa Rica tiene 0/1/2/4/8/13%).
 */
function lineasDeDetalle(filas) {
  return filas.map((f) => {
    const cantidad = Number(f.cantidad) || 1;
    const precio = Number(f.precio_unitario) || 0;
    const impuesto = Number(f.impuesto) || 0;
    const base = precio * cantidad;
    return {
      detalle: String(f.descripcion || '').trim(),
      cabys: f.codigo_cabys || null,
      cantidad,
      subtotal: Math.round(base * 100) / 100,
      tarifa: base > 0 ? Math.round((impuesto / base) * 100) : 0
    };
  }).filter(l => l.detalle && l.subtotal > 0);
}

/**
 * Servicio de Alegra para un concepto de la factura, creándolo la primera vez.
 *
 * Se crean como type 'service' a propósito: la sincronización del catálogo
 * pide `type: 'product'`, la búsqueda de productos también y la de inventario
 * pide `inventariable: true`. Verificado en vivo creando un servicio real y
 * corriendo el sync completo: no entra al catálogo local, así que estos
 * conceptos no aparecen en Gestión de Catálogo, Rentabilidad, Revisión de
 * Precios ni el catálogo público. Solo existen para la contabilidad.
 */
async function buscarOCrearServicio(nombre, cabys) {
  const limpio = String(nombre || '').trim().slice(0, 150);
  if (!limpio) return null;

  const client = getInstance();
  const res = await client.api.get('/items', { params: { query: limpio, type: 'service', limit: 30 } });
  const existente = (res.data || []).find(i => String(i.name || '').trim().toUpperCase() === limpio.toUpperCase());
  if (existente) return existente.id;

  const creado = await client.api.post('/items', {
    name: limpio,
    type: 'service',
    price: 0,
    status: 'active',
    unit: 'unit',
    // Alegra exige un CABYS válido; se usa el que declara el propio emisor.
    productKey: cabys || undefined
  });
  console.log(`   🆕 Servicio creado en Alegra: ${limpio} (id ${creado.data.id})`);
  return creado.data.id;
}

/**
 * Registra en Alegra, como factura de compra, las facturas de este emisor que
 * todavía no se hayan registrado. Idempotente: se salta las que ya tienen
 * alegra_bill_id.
 *
 * Se hace acá y no por Revisión de Precios porque estos conceptos no son
 * inventario y no tiene sentido pedir que se los relacione con un producto
 * del catálogo — que era justamente el ruido que se quería evitar. Pero la
 * compra sí tiene que llegar a Alegra: de ahí la toma el Reporte Contador y
 * ahí está el IVA acreditable.
 */
async function registrarEnAlegra({ cedulaEmisor }) {
  const cedula = normalizarCedula(cedulaEmisor);

  const pendientes = await query(`
    SELECT id, numero_consecutivo, fecha_emision, total_factura,
           proveedor_nombre, proveedor_cedula, proveedor_email, proveedor_telefono
    FROM facturas_proveedores
    WHERE regexp_replace(COALESCE(proveedor_cedula, ''), '\D', '', 'g') = $1
      AND alegra_bill_id IS NULL
      AND fecha_emision >= CURRENT_DATE - INTERVAL '12 months'
    ORDER BY fecha_emision ASC;
  `, [cedula]);

  if (pendientes.rows.length === 0) return { registradas: 0, fallidas: 0 };

  const contactService = getContactService();
  const invoiceService = getInvoiceService();

  let registradas = 0;
  const fallidas = [];

  for (const f of pendientes.rows) {
    try {
      const contacto = await contactService.createOrGetContact({
        name: f.proveedor_nombre,
        identification: String(f.proveedor_cedula || '').replace(/\D/g, ''),
        identificationType: 'CJ',
        email: f.proveedor_email || '',
        phonePrimary: f.proveedor_telefono || '',
        type: ['provider'],
        status: 'active',
        ignoreRepeated: true
      });

      const detalle = await query(`
        SELECT descripcion, cantidad, precio_unitario, impuesto, total_linea, codigo_cabys
        FROM productos_factura_proveedor WHERE factura_id = $1 ORDER BY numero_linea;
      `, [f.id]);

      const items = [];
      for (const linea of lineasDeDetalle(detalle.rows)) {
        const itemId = await buscarOCrearServicio(linea.detalle, linea.cabys);
        if (!itemId) continue;
        const item = {
          id: String(itemId),
          quantity: linea.cantidad,
          price: Math.round((linea.subtotal / (linea.cantidad || 1)) * 100) / 100
        };
        if (linea.tarifa > 0) item.tax = [{ percentage: linea.tarifa }];
        items.push(item);
      }

      // Los cargos que no son base ni IVA son la diferencia entre el total de
      // la factura y (base + impuesto) del detalle. No se guardan aparte.
      const cargos = otrosCargosDeTotales(detalle.rows, Number(f.total_factura) || 0);
      if (cargos.total > 0) {
        const itemId = await buscarOCrearServicio(
          `OTROS CARGOS (${cargos.detalle || 'varios'})`.slice(0, 150),
          detalle.rows[0]?.codigo_cabys
        );
        // Sin impuesto: no son base gravable ni IVA.
        if (itemId) items.push({ id: String(itemId), quantity: 1, price: cargos.total });
      }

      if (items.length === 0) throw new Error('el XML no tiene líneas utilizables');

      const bill = await invoiceService.createPurchaseInvoice({
        date: f.fecha_emision,
        client: contacto.id?.toString() || contacto.id,
        numberTemplate: {
          id: 10,
          number: f.numero_consecutivo,
          fullNumber: f.numero_consecutivo
        },
        observations: `Gasto recurrente ${f.numero_consecutivo} — registrado automáticamente`,
        items
      });

      await query(`UPDATE facturas_proveedores SET alegra_bill_id = $1 WHERE id = $2;`,
        [String(bill.id), f.id]);
      registradas++;
      console.log(`   ✅ Compra registrada en Alegra: ${f.numero_consecutivo} → bill ${bill.id}`);
    } catch (error) {
      // Un fallo acá NO tumba la sincronización: el pago ya quedó registrado
      // en Pagos Recurrentes, que es lo que el usuario ve. La compra se
      // reintenta en la próxima corrida porque alegra_bill_id sigue nulo.
      // El mensaje de axios ("status code 400") no dice nada: lo útil está en
      // el cuerpo de la respuesta de Alegra.
      const detalle = error.response?.data
        ? JSON.stringify(error.response.data).slice(0, 300)
        : error.message;
      console.error(`   ❌ No se pudo registrar ${f.numero_consecutivo} en Alegra: ${detalle}`);
      fallidas.push({ consecutivo: f.numero_consecutivo, error: detalle });
    }
  }

  return { registradas, fallidas: fallidas.length, detalleFallos: fallidas };
}

module.exports = {
  consultarRecibos,
  registrarEnAlegra,
  otrosCargosDeTotales,
  lineasDeDetalle,
  periodoTextoAPeriodoCr,
  esEmisorDeGastoRecurrente,
  normalizarCedula,
  aFechaCr,
  aPeriodoCr,
  ConsultaFallida,
  ESTADO_GASTO_RECURRENTE,
  FUENTE: 'facturas-recibidas'
};

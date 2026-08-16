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
 * Días de crédito declarados en el XML (<PlazoCredito>). Solo se usa como
 * respaldo: ver fechaVencimientoDeXml.
 */
function plazoCreditoDias(xml) {
  const m = String(xml || '').match(/<PlazoCredito>\s*([^<]*)<\/PlazoCredito>/i);
  if (!m) return 0;
  const dias = parseInt(String(m[1]).replace(/\D/g, ''), 10);
  return Number.isFinite(dias) ? dias : 0;
}

/**
 * Fecha de vencimiento real, del bloque <Otros> del XML.
 *
 * Hacienda no tiene un campo estándar de vencimiento, así que los emisores lo
 * ponen ahí como texto libre. Verificado en una factura real de Liberty:
 *
 *   <CondicionVenta>01</CondicionVenta>   (contado)
 *   <PlazoCredito>0</PlazoCredito>
 *   <OtroTexto codigo="Fecha_Vencimiento">20-08-2026</OtroTexto>
 *
 * Fiarse de PlazoCredito habría dado el 2 de agosto —la fecha de emisión—
 * cuando el recibo vence el 20: 18 días antes, y la pantalla lo habría
 * mostrado vencido apenas llega.
 */
function fechaVencimientoDeXml(xml) {
  const texto = String(xml || '');
  const m = texto.match(/<OtroTexto[^>]*codigo\s*=\s*"Fecha_Vencimiento"[^>]*>\s*([^<]+?)\s*<\/OtroTexto>/i);
  if (!m) return null;

  const valor = m[1].trim();
  const cr = valor.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (cr) return `${cr[1]}-${cr[2]}-${cr[3]}`;

  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  return null;
}

/**
 * Período facturado, del bloque <Otros>. Liberty lo escribe como
 * "01 Jul 2026 al 31 Jul 2026" — el consumo es de JULIO aunque la factura se
 * emita en agosto, y eso es lo que hay que mostrar en la nota del pago.
 */
const MESES_CR = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, set:9, oct:10, nov:11, dic:12 };

function periodoFacturadoDeXml(xml) {
  const m = String(xml || '').match(/<OtroTexto[^>]*codigo\s*=\s*"Periodo_Facturado"[^>]*>\s*([^<]+?)\s*<\/OtroTexto>/i);
  if (!m) return null;
  const f = m[1].match(/(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3})[a-z]*\s+(\d{4})/);
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
  const res = await query(`
    SELECT id, numero_consecutivo, fecha_emision, total_factura, archivo_xml, estado
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

    // El vencimiento del bloque <Otros> manda; PlazoCredito es el respaldo.
    const vencimiento = fechaVencimientoDeXml(f.archivo_xml)
      || aFechaCr(sumarDias(emision, plazoCreditoDias(f.archivo_xml)));

    recibos.push({
      documento: String(f.numero_consecutivo || '').trim(),
      // El período de CONSUMO, no el de emisión: Liberty factura julio el 2
      // de agosto, y en la nota del pago tiene que decir julio.
      periodo: periodoFacturadoDeXml(f.archivo_xml) || aPeriodoCr(emision),
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
function otrosCargosDeXml(xml) {
  const bloques = String(xml || '').match(/<OtrosCargos>[\s\S]*?<\/OtrosCargos>/gi) || [];
  let total = 0;
  const detalles = [];
  for (const b of bloques) {
    const monto = Number((b.match(/<MontoCargo>\s*([\d.]+)\s*<\/MontoCargo>/i) || [])[1]) || 0;
    const detalle = ((b.match(/<Detalle>\s*([^<]*)<\/Detalle>/i) || [])[1] || '').trim();
    if (monto > 0) { total += monto; if (detalle) detalles.push(detalle); }
  }
  return { total: Math.round(total * 100) / 100, detalle: detalles.join(' · ') };
}

/** Líneas del detalle del XML, con su tarifa de IVA real. */
function lineasDeXml(xml) {
  const bloques = String(xml || '').match(/<LineaDetalle>[\s\S]*?<\/LineaDetalle>/gi) || [];
  return bloques.map((b) => {
    const t = (re) => ((b.match(re) || [])[1] || '').trim();
    return {
      detalle: t(/<Detalle>\s*([^<]*)<\/Detalle>/i),
      cabys: t(/<CodigoCABYS>\s*([^<]*)<\/CodigoCABYS>/i),
      cantidad: Number(t(/<Cantidad>\s*([\d.]*)\s*<\/Cantidad>/i)) || 1,
      // SubTotal es el monto SIN IVA de la línea, que es lo que espera Alegra.
      subtotal: Number(t(/<SubTotal>\s*([\d.]*)\s*<\/SubTotal>/i)) || 0,
      tarifa: Number(t(/<Tarifa>\s*([\d.]*)\s*<\/Tarifa>/i)) || 0
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
    SELECT id, numero_consecutivo, fecha_emision, total_factura, archivo_xml,
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

      const items = [];
      for (const linea of lineasDeXml(f.archivo_xml)) {
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

      const cargos = otrosCargosDeXml(f.archivo_xml);
      if (cargos.total > 0) {
        const itemId = await buscarOCrearServicio(
          `OTROS CARGOS (${cargos.detalle || 'varios'})`.slice(0, 150),
          lineasDeXml(f.archivo_xml)[0]?.cabys
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
      console.error(`   ❌ No se pudo registrar ${f.numero_consecutivo} en Alegra: ${error.message}`);
      fallidas.push({ consecutivo: f.numero_consecutivo, error: error.message });
    }
  }

  return { registradas, fallidas: fallidas.length, detalleFallos: fallidas };
}

module.exports = {
  consultarRecibos,
  registrarEnAlegra,
  otrosCargosDeXml,
  lineasDeXml,
  esEmisorDeGastoRecurrente,
  normalizarCedula,
  aFechaCr,
  aPeriodoCr,
  plazoCreditoDias,
  fechaVencimientoDeXml,
  periodoFacturadoDeXml,
  ConsultaFallida,
  ESTADO_GASTO_RECURRENTE,
  FUENTE: 'facturas-recibidas'
};

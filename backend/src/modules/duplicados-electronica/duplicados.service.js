/**
 * Duplicados por conversión a electrónica - Service
 *
 * La detección vive aparte, en duplicados.detector.js, y no toca la red.
 * Acá está lo que sí tiene consecuencias: traer las facturas de Alegra,
 * guardar lo detectado y anular las copias limpias.
 *
 * Alcance del automatismo (decisión del usuario): solo se anulan los pares
 * LIMPIOS — ninguna de las dos facturas recibió plata. Cuando hay cobros de
 * por medio la copia se registra con su motivo y se deja intacta: resolver a
 * dónde va el dinero no es una decisión que deba tomar un proceso
 * desatendido.
 */

const { query } = require('../../../config/database');
const { getClient } = require('../../integrations/alegra');
const { detectarPares, motivoRevisionManual } = require('./duplicados.detector');

const client = getClient();

const LIMIT_INVOICES = 30; // máximo que acepta /invoices en Alegra

// La copia hereda la fecha de emisión del original, no la del día en que se
// convirtió, así que aparece en el listado en su fecha vieja y hay que mirar
// hacia atrás para encontrarla. Sobre los 42 pares reales el desfase máximo
// entre una factura y su copia fue de 3,1 días: 30 da diez veces de margen.
//
// No conviene estirarlo "por si acaso": esto corre pegado a la
// sincronización de cuentas por cobrar, cada 30 minutos, y cada página de
// Alegra tarda ~4,5s. A 45 días eran ~50s por corrida.
const DIAS_VENTANA = 30;

// Este módulo arranca en limpio. Entre abril y agosto de 2026 quedaron 42
// pares con cobros ya aplicados y ~₡1,7M de ingreso contado dos veces; el
// usuario decidió no tocar nada de eso y priorizar que de acá en adelante no
// vuelva a pasar. Sin este corte, cada corrida arrastraría esos 42 a la
// lista de revisión y taparía los casos nuevos, que son los que importan.
const DESDE_FECHA = '2026-08-17';

// Tope de seguridad. Esto corre solo y anula facturas de venta: si una
// corrida detecta más limpios que esto, lo más probable es que la detección
// se haya roto y no que aparecieran diez duplicados de golpe. Se frena y se
// avisa en vez de anular en masa. Mismo criterio que la guarda de borrado
// masivo en alegra-sync.service.js.
const MAX_ANULACIONES_POR_CORRIDA = 5;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function traerFacturasRecientes(dias = DIAS_VENTANA) {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const desdeStr = desde.toISOString().split('T')[0];

  const params = {
    start_date: desdeStr,
    end_date: hasta.toISOString().split('T')[0],
    limit: LIMIT_INVOICES,
    order_field: 'date',
    order_direction: 'DESC'
  };

  // Tope duro de páginas. La condición de salida normal es una página
  // incompleta; esto es el respaldo por si Alegra alguna vez deja de
  // respetar `start` y devuelve siempre la misma página, que convertiría el
  // recorrido en un bucle infinito dentro de un proceso desatendido.
  const MAX_PAGINAS = 40;

  const todas = [];
  let start = 0;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const res = await client.requestWithRetry(
      () => client.api.get('/invoices', { params: { ...params, start }, timeout: 60000 }),
      3,
      1000,
      { metodo: 'GET' }
    );
    const filas = res.data?.data || res.data || [];
    if (!Array.isArray(filas) || filas.length === 0) break;
    todas.push(...filas);
    if (filas.length < LIMIT_INVOICES) break;

    // Alegra IGNORA start_date/end_date en /invoices: se mandan igual, pero
    // lo único que hace es ordenar por fecha descendente y seguir caminando
    // hacia atrás por todo el histórico. Sin este corte explícito una
    // ventana de 30 días traía 1.200 facturas y tardaba 4 minutos, hasta
    // frenar contra MAX_PAGINAS. El recorrido se detiene cuando la página ya
    // salió de la ventana.
    const masVieja = filas[filas.length - 1]?.date;
    if (masVieja && masVieja < desdeStr) break;

    start += LIMIT_INVOICES;
    await new Promise(r => setTimeout(r, 250));
  }
  console.log(`   🔎 [Duplicados] ${todas.length} facturas revisadas (${params.start_date} → ${params.end_date})`);
  return todas;
}

async function guardarPar(par, { estado, motivo, anulado = false }) {
  await query(`
    INSERT INTO duplicado_electronica
      (duplicado_alegra_id, duplicado_numero, electronica_alegra_id, electronica_numero,
       cliente_id, cliente_nombre, fecha_emision, total, estado, motivo,
       pago_en_duplicado, pago_en_electronica, anulado_en)
    VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::numeric, $9, $10, $11::numeric, $12::numeric, $13)
    ON CONFLICT (duplicado_alegra_id) DO UPDATE SET
      estado = EXCLUDED.estado,
      motivo = EXCLUDED.motivo,
      pago_en_duplicado = EXCLUDED.pago_en_duplicado,
      pago_en_electronica = EXCLUDED.pago_en_electronica,
      -- si ya se había anulado, esa fecha no se pisa
      anulado_en = COALESCE(duplicado_electronica.anulado_en, EXCLUDED.anulado_en);
  `, [
    par.duplicadoId, par.duplicadoNumero, par.electronicaId, par.electronicaNumero,
    par.clienteId, par.clienteNombre, par.fecha, par.total, estado, motivo,
    par.pagoEnDuplicado, par.pagoEnElectronica, anulado ? new Date() : null
  ]);
}

/**
 * Anula una copia en Alegra y borra su rastro local.
 *
 * El orden importa: primero Alegra, y solo si eso responde bien se limpia lo
 * local. Al revés quedaría una factura viva en Alegra que este sistema ya no
 * muestra — invisible acá y cobrable allá.
 */
async function anularEnAlegra(par) {
  await client.api.post(`/invoices/${par.duplicadoId}/void`);

  // Cuentas por Cobrar: fuera del espejo, deja de sumar al saldo del cliente.
  await query(`DELETE FROM cuentas_por_cobrar WHERE alegra_invoice_id = $1;`, [par.duplicadoId]);

  // Bodega: la copia no se alista. Se marca en vez de borrar la fila para no
  // perder el rastro si alguien ya la había tocado.
  await query(`
    UPDATE facturas SET estado_bodega = 'anulada'
    WHERE alegra_id = $1::integer AND estado_bodega <> 'anulada';
  `, [par.duplicadoId]);
}

/**
 * Corrida completa: detectar, registrar y anular las limpias.
 *
 * `soloDetectar` deja el registro en la base local sin tocar Alegra — sirve
 * para ver qué haría antes de dejarlo correr solo.
 */
async function revisarDuplicados({ dias = DIAS_VENTANA, soloDetectar = false, desde = DESDE_FECHA } = {}) {
  const facturas = await traerFacturasRecientes(dias);
  const pares = detectarPares(facturas).filter(p => !desde || p.fecha >= desde);

  const limpios = pares.filter(p => p.limpio);
  const paraRevision = pares.filter(p => !p.limpio);

  for (const par of paraRevision) {
    await guardarPar(par, { estado: 'requiere_revision', motivo: motivoRevisionManual(par) });
  }

  const anulados = [];
  const errores = [];
  let frenadoPorTope = false;

  if (limpios.length > MAX_ANULACIONES_POR_CORRIDA) {
    frenadoPorTope = true;
    for (const par of limpios) {
      await guardarPar(par, {
        estado: 'requiere_revision',
        motivo: `Se detectaron ${limpios.length} duplicados limpios en una sola corrida (tope: ${MAX_ANULACIONES_POR_CORRIDA}). No se anuló ninguno automáticamente.`
      });
    }
    console.warn(`⚠️ [Duplicados] ${limpios.length} limpios de golpe supera el tope de ${MAX_ANULACIONES_POR_CORRIDA}: no se anuló nada, quedan para revisión.`);
  } else {
    for (const par of limpios) {
      if (soloDetectar) {
        await guardarPar(par, { estado: 'requiere_revision', motivo: 'Detectado en modo solo lectura.' });
        continue;
      }
      try {
        await anularEnAlegra(par);
        await guardarPar(par, { estado: 'anulado', motivo: null, anulado: true });
        anulados.push(par);
        console.log(`   🗑️ [Duplicados] Anulada la copia ${par.duplicadoNumero} — se conserva la electrónica ${par.electronicaNumero} (${par.clienteNombre}, ₡${par.total})`);
      } catch (error) {
        const detalle = error.response?.data?.message || error.message;
        await guardarPar(par, { estado: 'error', motivo: `Alegra rechazó la anulación: ${detalle}` });
        errores.push({ ...par, error: detalle });
        console.error(`   ❌ [Duplicados] No se pudo anular ${par.duplicadoNumero}: ${detalle}`);
      }
    }
  }

  return {
    facturasRevisadas: facturas.length,
    detectados: pares.length,
    anulados: anulados.length,
    requierenRevision: paraRevision.length + (frenadoPorTope ? limpios.length : 0),
    errores: errores.length,
    frenadoPorTope,
    detalleAnulados: anulados,
    detalleErrores: errores
  };
}

/**
 * Los pares que están esperando una decisión humana: son los que llegaron con
 * un cobro ya aplicado, donde anular sin más movería plata registrada.
 */
async function listarPendientes() {
  const result = await query(`
    SELECT * FROM duplicado_electronica
    WHERE estado IN ('requiere_revision', 'error')
    ORDER BY fecha_emision DESC;
  `);
  return result.rows.map(row => ({
    duplicadoId: row.duplicado_alegra_id,
    duplicadoNumero: row.duplicado_numero,
    electronicaId: row.electronica_alegra_id,
    electronicaNumero: row.electronica_numero,
    clienteNombre: row.cliente_nombre,
    fecha: row.fecha_emision,
    total: Number(row.total),
    estado: row.estado,
    motivo: row.motivo,
    pagoEnDuplicado: Number(row.pago_en_duplicado),
    pagoEnElectronica: Number(row.pago_en_electronica)
  }));
}

async function listarAnulados(limite = 50) {
  const result = await query(`
    SELECT * FROM duplicado_electronica WHERE estado = 'anulado'
    ORDER BY anulado_en DESC LIMIT $1;
  `, [limite]);
  return result.rows.map(row => ({
    duplicadoNumero: row.duplicado_numero,
    electronicaNumero: row.electronica_numero,
    clienteNombre: row.cliente_nombre,
    fecha: row.fecha_emision,
    total: Number(row.total),
    anuladoEn: row.anulado_en
  }));
}

/**
 * Anulación pedida a mano desde la pantalla, para un par que el automatismo
 * no tocó. Se exige que el par ya esté registrado por la detección: así esta
 * ruta no sirve para anular una factura cualquiera pasándole un id.
 */
async function anularManual(duplicadoId) {
  const res = await query(
    `SELECT * FROM duplicado_electronica WHERE duplicado_alegra_id = $1;`,
    [String(duplicadoId)]
  );
  if (res.rows.length === 0) {
    throw httpError(404, 'Ese duplicado no está registrado. Corré la revisión primero.');
  }
  const row = res.rows[0];
  if (row.estado === 'anulado') {
    throw httpError(400, 'Esa copia ya fue anulada.');
  }

  const par = {
    duplicadoId: row.duplicado_alegra_id,
    duplicadoNumero: row.duplicado_numero,
    electronicaId: row.electronica_alegra_id,
    electronicaNumero: row.electronica_numero,
    clienteId: row.cliente_id,
    clienteNombre: row.cliente_nombre,
    fecha: row.fecha_emision,
    total: Number(row.total),
    pagoEnDuplicado: Number(row.pago_en_duplicado),
    pagoEnElectronica: Number(row.pago_en_electronica)
  };

  await anularEnAlegra(par);
  await guardarPar(par, { estado: 'anulado', motivo: null, anulado: true });
  return { anulado: true, numero: par.duplicadoNumero, conserva: par.electronicaNumero };
}

module.exports = {
  revisarDuplicados,
  listarPendientes,
  listarAnulados,
  anularManual,
  DESDE_FECHA,
  MAX_ANULACIONES_POR_CORRIDA
};

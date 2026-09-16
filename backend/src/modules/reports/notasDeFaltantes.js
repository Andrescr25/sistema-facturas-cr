/**
 * Las notas que se le escribieron a un producto al facturarlo, para poder
 * leerlas mientras se le compra al proveedor.
 *
 * QUÉ SON. En Facturación se le puede escribir una nota a cada línea. Son
 * cortas y casi siempre dicen QUÉ VARIANTE quiere el cliente: "AZUL", "OJO
 * NEGRA", "Negro y rojo", "Solo 75w", "Niño y niña". Bodega ya las muestra en
 * su recuadro ámbar, porque quien alista necesita saberlo. Quien COMPRA lo
 * necesita igual, y ahí no estaban: muchas describen variantes que todavía no
 * existen en el catálogo, así que sin ellas se compra la equivocada.
 *
 * DE DÓNDE SALEN. La nota vive en la línea de la factura EN ALEGRA, no en
 * nuestra base: `faltantes.descripcion_factura` existe pero nunca se llenó.
 * No se cambia nada de cómo se escriben ni dónde se guardan —solo se leen—.
 *
 * POR QUÉ NO CUESTA CARO. Los faltantes pendientes son de pocos días: hoy son
 * 255 repartidos en 30 facturas. Y la LISTA de facturas de Alegra ya trae las
 * líneas con su descripción, así que son una o dos peticiones, no una por
 * factura.
 *
 * VA APARTE DEL REPORTE a propósito. El reporte de proveedores se arma con la
 * base local y carga rápido; si esto viviera adentro, el día que Alegra esté
 * lenta no se podría ni ver qué hay que comprar. Se pide después, y si falla,
 * lo único que falta son las notas.
 */

const { query } = require('../../../config/database');
const { getClient } = require('../../integrations/alegra');

const POR_PAGINA = 30;
const MAX_PAGINAS = 12;   // 360 facturas: de sobra para los días que cubre

// Cada página de Alegra tarda unos 5 segundos y trae la factura entera: no
// hay forma de pedir menos. Se probó `fields`, `metadata` y filtrar por fecha
// con `start_date`/`end_date`, y ALEGRA LOS IGNORA los tres —pedirle solo el
// 15 devolvió también el 14 y el 16—, así que el recorte hay que hacerlo acá.
// Guardar el resultado un rato evita pagar esos segundos cada vez que alguien
// abre otro proveedor.
const VIGENCIA_CACHE_MS = 5 * 60 * 1000;
let cache = null;

/** Las facturas que están detrás de los faltantes pendientes. */
async function facturasConFaltantes(fechaInicio = null) {
  const params = [];
  let filtroFecha = '';
  if (fechaInicio) {
    params.push(fechaInicio);
    filtroFecha = ' AND fa.fecha_emision >= $1';
  }

  const { rows } = await query(`
    SELECT DISTINCT fa.alegra_id::text AS alegra_id, fa.fecha_emision
      FROM faltantes f
      JOIN facturas fa ON fa.id = f.factura_id
     WHERE f.estado IN ('pendiente', 'procesado')
       AND f.tipo_faltante <> 'completo'
       AND f.cantidad_faltante::numeric > 0
       AND fa.estado_bodega IS DISTINCT FROM 'anulada'
       AND fa.alegra_id IS NOT NULL${filtroFecha}
  `, params);

  return rows;
}

/** Un día AAAA-MM-DD a partir de lo que devuelve pg. */
const soloDia = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);

/**
 * Las notas por producto.
 *
 * @returns {Promise<{porProducto: object, facturas: number, desde: string|null}>}
 *   `porProducto` va indexado por el id de Alegra del producto, que es el
 *   mismo `alegra_item_id` que trae cada línea del reporte.
 */
async function notasPorProducto(fechaInicio = null) {
  const claveCache = String(fechaInicio || 'todo');
  if (cache && cache.clave === claveCache && Date.now() - cache.hora < VIGENCIA_CACHE_MS) {
    return cache.valor;
  }

  const facturas = await facturasConFaltantes(fechaInicio);
  if (facturas.length === 0) return { porProducto: {}, facturas: 0, desde: null };

  const ids = new Set(facturas.map((f) => String(f.alegra_id)));
  const desde = facturas
    .map((f) => soloDia(f.fecha_emision))
    .filter(Boolean)
    .sort()[0];

  const client = getClient();
  const porProducto = {};
  const encontradas = new Set();
  let vistas = 0;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const lote = await client.request('GET', '/invoices', {
      limit: POR_PAGINA,
      start: pagina * POR_PAGINA,
      order_field: 'date',
      order_direction: 'DESC'
    });
    if (!Array.isArray(lote) || lote.length === 0) break;

    for (const factura of lote) {
      if (!ids.has(String(factura.id))) continue;
      encontradas.add(String(factura.id));
      vistas++;

      for (const linea of factura.items || []) {
        const nota = String(linea.description || '').trim();
        if (!nota) continue;

        const producto = String(linea.id);
        if (!porProducto[producto]) porProducto[producto] = [];

        // La MISMA nota repetida se junta en una sola, con la cuenta de
        // cuántas veces y de qué clientes. Sin esto, un "Entregado" escrito
        // cinco veces llenaría la pantalla y taparía la que sí importa.
        const iguales = porProducto[producto].find(
          (n) => n.nota.toLowerCase() === nota.toLowerCase()
        );
        const cliente = factura.client?.name || null;
        const numero = factura.numberTemplate?.fullNumber || String(factura.id);

        if (iguales) {
          iguales.veces++;
          if (cliente && !iguales.clientes.includes(cliente)) iguales.clientes.push(cliente);
          if (factura.date > iguales.fecha) {
            iguales.fecha = factura.date;
            iguales.numeroFactura = numero;
          }
        } else {
          porProducto[producto].push({
            nota,
            veces: 1,
            clientes: cliente ? [cliente] : [],
            numeroFactura: numero,
            fecha: factura.date
          });
        }
      }
    }

    // Se corta apenas aparecieron todas las que interesan. Es la condición
    // exacta; la fecha queda de respaldo por si alguna factura del reporte ya
    // no existe en Alegra y nunca se encontrara.
    if (encontradas.size === ids.size) break;
    const ultima = lote[lote.length - 1];
    if (desde && ultima?.date && ultima.date < desde) break;
    if (lote.length < POR_PAGINA) break;
  }

  // La más reciente primero: es la que describe lo que se está pidiendo ahora.
  for (const producto of Object.keys(porProducto)) {
    porProducto[producto].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }

  const valor = { porProducto, facturas: vistas, desde: desde || null };
  cache = { clave: claveCache, hora: Date.now(), valor };
  return valor;
}

/** Para las pruebas y para el día que haya que forzar una relectura. */
function olvidarCache() {
  cache = null;
}

module.exports = { notasPorProducto, facturasConFaltantes, olvidarCache };

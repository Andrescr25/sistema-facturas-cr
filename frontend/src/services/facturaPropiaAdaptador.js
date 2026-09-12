/**
 * Traduce la factura PROPIA a la forma que todavía habla el resto de la
 * pantalla.
 *
 * POR QUÉ VIVE ACÁ Y NO EN EL SERVIDOR
 * El backend propio devuelve nuestras columnas (`numero`, `cliente_nombre`,
 * `lineas`). El frontend —el cache de IndexedDB, la pestaña de edición, la
 * impresión— fue escrito contra la forma de Alegra (`numberTemplate.fullNumber`,
 * `client`, `items`, `status`). Se podía hacer que el servidor devolviera la
 * forma de Alegra y no cambiar nada del navegador, pero eso sería meter el
 * vocabulario del que estamos saliendo DENTRO de nuestra propia API, y ahí se
 * queda para siempre.
 *
 * Poniéndolo acá, la deuda queda pegada al código que la necesita: el día que
 * esos componentes hablen nuestro idioma, este archivo se borra entero y el
 * backend no se entera.
 */

/** Lo que devuelve el servidor propio, contado como lo espera la pantalla. */
export function desdeFacturaPropia(f) {
  if (!f) return f;

  const lineas = Array.isArray(f.lineas) ? f.lineas : [];
  const fecha = typeof f.fecha === 'string' ? f.fecha.slice(0, 10) : f.fecha;

  return {
    id: f.id,
    // `numero` ya viene armado con su serie ("001000014869"): la pantalla lo
    // muestra tal cual en el mensaje de "factura creada".
    numberTemplate: { fullNumber: f.numero, number: f.consecutivo, prefix: f.serie },
    date: fecha,
    dueDate: typeof f.fecha_vencimiento === 'string' ? f.fecha_vencimiento.slice(0, 10) : f.fecha_vencimiento,
    // 'void' y 'open' son las palabras de Alegra, y las entiende lo que ya
    // está escrito. Desaparecen con este archivo.
    status: f.estado === 'anulada' ? 'void' : 'open',
    client: {
      id: f.cliente_id,
      name: f.cliente_nombre,
      identification: f.cliente_identificacion
    },
    observations: f.observaciones || '',
    total: Number(f.total) || 0,
    items: lineas.map(l => ({
      // El id de Alegra mientras el catálogo siga teniéndolo; si no, el propio.
      id: l.alegra_item_id ?? l.producto_id,
      productoId: l.producto_id,
      name: l.nombre,
      reference: l.referencia,
      description: l.descripcion || '',
      quantity: Number(l.cantidad) || 0,
      price: Number(l.precio_unitario) || 0,
      discount: Number(l.descuento_porcentaje) || 0,
      tax: l.impuesto_id ? [{ id: l.impuesto_id, percentage: Number(l.tarifa) || 0 }] : []
    })),
    // La marca que le dice al resto que este documento es nuestro: de acá sale
    // por nuestro PDF y se edita por nuestras rutas, no por las de Alegra.
    esPropia: true
  };
}

/**
 * Abre el PDF propio en una pestaña.
 *
 * El PDF lo arma nuestro servidor y va detrás del token, así que se pide como
 * archivo y se abre desde la memoria del navegador: una URL suelta en otra
 * pestaña no lleva la autorización. Es el mismo camino del PDF de cotización.
 *
 * @param {object} api el cliente con el token ya puesto
 */
export async function abrirPdfFacturaPropia(api, facturaId) {
  // La ventana se abre ANTES de pedir el archivo: abrirla después, dentro del
  // await, el navegador la trata como emergente y la bloquea.
  const ventana = window.open('', '_blank');
  try {
    const { data } = await api.get(`/facturacion/facturas/${facturaId}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
    if (ventana) ventana.location = url;
    else window.location.href = url;
    // Se libera después de que la pestaña alcanzó a cargarlo; revocarlo de
    // inmediato la deja en blanco.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { success: true };
  } catch (error) {
    ventana?.close();
    throw error;
  }
}

/**
 * Lo mismo, pero para lo que devuelve la CONSULTA (`GET /facturacion/facturas`
 * y `/facturas/:id`), que habla en camelCase y anida el cliente.
 *
 * Son dos formas porque son dos caminos: al crear se devuelve la fila recién
 * escrita, y al consultar una vista ya calculada (con saldo, cobros y notas).
 */
export function desdeConsultaPropia(f) {
  if (!f) return f;

  const lineas = Array.isArray(f.lineas) ? f.lineas : [];
  return {
    id: f.id,
    numberTemplate: { fullNumber: f.numero, number: f.consecutivo, prefix: f.serie },
    date: typeof f.fecha === 'string' ? f.fecha.slice(0, 10) : f.fecha,
    dueDate: typeof f.fechaVencimiento === 'string' ? f.fechaVencimiento.slice(0, 10) : f.fechaVencimiento,
    status: f.estado === 'anulada' ? 'void' : (Number(f.saldo) > 0 ? 'open' : 'closed'),
    client: {
      id: f.cliente?.id,
      name: f.cliente?.nombre,
      identification: f.cliente?.identificacion
    },
    observations: f.observaciones || '',
    total: Number(f.total) || 0,
    saldo: Number(f.saldo) || 0,
    // En el listado `lineas` es un NÚMERO (cuántas son) y no la lista: las
    // líneas solo bajan al abrir una factura. Confundirlos deja la pantalla de
    // edición creyendo que la factura se quedó sin productos.
    items: Array.isArray(lineas) ? lineas.map(l => ({
      id: l.productoId,
      productoId: l.productoId,
      name: l.nombre,
      reference: l.referencia,
      description: l.descripcion || '',
      quantity: Number(l.cantidad) || 0,
      price: Number(l.precioUnitario) || 0,
      discount: Number(l.descuentoPorcentaje) || 0,
      tax: [{ percentage: Number(l.tarifa) || 0 }]
    })) : [],
    // Cuántas líneas tiene, aunque no hayan bajado todavía.
    cantidadLineas: Array.isArray(lineas) ? lineas.length : (Number(f.lineas) || 0),
    esPropia: true
  };
}

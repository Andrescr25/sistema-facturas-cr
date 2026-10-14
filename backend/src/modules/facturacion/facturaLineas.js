/** Cálculo de líneas e identidad de la copia mostrada, sin acceso a la base. */
const { httpError } = require('../../utils/validacion');

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Recorta un texto al largo de su columna.
 *
 * ES UNA FUNCIÓN PROPIA, Y NO EL `texto` DE utils/validacion, A PROPÓSITO. Ese
 * se usa al revés: `texto(largo)` DEVUELVE el validador, y recién entonces se
 * le pasa el valor. Escribirlo como `texto(valor, largo)` no falla ni avisa —
 * devuelve la función, que al guardarse se convierte en su propio código
 * fuente: 294 caracteres que reventaban tres columnas a la vez. Los archivos
 * de traducción (desdeAlegra) tienen su propio `texto(v, max)` con el valor
 * primero, y esa colisión de nombres fue justo la trampa.
 */
function recortar(valor, largo) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s ? s.slice(0, largo) : null;
}

/** La referencia tal como se compara: sin espacios de borde y sin distinguir mayúsculas. */
const referenciaComparable = (valor) => String(valor ?? '').trim().toLowerCase();

/** El nombre tal como se compara: sin acentos, sin mayúsculas y con los espacios juntos. */
const nombreComparable = (valor) => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/** La cédula tal como se compara: solo letras y números ("3-101-123456" = "3101123456"). */
const cedulaComparable = (valor) => String(valor ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase();

/**
 * ¿Lo que mostraba la pantalla es lo que hay acá con ese id?
 *
 * Recibe pares [lo que mandó la pantalla, lo que dice la ficha]. Con que UNA
 * seña calce, es el mismo: así corregirle el nombre a un cliente en la
 * oficina no rechaza la factura que una tablet hizo sin señal con el nombre
 * de antes (la cédula sigue calzando). Quien no manda ninguna seña (el
 * portal, Impresión, una cola antigua) no se revisa.
 */
function esLoMostrado(pares) {
  const dichas = pares.filter(([mostrado]) => mostrado);
  return dichas.length === 0 || dichas.some(([mostrado, real]) => mostrado === real);
}

/**
 * EL CLIENTE QUE EL CAJERO VIO TIENE QUE SER EL QUE SE FACTURA.
 *
 * El id de Alegra de un cliente es el id propio de otro. El 2026-10-10, en
 * producción, un dispositivo con el catálogo de antes del corte mandó el id
 * de Alegra como si fuera el propio y dos facturas salieron a nombre de
 * PANADERÍA SION, sin un solo error. El id solo no alcanza para darse
 * cuenta. La pantalla manda además el nombre y la cédula que mostraba; si
 * ninguno es el de la ficha con ese id, no se factura.
 */
function exigirClienteMostrado(datos, ficha) {
  if (esLoMostrado([
    [nombreComparable(datos?.clienteNombre), nombreComparable(ficha.nombre)],
    [cedulaComparable(datos?.clienteIdentificacion), cedulaComparable(ficha.identificacion)]
  ])) return;
  const mostrado = String(datos.clienteNombre || datos.clienteIdentificacion).trim();
  throw httpError(409,
    `El cliente elegido no coincide con el del servidor: la pantalla mostraba «${mostrado}» ` +
    `y ese código acá es «${ficha.nombre}». El catálogo de este dispositivo está viejo: toque ` +
    '«Actualizar catálogo» y arme la factura de nuevo.');
}

/**
 * Arma las líneas con la tarifa del maestro y calcula los totales.
 *
 * El descuento viene en porcentaje, como lo manda la pantalla, y se guarda
 * también en monto para que sumar la factura no exija rehacer la regla de tres
 * en cada consulta.
 */
function armarLineas(items, productosPorClave, claveDe, { yaFacturados = new Set(), preciosConImpuesto = false, exigirLoMostrado = false } = {}) {
  const lineas = [];
  let subtotal = 0;
  let descuentoTotal = 0;
  let impuestoTotal = 0;

  items.forEach((item, indice) => {
    const clave = claveDe(item);
    const producto = productosPorClave.get(String(clave));
    if (!producto) throw httpError(400, `No se encontró el producto ${clave}.`);

    // LO QUE EL CAJERO VIO TIENE QUE SER LO QUE SE FACTURA. La línea llega con
    // el id del producto Y con la referencia y el nombre que la pantalla
    // mostraba. Si el dispositivo conserva un catálogo de antes del corte,
    // ese id es el de Alegra y acá es OTRO producto: el 2026-10-10, en
    // producción, se pidió la referencia 0005 (UNIÓN LISA) y se facturó JARRA
    // VIDRIO MD LABRADA, sin un solo error. No se revisa lo que ya estaba en
    // la factura: su referencia es la copia de aquel día y pudo cambiar.
    if (exigirLoMostrado && !yaFacturados.has(producto.id) && !esLoMostrado([
      [referenciaComparable(item.reference ?? item.referencia), referenciaComparable(producto.referencia)],
      [nombreComparable(item.name ?? item.nombre), nombreComparable(producto.nombre)]
    ])) {
      const pedido = [item.reference ?? item.referencia, item.name ?? item.nombre]
        .map(v => String(v ?? '').trim()).filter(Boolean).join(' ');
      throw httpError(409,
        `La línea ${indice + 1} no coincide con el catálogo del servidor: la pantalla pidió «${pedido}» ` +
        `y ese código acá es «${[producto.referencia, producto.nombre].filter(Boolean).join(' ')}». ` +
        'El catálogo de este dispositivo está viejo: toque «Actualizar catálogo» y arme la factura de nuevo.');
    }

    // Un producto desactivado DESPUÉS de facturarlo se puede conservar al
    // editar esa factura (Impresión la ajusta para reimprimirla); lo que no se
    // puede es agregarlo nuevo.
    if (!producto.activo && !yaFacturados.has(producto.id)) {
      throw httpError(400, `${producto.nombre} está inactivo: no se puede facturar.`);
    }

    const cantidad = Number(item.quantity ?? item.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw httpError(400, `${producto.nombre}: la cantidad tiene que ser mayor que cero.`);
    }
    let precio = Number(item.price ?? item.precio);
    if (!Number.isFinite(precio) || precio < 0) {
      throw httpError(400, `${producto.nombre}: el precio no es válido.`);
    }

    const porcentajeDescuento = Number(item.discount ?? item.descuento) || 0;
    if (porcentajeDescuento < 0 || porcentajeDescuento > 100) {
      throw httpError(400, `${producto.nombre}: el descuento va entre 0 y 100.`);
    }

    // La tarifa del PRODUCTO, no la que mande la pantalla.
    const tarifa = producto.tarifa === null || producto.tarifa === undefined ? 0 : Number(producto.tarifa);
    const bruto = cantidad * precio;
    let descuentoMonto, base, impuestoMonto;
    if (preciosConImpuesto) {
      // El portal promete un precio FINAL. Separar base e IVA del total de
      // la línea evita perder centavos al dividir y luego redondear de nuevo
      // (dos unidades de ₡37.800 al 13% deben seguir costando ₡75.600).
      const totalConImpuesto = dinero(bruto * (1 - porcentajeDescuento / 100));
      base = dinero(totalConImpuesto / (1 + tarifa / 100));
      impuestoMonto = dinero(totalConImpuesto - base);
      descuentoMonto = dinero((bruto * porcentajeDescuento / 100) / (1 + tarifa / 100));
      precio = Math.round(precio / (1 + tarifa / 100) * 100000) / 100000;
    } else {
      descuentoMonto = dinero((bruto * porcentajeDescuento) / 100);
      base = dinero(bruto - descuentoMonto);
      impuestoMonto = dinero((base * tarifa) / 100);
    }

    subtotal += base;
    descuentoTotal += descuentoMonto;
    impuestoTotal += impuestoMonto;

    lineas.push({
      numero_linea: indice + 1,
      producto_id: producto.id,
      nombre: producto.nombre,
      referencia: producto.referencia,
      // Lo que el cajero escribió para esta línea; si no escribió nada, la del producto.
      descripcion: recortar(item.description ?? item.descripcion, 2000) || producto.descripcion,
      cabys: producto.cabys,
      unidad: producto.unidad,
      cantidad,
      precio_unitario: precio,
      descuento_porcentaje: porcentajeDescuento,
      descuento_monto: descuentoMonto,
      impuesto_id: producto.impuesto_id,
      tarifa,
      impuesto_monto: impuestoMonto,
      total: dinero(base + impuestoMonto),
      alegra_item_id: producto.alegra_id
    });
  });

  return {
    lineas,
    subtotal: dinero(subtotal),
    descuento: dinero(descuentoTotal),
    impuesto: dinero(impuestoTotal),
    total: dinero(subtotal + impuestoTotal)
  };
}

module.exports = { armarLineas, exigirClienteMostrado, recortar, dinero };

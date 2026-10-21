/**
 * Crear un producto del maestro a partir de una línea de factura de proveedor,
 * y dejar esa línea relacionada con él.
 *
 * Hasta el 2026-10-04 esto creaba el producto EN ALEGRA (`POST /items`), le
 * subía la foto allá, lo releía para copiarlo a `alegra_products_cache` y
 * relacionaba la línea por el id de Alegra. En esta rama a Alegra solo se le
 * lee: el botón no podía funcionar.
 *
 * Ahora el producto nace en `producto`, por la misma puerta que "Nuevo
 * producto" de Gestión de Catálogo (`productos.service.crearProducto`): las
 * mismas reglas —CABYS de 13 dígitos, impuesto obligatorio, referencia única
 * entre los activos, medicamento con forma y registro— y la misma línea en la
 * bitácora. La foto va al almacenamiento propio.
 *
 * LO QUE CAMBIA PARA QUIEN LLENA EL FORMULARIO
 *
 * · El IMPUESTO se elige. En Alegra se deducía del IVA de la línea y, si no
 *   calzaba con ninguno, el producto se creaba sin impuesto. Acá un producto
 *   sin impuesto no se puede facturar, así que el formulario lo propone (el
 *   que calza con el IVA real de la línea) y deja cambiarlo.
 * · La REFERENCIA vacía queda vacía. Antes se rellenaba con el código del
 *   proveedor; como la referencia tiene que ser única, eso volvía imposible
 *   crear el producto cuando ese código ya lo usaba otro: borrar el campo
 *   mandaba el mismo código otra vez.
 * · No hay CANTIDAD INICIAL. Era el inventario inicial en Alegra, y el
 *   inventario propio todavía no existe (espera el conteo físico). Un campo
 *   que no guarda nada es peor que no tenerlo.
 * · No se escribe `alegra_products_cache`.
 */

const prisma = require('../../../lib/prisma');
const { query } = require('../../../config/database');
const productos = require('../productos/productos.service');
const imagenes = require('../productos/productos.imagenes');
const { cabysPareceMedicamento } = require('../../utils/medicamento');
const { calcularCostoUnitarioProveedor } = require('../precios/costo');
const { sincronizarCostoDeLineas } = require('../precios/costoHistorico');
const { httpError } = require('../../utils/validacion');
const { productoPropio, guardarMapeo, relacionarLineas, recalcularAvance } = require('./relacionPropia');

// El IVA de una línea se calcula dividiendo dos montos redondeados: un 13 %
// llega como 12,99 o 13,01. Medio punto separa bien todas las tarifas vigentes
// (0, 0,5, 1, 2, 4, 8 y 13).
const TOLERANCIA_TARIFA = 0.5;

// El formulario viejo mandaba las unidades con el vocabulario de Alegra. El
// maestro guarda la abreviatura de Hacienda.
const UNIDAD_DE_ALEGRA = {
  unit: 'Unid', service: 'Os', meter: 'm', kilogram: 'kg', gram: 'g', liter: 'L', hour: 'h', day: 'd'
};

const sinAcentos = (texto) => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const limpio = (texto) => (texto === undefined || texto === null ? '' : String(texto).trim());

async function lineaDelProveedor(lineaId) {
  const linea = await prisma.productoFactura.findUnique({ where: { id: lineaId }, include: { factura: true } });
  if (!linea) throw httpError(404, 'Producto original no encontrado');
  if (linea.factura?.estado === 'GASTO_RECURRENTE') {
    throw httpError(409, 'Esta factura es un gasto: sus líneas no se crean como productos del catálogo.');
  }
  return linea;
}

/**
 * El impuesto que le corresponde a un producto según el IVA REAL de la línea
 * con que llegó. Si varios impuestos tienen esa tarifa (hay tres de 0 %), gana
 * el que más productos activos usan: es el que la empresa viene eligiendo.
 *
 * @returns {Promise<{porcentaje: number, impuesto: {id: number, nombre: string, tarifa: number}|null}>}
 */
async function impuestoDeLinea(linea) {
  const { porcentajeIva } = calcularCostoUnitarioProveedor(linea);
  const porcentaje = Number.isFinite(porcentajeIva) ? Math.round(porcentajeIva * 100) / 100 : 0;

  const { rows } = await query(`
    SELECT i.id, i.nombre, i.tarifa::float8 AS tarifa
      FROM impuesto i
      LEFT JOIN producto p ON p.impuesto_id = i.id AND p.activo = TRUE
     WHERE i.activo = TRUE AND ABS(i.tarifa - $1) <= $2
     GROUP BY i.id, i.nombre, i.tarifa
     ORDER BY ABS(i.tarifa - $1), COUNT(p.id) DESC, i.id
     LIMIT 1`, [porcentaje, TOLERANCIA_TARIFA]);
  return { porcentaje, impuesto: rows[0] || null };
}

/**
 * Lo que el formulario necesita para abrirse: las categorías y los impuestos
 * propios, y el impuesto que se propone para ESTA línea.
 *
 * Vive en este módulo, y no se piden a `/maestro/categorias`, porque quien
 * relaciona compras no tiene por qué tener permiso sobre Gestión de Catálogo.
 */
async function formularioProducto(lineaId) {
  const linea = await lineaDelProveedor(lineaId);
  const [categorias, impuestos, propuesto] = await Promise.all([
    query('SELECT id, nombre FROM categoria_producto WHERE activo = TRUE ORDER BY lower(nombre)'),
    query('SELECT id, nombre, tarifa::float8 AS tarifa FROM impuesto WHERE activo = TRUE ORDER BY tarifa DESC, id'),
    impuestoDeLinea(linea)
  ]);
  return {
    categorias: categorias.rows,
    impuestos: impuestos.rows,
    impuestoSugerido: propuesto.impuesto,
    porcentajeDeLaLinea: propuesto.porcentaje
  };
}

/** `'true'`/`'false'` del formulario (multipart) o un booleano de verdad. */
function casilla(valor) {
  if (valor === true || valor === 'true') return true;
  if (valor === false || valor === 'false') return false;
  return null;
}

/**
 * @param {object} datos  lo que manda el formulario (multipart: todo son textos)
 * @param {{buffer: Buffer, originalname: string, mimetype: string}|undefined} imagen
 * @param {number|undefined} usuarioId
 */
async function crearProductoDesdeLinea(datos, imagen, usuarioId) {
  const linea = await lineaDelProveedor(datos.productoId);

  const categoriaId = limpio(datos.categoria) ? Number(datos.categoria) : null;
  const categoriaNombre = categoriaId
    ? (await query('SELECT nombre FROM categoria_producto WHERE id = $1', [categoriaId])).rows[0]?.nombre || ''
    : '';

  const cabys = limpio(datos.codigoCabys) || limpio(linea.codigoCabys);
  const forma = limpio(datos.formaFarmaceutica);
  const registro = limpio(datos.registroSanitario);

  // MANDA LA CASILLA. Antes era un OR contra las reglas automáticas, y el
  // CABYS '35' arrastraba pinturas, aceites y cosméticos: quien creaba un
  // producto así lo desmarcaba en pantalla y el servidor se lo volvía a
  // marcar, exigiéndole una forma farmacéutica y un registro que no tiene.
  // Las reglas automáticas valen solo cuando quien envía no se pronunció.
  const marcada = casilla(datos.esMedicamento);
  const categoria = sinAcentos(categoriaNombre);
  const esMedicamento = marcada !== null
    ? marcada
    : (categoria.includes('medicamento') || categoria.includes('farmac') || cabysPareceMedicamento(cabys) || Boolean(forma || registro));

  let impuestoId = limpio(datos.impuestoId) ? Number(datos.impuestoId) : null;
  if (!impuestoId) {
    const { porcentaje, impuesto } = await impuestoDeLinea(linea);
    if (!impuesto) {
      throw httpError(400, `Impuesto: la línea del proveedor trae ${porcentaje} % y no calza con ninguna tarifa. Hay que elegirlo.`);
    }
    impuestoId = impuesto.id;
  }

  const unidad = limpio(datos.unidad);

  // El maestro valida todo lo demás (largo del nombre, CABYS de 13 dígitos,
  // referencia libre, impuesto y categoría vigentes, datos de medicamento) y
  // escribe la bitácora. Sin descripción va vacía, NO el nombre.
  const producto = await productos.crearProducto({
    nombre: limpio(datos.nombre),
    descripcion: limpio(datos.descripcion) || null,
    referencia: limpio(datos.referencia) || null,
    cabys,
    impuesto_id: impuestoId,
    unidad: UNIDAD_DE_ALEGRA[unidad] || unidad || 'Unid',
    categoria_id: categoriaId,
    precio_sin_iva: limpio(datos.precio),
    costo_con_iva: limpio(datos.costo),
    es_medicamento: esMedicamento,
    forma_farmaceutica: esMedicamento ? forma : null,
    registro_sanitario: esMedicamento ? registro : null
  }, usuarioId);

  // El producto ya existe. Si relacionarlo falla, no se pierde: se dice dónde
  // quedó, para que se relacione con el buscador y no se cree dos veces.
  let mapeo;
  try {
    const propio = await productoPropio(producto.id);
    mapeo = await guardarMapeo({
      cedula: linea.factura.proveedorCedula,
      codigo: linea.codigoProveedor,
      nombreProveedor: linea.factura.proveedorNombre,
      descripcion: linea.descripcion
    }, propio);

    // Si el proveedor lo factura en otra unidad (25 sueltos que se venden como
    // un paquete), el factor queda en el mapeo para las facturas que vengan.
    const factor = parseFloat(datos.factorConversion);
    if (Number.isFinite(factor) && factor > 0) {
      await query('UPDATE supplier_product_mapping SET factor_conversion = $2 WHERE id = $1', [mapeo.id, factor]);
    }

    await relacionarLineas({ lineaIds: [linea.id] }, propio, { mapeoId: mapeo.id });
    await sincronizarCostoDeLineas([linea.id]);
    await recalcularAvance([linea.id]);
  } catch (error) {
    console.error('❌ Producto creado pero no relacionado:', error);
    throw httpError(500,
      `El producto "${producto.nombre}" se creó, pero no se pudo relacionar con esta línea. ` +
      'Buscalo con "Relacionar" en vez de crearlo de nuevo.');
  }

  // La foto no detiene nada: el producto y la relación ya están.
  const warnings = [];
  let imagenSubida = false;
  try {
    if (imagen) {
      await imagenes.asignarImagenDesdeArchivo(producto.id, imagen, usuarioId);
      imagenSubida = true;
    } else if (limpio(datos.imageUrl)) {
      await imagenes.asignarImagenDesdeUrl(
        producto.id, { url: limpio(datos.imageUrl), urlRespaldo: limpio(datos.fallbackImageUrl) || undefined }, usuarioId);
      imagenSubida = true;
    }
  } catch (error) {
    console.error('⚠️ No se pudo guardar la foto (el producto quedó creado):', error.message);
    warnings.push(`No se pudo guardar la foto: ${error.message} Se puede poner después desde Gestión de Catálogo.`);
  }

  console.log(`✅ Producto ${producto.id} creado y relacionado: ${linea.descripcion} → ${producto.nombre}`);

  return {
    message: warnings.length > 0
      ? `Producto "${producto.nombre}" creado y relacionado, con advertencias`
      : `Producto "${producto.nombre}" creado y relacionado exitosamente`,
    productoPropioId: producto.id,
    mapeoId: mapeo.id,
    imagenSubida,
    warnings
  };
}

module.exports = { crearProductoDesdeLinea, formularioProducto, impuestoDeLinea, TOLERANCIA_TARIFA };

/**
 * Productos y categorías — Service (rama independencia-alegra)
 *
 * El maestro de productos sin Alegra. Reglas:
 *
 * - Nada se borra. `activo = false` lo saca de la venta; `oculto = true` lo
 *   deja vendible pero fuera de los catálogos que ven los clientes.
 * - Un producto nuevo necesita CABYS e impuesto: sin eso no se puede facturar.
 * - El impuesto y la categoría tienen que existir y estar activos al asignarlos.
 * - Un medicamento necesita forma farmacéutica y registro sanitario. Se exige
 *   al crearlo o al tocar esos datos; editar el precio de uno viejo que está
 *   incompleto no se bloquea (hay 10 así, se corrigen aparte).
 * - No puede haber dos productos activos con la misma referencia.
 * - Cada cambio de precio va a `precio_historico` igual que desde Revisión de
 *   Precios: precios sin IVA, costo sin IVA y el margen que resulta.
 * - Todo cambio queda en la bitácora, dentro de la misma transacción.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, texto, numero, booleano, validar, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { precioConImpuesto } = require('../catalogo-clientes/precio');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);
const LIMITE_MAXIMO = 100;
const SIN_PROVEEDOR = 'sin-proveedor';

const entero = numero({ min: 1, max: 2147483647, entero: true });

const CAMPOS_PRODUCTO = {
  nombre: { etiqueta: 'Nombre', requerido: true, validar: texto(250) },
  referencia: { etiqueta: 'Referencia', validar: texto(100) },
  descripcion: { etiqueta: 'Descripción', validar: texto(2000) },
  cabys: { etiqueta: 'CABYS', requerido: true, validar: texto(13, { patron: /^\d{13}$/, mensajePatron: 'tiene que tener 13 dígitos' }) },
  impuesto_id: { etiqueta: 'Impuesto', requerido: true, validar: entero },
  unidad: { etiqueta: 'Unidad', validar: texto(20) },
  categoria_id: { etiqueta: 'Categoría', validar: entero },
  precio_sin_iva: { etiqueta: 'Precio sin IVA', requerido: true, validar: numero({ min: 0, max: 1e10 }) },
  costo_con_iva: { etiqueta: 'Costo con IVA', validar: numero({ min: 0, max: 1e10 }) },
  inventariable: { etiqueta: 'Inventariable', validar: booleano },
  es_medicamento: { etiqueta: 'Es medicamento', validar: booleano },
  forma_farmaceutica: { etiqueta: 'Forma farmacéutica', validar: texto(3, { patron: /^\d{1,3}$/, mensajePatron: 'es un código de 1 a 3 dígitos' }) },
  registro_sanitario: { etiqueta: 'Registro sanitario', validar: texto(60) }
};
const CAMPOS_MEDICAMENTO = ['es_medicamento', 'forma_farmaceutica', 'registro_sanitario'];

const CAMPOS_CATEGORIA = {
  nombre: { etiqueta: 'Nombre', requerido: true, validar: texto(80) }
};

// ─── Utilidades ────────────────────────────────────────────────────────────

const SELECT_VISTA = `
  SELECT p.*, c.nombre AS categoria, i.nombre AS impuesto, i.tarifa AS tarifa
  FROM producto p
  LEFT JOIN categoria_producto c ON c.id = p.categoria_id
  LEFT JOIN impuesto i ON i.id = p.impuesto_id`;

/** Los NUMERIC llegan como texto desde pg: se entregan como número. */
function aVista(f) {
  if (!f) return f;
  const tarifa = f.tarifa === null || f.tarifa === undefined ? null : Number(f.tarifa);
  const precio = Number(f.precio_sin_iva);
  const { total: _t, ...resto } = f;
  return {
    ...resto,
    precio_sin_iva: precio,
    costo_con_iva: Number(f.costo_con_iva),
    tarifa,
    // Sin impuesto asignado no se inventa el precio con IVA.
    precio_con_iva: tarifa === null ? null : precioConImpuesto(precio, tarifa)
  };
}

function sinTiempos(fila) {
  if (!fila) return fila;
  const { actualizado_en: _a, creado_en: _c, ...resto } = fila;
  return resto;
}

function traducirDuplicado(error, que) {
  if (error.code === '23505') return httpError(409, `Ya existe ${que} con ese nombre.`);
  return error;
}

/** Quita acentos y pasa a minúsculas, igual en la consulta y en el texto buscado. */
const NORMALIZAR_SQL = (expr) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;
function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function obtenerCon(ejecutor, id) {
  const { rows } = await ejecutor.query(`${SELECT_VISTA} WHERE p.id = $1`, [id]);
  return aVista(rows[0]);
}

async function revisarImpuesto(ejecutor, id) {
  const { rows } = await ejecutor.query('SELECT id, tarifa, activo FROM impuesto WHERE id = $1', [id]);
  if (!rows[0] || !rows[0].activo) throw httpError(400, 'Impuesto: no existe o está inactivo.');
  return Number(rows[0].tarifa);
}

async function revisarCategoria(ejecutor, id) {
  const { rows } = await ejecutor.query('SELECT id, activo FROM categoria_producto WHERE id = $1', [id]);
  if (!rows[0] || !rows[0].activo) throw httpError(400, 'Categoría: no existe o está inactiva.');
}

async function revisarReferenciaLibre(ejecutor, referencia, idPropio) {
  if (!referencia) return;
  const { rows } = await ejecutor.query(
    'SELECT id, nombre FROM producto WHERE activo = TRUE AND lower(referencia) = lower($1) AND id <> $2 LIMIT 1',
    [referencia, idPropio || 0]
  );
  if (rows[0]) throw httpError(409, `La referencia ${referencia} ya la usa "${rows[0].nombre}".`);
}

function revisarMedicamento(fila) {
  if (fila.es_medicamento && (!fila.forma_farmaceutica || !fila.registro_sanitario)) {
    throw httpError(400, 'Un medicamento necesita forma farmacéutica y registro sanitario.');
  }
}

function normalizarFila(fila) {
  if ('unidad' in fila && fila.unidad === null) throw httpError(400, 'Unidad: es obligatoria.');
  if ('costo_con_iva' in fila && fila.costo_con_iva === null) fila.costo_con_iva = 0;
  return fila;
}

// ─── Productos ─────────────────────────────────────────────────────────────

/**
 * @param {object} filtros
 * @param {'activos'|'ocultos'|'inactivos'|'todos'} filtros.estado
 */
async function listarProductos({ buscar = '', categoriaId, proveedor = '', sinImagen = false, estado = 'activos', pagina = 1, limite = 30 } = {}) {
  const where = [];
  const params = [];
  const agregar = (valor) => { params.push(valor); return `$${params.length}`; };

  switch (estado) {
    case 'activos': where.push('p.activo = TRUE AND p.oculto = FALSE'); break;
    case 'ocultos': where.push('p.activo = TRUE AND p.oculto = TRUE'); break;
    case 'inactivos': where.push('p.activo = FALSE'); break;
    case 'todos': break;
    default: throw httpError(400, 'Estado: tiene que ser activos, ocultos, inactivos o todos.');
  }

  for (const palabra of normalizar(buscar).split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push(`${NORMALIZAR_SQL("p.nombre || ' ' || COALESCE(p.referencia, '') || ' ' || COALESCE(p.descripcion, '')")} LIKE ${agregar(`%${palabra}%`)}`);
  }

  if (categoriaId !== undefined && categoriaId !== null && categoriaId !== '') {
    where.push(`p.categoria_id = ${agregar(idValido(categoriaId))}`);
  }

  if (sinImagen === true || sinImagen === 'true') {
    where.push("(p.imagen_url IS NULL OR p.imagen_url = '')");
  }

  // Quién vende qué está en supplier_product_mapping: por cédula del
  // proveedor y por `producto_id`. Hasta el 2026-10-03 se cruzaba por el id de
  // Alegra, y un producto creado en el sistema salía siempre "sin proveedor".
  const cedula = String(proveedor || '').trim();
  if (cedula === SIN_PROVEEDOR) {
    where.push('NOT EXISTS (SELECT 1 FROM supplier_product_mapping m WHERE m.producto_id = p.id)');
  } else if (cedula) {
    where.push(`EXISTS (SELECT 1 FROM supplier_product_mapping m WHERE m.producto_id = p.id AND m.supplier_cedula = ${agregar(cedula)})`);
  }

  const lim = Math.min(Math.max(parseInt(limite, 10) || 30, 1), LIMITE_MAXIMO);
  const pag = Math.max(parseInt(pagina, 10) || 1, 1);
  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `${SELECT_VISTA.replace('SELECT p.*,', 'SELECT p.*, COUNT(*) OVER() AS total,')}
     ${filtro}
     ORDER BY lower(p.nombre), p.id
     LIMIT ${agregar(lim)} OFFSET ${agregar((pag - 1) * lim)}`,
    params
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  return {
    data: rows.map(aVista),
    paginacion: { total, pagina: pag, limite: lim, paginas: Math.ceil(total / lim) }
  };
}

async function obtenerProducto(id) {
  const producto = await obtenerCon(pool, idValido(id));
  if (!producto) throw httpError(404, 'No existe ese producto.');
  return producto;
}

async function crearProducto(datos, usuarioId) {
  const fila = normalizarFila(validar(CAMPOS_PRODUCTO, datos, { crear: true }));
  if (!fila.unidad) fila.unidad = 'Unid';
  revisarMedicamento(fila);

  return enTransaccion(async (cliente) => {
    await revisarImpuesto(cliente, fila.impuesto_id);
    if (fila.categoria_id) await revisarCategoria(cliente, fila.categoria_id);
    await revisarReferenciaLibre(cliente, fila.referencia, null);

    const columnas = Object.keys(fila);
    const { rows } = await cliente.query(
      `INSERT INTO producto (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      columnas.map(c => fila[c])
    );
    await registrarCambio(cliente, { entidad: 'producto', entidadId: rows[0].id, accion: 'crear', despues: sinTiempos(rows[0]), usuarioId });
    return obtenerCon(cliente, rows[0].id);
  });
}

async function editarProducto(id, datos, usuarioId) {
  const n = idValido(id);
  const cambios = normalizarFila(validar(CAMPOS_PRODUCTO, datos, { crear: false }));
  const columnas = Object.keys(cambios);
  if (columnas.length === 0) throw httpError(400, 'No vino ningún dato para cambiar.');

  return enTransaccion(async (cliente) => {
    const { rows: previas } = await cliente.query('SELECT * FROM producto WHERE id = $1 FOR UPDATE', [n]);
    const antes = previas[0];
    if (!antes) throw httpError(404, 'No existe ese producto.');
    const despues = { ...antes, ...cambios };

    const tarifa = 'impuesto_id' in cambios
      ? await revisarImpuesto(cliente, cambios.impuesto_id)
      : null;
    if ('categoria_id' in cambios && cambios.categoria_id) await revisarCategoria(cliente, cambios.categoria_id);
    if ('referencia' in cambios && (cambios.referencia || '').toLowerCase() !== (antes.referencia || '').toLowerCase()) {
      await revisarReferenciaLibre(cliente, cambios.referencia, n);
    }
    if (CAMPOS_MEDICAMENTO.some(c => c in cambios)) revisarMedicamento(despues);

    const { rows } = await cliente.query(
      `UPDATE producto SET ${columnas.map((c, i) => `${c} = $${i + 1}`).join(', ')}, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $${columnas.length + 1} RETURNING *`,
      [...columnas.map(c => cambios[c]), n]
    );
    const nuevo = rows[0];

    const precioAntes = Number(antes.precio_sin_iva);
    const precioNuevo = Number(nuevo.precio_sin_iva);
    if ('precio_sin_iva' in cambios && precioAntes !== precioNuevo) {
      // Igual que Revisión de Precios: precios sin IVA, costo SIN IVA, margen.
      const tarifaFinal = tarifa !== null ? tarifa : await tarifaDe(cliente, nuevo.impuesto_id);
      const costoSinIva = tarifaFinal === null ? null : Number(nuevo.costo_con_iva) / (1 + tarifaFinal / 100);
      const margen = costoSinIva !== null && precioNuevo > 0 ? Math.round(((precioNuevo - costoSinIva) / precioNuevo) * 10000) / 100 : null;
      await cliente.query(
        `INSERT INTO precio_historico (producto_id, alegra_item_id, precio_anterior, precio_nuevo, costo_al_momento, margen_resultante, origen)
         VALUES ($1, $2, $3, $4, $5, $6, 'gestion_catalogo')`,
        [n, nuevo.alegra_id, precioAntes > 0 ? precioAntes : null, precioNuevo, costoSinIva === null ? null : Math.round(costoSinIva * 10000) / 10000, margen]
      );
    }

    await registrarCambio(cliente, {
      entidad: 'producto', entidadId: n, accion: 'editar',
      antes: sinTiempos(antes), despues: sinTiempos(nuevo), usuarioId
    });
    return obtenerCon(cliente, n);
  });
}

async function tarifaDe(ejecutor, impuestoId) {
  if (!impuestoId) return null;
  const { rows } = await ejecutor.query('SELECT tarifa FROM impuesto WHERE id = $1', [impuestoId]);
  return rows[0] ? Number(rows[0].tarifa) : null;
}

/** Activar/desactivar (sale de la venta) u ocultar/mostrar (sale de los catálogos). */
async function cambiarEstadoProducto(id, { activo, oculto } = {}, usuarioId) {
  const n = idValido(id);
  const cambios = {};
  if (activo !== undefined) cambios.activo = booleano(activo, 'Activo');
  if (oculto !== undefined) cambios.oculto = booleano(oculto, 'Oculto');
  if (Object.keys(cambios).length === 0) throw httpError(400, 'Hay que indicar activo u oculto.');

  return enTransaccion(async (cliente) => {
    const { rows: previas } = await cliente.query('SELECT * FROM producto WHERE id = $1 FOR UPDATE', [n]);
    const antes = previas[0];
    if (!antes) throw httpError(404, 'No existe ese producto.');
    const reales = Object.fromEntries(Object.entries(cambios).filter(([k, v]) => antes[k] !== v));
    if (Object.keys(reales).length === 0) return obtenerCon(cliente, n);

    const columnas = Object.keys(reales);
    const { rows } = await cliente.query(
      `UPDATE producto SET ${columnas.map((c, i) => `${c} = $${i + 1}`).join(', ')}, actualizado_en = CURRENT_TIMESTAMP WHERE id = $${columnas.length + 1} RETURNING *`,
      [...columnas.map(c => reales[c]), n]
    );
    const accion = 'activo' in reales
      ? (reales.activo ? 'activar' : 'desactivar')
      : (reales.oculto ? 'ocultar' : 'mostrar');
    await registrarCambio(cliente, { entidad: 'producto', entidadId: n, accion, antes: sinTiempos(antes), despues: sinTiempos(rows[0]), usuarioId });
    return obtenerCon(cliente, n);
  });
}

/**
 * La foto de cada referencia, del maestro propio. La usa Facturas en Bodega
 * para mostrar el producto de cada línea.
 *
 * Hasta el 2026-10-04 salía de `alegra_products_cache`, y en esta rama esa
 * caché ya no sirve para esto: sus 1.995 fotos son direcciones firmadas de
 * Alegra, que vencen a los 7 días, mientras el maestro tiene 2.022 guardadas
 * en almacenamiento propio. En Bodega se veían rotas.
 *
 * Se responde con la referencia TAL COMO SE PIDIÓ, que es la llave con la que
 * la pantalla busca; la comparación no distingue mayúsculas. Si dos productos
 * comparten referencia (quedan 4 casos, casi siempre uno inactivo), gana el
 * activo y, entre iguales, el más nuevo.
 *
 * @param {string[]} referencias
 * @returns {Promise<{referencia: string, imageUrl: string}[]>}
 */
async function imagenesPorReferencia(referencias) {
  const pedidas = [...new Set((referencias || []).map(r => String(r ?? '').trim()).filter(Boolean))].slice(0, 500);
  if (pedidas.length === 0) return [];

  const { rows } = await pool.query(`
    SELECT DISTINCT ON (lower(p.referencia)) lower(p.referencia) AS llave, p.imagen_url
      FROM producto p
     WHERE lower(p.referencia) = ANY($1::text[])
       AND p.imagen_url IS NOT NULL AND p.imagen_url <> ''
     ORDER BY lower(p.referencia), p.activo DESC, p.id DESC`,
  [[...new Set(pedidas.map(r => r.toLowerCase()))]]);

  const foto = new Map(rows.map(r => [r.llave, r.imagen_url]));
  return pedidas
    .filter(r => foto.has(r.toLowerCase()))
    .map(r => ({ referencia: r, imageUrl: foto.get(r.toLowerCase()) }));
}

/**
 * Siguiente código libre para agregar una marca de un producto.
 *
 * Devuelve el menor número LIBRE empezando en 1, con tres dígitos, así las
 * marcas nuevas quedan numeradas de corrido aunque las viejas no lo estén
 * (305-14, 305-908, 305-1453…). Si el producto ya es una variante (`305-14`),
 * la base es `305`: una marca hermana, no un código anidado `305-14-001`.
 *
 * SE CUENTA SOBRE EL MAESTRO PROPIO, también los inactivos. Se contaba sobre
 * la caché de Alegra, que en esta rama no se entera de los productos creados
 * acá: después de agregar una marca volvía a proponer el mismo código, y el
 * guardado lo rechazaba por repetido.
 */
async function siguienteReferenciaDeMarca(referenciaBase) {
  const base = String(referenciaBase || '').trim().replace(/-\d+$/, '');
  if (!base) throw httpError(400, 'Hace falta la referencia base.');

  // Con `left` y no con LIKE: una referencia puede traer `%` o `_`.
  const prefijo = `${base}-`;
  const { rows } = await pool.query(
    'SELECT referencia FROM producto WHERE lower(left(referencia, $2)) = lower($1)', [prefijo, prefijo.length]);

  const usados = new Set();
  for (const fila of rows) {
    const sufijo = String(fila.referencia).slice(prefijo.length);
    // Solo cuentan los sufijos puramente numéricos: '305-A' no ocupa un
    // número de la serie.
    if (/^\d+$/.test(sufijo)) usados.add(parseInt(sufijo, 10));
  }

  let siguiente = 1;
  while (usados.has(siguiente)) siguiente++;

  return {
    base,
    referencia: `${base}-${String(siguiente).padStart(3, '0')}`,
    usados: [...usados].sort((a, b) => a - b)
  };
}

/** Lo que necesitan los demás módulos para vender: activo, visible y lo justo. */
async function productosParaOperar({ buscar = '', pagina = 1, limite = 30 } = {}) {
  const r = await listarProductos({ buscar, pagina, limite, estado: 'activos' });
  return {
    ...r,
    data: r.data.map(p => ({
      id: p.id, alegra_id: p.alegra_id, nombre: p.nombre, referencia: p.referencia, descripcion: p.descripcion, unidad: p.unidad,
      cabys: p.cabys, categoria: p.categoria, impuesto_id: p.impuesto_id, tarifa: p.tarifa,
      precio_sin_iva: p.precio_sin_iva, precio_con_iva: p.precio_con_iva, imagen_url: p.imagen_url,
      es_medicamento: p.es_medicamento
    }))
  };
}

/** Proveedores con productos, para el filtro (mismo criterio que el catálogo actual). */
async function proveedoresConProductos() {
  const [conProveedor, sinProveedor] = await Promise.all([pool.query(`
    SELECT m.supplier_cedula AS cedula,
           (array_agg(m.supplier_name ORDER BY m.last_used_date DESC NULLS LAST))[1] AS nombre,
           COUNT(DISTINCT p.id)::int AS productos
    FROM supplier_product_mapping m
    JOIN producto p ON p.id = m.producto_id AND p.activo = TRUE AND p.oculto = FALSE
    WHERE m.supplier_cedula IS NOT NULL AND m.supplier_cedula <> ''
    GROUP BY m.supplier_cedula
    ORDER BY nombre`), pool.query(`
    SELECT COUNT(*)::int AS productos
    FROM producto p
    WHERE p.activo = TRUE AND p.oculto = FALSE
      AND NOT EXISTS (SELECT 1 FROM supplier_product_mapping m WHERE m.producto_id = p.id)`)]);
  return {
    proveedores: conProveedor.rows,
    sinProveedor: { valor: SIN_PROVEEDOR, productos: sinProveedor.rows[0]?.productos || 0 }
  };
}

// ─── Categorías ────────────────────────────────────────────────────────────

async function listarCategorias() {
  const { rows } = await pool.query(`
    SELECT c.*, COUNT(p.id) FILTER (WHERE p.activo)::int AS productos
    FROM categoria_producto c
    LEFT JOIN producto p ON p.categoria_id = c.id
    GROUP BY c.id
    ORDER BY lower(c.nombre)`);
  return rows;
}

async function crearCategoria(datos, usuarioId) {
  const fila = validar(CAMPOS_CATEGORIA, datos, { crear: true });
  try {
    return await enTransaccion(async (cliente) => {
      const { rows } = await cliente.query('INSERT INTO categoria_producto (nombre) VALUES ($1) RETURNING *', [fila.nombre]);
      await registrarCambio(cliente, { entidad: 'categoria_producto', entidadId: rows[0].id, accion: 'crear', despues: sinTiempos(rows[0]), usuarioId });
      return rows[0];
    });
  } catch (error) {
    throw traducirDuplicado(error, 'una categoría');
  }
}

async function editarCategoria(id, datos, usuarioId) {
  const n = idValido(id);
  const cambios = validar(CAMPOS_CATEGORIA, datos, { crear: false });
  if (!cambios.nombre) throw httpError(400, 'No vino ningún dato para cambiar.');
  try {
    return await enTransaccion(async (cliente) => {
      const { rows: previas } = await cliente.query('SELECT * FROM categoria_producto WHERE id = $1 FOR UPDATE', [n]);
      if (!previas[0]) throw httpError(404, 'No existe esa categoría.');
      const { rows } = await cliente.query('UPDATE categoria_producto SET nombre = $1 WHERE id = $2 RETURNING *', [cambios.nombre, n]);
      // `subcategoria` y `categoria_config` cuelgan del NOMBRE de la
      // categoría (así los hizo `main`, donde la categoría es de Alegra).
      // Renombrar sin arrastrarlo dejaría sus subcategorías y su orden
      // colgando de un nombre que ya no existe. El nombre visible se limpia:
      // el nombre de verdad ahora es el que se quiere ver.
      if (previas[0].nombre !== rows[0].nombre) {
        await cliente.query('UPDATE subcategoria SET categoria = $1 WHERE categoria = $2', [rows[0].nombre, previas[0].nombre]);
        await cliente.query(
          'UPDATE categoria_config SET categoria = $1, nombre_visible = NULL, actualizado_en = CURRENT_TIMESTAMP WHERE categoria = $2',
          [rows[0].nombre, previas[0].nombre]
        );
      }
      await registrarCambio(cliente, { entidad: 'categoria_producto', entidadId: n, accion: 'editar', antes: sinTiempos(previas[0]), despues: sinTiempos(rows[0]), usuarioId });
      return rows[0];
    });
  } catch (error) {
    throw traducirDuplicado(error, 'una categoría');
  }
}

async function cambiarActivoCategoria(id, activo, usuarioId) {
  const n = idValido(id);
  booleano(activo, 'Activo');
  return enTransaccion(async (cliente) => {
    const { rows: previas } = await cliente.query('SELECT * FROM categoria_producto WHERE id = $1 FOR UPDATE', [n]);
    if (!previas[0]) throw httpError(404, 'No existe esa categoría.');
    if (previas[0].activo === activo) return previas[0];
    const { rows } = await cliente.query('UPDATE categoria_producto SET activo = $1 WHERE id = $2 RETURNING *', [activo, n]);
    await registrarCambio(cliente, { entidad: 'categoria_producto', entidadId: n, accion: activo ? 'activar' : 'desactivar', antes: sinTiempos(previas[0]), despues: sinTiempos(rows[0]), usuarioId });
    return rows[0];
  });
}

module.exports = {
  CAMPOS_PRODUCTO,
  SIN_PROVEEDOR,
  listarProductos,
  obtenerProducto,
  crearProducto,
  editarProducto,
  cambiarEstadoProducto,
  productosParaOperar, imagenesPorReferencia, siguienteReferenciaDeMarca,
  proveedoresConProductos,
  listarCategorias,
  crearCategoria,
  editarCategoria,
  cambiarActivoCategoria
};

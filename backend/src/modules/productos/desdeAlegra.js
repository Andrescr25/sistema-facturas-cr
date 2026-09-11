/**
 * Traducción de los productos de Alegra a las tablas propias.
 *
 * Funciones puras: entra un ítem tal como lo devuelve GET /items y salen las
 * filas. La carga (scripts/independencia/cargar-productos.js) solo lee de
 * Alegra y escribe con esto, así que la traducción se prueba sin red.
 *
 * Nada se inventa: un producto sin impuesto queda sin impuesto, un CABYS que
 * no tiene 13 dígitos queda vacío. Se cuentan para corregirlos, no se tapan.
 */

/** Unidad de Alegra a la abreviatura de Hacienda. */
function unidadDesdeAlegra(unidad) {
  const u = String(unidad || '').trim();
  if (!u || u === 'unit') return 'Unid';
  if (u === 'service' || u === 'anotherTypeOfService') return 'Os';
  return u.slice(0, 20);
}

function referenciaDe(item) {
  const r = item.reference;
  const texto = typeof r === 'string' ? r : (r?.reference ?? '');
  return String(texto).trim() || null;
}

function categoriaDesdeAlegra(c) {
  if (!c || c.id === undefined || c.id === null || !c.name) throw new Error('categoría de Alegra sin id o nombre');
  return { nombre: String(c.name).trim().slice(0, 80), activo: c.status ? String(c.status) === 'active' : true, alegra_id: String(c.id) };
}

/**
 * @param {object} item                GET /items/:id
 * @param {object} contexto
 * @param {Map<string, number>} contexto.impuestos   alegra_id del impuesto → impuesto.id propio
 * @param {Map<string, number>} contexto.categorias  alegra_id de la categoría → categoria_producto.id
 * @param {Set<string>} contexto.ocultos             alegra_id marcados ocultos en la caché local
 * @returns {{ fila: object, avisos: string[] }}
 */
function productoDesdeAlegra(item, { impuestos, categorias, ocultos }) {
  if (!item || item.id === undefined || item.id === null || !item.name) {
    throw new Error('producto de Alegra sin id o nombre');
  }
  const avisos = [];

  const precio = item.price?.find(p => p.main === true) || item.price?.[0];

  const cabysCrudo = String(item.productKey || '').trim();
  const cabys = /^\d{13}$/.test(cabysCrudo) ? cabysCrudo : null;
  if (!cabys) avisos.push(cabysCrudo ? 'cabys_invalido' : 'sin_cabys');

  // El IVA del producto: si trae más de un impuesto, el de tipo IVA.
  const taxes = Array.isArray(item.tax) ? item.tax : [];
  const iva = taxes.find(t => !t.type || String(t.type).toUpperCase() === 'IVA') || taxes[0];
  let impuestoId = null;
  if (!iva) {
    avisos.push('sin_impuesto');
  } else {
    impuestoId = impuestos.get(String(iva.id)) ?? null;
    if (impuestoId === null) avisos.push('impuesto_desconocido');
  }

  const categoriaAlegra = item.itemCategory?.id;
  const categoriaId = categoriaAlegra === undefined || categoriaAlegra === null
    ? null
    : (categorias.get(String(categoriaAlegra)) ?? null);
  if (categoriaId === null) avisos.push('sin_categoria');

  const esServicio = String(item.type) === 'service';
  const foto = item.images?.find(i => i.favorite === true) || item.images?.[0];

  const fila = {
    nombre: String(item.name).trim().slice(0, 250),
    referencia: referenciaDe(item),
    descripcion: item.description ? (String(item.description).trim() || null) : null,
    cabys,
    impuesto_id: impuestoId,
    unidad: unidadDesdeAlegra(item.inventory?.unit),
    categoria_id: categoriaId,
    precio_sin_iva: Number(precio?.price) || 0,
    costo_con_iva: Number(item.inventory?.unitCost) || 0,
    inventariable: Boolean(item.inventory) && !esServicio,
    es_medicamento: /medicament/i.test(item.itemCategory?.name || '') || Boolean(item.pharmaceuticalForm || item.sanitaryRegistry),
    forma_farmaceutica: item.pharmaceuticalForm ? String(item.pharmaceuticalForm).slice(0, 10) : null,
    registro_sanitario: item.sanitaryRegistry ? String(item.sanitaryRegistry).slice(0, 60) : null,
    // OJO: la URL de Alegra viene firmada y vence a los 7 días. Queda para no
    // perder la foto mientras se pasa a almacenamiento propio (checklist, sección 2).
    imagen_url: foto?.url || null,
    activo: String(item.status) === 'active',
    oculto: ocultos.has(String(item.id)),
    alegra_id: String(item.id)
  };
  if (fila.es_medicamento && !fila.registro_sanitario) avisos.push('medicamento_sin_registro');
  return { fila, avisos };
}

module.exports = { productoDesdeAlegra, categoriaDesdeAlegra, unidadDesdeAlegra };

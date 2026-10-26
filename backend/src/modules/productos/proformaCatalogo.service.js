/** Un plan revisado actualiza el catálogo; una proforma no registra una compra. */
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError } = require('../../utils/validacion');
const productos = require('./productos.service');
const taxonomia = require('./taxonomia.service');
const marcas = require('./marcas.service');
const { productoPropio, guardarMapeo } = require('../productos-revision/relacionPropia');
const { precioConImpuesto } = require('../catalogo-clientes/precio');

const numero = n => Number(n);
const iguales = (a, b, campos) => campos.every(k => String(a?.[k] ?? '') === String(b?.[k] ?? ''));
const camposPrecio = ['nombre', 'precio_sin_iva', 'costo_con_iva'];
const mismoPrecio = (p, f) => p.nombre === f.nombre &&
  Math.abs(numero(p.precio_sin_iva) - numero(f.precioSinIva)) < 0.00001 &&
  Math.abs(numero(p.costo_con_iva) - numero(f.costoConIva)) < 0.00001;

function validarPlan(plan) {
  const filas = plan?.productos;
  if (!plan?.proforma || !Array.isArray(filas) || !filas.length || filas.length > 100) throw httpError(400, 'Hace falta un plan de proforma revisado.');
  if (new Set(filas.map(f => f.codigoProveedor)).size !== filas.length) throw httpError(400, 'El plan repite códigos del proveedor.');
  for (const f of filas) {
    const costo = numero(f.costoSinIva), iva = numero(f.ivaPorcentaje), margen = numero(f.margenPorcentaje);
    if (![costo, iva, margen, numero(f.costoConIva), numero(f.precioSinIva), numero(f.precioConIva)].every(Number.isFinite) ||
      !f.nombre?.trim() || f.nombre.length > 250 || !(costo > 0) || !(margen > 0 && margen < 100) || !(iva >= 0 && iva <= 100) ||
      Math.abs(numero(f.costoConIva) - costo * (1 + iva / 100)) > 0.00001 ||
      Math.abs(numero(f.precioSinIva) - costo / (1 - margen / 100)) > 0.00001 ||
      precioConImpuesto(f.precioSinIva, iva) !== numero(f.precioConIva)) {
      throw httpError(400, 'Costo, IVA o margen del plan no coinciden.');
    }
  }
  const usados = Object.values(plan.actualizarPorMedida || {}).map(Number);
  if (new Set(usados).size !== usados.length || (plan.retirar || []).some(id => usados.includes(id))) throw httpError(400, 'Un producto aparece en dos destinos del plan.');
  return filas;
}

async function aplicarPlan(plan, anterior, usuarioId, guardarRespaldo) {
  const filas = validarPlan(plan);
  if (!usuarioId || typeof guardarRespaldo !== 'function') throw httpError(400, 'Se necesita usuario y respaldo previo.');
  return enTransaccion(pool, async c => {
    await c.query('SELECT id FROM subcategoria WHERE id=$1 FOR UPDATE', [plan.subcategoriaId]);
    const { rows: [marca] } = await c.query('SELECT * FROM marca_catalogo WHERE id=$1 FOR UPDATE', [plan.marcaId]);
    if (!marca || marca.subcategoria_id !== plan.subcategoriaId) throw httpError(409, 'La marca cambió de subcategoría.');
    const { rows: [impuesto] } = await c.query('SELECT tarifa,activo FROM impuesto WHERE id=$1', [plan.impuestoId]);
    if (!impuesto?.activo || filas.some(f => numero(f.ivaPorcentaje) !== numero(impuesto.tarifa))) throw httpError(409, 'El impuesto actual no coincide con la proforma.');
    const idsAnteriores = [...Object.values(plan.actualizarPorMedida).map(Number), ...plan.retirar].sort((a, b) => a - b);
    const { rows: miembros } = await c.query('SELECT id FROM producto WHERE marca_catalogo_id=$1 ORDER BY id FOR UPDATE', [plan.marcaId]);
    // Guardar la selección de una marca también desasigna lo no elegido.
    // Frenar si alguien agregó una presentación desde que se revisó el lote.
    if (JSON.stringify(miembros.map(p => p.id)) !== JSON.stringify(idsAnteriores)) throw httpError(409, 'Cambió la selección de productos de la marca.');
    const codigos = filas.map(f => f.codigoProveedor.toLowerCase());
    const { rows: actuales } = await c.query('SELECT * FROM producto WHERE id=ANY($1::int[]) OR lower(referencia)=ANY($2::text[]) ORDER BY id FOR UPDATE', [idsAnteriores, codigos]);
    const { rows: relaciones } = await c.query('SELECT * FROM supplier_product_mapping WHERE supplier_cedula=$1 AND supplier_code=ANY($2::text[]) ORDER BY id FOR UPDATE', [plan.proveedorCedula, filas.map(f => f.codigoProveedor)]);
    const esperados = new Map(anterior.productos.map(p => [p.id, p]));
    for (const id of idsAnteriores) {
      const actual = actuales.find(p => p.id === id), esperado = esperados.get(id);
      if (!actual || !esperado || !iguales(actual, esperado, [...camposPrecio, 'referencia', 'activo', 'oculto', 'marca_catalogo_id', 'subcategoria_id', 'categoria_id', 'impuesto_id', 'cabys'])) {
        throw httpError(409, `Cambió el producto ${id}; revisar el plan antes de continuar.`);
      }
    }
    // No reutilizar una referencia ni una relación ajena por parecerse al nombre.
    for (const f of filas) {
      const id = Number(plan.actualizarPorMedida[f.medidaMm]);
      if (actuales.some(p => p.referencia?.toLowerCase() === f.codigoProveedor.toLowerCase() && p.id !== id)) throw httpError(409, `La referencia ${f.codigoProveedor} ya existe.`);
      const relacion = relaciones.find(m => m.supplier_code === f.codigoProveedor);
      if (relacion && relacion.producto_id !== id) throw httpError(409, `El código ${f.codigoProveedor} tiene otra relación.`);
    }
    const { rows: stock } = await c.query('SELECT * FROM inventario_saldo WHERE producto_id=ANY($1::int[]) ORDER BY producto_id', [idsAnteriores]);
    await guardarRespaldo({ productos: actuales, marca, relaciones, stock });
    const resultado = [];
    for (const f of filas) {
      const datos = { nombre: f.nombre, precio_sin_iva: numero(f.precioSinIva), costo_con_iva: numero(f.costoConIva) };
      const existente = Number(plan.actualizarPorMedida[f.medidaMm]);
      const p = existente ? await productos.editarProducto(existente, datos, usuarioId)
        : await productos.crearProducto({ ...datos, referencia: f.codigoProveedor, cabys: plan.cabys, impuesto_id: plan.impuestoId,
          unidad: plan.unidad, categoria_id: plan.categoriaId, inventariable: true }, usuarioId);
      resultado.push({ id: p.id, ...f, creado: !existente });
    }
    const ids = resultado.map(p => p.id);
    await taxonomia.asignarSubcategoria({ productoIds: ids, subcategoriaId: plan.subcategoriaId }, usuarioId);
    for (const id of plan.retirar) await productos.cambiarEstadoProducto(id, { activo: false }, usuarioId);
    await marcas.guardar(plan.subcategoriaId, plan.marcaId, { nombre: plan.nombreMarca, productoIds: ids }, usuarioId);
    for (const f of resultado) {
      const antes = relaciones.find(m => m.supplier_code === f.codigoProveedor) || null;
      const p = await productoPropio(f.id, c);
      const m = await guardarMapeo({ cedula: plan.proveedorCedula, codigo: f.codigoProveedor, descripcion: f.nombre, nombreProveedor: plan.proveedorNombre }, p, {}, c);
      // C/M son empaques informativos del nombre. La cotización es por unidad.
      await c.query('UPDATE supplier_product_mapping SET factor_conversion=1 WHERE id=$1', [m.id]);
      await registrarCambio(c, { entidad: 'supplier_product_mapping', entidadId: m.id, accion: antes ? 'editar' : 'crear', usuarioId,
        antes, despues: { ...m, factor_conversion: 1 }, motivo: `Catálogo según proforma ${plan.proforma}; sin registrar compra.` });
    }
    await verificarPlan(plan, resultado, c);
    return resultado;
  });
}

async function verificarPlan(plan, resultado, db = pool) {
  const { rows } = await db.query('SELECT p.*,i.tarifa FROM producto p LEFT JOIN impuesto i ON i.id=p.impuesto_id WHERE p.id=ANY($1::int[])', [resultado.map(p => p.id)]);
  if (rows.length !== plan.productos.length) throw new Error('Faltan productos al verificar la proforma.');
  for (const f of resultado) {
    const p = rows.find(p => p.id === f.id);
    if (!p?.activo || p.oculto || p.marca_catalogo_id !== plan.marcaId || p.subcategoria_id !== plan.subcategoriaId || !mismoPrecio(p, f) ||
      precioConImpuesto(p.precio_sin_iva, p.tarifa) !== numero(f.precioConIva)) throw new Error(`No coincide el producto ${f.id} con el plan.`);
  }
  return rows;
}

module.exports = { validarPlan, aplicarPlan, verificarPlan };

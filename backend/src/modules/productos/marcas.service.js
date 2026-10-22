/** Marca visual por subcategoría: agrupar no duplica ni cambia productos. */
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError, idValido } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');

async function listar(subcategoriaId) {
  const id = idValido(subcategoriaId);
  const { rows: [sub] } = await pool.query('SELECT id,nombre FROM subcategoria WHERE id=$1', [id]);
  if (!sub) throw httpError(404, 'No existe esa subcategoría.');
  const { rows: marcas } = await pool.query(`SELECT m.id,m.nombre,m.imagen,
      COUNT(p.id)::int AS productos FROM marca_catalogo m
    LEFT JOIN producto p ON p.marca_catalogo_id=m.id
    WHERE m.subcategoria_id=$1 GROUP BY m.id ORDER BY lower(m.nombre),m.id`, [id]);
  const { rows: productos } = await pool.query(`SELECT id,nombre,referencia,marca_catalogo_id,activo,oculto
    FROM producto WHERE subcategoria_id=$1 ORDER BY lower(nombre),id`, [id]);
  return { subcategoria: sub, marcas, productos };
}

async function guardar(subcategoriaId, marcaId, datos, usuarioId) {
  const subId = idValido(subcategoriaId);
  const id = marcaId == null ? null : idValido(marcaId);
  const nombre = typeof datos?.nombre === 'string' ? datos.nombre.trim() : '';
  if (!nombre || nombre.length > 80) throw httpError(400, 'La marca necesita un nombre de hasta 80 caracteres.');
  const crudos = datos?.productoIds;
  if (!Array.isArray(crudos) || crudos.length > 5000) throw httpError(400, 'Elegí los productos de la marca.');
  const ids = [...new Set(crudos.map(idValido))].sort((a, b) => a - b);
  try {
    return await enTransaccion(pool, async c => {
      const { rows: [sub] } = await c.query('SELECT id FROM subcategoria WHERE id=$1 FOR UPDATE', [subId]);
      if (!sub) throw httpError(404, 'No existe esa subcategoría.');
      let anterior;
      if (id) {
        ({ rows: [anterior] } = await c.query('SELECT * FROM marca_catalogo WHERE id=$1 AND subcategoria_id=$2 FOR UPDATE', [id, subId]));
        if (!anterior) throw httpError(404, 'No existe esa marca en esta subcategoría.');
      }
      // El mismo bloqueo serializa ediciones de distintas marcas de la misma
      // subcategoría; el de producto coordina con cambiar de categoría/lotes.
      const { rows: productos } = await c.query(`SELECT id,subcategoria_id,marca_catalogo_id FROM producto
        WHERE subcategoria_id=$1 OR id=ANY($2::int[]) ORDER BY id FOR UPDATE`, [subId, ids]);
      const elegidos = productos.filter(p => ids.includes(p.id));
      if (elegidos.length !== ids.length || elegidos.some(p => p.subcategoria_id !== subId)) {
        throw httpError(409, 'Algún producto cambió de subcategoría. Actualizá la lista.');
      }
      const { rows: [marca] } = id
        ? await c.query('UPDATE marca_catalogo SET nombre=$2,actualizado_en=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id,nombre,imagen', [id, nombre])
        : await c.query('INSERT INTO marca_catalogo(subcategoria_id,nombre) VALUES($1,$2) RETURNING id,nombre,imagen', [subId, nombre]);
      await c.query(`UPDATE producto SET marca_catalogo_id=NULL,actualizado_en=CURRENT_TIMESTAMP
        WHERE marca_catalogo_id=$1 AND NOT(id=ANY($2::int[]))`, [marca.id, ids]);
      await c.query(`UPDATE producto SET marca_catalogo_id=$1,actualizado_en=CURRENT_TIMESTAMP
        WHERE id=ANY($2::int[]) AND marca_catalogo_id IS DISTINCT FROM $1`, [marca.id, ids]);
      await registrarCambio(c, { entidad:'marca_catalogo',entidadId:marca.id,accion:id ? 'editar' : 'crear',usuarioId,
        antes:{ nombre:anterior?.nombre || null,productoIds:productos.filter(p => p.marca_catalogo_id === marca.id).map(p => p.id),
          asignaciones:elegidos.map(p => ({ id:p.id,marcaId:p.marca_catalogo_id })) },
        despues:{ nombre,productoIds:ids },motivo:'agrupación visual del catálogo' });
      return marca;
    });
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'Ya existe una marca con ese nombre en esta subcategoría.');
    throw error;
  }
}

async function eliminar(marcaId, usuarioId) {
  const id = idValido(marcaId);
  return enTransaccion(pool, async c => {
    // Mismo orden de bloqueos que guardar: subcategoría antes que marca.
    const { rows: [encontrada] } = await c.query('SELECT subcategoria_id FROM marca_catalogo WHERE id=$1', [id]);
    if (!encontrada) throw httpError(404, 'No existe esa marca.');
    await c.query('SELECT id FROM subcategoria WHERE id=$1 FOR UPDATE', [encontrada.subcategoria_id]);
    const { rows: [marca] } = await c.query('DELETE FROM marca_catalogo WHERE id=$1 RETURNING *', [id]);
    if (!marca) throw httpError(404, 'No existe esa marca.');
    await registrarCambio(c, { entidad:'marca_catalogo',entidadId:id,accion:'eliminar',usuarioId,antes:marca,
      motivo:'retirar agrupación, conservando sus productos' });
    return marca;
  });
}

module.exports = { listar, guardar, eliminar };

/** Corrección revisada de nombres: no adivina medidas ni modifica documentos. */
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');

function validarPlan(plan) {
  const validarFilas = (filas, largo, productos) => {
    if (!Array.isArray(filas) || filas.length > 5000) throw httpError(400, 'El plan necesita una lista de nombres revisados.');
    const ids = new Set();
    return filas.map(f => {
      const id = idValido(f.id);
      if (ids.has(id)) throw httpError(400, 'El plan repite un identificador.');
      ids.add(id);
      for (const campo of ['antes', 'despues']) {
        if (typeof f[campo] !== 'string' || !f[campo].trim() || f[campo].length > largo || /[\r\n\t]/.test(f[campo])) {
          throw httpError(400, 'El plan contiene un nombre inválido.');
        }
      }
      return { id, antes: f.antes, despues: f.despues.trim(), ...(productos ? { marcaId: idValido(f.marcaId) } : {}) };
    }).sort((a, b) => a.id - b.id);
  };
  return { productos: validarFilas(plan?.productos, 250, true), marcas: validarFilas(plan?.marcas || [], 80, false) };
}

async function corregirNombres(plan, usuarioId, { aplicar = false, guardarRespaldo } = {}) {
  const filas = validarPlan(plan);
  if (aplicar && (typeof guardarRespaldo !== 'function' || !usuarioId)) throw httpError(400, 'Aplicar requiere usuario y respaldo previo.');
  return enTransaccion(pool, async c => {
    const idsMarca = [...new Set([...filas.marcas.map(f => f.id), ...filas.productos.map(f => f.marcaId)])].sort((a, b) => a - b);
    // Mismo orden que Gestión: subcategoría, marca y producto. El plan no
    // sobrescribe una edición ni una reasignación hecha después de revisarlo.
    const { rows: subs } = await c.query('SELECT DISTINCT subcategoria_id FROM marca_catalogo WHERE id=ANY($1::int[])', [idsMarca]);
    if (aplicar) await c.query('SELECT id FROM subcategoria WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE', [subs.map(s => s.subcategoria_id)]);
    const { rows: marcas } = await c.query(`SELECT * FROM marca_catalogo WHERE id=ANY($1::int[]) ORDER BY id${aplicar ? ' FOR UPDATE' : ''}`, [idsMarca]);
    const { rows: productos } = await c.query(`SELECT * FROM producto WHERE id=ANY($1::int[]) ORDER BY id${aplicar ? ' FOR UPDATE' : ''}`, [filas.productos.map(f => f.id)]);
    const revisar = (lista, actuales, esProducto) => lista.map(f => {
      const p = actuales.find(p => p.id === f.id);
      if (!p || (esProducto && p.marca_catalogo_id !== f.marcaId) || ![f.antes, f.despues].includes(p.nombre)) {
        throw httpError(409, `Cambió ${esProducto ? 'el producto' : 'la marca'} ${f.id}. Revisá el plan antes de aplicar.`);
      }
      return { ...f, actual: p.nombre };
    }).filter(f => f.actual !== f.despues);
    if (marcas.length !== idsMarca.length) throw httpError(409, 'Alguna marca del plan ya no existe.');
    const cambios = { productos: revisar(filas.productos, productos, true), marcas: revisar(filas.marcas, marcas, false) };
    if (!aplicar || (!cambios.productos.length && !cambios.marcas.length)) return cambios;
    // El respaldo se escribe antes del primer UPDATE; si falla, no cambia nada.
    await guardarRespaldo({ productos, marcas, cambios });
    for (const [tipo, tabla] of [['marcas', 'marca_catalogo'], ['productos', 'producto']]) {
      for (const f of cambios[tipo]) {
        await c.query(`UPDATE ${tabla} SET nombre=$2,actualizado_en=CURRENT_TIMESTAMP WHERE id=$1`, [f.id, f.despues]);
        await registrarCambio(c, { entidad: tabla, entidadId: f.id, accion: 'editar', usuarioId,
          antes: { nombre: f.actual }, despues: { nombre: f.despues }, motivo: 'Normalización revisada de nombres del catálogo; medidas y referencias conservadas.' });
      }
    }
    return cambios;
  });
}

module.exports = { validarPlan, corregirNombres };

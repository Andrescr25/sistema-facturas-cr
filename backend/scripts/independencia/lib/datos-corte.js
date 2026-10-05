/** Fichas por revisar, sin corregir ni deducir datos fiscales o personales. */
const { telefonosDe } = require('../../../src/utils/telefonosCliente');
const { motivoQueNoCalza } = require('../../../src/modules/clientes/identificacion');
const vacio = v => v == null || String(v).trim() === '';
function motivosProducto(p) {
  const m = [];
  if (p.impuesto_id == null) m.push('sin_impuesto');
  if (p.categoria_id == null) m.push('sin_categoria');
  if (!/^\d{13}$/.test(p.cabys || '')) m.push('cabys_ausente_o_invalido');
  if (p.es_medicamento && vacio(p.registro_sanitario)) m.push('medicamento_sin_registro');
  if (p.tarifa != null && Number(p.precio_sin_iva) * (1 + Number(p.tarifa) / 100) + 0.005 < Number(p.costo_con_iva)) m.push('precio_por_debajo_del_costo');
  return m;
}
function motivosCliente(c) {
  const m = [];
  if (vacio(c.correo) && !(c.correos_adicionales || []).some(v => !vacio(v))) m.push('sin_correo');
  if (vacio(c.actividad_economica)) m.push('sin_actividad_economica');
  if (vacio(c.identificacion)) m.push('sin_identificacion');
  else if (!c.tipo_identificacion || motivoQueNoCalza(c.tipo_identificacion, c.identificacion)) m.push('tipo_o_identificacion_por_revisar');
  if (!telefonosDe({ phonePrimary: c.telefono, phoneSecondary: c.telefono_secundario, mobile: c.celular }).candidatos.length) m.push('sin_telefono_utilizable');
  return m;
}
async function leerDatos(pool) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const base = (await c.query('SELECT current_database() AS base')).rows[0].base;
    const productos = (await c.query(`SELECT p.id,p.alegra_id,p.nombre,p.referencia,p.cabys,p.impuesto_id,p.categoria_id,
      p.es_medicamento,p.registro_sanitario,p.precio_sin_iva,p.costo_con_iva,i.tarifa
      FROM producto p LEFT JOIN impuesto i ON i.id=p.impuesto_id WHERE p.activo ORDER BY p.id`)).rows;
    const clientes = (await c.query(`SELECT id,alegra_id,nombre,tipo_identificacion,identificacion,correo,correos_adicionales,
      actividad_economica,telefono,telefono_secundario,celular FROM cliente WHERE activo ORDER BY id`)).rows;
    const pendientes = {
      productos: productos.map(p => ({ id: p.id, alegra_id: p.alegra_id, nombre: p.nombre, referencia: p.referencia,
        precio_sin_iva: p.precio_sin_iva, costo_con_iva: p.costo_con_iva, tarifa: p.tarifa, motivos: motivosProducto(p) })).filter(p => p.motivos.length),
      clientes: clientes.map(p => ({ id: p.id, alegra_id: p.alegra_id, nombre: p.nombre, motivos: motivosCliente(p) })).filter(p => p.motivos.length)
    };
    const resumen = {};
    for (const [tipo, filas] of Object.entries(pendientes)) {
      resumen[tipo] = { fichas: filas.length, motivos: {} };
      for (const f of filas) for (const m of f.motivos) resumen[tipo].motivos[m] = (resumen[tipo].motivos[m] || 0) + 1;
    }
    await c.query('COMMIT');
    return { base, resumen, pendientes, notas: [
      'Los ids propios pertenecen exclusivamente a esta base. No usarlos como ids de otra copia; alegra_id solo conserva referencia histórica.',
      'Es una lista de revisión: un dato ausente no constituye por sí solo un rechazo de negocio o de Hacienda.',
      'Completar con información verdadera en las fichas propias; este informe no modifica SQL.',
      'Las tarifas históricas equivocadas requieren revisión separada; no se deducen de la ausencia de campos.'
    ] };
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
module.exports = { motivosProducto, motivosCliente, leerDatos };

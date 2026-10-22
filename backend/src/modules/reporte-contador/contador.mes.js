const { createHash } = require('node:crypto');
const { pool } = require('../../../config/database');
const { httpError } = require('../../utils/validacion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const datos = require('./desdeElSistema');

function periodo({ anio, mes } = {}) {
  const a = Number(anio),
    m = Number(mes);
  if (!Number.isInteger(a) || a < 2000 || a > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    throw httpError(400, 'Elegí un año y mes válidos.');
  }
  const dos = (n) => String(n).padStart(2, '0');
  const desde = `${a}-${dos(m)}-01`;
  const hasta = `${a}-${dos(m)}-${new Date(Date.UTC(a, m, 0)).getUTCDate()}`;
  const siguiente = `${m === 12 ? a + 1 : a}-${dos(m === 12 ? 1 : m + 1)}-01`;
  return {
    anio: a,
    mes: m,
    desde,
    hasta,
    siguiente,
    etiqueta: `${dos(m)}/${a}`,
    finalizado: hasta < hoyEnCostaRica()
  };
}

const n = (v) => Number(v || 0);
const redondear = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
function prepararGasto(g) {
  const revisado = Boolean(g.revisado_en) && g.validacion === 'validado' && g.estado !== 'anulada';
  return {
    ...g,
    total: n(g.total),
    saldo: g.saldo == null ? null : n(g.saldo),
    pagado: n(g.pagado),
    categoria_texto: g.categoria === 'combustible' ? 'Combustible' : 'Alimentación y viáticos',
    revision: g.estado === 'anulada' ? 'Anulado' : revisado ? 'Revisado' : 'Por revisar',
    gasto_deducible: revisado ? n(g.gasto_deducible) : null,
    iva_credito: revisado ? n(g.iva_credito) : null,
    tiene_xml: Boolean(g.xml_ruta),
    tiene_pdf: Boolean(g.pdf_ruta)
  };
}

function resumir(documentos, gastos) {
  const monedas = [...new Set([...documentos, ...gastos].map((d) => d.moneda))].sort();
  return monedas.map((moneda) => {
    const doc = documentos.filter((d) => d.moneda === moneda),
      gs = gastos.filter((g) => g.moneda === moneda && g.estado !== 'anulada');
    const suma = (lista, campo) => redondear(lista.reduce((s, d) => s + n(d[campo]), 0));
    return {
      moneda,
      ventas: suma(
        doc.filter((d) => d.tipo === 'Venta'),
        'total'
      ),
      devoluciones: suma(
        doc.filter((d) => d.tipo === 'Nota de crédito'),
        'total'
      ),
      compras: suma(
        doc.filter((d) => d.tipo === 'Compra'),
        'total'
      ),
      creditos_proveedores: suma(
        doc.filter((d) => d.tipo === 'Nota de crédito proveedor'),
        'total'
      ),
      gastos: suma(gs, 'total'),
      gasto_deducible: suma(gs, 'gasto_deducible'),
      iva_credito_gastos: suma(gs, 'iva_credito')
    };
  });
}

/** El mes se consulta en una sola foto, sin reemplazar archivos históricos.
 * Gastos por revisar también viajan; un vacío no se convierte en deducción cero.
 */
async function obtenerMes(filtros, conexion = pool) {
  const p = periodo(filtros),
    db = await conexion.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query("SET LOCAL TIME ZONE 'America/Costa_Rica'");
    const documentos = [
      ...(await datos.ventas(db, p.desde, p.hasta)),
      ...(await datos.ventas(db, p.desde, p.hasta, true)),
      ...(await datos.compras(db, p.desde, p.hasta)),
      ...(await datos.notasProveedor(db, p.desde, p.siguiente))
    ]
      .map((d) => ({
        ...d,
        total: n(d.total),
        base: d.base == null ? null : n(d.base),
        impuestos: d.impuestos == null ? null : n(d.impuestos)
      }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.identidad.localeCompare(b.identidad));
    const gastos = (await datos.gastos(db, p.desde, p.siguiente)).map(prepararGasto);
    const empresa = (await db.query('SELECT nombre,nombre_comercial,identificacion FROM empresa WHERE id=1')).rows[0] || null;
    await db.query('COMMIT');
    const contenido = { documentos, gastos, empresa };
    const huella = createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
    // Las rutas privadas sólo se usan para armar el respaldo, nunca salen en JSON.
    return { ...p, ...contenido, resumen: resumir(documentos, gastos), huella };
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }
}

function vistaPublica(mes) {
  return { ...mes, gastos: mes.gastos.map(({ xml_ruta: _x, pdf_ruta: _p, ...g }) => g) };
}

module.exports = { periodo, prepararGasto, resumir, obtenerMes, vistaPublica };

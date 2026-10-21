/**
 * Proveedores — maestro propio (rama independencia-alegra)
 *
 * Hasta ahora "proveedor" era tres cosas distintas: el mapeo por cédula
 * (`supplier_product_mapping`), la tabla vieja `proveedores` (sin cédula) y
 * los contactos de Alegra. Acá hay una sola lista, identificada por cédula,
 * que se puede ver y corregir.
 *
 * Reglas:
 * - Nada se borra: desactivar lo saca de la lista sin tocar sus compras.
 * - La cédula es única entre proveedores (a diferencia de los clientes, donde
 *   la genérica del consumidor final se repite), y tiene que calzar con su
 *   tipo.
 * - WhatsApp admite hasta diez números, uno por línea. Se validan por
 *   separado para que un segundo contacto no se pegue al primero al enviar.
 * - Todo cambio queda en la bitácora, dentro de la misma transacción.
 *
 * El "saldo" del proveedor todavía no vive acá: los pagos están en Alegra y
 * se traen en la sección de Compras. Lo que sí se puede decir hoy es cuántos
 * productos le compramos, cuántas facturas suyas entraron por el buzón y
 * cuándo fue la última.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, texto, numero, booleano, opcion, correo, validar, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { validarTelefonoEscrito } = require('../../utils/telefonosCliente');
const { validarWhatsappsProveedor } = require('../../utils/telefonosProveedor');
const { TIPOS, LARGOS, NOMBRES, limpiar, calza } = require('../clientes/identificacion');
const { TRATAMIENTOS } = require('../gastos-operativos/gastos.validacion');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);
const LIMITE_MAXIMO = 100;
const entero = numero({ min: 1, max: 2147483647, entero: true });

const telefono = (v, etiqueta) => {
  if (v === null || String(v).trim() === '') return null;
  const r = validarTelefonoEscrito(v);
  if (!r.valido) throw httpError(400, `${etiqueta}: ${r.motivo}`);
  return r.formateado;
};

const tipoIdentificacion = (v, etiqueta) => {
  if (v === null || String(v).trim() === '') return null;
  return opcion(TIPOS)(v, etiqueta);
};

const CAMPOS = {
  nombre: { etiqueta: 'Nombre', requerido: true, validar: texto(200) },
  tipo_identificacion: { etiqueta: 'Tipo de identificación', validar: tipoIdentificacion },
  identificacion: { etiqueta: 'Cédula', validar: texto(20) },
  correo: { etiqueta: 'Correo', validar: correo(160) },
  telefono: { etiqueta: 'Teléfono', validar: telefono },
  telefono_whatsapp: { etiqueta: 'WhatsApp', validar: validarWhatsappsProveedor },
  plazo_credito_id: { etiqueta: 'Plazo de crédito', validar: entero },
  observaciones: { etiqueta: 'Observaciones', validar: texto(2000) },
  tratamiento_facturas: { etiqueta: 'Facturas recibidas', validar: opcion(TRATAMIENTOS) }
};

// ─── Utilidades ────────────────────────────────────────────────────────────

/**
 * Los productos salen del mapeo por cédula y las compras del buzón de
 * facturas, que también es por cédula: un proveedor sin cédula no puede tener
 * ni lo uno ni lo otro, y los contadores dan 0 en vez de mentir.
 */
const SELECT_VISTA = `
  SELECT pr.*,
         pl.nombre AS plazo,
         pl.dias AS plazo_dias,
         (SELECT COUNT(DISTINCT p.id)
            FROM supplier_product_mapping m
            JOIN producto p ON p.id = m.producto_id
           WHERE m.supplier_cedula = pr.identificacion)::int AS productos,
         (SELECT COUNT(*) FROM facturas_proveedores f WHERE f.proveedor_cedula = pr.identificacion)::int AS compras,
         (SELECT MAX(f.fecha_emision) FROM facturas_proveedores f WHERE f.proveedor_cedula = pr.identificacion) AS ultima_compra
    FROM proveedor pr
    LEFT JOIN plazo_credito pl ON pl.id = pr.plazo_credito_id`;

function sinTiempos(fila) {
  if (!fila) return fila;
  const { actualizado_en: _a, creado_en: _c, ...resto } = fila;
  return resto;
}

const NORMALIZAR_SQL = (expr) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;
function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function obtenerCon(ejecutor, id) {
  const { rows } = await ejecutor.query(`${SELECT_VISTA} WHERE pr.id = $1`, [id]);
  return rows[0];
}

async function revisarPlazo(ejecutor, id) {
  if (!id) return;
  const { rows } = await ejecutor.query('SELECT id, activo FROM plazo_credito WHERE id = $1', [id]);
  if (!rows[0] || !rows[0].activo) throw httpError(400, 'Plazo de crédito: no existe o está inactivo.');
}

function revisarIdentificacion(cambios, completa) {
  if (!('identificacion' in cambios) && !('tipo_identificacion' in cambios)) return;
  const tipo = completa.tipo_identificacion ?? null;
  const limpia = limpiar(completa.identificacion, tipo);
  if (limpia && !calza(tipo, limpia)) {
    throw httpError(400, `Cédula: una ${NOMBRES[tipo]} tiene ${LARGOS[tipo].join(' o ')} dígitos, y esa tiene ${limpia.length}.`);
  }
  if ('identificacion' in cambios) cambios.identificacion = limpia;
}

/** La cédula repetida no es un error del sistema: es un proveedor que ya existe. */
function traducirDuplicado(error) {
  if (error.code === '23505') {
    return httpError(409, 'Ya hay un proveedor con esa cédula. Búsquelo en la lista en vez de crearlo de nuevo.');
  }
  return error;
}

// ─── Fichas ────────────────────────────────────────────────────────────────

async function listarFichas({ buscar = '', estado = 'activos', pagina = 1, limite = 30 } = {}) {
  const where = [];
  const params = [];
  const agregar = (valor) => { params.push(valor); return `$${params.length}`; };

  switch (estado) {
    case 'activos': where.push('pr.activo = TRUE'); break;
    case 'inactivos': where.push('pr.activo = FALSE'); break;
    case 'todos': break;
    default: throw httpError(400, 'Estado: tiene que ser activos, inactivos o todos.');
  }

  for (const palabra of normalizar(buscar).split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push(`${NORMALIZAR_SQL("pr.nombre || ' ' || COALESCE(pr.identificacion, '') || ' ' || COALESCE(pr.correo, '')")} LIKE ${agregar(`%${palabra}%`)}`);
  }

  const lim = Math.min(Math.max(parseInt(limite, 10) || 30, 1), LIMITE_MAXIMO);
  const pag = Math.max(parseInt(pagina, 10) || 1, 1);
  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `${SELECT_VISTA.replace('SELECT pr.*,', 'SELECT pr.*, COUNT(*) OVER() AS total,')}
     ${filtro}
     ORDER BY lower(pr.nombre), pr.id
     LIMIT ${agregar(lim)} OFFSET ${agregar((pag - 1) * lim)}`,
    params
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  return {
    data: rows.map(({ total: _t, ...resto }) => resto),
    paginacion: { total, pagina: pag, limite: lim, paginas: Math.ceil(total / lim) }
  };
}

/** La ficha con sus últimas compras: es lo que se mira antes de llamarlo. */
async function obtenerFicha(id) {
  const n = idValido(id);
  const ficha = await obtenerCon(pool, n);
  if (!ficha) throw httpError(404, 'No existe ese proveedor.');

  const [compras, productos] = await Promise.all([
    pool.query(
      `SELECT numero_consecutivo, fecha_emision, total_factura, moneda, estado
         FROM facturas_proveedores
        WHERE proveedor_cedula = $1
        ORDER BY fecha_emision DESC
        LIMIT 10`,
      [ficha.identificacion]
    ),
    pool.query(
      `SELECT p.id, p.nombre, p.referencia, m.supplier_code AS codigo_proveedor
         FROM supplier_product_mapping m
         JOIN producto p ON p.id = m.producto_id
        WHERE m.supplier_cedula = $1
        ORDER BY m.times_used DESC, lower(p.nombre)
        LIMIT 20`,
      [ficha.identificacion]
    )
  ]);

  return {
    ...ficha,
    ultimasCompras: compras.rows.map(f => ({ ...f, total_factura: Number(f.total_factura) })),
    productosQueVende: productos.rows
  };
}

async function crearFicha(datos, usuarioId) {
  const fila = validar(CAMPOS, datos, { crear: true });
  revisarIdentificacion(fila, fila);

  try {
    return await enTransaccion(async (cliente) => {
      await revisarPlazo(cliente, fila.plazo_credito_id);
      const columnas = Object.keys(fila);
      const { rows } = await cliente.query(
        `INSERT INTO proveedor (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
        columnas.map(c => fila[c])
      );
      await registrarCambio(cliente, { entidad: 'proveedor', entidadId: rows[0].id, accion: 'crear', despues: sinTiempos(rows[0]), usuarioId });
      return obtenerCon(cliente, rows[0].id);
    });
  } catch (error) {
    throw traducirDuplicado(error);
  }
}

async function editarFicha(id, datos, usuarioId) {
  const n = idValido(id);
  const cambios = validar(CAMPOS, datos, { crear: false });
  if (Object.keys(cambios).length === 0) throw httpError(400, 'No vino ningún dato para cambiar.');

  try {
    return await enTransaccion(async (cliente) => {
      const { rows: previas } = await cliente.query('SELECT * FROM proveedor WHERE id = $1 FOR UPDATE', [n]);
      const antes = previas[0];
      if (!antes) throw httpError(404, 'No existe ese proveedor.');

      revisarIdentificacion(cambios, { ...antes, ...cambios });
      if ('plazo_credito_id' in cambios) await revisarPlazo(cliente, cambios.plazo_credito_id);

      const columnas = Object.keys(cambios);
      const { rows } = await cliente.query(
        `UPDATE proveedor SET ${columnas.map((c, i) => `${c} = $${i + 1}`).join(', ')}, actualizado_en = CURRENT_TIMESTAMP
         WHERE id = $${columnas.length + 1} RETURNING *`,
        [...columnas.map(c => cambios[c]), n]
      );
      await registrarCambio(cliente, {
        entidad: 'proveedor', entidadId: n, accion: 'editar',
        antes: sinTiempos(antes), despues: sinTiempos(rows[0]), usuarioId
      });
      return obtenerCon(cliente, n);
    });
  } catch (error) {
    throw traducirDuplicado(error);
  }
}

async function cambiarEstadoFicha(id, activo, usuarioId) {
  const n = idValido(id);
  const valor = booleano(activo, 'Activo');
  return enTransaccion(async (cliente) => {
    const { rows: previas } = await cliente.query('SELECT * FROM proveedor WHERE id = $1 FOR UPDATE', [n]);
    const antes = previas[0];
    if (!antes) throw httpError(404, 'No existe ese proveedor.');
    if (antes.activo === valor) return obtenerCon(cliente, n);

    const { rows } = await cliente.query(
      'UPDATE proveedor SET activo = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [valor, n]
    );
    await registrarCambio(cliente, {
      entidad: 'proveedor', entidadId: n, accion: valor ? 'activar' : 'desactivar',
      antes: sinTiempos(antes), despues: sinTiempos(rows[0]), usuarioId
    });
    return obtenerCon(cliente, n);
  });
}

module.exports = { CAMPOS, listarFichas, obtenerFicha, crearFicha, editarFicha, cambiarEstadoFicha };

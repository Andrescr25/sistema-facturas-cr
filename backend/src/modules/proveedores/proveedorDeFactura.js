/**
 * El proveedor de una factura del buzón: el que ya existe con esa cédula, o
 * uno nuevo con los datos que trae la misma factura.
 *
 * POR QUÉ SE CREA SOLO (2026-11-25, el usuario, con una factura frenada en
 * Revisión de Precios por «No hay proveedor propio con cédula…»): «la idea es
 * que el sistema no tiene este proveedor, entonces que al momento de
 * registrar la compra el sistema cree este proveedor con todos sus datos».
 * Antes había que salir a Proveedores a copiar a mano lo que el XML ya decía.
 *
 * DE DÓNDE SALE CADA DATO. Del XML del proveedor, que es lo firmado: nombre,
 * tipo y número de cédula, correo, teléfono, plazo, nombre comercial y
 * dirección. Si el XML no se puede leer, de lo que guardó el buzón al
 * recibirla (nombre, cédula, correo y teléfono). Un dato que no pasa la
 * validación de la ficha (un teléfono que no es de Costa Rica, un correo mal
 * escrito) queda vacío: no frena la compra y se completa después en
 * Proveedores. La cédula es la del buzón tal cual, porque es la llave con que
 * la ficha cuenta sus compras y sus productos.
 *
 * Una sola copia: la usan Registrar compra y los gastos operativos.
 */

const XmlParser = require('../../../services/xmlParser');
const { leerArchivoPrivado } = require('../../integrations/almacenamiento');
const { TIPOS: TIPOS_HACIENDA } = require('../../integrations/hacienda/hacienda.client');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, correo } = require('../../utils/validacion');
const { validarTelefonoEscrito } = require('../../utils/telefonosCliente');
const { calza } = require('../clientes/identificacion');
const { cedula } = require('../gastos-operativos/gastos.originales');

// Los cuatro de Hacienda que ya traduce la consulta de contribuyentes, más
// los dos que solo aparecen en comprobantes (4.4: 05 y 06).
const TIPOS = { ...TIPOS_HACIENDA, '05': 'EXTRANJERO', '06': 'NO_CONTRIBUYENTE' };

/** El XML del proveedor, si se puede leer y es de esa misma cédula. Nunca lanza. */
async function emisorDelXml(factura) {
  try {
    const buffer = factura.xml_ruta && await leerArchivoPrivado(factura.xml_ruta);
    if (!buffer) return null;
    const datos = await new XmlParser().parseFacturaXML(buffer.toString('utf8'));
    if (cedula(datos?.emisor?.identificacion?.numero) !== cedula(factura.proveedor_cedula)) return null;
    return datos;
  } catch {
    return null;
  }
}

const correoValido = (v) => {
  try { return correo(160)(v ? String(v).trim().toLowerCase() : null, 'Correo'); } catch { return null; }
};

function telefonoValido(telefono) {
  if (!telefono) return null;
  if (typeof telefono === 'object' && telefono.codigoPais && String(telefono.codigoPais) !== '506') return null;
  const r = validarTelefonoEscrito(typeof telefono === 'object' ? telefono.numero : telefono);
  return r.valido ? r.formateado : null;
}

/** Contado = el plazo de 0 días; crédito = el plazo con esos mismos días, si existe. */
async function plazoDeLaFactura(db, datos) {
  if (!datos) return null;
  const dias = datos.condicionVenta === '01' ? 0
    : datos.condicionVenta === '02' ? parseInt(String(datos.plazoCredito || '').replace(/\D/g, ''), 10) : NaN;
  if (!Number.isInteger(dias)) return null;
  const { rows } = await db.query('SELECT id FROM plazo_credito WHERE dias = $1 AND activo ORDER BY id LIMIT 1', [dias]);
  return rows[0]?.id ?? null;
}

/** La ficha que se crearía con esta factura. Sin escribir nada. */
async function fichaDeLaFactura(db, factura) {
  const datos = await emisorDelXml(factura);
  const emisor = datos?.emisor || {};
  const nombre = String(emisor.nombre || factura.proveedor_nombre || '').trim().slice(0, 200);
  if (!nombre) throw httpError(422, 'La factura no trae el nombre del proveedor: hay que crearlo a mano en Proveedores.');

  const tipo = TIPOS[emisor.identificacion?.tipo] || null;
  const notas = [`Creado por el sistema con los datos de su factura ${factura.numero_consecutivo}.`];
  const comercial = String(emisor.nombreComercial || '').trim();
  if (comercial && comercial.toLowerCase() !== nombre.toLowerCase()) notas.push(`Nombre comercial: ${comercial}.`);
  const senas = String(emisor.ubicacion?.otrasSenas || '').trim();
  if (senas) notas.push(`Dirección: ${senas}.`);

  return {
    nombre,
    tipo_identificacion: tipo && calza(tipo, factura.proveedor_cedula) ? tipo : null,
    identificacion: factura.proveedor_cedula,
    correo: correoValido(emisor.correoElectronico) || correoValido(factura.proveedor_email),
    telefono: telefonoValido(emisor.telefono) || telefonoValido(factura.proveedor_telefono),
    plazo_credito_id: await plazoDeLaFactura(db, datos),
    observaciones: notas.join('\n').slice(0, 2000)
  };
}

/**
 * @param db         el cliente de la transacción de quien llama
 * @param factura    la fila de `facturas_proveedores`
 * @returns {{ proveedor: object, creado: boolean }}
 */
async function proveedorDeFactura(db, factura, usuarioId = null) {
  const clave = cedula(factura.proveedor_cedula);
  if (!clave) throw httpError(422, 'La factura no trae la cédula del proveedor: hay que asignarlo a mano.');

  // Bloqueada: los gastos operativos cambian después su preferencia de facturas.
  const { rows } = await db.query(
    `SELECT * FROM proveedor WHERE ltrim(regexp_replace(identificacion, '[[:space:]-]', '', 'g'), '0') = $1 FOR UPDATE`, [clave]
  );
  if (rows.length > 1) throw httpError(409, `Hay ${rows.length} fichas de proveedor con la cédula ${factura.proveedor_cedula}. Dejá una sola en Proveedores antes de registrar.`);
  if (rows[0]) return { proveedor: rows[0], creado: false };

  const ficha = await fichaDeLaFactura(db, factura);
  const columnas = Object.keys(ficha);
  // Si otra transacción lo creó entre medio, se usa ese (xmax = 0 solo en una fila recién insertada).
  const { rows: [fila] } = await db.query(
    `INSERT INTO proveedor (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (identificacion) WHERE identificacion IS NOT NULL
     DO UPDATE SET identificacion = EXCLUDED.identificacion
     RETURNING *, (xmax = 0) AS recien_creado`,
    columnas.map((c) => ficha[c])
  );
  const { recien_creado: creado, ...proveedor } = fila;
  if (creado) {
    await registrarCambio(db, {
      entidad: 'proveedor', entidadId: proveedor.id, accion: 'crear', despues: proveedor, usuarioId,
      motivo: `Proveedor nuevo, con los datos de su factura ${factura.numero_consecutivo}`
    });
  }
  return { proveedor, creado: Boolean(creado) };
}

module.exports = { proveedorDeFactura, fichaDeLaFactura };

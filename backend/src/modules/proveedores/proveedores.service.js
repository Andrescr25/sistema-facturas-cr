/**
 * Proveedores Module - Service
 * Lógica de negocio para proveedores derivados de las facturas de Hacienda
 */

const prisma = require('../../../lib/prisma');

/**
 * Error con código de estado HTTP para que el controller responda con el status correcto.
 */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Obtener todos los proveedores únicos (por cédula) derivados de las facturas
 */
async function getProveedores() {
  console.log('📋 Obteniendo proveedores únicos de facturas...');

  const proveedores = await prisma.factura.findMany({
    select: {
      proveedorNombre: true,
      proveedorCedula: true
    },
    distinct: ['proveedorCedula'],
    orderBy: {
      proveedorNombre: 'asc'
    }
  });

  const proveedoresFormateados = proveedores.map(p => ({
    id: p.proveedorCedula,
    name: p.proveedorNombre,
    cedula: p.proveedorCedula,
    nombre: p.proveedorNombre
  }));

  console.log(`✅ ${proveedoresFormateados.length} proveedores encontrados`);

  return proveedoresFormateados;
}

/**
 * Obtener las facturas de un proveedor específico por cédula
 */
async function getFacturasPorCedula(cedula) {
  console.log(`📋 Buscando facturas del proveedor: ${cedula}`);

  const facturas = await prisma.factura.findMany({
    where: {
      proveedorCedula: cedula
    },
    include: {
      productos: true
    },
    orderBy: {
      fechaEmision: 'desc'
    }
  });

  if (facturas.length === 0) {
    throw httpError(404, 'No se encontraron facturas para este proveedor');
  }

  const proveedor = {
    cedula: facturas[0].proveedorCedula,
    nombre: facturas[0].proveedorNombre,
    totalFacturas: facturas.length
  };

  return { proveedor, facturas };
}

module.exports = {
  getProveedores,
  getFacturasPorCedula
};

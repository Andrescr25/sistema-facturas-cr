const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// Obtener todos los proveedores (de las facturas de Hacienda)
router.get('/', async (req, res) => {
  try {
    console.log('📋 Obteniendo proveedores únicos de facturas...');
    
    // Obtener proveedores únicos de las facturas
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

    // Formatear respuesta para compatibilidad
    const proveedoresFormateados = proveedores.map(p => ({
      id: p.proveedorCedula,
      name: p.proveedorNombre,
      cedula: p.proveedorCedula,
      nombre: p.proveedorNombre
    }));

    console.log(`✅ ${proveedoresFormateados.length} proveedores encontrados`);

    res.json({
      success: true,
      proveedores: proveedoresFormateados,
      data: proveedoresFormateados // Compatibilidad con formatos viejos
    });
  } catch (error) {
    console.error('❌ Error obteniendo proveedores:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo proveedores'
    });
  }
});

// Obtener facturas de un proveedor específico
router.get('/:cedula', async (req, res) => {
  try {
    const { cedula } = req.params;
    
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
      return res.status(404).json({
        success: false,
        message: 'No se encontraron facturas para este proveedor'
      });
    }
    
    const proveedor = {
      cedula: facturas[0].proveedorCedula,
      nombre: facturas[0].proveedorNombre,
      totalFacturas: facturas.length
    };
    
    res.json({
      success: true,
      data: proveedor,
      facturas: facturas
    });
  } catch (error) {
    console.error('Error obteniendo proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo información del proveedor'
    });
  }
});

module.exports = router;
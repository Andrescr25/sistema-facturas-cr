/**
 * Verificar relaciones en producto_factura para CABLE TRASERO
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verificarRelaciones() {
  console.log('🔍 Buscando relaciones en producto_factura para CABLE TRASERO\n');
  
  // Buscar productos de factura relacionados
  const productosFactura = await prisma.productoFactura.findMany({
    where: {
      OR: [
        { descripcion: { contains: 'CABLE TRASERO', mode: 'insensitive' } },
        { descripcion: { contains: 'MOTO', mode: 'insensitive' } },
        { codigoProveedor: '705' },
        { alegraItemId: '705' }
      ]
    },
    include: {
      factura: {
        select: {
          proveedorNombre: true,
          proveedorCedula: true,
          fechaEmision: true
        }
      },
      mapeo: {
        select: {
          id: true,
          supplierName: true,
          supplierCode: true,
          supplierDesc: true,
          alegraName: true,
          alegraReference: true
        }
      }
    },
    orderBy: {
      factura: {
        fechaEmision: 'desc'
      }
    }
  });
  
  console.log(`📊 Productos de factura encontrados: ${productosFactura.length}\n`);
  
  for (const pf of productosFactura) {
    console.log('─'.repeat(70));
    console.log(`📦 Producto de Factura ID: ${pf.id}`);
    console.log(`   Descripción: "${pf.descripcion}"`);
    console.log(`   Código Proveedor: "${pf.codigoProveedor}"`);
    console.log(`   Alegra Item ID: "${pf.alegraItemId || 'N/A'}"`);
    console.log(`   Estado: ${pf.estadoRelacionado}`);
    console.log(`   Confianza: ${pf.confianza || 0}%`);
    console.log(`\n🏢 Factura:`);
    console.log(`   Proveedor: ${pf.factura.proveedorNombre}`);
    console.log(`   Cédula: ${pf.factura.proveedorCedula}`);
    console.log(`   Fecha: ${pf.factura.fechaEmision}`);
    
    if (pf.mapeo) {
      console.log(`\n🔗 Mapping relacionado:`);
      console.log(`   ID: ${pf.mapeo.id}`);
      console.log(`   Proveedor mapping: ${pf.mapeo.supplierName}`);
      console.log(`   Código mapping: "${pf.mapeo.supplierCode}"`);
      console.log(`   Descripción mapping: "${pf.mapeo.supplierDesc}"`);
      console.log(`   Producto Alegra: "${pf.mapeo.alegraName}" (Ref: ${pf.mapeo.alegraReference})`);
      
      // Verificar si la relación es correcta
      const proveedorCoincide = pf.factura.proveedorNombre === pf.mapeo.supplierName;
      const codigoCoincide = pf.codigoProveedor === pf.mapeo.supplierCode;
      
      if (!proveedorCoincide || !codigoCoincide) {
        console.log(`   ⚠️ RELACIÓN INCORRECTA DETECTADA:`);
        if (!proveedorCoincide) {
          console.log(`      - Proveedor factura: "${pf.factura.proveedorNombre}"`);
          console.log(`      - Proveedor mapping: "${pf.mapeo.supplierName}"`);
        }
        if (!codigoCoincide) {
          console.log(`      - Código factura: "${pf.codigoProveedor}"`);
          console.log(`      - Código mapping: "${pf.mapeo.supplierCode}"`);
        }
      } else {
        console.log(`   ✅ Relación correcta`);
      }
    } else {
      console.log(`\n   ⚠️ NO tiene mapping relacionado (mapeoId: ${pf.mapeoId || 'null'})`);
    }
    console.log();
  }
  
  // Buscar productos con estado RELACIONADO pero sin mapping
  const productosSinMapping = await prisma.productoFactura.findMany({
    where: {
      estadoRelacionado: 'RELACIONADO',
      mapeoId: null,
      OR: [
        { descripcion: { contains: 'CABLE TRASERO', mode: 'insensitive' } },
        { codigoProveedor: '705' }
      ]
    },
    include: {
      factura: {
        select: {
          proveedorNombre: true,
          proveedorCedula: true
        }
      }
    }
  });
  
  if (productosSinMapping.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log(`⚠️ Productos marcados como RELACIONADOS pero SIN mapping: ${productosSinMapping.length}\n`);
    productosSinMapping.forEach(pf => {
      console.log(`   - ID: ${pf.id}, Descripción: "${pf.descripcion}", Proveedor: ${pf.factura.proveedorNombre}`);
    });
  }
  
  await prisma.$disconnect();
  process.exit(0);
}

verificarRelaciones().catch(async err => {
  console.error('❌ Error:', err);
  await prisma.$disconnect();
  process.exit(1);
});

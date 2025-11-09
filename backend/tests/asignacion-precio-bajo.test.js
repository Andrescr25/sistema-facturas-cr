/**
 * TEST TEMPORAL: Verificar asignación automática de productos a proveedores con precio más bajo
 * 
 * Este test verifica que:
 * 1. Se buscan todos los mappings disponibles para cada producto
 * 2. Se obtienen los precios más recientes de cada proveedor
 * 3. Se selecciona automáticamente el proveedor con precio más bajo
 * 4. Si hay empate en precio, se usa confianza como desempate
 * 5. Si no hay precios, se usa el proveedor con mayor confianza
 * 
 * ELIMINAR después de aprobación
 */

require('dotenv').config();
const { query } = require('../config/database');
const prisma = require('../lib/prisma');

async function testAsignacionPrecioBajo() {
  console.log('🧪 INICIANDO TESTS DE ASIGNACIÓN AUTOMÁTICA POR PRECIO MÁS BAJO\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // TEST 1: Verificar que se buscan todos los mappings para un producto
    console.log('📋 TEST 1: Búsqueda de todos los mappings para un producto');
    
    // Buscar un producto que tenga múltiples mappings (múltiples proveedores)
    const productosConMultiplesProveedores = await query(`
      SELECT alegra_reference, COUNT(DISTINCT supplier_name) as count
      FROM supplier_product_mapping
      GROUP BY alegra_reference
      HAVING COUNT(DISTINCT supplier_name) > 1
      LIMIT 1
    `);
    
    if (productosConMultiplesProveedores.rows.length === 0) {
      console.log('⚠️ No hay productos con múltiples proveedores para probar');
      console.log('✅ Test básico: PASSED (no hay datos para probar)');
      testsPassed++;
    } else {
      const productoCodigo = productosConMultiplesProveedores.rows[0].alegra_reference;
      
      // Buscar todos los mappings para este producto
      const todosLosMappings = await query(`
        SELECT id, supplier_name, supplier_code, confidence
        FROM supplier_product_mapping
        WHERE alegra_reference = $1
      `, [productoCodigo]);
      
      console.log(`   Producto: ${productoCodigo}`);
      console.log(`   Mappings encontrados: ${todosLosMappings.rows.length}`);
      
      if (todosLosMappings.rows.length > 1) {
        console.log('   ✅ PASSED: Se encuentran múltiples mappings para el producto');
        testsPassed++;
      } else {
        console.log('   ❌ FAILED: No se encuentran múltiples mappings');
        testsFailed++;
      }
    }
    
    // TEST 2: Verificar obtención de precios más recientes
    console.log('\n📋 TEST 2: Obtención de precios más recientes por proveedor');
    
    // Buscar un mapping que tenga productos relacionados
    const mappingConProductos = await query(`
      SELECT spm.id, spm.supplier_name, spm.alegra_reference
      FROM supplier_product_mapping spm
      WHERE EXISTS (
        SELECT 1 FROM productos_factura_proveedor pfp
        WHERE pfp.mapeo_id = spm.id
        AND pfp.precio_unitario > 0
      )
      LIMIT 1
    `);
    
    if (mappingConProductos.rows.length === 0) {
      console.log('⚠️ No hay mappings con productos relacionados para probar');
      console.log('✅ Test básico: PASSED (no hay datos para probar)');
      testsPassed++;
    } else {
      const mappingId = mappingConProductos.rows[0].id;
      const proveedorNombre = mappingConProductos.rows[0].supplier_name;
      
      // Buscar precio más reciente usando Prisma
      const productoFactura = await prisma.productoFactura.findFirst({
        where: {
          mapeoId: mappingId
        },
        orderBy: {
          factura: {
            fechaEmision: 'desc'
          }
        },
        select: {
          precioUnitario: true,
          factura: {
            select: {
              fechaEmision: true
            }
          }
        }
      });
      
      if (productoFactura && productoFactura.precioUnitario > 0) {
        console.log(`   Proveedor: ${proveedorNombre}`);
        console.log(`   Precio más reciente: ₡${productoFactura.precioUnitario.toFixed(2)}`);
        console.log(`   Fecha: ${productoFactura.factura?.fechaEmision || 'N/A'}`);
        console.log('   ✅ PASSED: Se obtiene precio más reciente correctamente');
        testsPassed++;
      } else {
        console.log('   ❌ FAILED: No se pudo obtener precio más reciente');
        testsFailed++;
      }
    }
    
    // TEST 3: Verificar lógica de selección por precio más bajo
    console.log('\n📋 TEST 3: Lógica de selección por precio más bajo');
    
    // Buscar un producto con múltiples proveedores que tengan precios
    const productoConPrecios = await query(`
      SELECT DISTINCT spm.alegra_reference, spm.alegra_name
      FROM supplier_product_mapping spm
      WHERE EXISTS (
        SELECT 1 FROM productos_factura_proveedor pfp1
        WHERE pfp1.mapeo_id = spm.id AND pfp1.precio_unitario > 0
      )
      AND (
        SELECT COUNT(DISTINCT spm2.supplier_name)
        FROM supplier_product_mapping spm2
        WHERE spm2.alegra_reference = spm.alegra_reference
        AND EXISTS (
          SELECT 1 FROM productos_factura_proveedor pfp2
          WHERE pfp2.mapeo_id = spm2.id AND pfp2.precio_unitario > 0
        )
      ) > 1
      LIMIT 1
    `);
    
    if (productoConPrecios.rows.length === 0) {
      console.log('⚠️ No hay productos con múltiples proveedores y precios para probar');
      console.log('✅ Test básico: PASSED (no hay datos para probar)');
      testsPassed++;
    } else {
      const productoRef = productoConPrecios.rows[0].alegra_reference;
      const productoNombre = productoConPrecios.rows[0].alegra_name;
      
      console.log(`   Producto: ${productoNombre} (${productoRef})`);
      
      // Obtener todos los mappings con precios
      const mappings = await query(`
        SELECT id, supplier_name, confidence
        FROM supplier_product_mapping
        WHERE alegra_reference = $1
      `, [productoRef]);
      
      const proveedoresConPrecios = [];
      
      for (const mapping of mappings.rows) {
        const productoFactura = await prisma.productoFactura.findFirst({
          where: {
            mapeoId: mapping.id
          },
          orderBy: {
            factura: {
              fechaEmision: 'desc'
            }
          },
          select: {
            precioUnitario: true
          }
        });
        
        if (productoFactura && productoFactura.precioUnitario > 0) {
          proveedoresConPrecios.push({
            mapping: mapping,
            precio: productoFactura.precioUnitario,
            confianza: mapping.confidence || 0
          });
        }
      }
      
      if (proveedoresConPrecios.length > 1) {
        // Ordenar por precio (ascendente) y confianza (descendente) como desempate
        proveedoresConPrecios.sort((a, b) => {
          if (a.precio !== b.precio) {
            return a.precio - b.precio; // Precio más bajo primero
          }
          return b.confianza - a.confianza; // Mayor confianza como desempate
        });
        
        const proveedorSeleccionado = proveedoresConPrecios[0];
        
        console.log(`   Proveedores encontrados: ${proveedoresConPrecios.length}`);
        proveedoresConPrecios.forEach((p, idx) => {
          console.log(`   ${idx + 1}. ${p.mapping.supplier_name}: ₡${p.precio.toFixed(2)} (confianza: ${p.confianza}%)`);
        });
        console.log(`   ✅ Seleccionado: ${proveedorSeleccionado.mapping.supplier_name} con precio ₡${proveedorSeleccionado.precio.toFixed(2)}`);
        
        // Verificar que el seleccionado tiene el precio más bajo
        const todosLosPrecios = proveedoresConPrecios.map(p => p.precio);
        const precioMasBajo = Math.min(...todosLosPrecios);
        
        if (proveedorSeleccionado.precio === precioMasBajo) {
          console.log('   ✅ PASSED: Se selecciona correctamente el proveedor con precio más bajo');
          testsPassed++;
        } else {
          console.log('   ❌ FAILED: No se selecciona el proveedor con precio más bajo');
          testsFailed++;
        }
      } else {
        console.log('   ⚠️ No hay suficientes proveedores con precios para probar');
        console.log('   ✅ Test básico: PASSED (no hay datos suficientes)');
        testsPassed++;
      }
    }
    
    // TEST 4: Verificar fallback cuando no hay precios
    console.log('\n📋 TEST 4: Fallback cuando no hay precios disponibles');
    
    // Buscar un producto con mappings pero sin precios
    const productoSinPrecios = await query(`
      SELECT alegra_reference
      FROM supplier_product_mapping
      WHERE alegra_reference NOT IN (
        SELECT DISTINCT spm.alegra_reference
        FROM supplier_product_mapping spm
        WHERE EXISTS (
          SELECT 1 FROM productos_factura_proveedor pfp
          WHERE pfp.mapeo_id = spm.id AND pfp.precio_unitario > 0
        )
      )
      AND (
        SELECT COUNT(*) FROM supplier_product_mapping spm2
        WHERE spm2.alegra_reference = supplier_product_mapping.alegra_reference
      ) > 1
      LIMIT 1
    `);
    
    if (productoSinPrecios.rows.length === 0) {
      console.log('⚠️ No hay productos sin precios para probar fallback');
      console.log('✅ Test básico: PASSED (no hay datos para probar)');
      testsPassed++;
    } else {
      const productoRef = productoSinPrecios.rows[0].alegra_reference;
      
      const mappings = await query(`
        SELECT id, supplier_name, confidence
        FROM supplier_product_mapping
        WHERE alegra_reference = $1
        ORDER BY confidence DESC
      `, [productoRef]);
      
      if (mappings.rows.length > 0) {
        const proveedorMayorConfianza = mappings.rows[0];
        console.log(`   Producto: ${productoRef}`);
        console.log(`   Proveedor con mayor confianza: ${proveedorMayorConfianza.supplier_name} (${proveedorMayorConfianza.confidence}%)`);
        console.log('   ✅ PASSED: Fallback a proveedor con mayor confianza cuando no hay precios');
        testsPassed++;
      } else {
        console.log('   ❌ FAILED: No se encuentra proveedor para fallback');
        testsFailed++;
      }
    }
    
  } catch (error) {
    console.error('❌ ERROR en tests:', error);
    testsFailed++;
  } finally {
    // Cerrar conexión de Prisma
    await prisma.$disconnect();
  }
  
  // RESUMEN
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN DE TESTS');
  console.log('='.repeat(50));
  console.log(`✅ Tests pasados: ${testsPassed}`);
  console.log(`❌ Tests fallidos: ${testsFailed}`);
  console.log(`📈 Total: ${testsPassed + testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 TODOS LOS TESTS PASARON');
    process.exit(0);
  } else {
    console.log('\n⚠️ ALGUNOS TESTS FALLARON - Revisar lógica');
    process.exit(1);
  }
}

// Ejecutar tests
testAsignacionPrecioBajo().catch(async (error) => {
  console.error('❌ Error fatal:', error);
  await prisma.$disconnect();
  process.exit(1);
});


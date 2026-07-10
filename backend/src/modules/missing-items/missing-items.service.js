/**
 * Missing-Items Module - Service
 * Lógica de negocio para operaciones de faltantes
 */

const { query } = require('../../../config/database');
const { getClient } = require('../../integrations/alegra');
const client = getClient();

/**
 * Guarda o actualiza un ajuste de faltante
 */
async function saveAdjustment({ faltanteId, cantidadEntregada, estado, requiereActualizacion }) {
  await query(`
    INSERT INTO faltantes_ajustes (faltante_id, cantidad_entregada, estado, requiere_actualizacion)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (faltante_id) 
    DO UPDATE SET 
      cantidad_entregada = $2,
      estado = $3,
      requiere_actualizacion = $4,
      updated_at = CURRENT_TIMESTAMP
  `, [faltanteId, cantidadEntregada, estado, requiereActualizacion]);

  return { success: true, message: 'Ajuste guardado' };
}

/**
 * Elimina un ajuste de faltante
 */
async function deleteAdjustment(faltanteId) {
  await query(
    'DELETE FROM faltantes_ajustes WHERE faltante_id = $1',
    [faltanteId]
  );

  return { success: true, message: 'Ajuste eliminado' };
}

/**
 * Limpia los faltantes de proveedor de la base de datos
 */
async function cleanProviderMissingItems() {
  // Contar faltantes antes de eliminar
  const countResult = await query('SELECT COUNT(*) FROM faltantes');
  const totalAntes = parseInt(countResult.rows[0].count);

  // Eliminar todos los faltantes
  await query('DELETE FROM faltantes');

  console.log(`✅ Faltantes limpiados: ${totalAntes} registros eliminados`);

  return {
    success: true,
    message: 'Faltantes limpiados correctamente',
    registros_eliminados: totalAntes
  };
}

/**
 * Obtiene diagnóstico de un producto por su referencia de Alegra
 */
async function getDiagnostic(alegraReference) {
  console.log(`🔍 Buscando diagnóstico para ${alegraReference}...`);

  // Buscar producto en BD local
  const productoLocal = await query(`
    SELECT id, nombre, codigo, alegra_id, proveedor_id
    FROM productos
    WHERE codigo = $1 OR alegra_id::text = $1 OR nombre ILIKE $2
    LIMIT 5
  `, [alegraReference, `%${alegraReference}%`]);

  // Buscar faltantes asociados
  const faltantes = await query(`
    SELECT f.*, fa.numero_factura, fa.cliente_nombre
    FROM faltantes f
    JOIN facturas fa ON f.factura_id = fa.id
    JOIN productos p ON f.producto_id = p.id
    WHERE p.codigo = $1 OR p.alegra_id::text = $1 OR p.nombre ILIKE $2
    ORDER BY f.created_at DESC
    LIMIT 10
  `, [alegraReference, `%${alegraReference}%`]);

  // Buscar mappings de proveedor
  const mappings = await query(`
    SELECT spm.*
    FROM supplier_product_mapping spm
    WHERE spm.supplier_code = $1 OR spm.alegra_reference = $1 OR spm.alegra_name ILIKE $2
    LIMIT 10
  `, [alegraReference, `%${alegraReference}%`]);

  return {
    success: true,
    data: {
      producto_local: productoLocal.rows,
      faltantes_recientes: faltantes.rows,
      mappings_proveedor: mappings.rows
    }
  };
}

/**
 * Limpia duplicados de un producto
 */
async function cleanDuplicates(alegraReference) {
  console.log(`🧹 Limpiando duplicados para ${alegraReference}...`);

  // Encontrar productos duplicados (mismo codigo)
  const duplicados = await query(`
    WITH duplicates AS (
      SELECT id, codigo, nombre, created_at,
             ROW_NUMBER() OVER (PARTITION BY codigo ORDER BY created_at ASC) as rn
      FROM productos
      WHERE codigo = $1
    )
    SELECT * FROM duplicates WHERE rn > 1
  `, [alegraReference]);

  if (duplicados.rows.length === 0) {
    return {
      success: true,
      message: 'No se encontraron duplicados',
      eliminados: 0
    };
  }

  const idsToDelete = duplicados.rows.map(r => r.id);
  
  // Actualizar faltantes que apuntan a duplicados al producto original
  const productoOriginal = await query(`
    SELECT id FROM productos 
    WHERE codigo = $1 
    ORDER BY created_at ASC 
    LIMIT 1
  `, [alegraReference]);

  if (productoOriginal.rows.length > 0) {
    await query(`
      UPDATE faltantes 
      SET producto_id = $1 
      WHERE producto_id = ANY($2::int[])
    `, [productoOriginal.rows[0].id, idsToDelete]);
  }

  // Eliminar duplicados
  await query(`
    DELETE FROM productos WHERE id = ANY($1::int[])
  `, [idsToDelete]);

  return {
    success: true,
    message: `Duplicados eliminados: ${idsToDelete.length}`,
    eliminados: idsToDelete.length
  };
}

/**
 * Asigna manualmente un proveedor a un producto (usado por ReporteProveedores)
 */
async function assignSupplierManual({ alegraReference, alegraItemId, alegraName, proveedorId, nuevoProveedorId }) {
  const targetProveedorId = proveedorId || nuevoProveedorId;

  if (!alegraReference && !alegraItemId) {
    throw new Error('Se requiere alegraReference o alegraItemId');
  }

  if (!targetProveedorId) {
    throw new Error('Se requiere proveedorId o nuevoProveedorId');
  }

  // 1. Obtener la información del contacto desde Alegra usando su ID de Alegra
  console.log(`📡 Consultando proveedor en Alegra con ID: ${targetProveedorId}...`);
  const contactResponse = await client.api.get(`/contacts/${targetProveedorId}`);
  const contactData = contactResponse.data;
  
  if (!contactData || !contactData.name) {
    throw new Error(`No se pudo obtener la información del proveedor ${targetProveedorId} desde Alegra`);
  }

  const supplierName = contactData.name.trim();
  const email = contactData.email || null;
  const phone = contactData.phonePrimary || contactData.mobile || null;
  const contactPerson = contactData.contact?.name || null;
  const supplierCedula = contactData.identification || null;

  // 2. Buscar o crear el proveedor en la tabla local 'proveedores'
  let localProveedorId = null;
  const existingProveedor = await query('SELECT id FROM proveedores WHERE nombre = $1', [supplierName]);

  if (existingProveedor.rows.length > 0) {
    localProveedorId = existingProveedor.rows[0].id;
    console.log(`✅ Proveedor local encontrado: ${supplierName} (ID local: ${localProveedorId})`);
  } else {
    // Si no existe localmente, lo insertamos
    const insertProveedor = await query(`
      INSERT INTO proveedores (nombre, contacto, telefono, email, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `, [supplierName, contactPerson, phone, email]);
    
    localProveedorId = insertProveedor.rows[0].id;
    console.log(`✅ Nuevo proveedor local registrado: ${supplierName} (ID local: ${localProveedorId})`);
  }

  // 3. Buscar el producto en la tabla local 'productos'
  let queryStr = 'SELECT id FROM productos WHERE codigo = $1';
  let params = [alegraReference || alegraItemId];
  let result = await query(queryStr, params);

  if (result.rows.length === 0 && alegraItemId) {
    // Intentar por ID si es un número válido
    const idNum = parseInt(alegraItemId);
    if (!isNaN(idNum)) {
      queryStr = 'SELECT id FROM productos WHERE id = $1';
      params = [idNum];
      result = await query(queryStr, params);
    }
  }

  if (result.rows.length === 0 && alegraItemId) {
    // Intentar por código = alegraItemId
    queryStr = 'SELECT id FROM productos WHERE codigo = $1';
    params = [alegraItemId];
    result = await query(queryStr, params);
  }

  let productoId = null;

  if (result.rows.length === 0) {
    // Si no existe el producto localmente, lo creamos
    console.log(`Product ${alegraReference || alegraName} not found in local DB. Creating it...`);
    const insertResult = await query(`
      INSERT INTO productos (nombre, codigo, descripcion, proveedor_id, precio_unitario)
      VALUES ($1, $2, $3, $4, 0)
      RETURNING id
    `, [alegraName || alegraReference || 'Producto Sincronizado', alegraReference || alegraItemId, 'Creado desde asignación manual de proveedor', localProveedorId]);
    productoId = insertResult.rows[0].id;
  } else {
    productoId = result.rows[0].id;
    // Actualizar el proveedor del producto en la BD local
    await query(`
      UPDATE productos
      SET proveedor_id = $1
      WHERE id = $2
    `, [localProveedorId, productoId]);
  }

  // 4. Buscar mapping ID opcional en la tabla supplier_product_mapping si existiese para el nuevo proveedor
  let mappingId = null;
  const mappingConditions = [];
  const mappingParams = [alegraItemId?.toString(), alegraReference];
  let mappingParamIdx = 3;

  if (supplierCedula) {
    mappingConditions.push(`supplier_cedula = $${mappingParamIdx}`);
    mappingParams.push(supplierCedula);
    mappingParamIdx++;
  }
  if (supplierName) {
    mappingConditions.push(`supplier_name ILIKE $${mappingParamIdx}`);
    mappingParams.push(`%${supplierName}%`);
    mappingParamIdx++;
  }

  if (mappingConditions.length > 0) {
    const mappingResult = await query(`
      SELECT id FROM supplier_product_mapping
      WHERE (alegra_item_id::text = $1 OR alegra_reference = $2)
        AND (${mappingConditions.join(' OR ')})
      LIMIT 1
    `, mappingParams);

    if (mappingResult.rows.length > 0) {
      mappingId = mappingResult.rows[0].id;
    }
  }

  // 5. Actualizar los faltantes pendientes de este producto con el nombre y cédula del proveedor
  const updateFaltantesResult = await query(`
    UPDATE faltantes
    SET 
      proveedor_asignado = $1,
      proveedor_cedula = $2,
      asignacion_tipo = 'manual',
      fecha_asignacion = CURRENT_TIMESTAMP,
      mapping_id = $3
    WHERE producto_id = $4 AND estado = 'pendiente'
  `, [supplierName, supplierCedula, mappingId, productoId]);

  console.log(`✅ Asignación manual completada: ${updateFaltantesResult.rowCount} faltante(s) actualizados`);

  return {
    success: true,
    message: 'Proveedor asignado exitosamente al producto y sus faltantes pendientes',
    localProveedorId,
    productoId,
    faltantesActualizados: updateFaltantesResult.rowCount
  };
}

module.exports = {
  saveAdjustment,
  deleteAdjustment,
  cleanProviderMissingItems,
  getDiagnostic,
  cleanDuplicates,
  assignSupplierManual
};

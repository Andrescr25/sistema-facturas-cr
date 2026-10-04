/**
 * Dobles para probar el buzón de compras contra PostgreSQL local, dentro de
 * UNA transacción que se deshace.
 *
 * El problema: el código mezcla tres formas de llegar a la base —`query`,
 * `pool.connect()` con sus propios BEGIN/COMMIT, y Prisma—. Prisma abre otra
 * conexión y no vería lo que hay en la transacción de la prueba; y un BEGIN
 * adentro de otro la cerraría.
 *
 * · `baseEnTransaccion(conexion)` reemplaza `config/database`: todo va por la
 *   misma conexión, y cada BEGIN/COMMIT/ROLLBACK de adentro se vuelve un
 *   SAVEPOINT.
 * · `prismaDelBuzon(conexion)` reemplaza `lib/prisma` con lo justo que piden
 *   estos módulos, leyendo de la misma conexión.
 *
 * EL DOBLE DE PRISMA VALIDA LO QUE VALIDA EL DE VERDAD. El cliente generado
 * declara obligatorios `alegraItemId` y `alegraName` del mapeo: una fila con
 * NULL hace fallar la lectura entera (P2032). Un doble que devolvía lo que
 * hubiera en la fila dejó pasar ese error hasta el navegador
 * (docs/grafo/leccion/el-doble-de-prisma-no-valida-tipos.md).
 */

function baseEnTransaccion(conexion, prefijo = 'sp') {
  let nivel = 0;
  const ejecutar = (sql, params) => conexion.query(sql, params);
  return {
    query: ejecutar,
    pool: {
      query: ejecutar,
      connect: async () => ({
        query: async (sql, params) => {
          if (sql === 'BEGIN') return conexion.query(`SAVEPOINT ${prefijo}_${++nivel}`);
          if (sql === 'COMMIT') return conexion.query(`RELEASE SAVEPOINT ${prefijo}_${nivel--}`);
          if (sql === 'ROLLBACK') return conexion.query(`ROLLBACK TO SAVEPOINT ${prefijo}_${nivel--}`);
          return ejecutar(sql, params);
        },
        release() {}
      })
    }
  };
}

function prismaDelBuzon(conexion) {
  const mapeoDeLinea = (f) => {
    if (f.mapeo_alegra_item_id === null) throw new Error('Prisma no puede leer un mapeo con alegra_item_id NULL');
    return { id: f.mapeo_id, factorConversion: f.factor_conversion, alegraItemId: f.mapeo_alegra_item_id };
  };
  const comoLinea = (f) => ({
    id: f.id, facturaId: f.factura_id, numeroLinea: f.numero_linea,
    codigoProveedor: f.codigo_proveedor, codigoComercial: f.codigo_comercial, codigoCabys: f.codigo_cabys,
    descripcion: f.descripcion, unidadMedida: f.unidad_medida,
    cantidad: Number(f.cantidad), precioUnitario: Number(f.precio_unitario),
    descuento: Number(f.descuento || 0), impuesto: Number(f.impuesto || 0), totalLinea: Number(f.total_linea),
    alegraItemId: f.alegra_item_id, estadoRelacionado: f.estado_relacionado, mapeoId: f.mapeo_id,
    factura: { id: f.factura_id, fechaEmision: f.fecha_emision, proveedorNombre: f.proveedor_nombre, proveedorCedula: f.proveedor_cedula },
    // Abrir una factura trae el mapeo de cada línea (`include: { mapeo: true }`).
    mapeo: f.mapeo_id ? mapeoDeLinea(f) : null
  });
  const lineas = async (filtro, params) => (await conexion.query(`
    SELECT l.*, f.fecha_emision, f.proveedor_nombre, f.proveedor_cedula, m.factor_conversion,
           m.alegra_item_id AS mapeo_alegra_item_id
      FROM productos_factura_proveedor l
      JOIN facturas_proveedores f ON f.id = l.factura_id
      LEFT JOIN supplier_product_mapping m ON m.id = l.mapeo_id
     WHERE ${filtro} ORDER BY l.numero_linea`, params)).rows.map(comoLinea);

  const comoFactura = (f, productos) => ({
    id: f.id, estado: f.estado, numeroConsecutivo: f.numero_consecutivo, fechaEmision: f.fecha_emision,
    proveedorNombre: f.proveedor_nombre, proveedorCedula: f.proveedor_cedula, productos
  });

  const comoMapeo = (m) => {
    if (!m) return m;
    for (const campo of ['alegra_item_id', 'alegra_name']) {
      if (m[campo] === null) throw new Error(`Prisma no puede leer un mapeo con ${campo} NULL`);
    }
    return {
      id: m.id, supplierName: m.supplier_name, supplierCedula: m.supplier_cedula, supplierCode: m.supplier_code,
      supplierDesc: m.supplier_desc, alegraItemId: m.alegra_item_id, alegraReference: m.alegra_reference,
      alegraName: m.alegra_name, confidence: Number(m.confidence), timesUsed: m.times_used,
      origen: m.origen, factorConversion: m.factor_conversion, lastUsedDate: m.last_used_date
    };
  };
  const mapeos = async (filtro, params) => (await conexion.query(
    `SELECT * FROM supplier_product_mapping WHERE ${filtro}`, params)).rows.map(comoMapeo);

  return {
    productoFactura: {
      findUnique: async ({ where }) => (await lineas('l.id = $1', [where.id]))[0] || null,
      findMany: async ({ where }) => {
        if (where.id?.in) return lineas('l.id = ANY($1::uuid[])', [where.id.in]);
        if (where.mapeoId) return lineas('l.mapeo_id = $1', [where.mapeoId]);
        return lineas('l.factura_id = $1', [where.facturaId]);
      }
    },
    factura: {
      findUnique: async ({ where }) => {
        const { rows: [f] } = await conexion.query('SELECT * FROM facturas_proveedores WHERE id = $1', [where.id]);
        return f ? comoFactura(f, await lineas('l.factura_id = $1', [where.id])) : null;
      },
      // Lo que piden las listas de Revisión de Precios: por estado, y
      // "todas sus líneas relacionadas" (`productos: { some, every }`).
      findMany: async ({ where = {}, take = 50 } = {}) => {
        const condiciones = ['TRUE'];
        const params = [];
        const estados = typeof where.estado === 'string' ? [where.estado] : where.estado?.in;
        if (estados) { params.push(estados); condiciones.push(`f.estado::text = ANY($${params.length}::text[])`); }
        if (where.productos?.every?.estadoRelacionado) {
          params.push(where.productos.every.estadoRelacionado);
          condiciones.push(`EXISTS (SELECT 1 FROM productos_factura_proveedor l WHERE l.factura_id = f.id)
            AND NOT EXISTS (SELECT 1 FROM productos_factura_proveedor l WHERE l.factura_id = f.id AND l.estado_relacionado::text <> $${params.length})`);
        }
        params.push(take);
        const { rows } = await conexion.query(
          `SELECT * FROM facturas_proveedores f WHERE ${condiciones.join(' AND ')} ORDER BY f.fecha_emision DESC LIMIT $${params.length}`, params);
        const todas = rows.length ? await lineas('l.factura_id = ANY($1::uuid[])', [rows.map(f => f.id)]) : [];
        return rows.map(f => comoFactura(f, todas.filter(l => l.facturaId === f.id)));
      }
    },
    supplierProductMapping: {
      findUnique: async ({ where }) => (where.id
        ? await mapeos('id = $1', [where.id])
        : await mapeos('supplier_cedula = $1 AND supplier_code = $2',
          [where.supplierCedula_supplierCode.supplierCedula, where.supplierCedula_supplierCode.supplierCode]))[0] || null,
      findMany: async ({ where }) => (await mapeos('id = ANY($1::uuid[])', [where.id.in])).map(m => ({ ...m, productos: [] })),
      delete: async ({ where }) => conexion.query('DELETE FROM supplier_product_mapping WHERE id = $1', [where.id])
    }
  };
}

module.exports = { baseEnTransaccion, prismaDelBuzon };

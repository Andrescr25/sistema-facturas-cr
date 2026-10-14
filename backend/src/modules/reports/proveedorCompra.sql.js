/** Una asignación antigua puede guardar sólo nombre. Usar la ficha únicamente
 * si ese nombre exacto identifica a un proveedor; nunca repartirla entre
 * homónimos ni depender del nombre histórico que quedó en el mapping. */
const cedulaAsignada = (f = 'f') => `NULLIF(NULLIF(btrim(${f}.proveedor_cedula),'SIN_PROVEEDOR'),'')`;
const nombreAsignado = (f = 'f') => `lower(btrim(${f}.proveedor_asignado))`;

function fichaAsignada(f = 'f') {
  return `SELECT pr.id,pr.nombre,pr.identificacion FROM proveedor pr WHERE
    (${cedulaAsignada(f)} IS NOT NULL AND pr.identificacion=${cedulaAsignada(f)})
    OR (${cedulaAsignada(f)} IS NULL AND lower(btrim(pr.nombre))=${nombreAsignado(f)}
      AND NOT EXISTS(SELECT 1 FROM proveedor otra WHERE otra.id<>pr.id
        AND lower(btrim(otra.nombre))=${nombreAsignado(f)})) LIMIT 1`;
}

function mappingProveedor(productoId, proveedorId, cedula) {
  return `SELECT m.* FROM supplier_product_mapping m WHERE m.producto_id=${productoId}
    AND (m.proveedor_id=${proveedorId} OR (m.proveedor_id IS NULL AND m.supplier_cedula=${cedula}))
    ORDER BY m.last_used_date DESC NULLS LAST,m.times_used DESC,m.id LIMIT 1`;
}

function asignadoAlProveedor(proveedorId, cedula, nombre, f = 'f') {
  return `((${cedulaAsignada(f)} IS NOT NULL AND ${cedulaAsignada(f)}=${cedula})
    OR (${cedulaAsignada(f)} IS NULL AND ${nombreAsignado(f)}=lower(btrim(${nombre}))
      AND NOT EXISTS(SELECT 1 FROM proveedor otra WHERE otra.id<>${proveedorId}
        AND lower(btrim(otra.nombre))=${nombreAsignado(f)})))`;
}

module.exports = { cedulaAsignada, fichaAsignada, mappingProveedor, asignadoAlProveedor };

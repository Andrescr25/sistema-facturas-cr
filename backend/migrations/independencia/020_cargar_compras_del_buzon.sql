-- Las compras que ya pasaron, cargadas desde el buzón de correo.
--
-- `facturas_proveedores` + `productos_factura_proveedor` son el buzón: lo que
-- llegó. Acá se convierte en `compra` lo que YA ENTRÓ AL NEGOCIO, para que el
-- histórico de costos, los reportes y las cuentas por pagar no tengan que
-- seguir leyendo el buzón —ni a Alegra— para saber a cómo se compró algo.
--
-- QUÉ ENTRA Y QUÉ NO, de las 862 del buzón:
--
--   ENVIADA           855  → sí. Ya se mandó a Alegra como factura de compra:
--                            es la prueba de que se aceptó.
--   GASTO_RECURRENTE    5  → sí. El internet y el teléfono son compras
--                            igual; que no lleven mercadería no las hace
--                            menos gasto del negocio.
--   PROCESADA           1  → no. Se leyó el correo y nada más.
--   RELACIONADA         1  → no. Se le encontraron los productos pero nadie
--                            la aceptó todavía.
--
-- Las dos que quedan afuera NO se pierden: siguen en el buzón, que es donde
-- tienen que estar mientras nadie las acepte. Cuando alguien las apruebe
-- desde la pantalla, se crearán como compra por el camino normal.
--
-- SE PUEDE VOLVER A CORRER. El índice único sobre `factura_proveedor_id` y el
-- `ON CONFLICT DO NOTHING` hacen que una segunda pasada no duplique nada.
--
-- EL TOTAL ES EL DEL COMPROBANTE. Hay 18 facturas donde no coincide con la
-- suma de sus líneas (de ₡65 a ₡16.941, algunas negativas): descuentos y
-- cargos de factura que el parser no extrae y que no se pueden recuperar
-- porque el XML no se guarda. Se carga el del comprobante, que es lo que se
-- le debe al proveedor.

INSERT INTO compra (
  proveedor_id, clave, numero_consecutivo, fecha_emision, fecha_vencimiento,
  moneda, total, estado, factura_proveedor_id, creado_en
)
SELECT
  pr.id,
  f.clave,
  f.numero_consecutivo,
  f.fecha_emision::date,
  f.fecha_vencimiento,
  COALESCE(NULLIF(f.moneda, ''), 'CRC'),
  f.total_factura,
  'registrada',
  f.id,
  -- Cuándo se registró de verdad, no cuándo corrió esta migración: si
  -- quedaran todas con la fecha de hoy, el histórico de compras se vería como
  -- si se hubiera comprado todo el mismo día.
  COALESCE(f.fecha_procesada, f.fecha_emision)
FROM facturas_proveedores f
JOIN proveedor pr ON pr.identificacion = f.proveedor_cedula
WHERE f.estado::text IN ('ENVIADA', 'GASTO_RECURRENTE')
ON CONFLICT DO NOTHING;


INSERT INTO compra_linea (
  compra_id, numero_linea, producto_id, descripcion, codigo_proveedor,
  codigo_cabys, cantidad, unidad, factor_conversion,
  precio_unitario, descuento, impuesto, total_linea
)
SELECT
  c.id,
  l.numero_linea,
  -- El producto sale del mapeo, que la migración 018 dejó apuntando a
  -- `producto.id`. NULL cuando la línea nunca se relacionó (123 así) o
  -- cuando su mapeo quedó sin producto.
  m.producto_id,
  l.descripcion,
  NULLIF(l.codigo_proveedor, ''),
  NULLIF(l.codigo_cabys, ''),
  l.cantidad,
  NULLIF(l.unidad_medida, ''),
  -- Sin factor, una unidad del proveedor es una mía.
  COALESCE(m.factor_conversion, 1),
  l.precio_unitario,
  COALESCE(l.descuento, 0),
  COALESCE(l.impuesto, 0),
  l.total_linea
FROM productos_factura_proveedor l
JOIN compra c ON c.factura_proveedor_id = l.factura_id
LEFT JOIN supplier_product_mapping m ON m.id = l.mapeo_id
-- Una compra recién creada no tiene líneas; si ya las tiene, es que esto ya
-- corrió y no hay que volver a meterlas.
WHERE NOT EXISTS (SELECT 1 FROM compra_linea cl WHERE cl.compra_id = c.id);

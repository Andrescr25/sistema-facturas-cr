-- 'devuelta' (migración 019) salió de una alucinación de una sesión anterior:
-- "devolver la factura al proveedor" nunca fue un pedido real, y nada del
-- código lo usaba (ni el servicio, ni el frontend, ni una sola compra
-- histórica en ese estado). Lo que el usuario sí pidió, y ya existe, es otra
-- cosa: "devolver a relacionar" una factura mal relacionada —eso vive en
-- `factura.estado` (`devolverFactura`), no en `compra.estado`, y no necesita
-- ningún estado nuevo aquí.

ALTER TABLE compra DROP CONSTRAINT compra_estado_valido;

ALTER TABLE compra
  ADD CONSTRAINT compra_estado_valido CHECK (estado IN ('registrada', 'anulada'));

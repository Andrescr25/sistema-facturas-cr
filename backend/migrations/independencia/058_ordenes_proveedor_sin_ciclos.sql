-- El usuario retira las semanas del Reporte Proveedores. Las órdenes
-- abiertas acumulan por proveedor; ciclo_id conserva únicamente historia.
-- No reclasificar ninguna fila. Mantener producto/factura/cliente y las
-- restricciones de cobertura/cantidades; quitar solo la igualdad de semana.
CREATE OR REPLACE FUNCTION validar_reserva_orden_compra() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE linea RECORD; origen RECORD; reservada NUMERIC;
BEGIN
  SELECT l.*,o.ciclo_id INTO linea FROM orden_compra_ciclo_linea l
    JOIN orden_compra_ciclo o ON o.id=l.orden_id WHERE l.id=NEW.linea_id;
  SELECT f.*,fa.cliente_id,rc.ciclo_id INTO origen FROM faltantes f JOIN factura fa ON fa.id=f.factura_propia_id
    LEFT JOIN ciclo_ruta_cliente rc ON rc.id=fa.ciclo_ruta_cliente_id WHERE f.id=NEW.faltante_id FOR UPDATE OF f;
  IF origen.producto_propio_id IS DISTINCT FROM linea.producto_id
    OR origen.factura_propia_id IS DISTINCT FROM NEW.factura_id
    OR origen.cliente_id IS DISTINCT FROM NEW.cliente_id
    THEN
    RAISE EXCEPTION 'La procedencia no corresponde al producto/factura/cliente de la orden';
  END IF;
  SELECT COALESCE(SUM(cobertura),0) INTO reservada FROM orden_compra_ciclo_cobertura WHERE faltante_id=NEW.faltante_id;
  IF reservada+NEW.cantidad>origen.cantidad_faltante THEN
    RAISE EXCEPTION 'El faltante ya está reservado en otra orden';
  END IF;
  SELECT COALESCE(SUM(cantidad),0) INTO reservada FROM orden_compra_ciclo_origen WHERE linea_id=NEW.linea_id;
  IF reservada+NEW.cantidad>linea.cantidad_propia THEN
    RAISE EXCEPTION 'La procedencia supera la cantidad propia de la línea';
  END IF;
  RETURN NEW;
END $$;

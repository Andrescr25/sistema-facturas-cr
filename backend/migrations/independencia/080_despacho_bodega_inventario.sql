-- 080 · Facturas en Bodega corrige el inventario (2026-11-19).
--
-- El usuario: «quiero que facturas en bodega corrija inventario con los
-- negativos: si marcan que algo no hay físico pero en sistema sí, entonces que
-- ponga la cantidad negativa y se vaya acumulando conforme los clientes».
-- Su ejemplo: sistema 4, físico 0; el cliente A pide 6 → −6; el cliente B pide
-- 3 → −9; si el domingo no ingresó por Revisión de Precios, vuelve a 0.
--
-- · El kardex admite el ajuste de Bodega: tipo `ajuste_bodega`, con origen
--   `despacho_bodega` (la fila de abajo). Sigue sin editarse ni borrarse.
-- · `despacho_bodega_inventario`: una fila por factura y producto, con la
--   marca y lo que se ajustó. Queda quién marcó, qué decía el sistema y
--   cuánto se les debía a los clientes, para revisarlo después.
--
-- Se puede correr dos veces: la segunda no hace nada.

ALTER TABLE movimiento_inventario DROP CONSTRAINT IF EXISTS movimiento_inventario_tipo_check;
ALTER TABLE movimiento_inventario ADD CONSTRAINT movimiento_inventario_tipo_check CHECK (tipo IN
  ('inicial','venta','nota_credito','compra','ajuste_auditoria','devolucion_proveedor','reversa','ajuste_bodega'));

ALTER TABLE movimiento_inventario DROP CONSTRAINT IF EXISTS movimiento_inventario_origen_tipo_check;
ALTER TABLE movimiento_inventario ADD CONSTRAINT movimiento_inventario_origen_tipo_check CHECK (origen_tipo IN
  ('factura','nota_credito','compra','auditoria_item','devolucion_proveedor','despacho_bodega'));

CREATE TABLE IF NOT EXISTS despacho_bodega_inventario (
  id                  SERIAL        PRIMARY KEY,
  factura_id          INTEGER       NOT NULL REFERENCES factura(id),
  producto_id         INTEGER       NOT NULL REFERENCES producto(id),
  -- La marca de Bodega: completo, faltó todo o parcial.
  marca               VARCHAR(10)   NOT NULL CHECK (marca IN ('completo', 'total', 'parcial')),
  cantidad_pedida     NUMERIC(14,4) NOT NULL CHECK (cantidad_pedida >= 0),
  cantidad_faltante   NUMERIC(14,4) NOT NULL CHECK (cantidad_faltante >= 0),
  -- Lo que decía el sistema sin el ajuste de esta factura, lo que se les
  -- debía a los clientes, y en cuánto quedó.
  existencia_sistema  NUMERIC(14,4) NOT NULL,
  deuda_clientes      NUMERIC(14,4) NOT NULL CHECK (deuda_clientes >= 0),
  existencia_final    NUMERIC(14,4) NOT NULL,
  -- existencia_final − existencia_sistema: lo que esta factura movió en total.
  ajuste              NUMERIC(14,4) NOT NULL,
  version             INTEGER       NOT NULL DEFAULT 1 CHECK (version > 0),
  usuario_id          INTEGER       REFERENCES usuario(id),
  creado_en           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (factura_id, producto_id)
);
CREATE INDEX IF NOT EXISTS idx_despacho_bodega_inventario_producto ON despacho_bodega_inventario(producto_id);

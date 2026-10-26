-- Qué compra respalda lo que se le entregó a un cliente (2026-10-25). El
-- usuario: «crear algo para que el sistema sepa cuándo el producto del
-- proveedor entra, y así no dejar al usuario marcar que sí llegó desde
-- Reporte Clientes si el sistema no ha detectado que el producto ingresara a
-- través de Revisión de precios».
--
-- Cada fila es un pedazo de una línea de compra entregado a un faltante.
-- Eligió «repartir lo que ingresó»: lo que se usó para el faltante de un
-- cliente no sirve para el de otro. El reparto lo hace
-- src/modules/missing-items/ingresoFaltante.js al guardar «Llegó todo» o
-- «Parte»; «No llegó» y quitar la respuesta lo sueltan.
--
-- Lo que llega sin factura electrónica se carga a mano en Revisión de
-- precios: es una compra con factura_proveedor_id NULL, y el índice de abajo
-- impide cargar dos veces el mismo papel del mismo proveedor.
BEGIN;
CREATE TABLE IF NOT EXISTS faltante_ingreso (
  id SERIAL PRIMARY KEY,
  faltante_id INTEGER NOT NULL REFERENCES faltantes(id) ON DELETE CASCADE,
  compra_linea_id INTEGER NOT NULL REFERENCES compra_linea(id),
  cantidad NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
  usuario_id INTEGER REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (faltante_id, compra_linea_id)
);
CREATE INDEX IF NOT EXISTS idx_faltante_ingreso_linea ON faltante_ingreso (compra_linea_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compra_manual_numero
  ON compra (proveedor_id, lower(btrim(numero_consecutivo)))
  WHERE factura_proveedor_id IS NULL AND numero_consecutivo IS NOT NULL AND estado <> 'anulada';
COMMIT;

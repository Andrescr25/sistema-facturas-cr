-- Un faltante que ya no se le compra a ningún proveedor (2026-10-22). El
-- usuario: «cuando estoy dentro de una orden de compra me deja borrar algún
-- producto, pero estos solo se tachan, necesito poder eliminarlos por
-- completo para ya cerrar esa orden de compra».
--
-- Sale de Reporte Proveedores y de las órdenes nuevas (faltanteOperativo en
-- reports/faltantesCompra.sql.js). El faltante del CLIENTE no cambia: Reporte
-- Clientes e Impresión lo siguen resolviendo (llegó, no llegó, se rebaja).
-- Se marca por faltante, no por producto: una venta nueva del mismo producto
-- vuelve a aparecer para comprarse.
BEGIN;
CREATE TABLE IF NOT EXISTS faltante_sin_compra (
  id SERIAL PRIMARY KEY,
  faltante_id INTEGER NOT NULL UNIQUE REFERENCES faltantes(id) ON DELETE CASCADE,
  proveedor_nombre VARCHAR(255),
  usuario_id INTEGER REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMIT;

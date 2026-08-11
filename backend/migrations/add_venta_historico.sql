-- Migración: Historial de compras por cliente (Catálogo Público personalizado)
-- Ledger crudo de líneas de venta, histórico completo, sin poda. A propósito
-- separada de venta_items (que tiene semántica de ventana móvil de 120 días
-- para la detección de excesos) para no arriesgar ese sistema.

CREATE TABLE IF NOT EXISTS venta_historico (
    id SERIAL PRIMARY KEY,
    alegra_invoice_id INTEGER NOT NULL,
    alegra_item_id VARCHAR(100) NOT NULL,
    cliente_id VARCHAR(50) NOT NULL,
    cliente_nombre VARCHAR(255),
    cantidad NUMERIC(12,2) NOT NULL DEFAULT 0,
    precio_unitario NUMERIC(12,2) DEFAULT 0,
    fecha_emision DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (alegra_invoice_id, alegra_item_id)
);

CREATE INDEX IF NOT EXISTS idx_venta_historico_cliente ON venta_historico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_venta_historico_fecha ON venta_historico(fecha_emision);

-- Verificar
SELECT table_name FROM information_schema.tables
WHERE table_name = 'venta_historico';

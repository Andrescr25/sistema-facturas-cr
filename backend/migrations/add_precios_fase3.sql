-- Migración: Fase 3 de la estrategia de precios (competencia)
-- Ver plan: /Users/joseandres/.claude/plans/ok-ya-lo-vi-adaptive-sky.md
--
-- Mismo patrón que supplier_product_mapping + productos_factura_proveedor:
-- competencia_mapping es el vínculo ESTABLE (producto propio ↔ producto de
-- la competencia), precio_competencia es la captura CRUDA de cada
-- sincronización (append-only — de paso queda un histórico de precios de
-- competencia en el tiempo, sin costo extra de diseño).

CREATE TABLE IF NOT EXISTS competencia_mapping (
    id SERIAL PRIMARY KEY,
    fuente VARCHAR(30) NOT NULL,              -- 'epa' | 'walmart' | 'masxmenos' | 'manual'
    sku_externo VARCHAR(150) NOT NULL,
    nombre_externo VARCHAR(500) NOT NULL,
    alegra_item_id VARCHAR(50) NOT NULL,
    confianza NUMERIC(5,2),
    origen VARCHAR(20) NOT NULL DEFAULT 'automatico', -- 'automatico' | 'manual'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (fuente, sku_externo)
);

CREATE TABLE IF NOT EXISTS precio_competencia (
    id SERIAL PRIMARY KEY,
    fuente VARCHAR(30) NOT NULL,
    sku_externo VARCHAR(150) NOT NULL,
    nombre_externo VARCHAR(500) NOT NULL,
    precio NUMERIC(14,2) NOT NULL,
    fecha_captura DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (fuente, sku_externo, fecha_captura)
);

CREATE INDEX IF NOT EXISTS idx_competencia_mapping_item ON competencia_mapping(alegra_item_id);
CREATE INDEX IF NOT EXISTS idx_precio_competencia_fuente_sku ON precio_competencia(fuente, sku_externo);
CREATE INDEX IF NOT EXISTS idx_precio_competencia_fecha ON precio_competencia(fecha_captura);

-- Verificar
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('competencia_mapping', 'precio_competencia');

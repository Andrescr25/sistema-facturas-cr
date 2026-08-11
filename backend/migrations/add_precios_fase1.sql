-- Migración: Fase 1 de la estrategia de precios (datos confiables)
-- Ver plan: /Users/joseandres/.claude/plans/ok-ya-lo-vi-adaptive-sky.md
--
-- 1) costo_historico: serie temporal de costo real por producto, derivada de
--    productos_factura_proveedor (que ya la tiene pero nadie la usa como
--    serie — el cache de Alegra solo guarda el último valor y se pisa cada
--    6h). Backfill: backend/scripts/backfill-costo-historico.js
--
-- 2) producto_rotacion: clasificación ABC por producto a partir de
--    venta_historico. NO se reutiliza la tabla rotacion_productos existente
--    a pesar de tener nombre parecido: esa es de grano semanal, atada a
--    faltantes (costo_total/venta_total por semana) y con FK dura a la
--    tabla legacy "productos" (no a alegra_item_id) — no encaja con esto y
--    sigue completamente muerta, sin tocar.
--
-- 3) Índice faltante en venta_historico(alegra_item_id): hoy solo hay
--    índices por cliente_id y fecha_emision, y el motor de precios va a
--    filtrar por producto todo el tiempo.

CREATE TABLE IF NOT EXISTS costo_historico (
    id SERIAL PRIMARY KEY,
    alegra_item_id VARCHAR(50) NOT NULL,
    producto_factura_id UUID,
    proveedor_cedula VARCHAR(50),
    proveedor_nombre VARCHAR(255),
    fecha DATE NOT NULL,
    costo_unitario NUMERIC(14,4) NOT NULL,
    factor_conversion NUMERIC(14,6) NOT NULL DEFAULT 1,
    origen VARCHAR(30) NOT NULL DEFAULT 'factura_proveedor',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (producto_factura_id)
);

CREATE INDEX IF NOT EXISTS idx_costo_historico_item ON costo_historico(alegra_item_id);
CREATE INDEX IF NOT EXISTS idx_costo_historico_fecha ON costo_historico(fecha);

CREATE TABLE IF NOT EXISTS producto_rotacion (
    id SERIAL PRIMARY KEY,
    alegra_item_id VARCHAR(50) UNIQUE NOT NULL,
    unidades_mes NUMERIC(14,2) NOT NULL DEFAULT 0,
    clientes_distintos INTEGER NOT NULL DEFAULT 0,
    facturacion_12m NUMERIC(14,2) NOT NULL DEFAULT 0,
    meses_sin_venta INTEGER,
    clase CHAR(1) NOT NULL,
    calculado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_producto_rotacion_clase ON producto_rotacion(clase);

CREATE INDEX IF NOT EXISTS idx_venta_historico_item ON venta_historico(alegra_item_id);

-- Verificar
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('costo_historico', 'producto_rotacion');

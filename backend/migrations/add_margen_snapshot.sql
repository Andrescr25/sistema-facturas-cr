-- Foto periódica del margen de TODO el catálogo.
--
-- precio_historico solo guarda una fila cuando alguien cambia un precio a
-- mano, así que responde "¿qué toqué?" pero no "¿estoy ganando más o menos
-- que hace tres meses?". Un producto cuyo proveedor subió el costo pierde
-- margen sin que nadie toque nada, y hoy eso es invisible hasta que alguien
-- lo abre.
--
-- Esta tabla guarda el margen de cada producto en cada corrida, lo hayas
-- tocado o no. Es la serie que permite ver deterioro sin ir a buscarlo.

CREATE TABLE IF NOT EXISTS margen_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL,
    alegra_item_id VARCHAR(20) NOT NULL,
    categoria VARCHAR(120),
    precio NUMERIC(14,2),
    -- Costo efectivo CON IVA, igual que alegra_products_cache.cost.
    costo NUMERIC(14,2),
    origen_costo VARCHAR(12),          -- 'alegra' | 'facturas' | NULL
    margen NUMERIC(7,2),               -- % sobre precio de venta; NULL si no hay costo
    clasificacion VARCHAR(20) NOT NULL,
    unidades_mes NUMERIC(12,2),
    facturacion_12m NUMERIC(14,2),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Una sola foto por producto por día: re-correr el job el mismo día
    -- actualiza en vez de duplicar.
    UNIQUE (fecha, alegra_item_id)
);

CREATE INDEX IF NOT EXISTS idx_margen_snapshot_fecha ON margen_snapshot(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_margen_snapshot_item ON margen_snapshot(alegra_item_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_margen_snapshot_categoria ON margen_snapshot(categoria, fecha DESC);

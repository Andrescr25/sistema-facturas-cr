-- Migración: Fase 2 de la estrategia de precios (motor de precios)
-- Ver plan: /Users/joseandres/.claude/plans/ok-ya-lo-vi-adaptive-sky.md
--
-- config_precios: margen meta y margen mínimo por categoría, editables
-- desde una pantalla — reemplaza el 20% hardcodeado en el frontend. Los
-- valores iniciales son la MEDIANA REAL medida en producción por categoría
-- (endpoint /api/rentabilidad/resumen), no un número redondo inventado.
-- margen_minimo = piso de seguridad, nunca se sugiere un precio por debajo.
--
-- precio_historico: bitácora de cada cambio de precio aplicado — hoy no
-- queda ningún registro de qué precio se aplicó, cuándo, ni con qué costo/
-- margen resultante (revision-precios.service.js no persiste nada de esto).

CREATE TABLE IF NOT EXISTS config_precios (
    id SERIAL PRIMARY KEY,
    categoria VARCHAR(255) UNIQUE NOT NULL,
    margen_meta NUMERIC(5,2) NOT NULL,
    margen_minimo NUMERIC(5,2) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS precio_historico (
    id SERIAL PRIMARY KEY,
    alegra_item_id VARCHAR(50) NOT NULL,
    precio_anterior NUMERIC(14,2),
    precio_nuevo NUMERIC(14,2) NOT NULL,
    costo_al_momento NUMERIC(14,4),
    margen_resultante NUMERIC(6,2),
    origen VARCHAR(30) NOT NULL DEFAULT 'revision_precios',
    factura_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_precio_historico_item ON precio_historico(alegra_item_id);
CREATE INDEX IF NOT EXISTS idx_precio_historico_factura ON precio_historico(factura_id);

-- __default__ cubre categorías sin fila propia (nuevas en Alegra, o vacías).
-- margen conservador, deliberadamente más bajo que la mediana real medida:
-- para lo desconocido conviene pecar de cauto, no de agresivo.
INSERT INTO config_precios (categoria, margen_meta, margen_minimo) VALUES
    ('__default__', 25.00, 12.00),
    ('Ferretería', 25.00, 15.00),
    ('Línea Plástica', 24.50, 14.00),
    ('Línea de Ciclo', 27.30, 16.00),
    ('Librería', 29.20, 17.00),
    ('Productos Personales', 24.20, 14.00),
    ('Línea Eléctrica', 25.70, 15.00),
    ('Productos de Pesca', 28.80, 17.00),
    ('Limpieza', 25.80, 15.00),
    ('Productos de PVC', 28.90, 17.00),
    ('Cocina', 25.00, 15.00),
    ('Consumo', 28.00, 16.00),
    ('Aceites y productos para vehículos', 22.50, 13.00),
    ('Ventas', 23.10, 13.00),
    ('r.Venenos', 22.10, 13.00),
    ('Pegamentos', 24.50, 14.00),
    ('Productos para perro', 20.00, 12.00),
    ('Medicamentos', 22.70, 13.00),
    ('Desodorantes', 24.20, 14.00)
ON CONFLICT (categoria) DO NOTHING;

-- Verificar
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('config_precios', 'precio_historico');
SELECT COUNT(*) as categorias_configuradas FROM config_precios;

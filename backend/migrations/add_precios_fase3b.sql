-- Migración: complemento a Fase 3 — recordar rechazos de emparejamiento.
-- Sin esto, una sugerencia de match descartada por el usuario volvería a
-- aparecer en "pendientes" cada vez que se recalcula (no se persiste nada
-- distinto entre "nunca revisado" y "revisado y rechazado").

CREATE TABLE IF NOT EXISTS competencia_rechazo (
    id SERIAL PRIMARY KEY,
    fuente VARCHAR(30) NOT NULL,
    sku_externo VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (fuente, sku_externo)
);

SELECT table_name FROM information_schema.tables WHERE table_name = 'competencia_rechazo';

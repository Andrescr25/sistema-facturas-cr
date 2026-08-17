-- Bitácora de las copias que deja Alegra al convertir una factura a
-- electrónica.
--
-- Al convertir, Alegra transforma el registro original en su lugar (conserva
-- su id, le pone plantilla electrónica y timbre) y deja atrás una copia NO
-- electrónica con id nuevo. Esa copia aparece en Cuentas por Cobrar
-- duplicando el monto y en Bodega como una segunda orden que alistar.
--
-- Esta tabla existe por dos razones:
--
--   1. Anular una factura de venta es irreversible desde acá. Queda registro
--      de qué se anuló, contra qué electrónica y cuándo, para poder auditar
--      después una acción que corrió desatendida.
--
--   2. Los pares que NO se anulan solos (porque hay cobros de por medio) se
--      guardan con su motivo, que es lo que alimenta la lista de revisión.
--      Sin esto habría que volver a recorrer Alegra para saber qué quedó
--      pendiente.
--
-- UNIQUE sobre el id del duplicado: la detección corre en cada sincronización
-- y tiene que poder reconocer lo que ya vio en vez de acumular filas.

CREATE TABLE IF NOT EXISTS duplicado_electronica (
    id SERIAL PRIMARY KEY,
    duplicado_alegra_id VARCHAR(20) NOT NULL UNIQUE,
    duplicado_numero VARCHAR(60),
    electronica_alegra_id VARCHAR(20) NOT NULL,
    electronica_numero VARCHAR(60),
    cliente_id VARCHAR(20),
    cliente_nombre VARCHAR(255),
    fecha_emision DATE,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- 'anulado'            -> se anuló en Alegra (era limpio)
    -- 'requiere_revision'  -> hay cobros de por medio, no se toca
    -- 'error'              -> se intentó anular y Alegra lo rechazó
    estado VARCHAR(20) NOT NULL DEFAULT 'requiere_revision',
    motivo TEXT,
    pago_en_duplicado NUMERIC(14,2) NOT NULL DEFAULT 0,
    pago_en_electronica NUMERIC(14,2) NOT NULL DEFAULT 0,
    detectado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    anulado_en TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_duplicado_electronica_estado
    ON duplicado_electronica(estado);

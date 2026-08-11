-- Pagos recurrentes: luz, agua, internet, alquiler, insumos, planilla.
--
-- Dos tablas a propósito, no una:
--
--   gasto_recurrente  = la plantilla ("la luz, del ICE, ~₡85.000, mensual,
--                       vence el 15"). Cambia poco.
--   pago_recurrente   = la ocurrencia de cada período ("la luz de agosto
--                       2026: ₡91.300, pagada el 14"). Es lo que da el
--                       control de flujo: cuánto se debe este mes, qué está
--                       vencido, y cómo viene variando cada servicio.
--
-- Guardar solo un "monto" en la plantilla haría imposible lo segundo, que es
-- justamente para lo que se pide el módulo.

CREATE TABLE IF NOT EXISTS gasto_recurrente (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    categoria VARCHAR(50) NOT NULL DEFAULT 'servicios',
    proveedor VARCHAR(200),
    monto_estimado NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- 'mensual' | 'quincenal' | 'bimensual' | 'trimestral' | 'semestral' | 'anual'
    frecuencia VARCHAR(20) NOT NULL DEFAULT 'mensual',
    -- Ancla para las frecuencias que no caen todos los meses: en qué mes
    -- (1-12) toca. Para mensual/quincenal se ignora.
    mes_referencia INTEGER,
    dia_vencimiento INTEGER,
    notas TEXT,
    -- Desactivar en vez de borrar: deja de generar períodos nuevos pero
    -- conserva el historial de lo ya pagado.
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pago_recurrente (
    id SERIAL PRIMARY KEY,
    gasto_id INTEGER NOT NULL REFERENCES gasto_recurrente(id) ON DELETE CASCADE,
    -- 'YYYY-MM' normalmente; los quincenales usan 'YYYY-MM-Q1' / 'YYYY-MM-Q2'
    -- (planilla es quincenal en CR y no entra en un solo período por mes).
    periodo VARCHAR(10) NOT NULL,
    monto NUMERIC(12,2) NOT NULL DEFAULT 0,
    fecha_vencimiento DATE,
    fecha_pago DATE,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'pagado'
    metodo VARCHAR(50),
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (gasto_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_pago_recurrente_periodo ON pago_recurrente(periodo);
CREATE INDEX IF NOT EXISTS idx_pago_recurrente_estado ON pago_recurrente(estado);

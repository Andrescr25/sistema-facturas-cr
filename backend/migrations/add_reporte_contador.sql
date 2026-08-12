-- Reporte Contador: control interno mensual de ventas y compras.
--
-- Cada mes se sube el par de Excel que exporta Alegra ("Impuestos en
-- Ventas" / "Impuestos en Compras"). Se guarda línea por línea (no solo el
-- resumen) porque la detección de duplicados necesita comparar factura
-- contra factura por cliente+fecha+monto+ítems — el resumen por tarifa no
-- alcanza para eso.
--
-- UNIQUE(anio, mes, tipo): volver a subir el mismo mes/tipo reemplaza el
-- período anterior completo (ver reporte-contador.service.js) en vez de
-- acumular cargas duplicadas.

CREATE TABLE IF NOT EXISTS reporte_contador_periodo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anio INTEGER NOT NULL,
    mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ventas', 'compras')),
    nombre_archivo VARCHAR(255),
    base_gravable_original NUMERIC(14,2) NOT NULL DEFAULT 0,
    impuesto_original NUMERIC(14,2) NOT NULL DEFAULT 0,
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (anio, mes, tipo)
);

CREATE TABLE IF NOT EXISTS reporte_contador_linea (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo_id UUID NOT NULL REFERENCES reporte_contador_periodo(id) ON DELETE CASCADE,
    orden INTEGER NOT NULL,
    tipo_documento VARCHAR(50),
    fecha DATE,
    numero VARCHAR(30) NOT NULL,
    -- Regla de Hacienda CR verificada en los archivos reales: el consecutivo
    -- electrónico (factura emitida) tiene 20 dígitos; el interno de Alegra
    -- (sin emisión) tiene 12. Se guarda ya resuelto para no recalcularlo en
    -- cada consulta.
    es_emitida BOOLEAN NOT NULL,
    contraparte VARCHAR(255),
    actividad_economica VARCHAR(255),
    concepto VARCHAR(500),
    cantidad NUMERIC(14,4),
    precio_unitario NUMERIC(14,4),
    precio_total NUMERIC(14,2),
    descuento NUMERIC(14,2) DEFAULT 0,
    nombre_impuesto VARCHAR(50),
    tipo_impuesto VARCHAR(50),
    tarifa VARCHAR(20),
    tipo_tarifa VARCHAR(30),
    acreditable VARCHAR(10),
    base_gravable NUMERIC(14,2) DEFAULT 0,
    impuesto NUMERIC(14,2) DEFAULT 0,
    -- El usuario decide qué queda fuera del total. Los duplicados de alta
    -- confianza arrancan excluidos como sugerencia, pero es reversible con
    -- un click — nunca se borra la fila, se excluye del cálculo.
    excluido BOOLEAN NOT NULL DEFAULT FALSE,
    -- 'alta' = mismo cliente+fecha+monto+ítems que una emitida (duplicado
    -- casi seguro). 'media' = mismo cliente+fecha+monto pero ítems
    -- distintos (puede ser coincidencia, no se auto-excluye). NULL = sin
    -- coincidencia encontrada.
    duplicado_confianza VARCHAR(10),
    duplicado_de VARCHAR(30)
);

CREATE INDEX IF NOT EXISTS idx_reporte_contador_linea_periodo ON reporte_contador_linea(periodo_id);
CREATE INDEX IF NOT EXISTS idx_reporte_contador_linea_numero ON reporte_contador_linea(periodo_id, numero);

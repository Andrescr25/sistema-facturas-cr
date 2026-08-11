-- Migración: Cuentas por Cobrar
-- Crea el espejo local de facturas de venta con saldo pendiente en Alegra
-- (cuentas_por_cobrar) y la bitácora de abonos registrados desde este
-- sistema (abonos_cobro). Alegra sigue siendo la fuente de verdad del saldo;
-- estas tablas existen porque /invoices es lenta de recorrer en vivo.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alegra_invoice_id VARCHAR(50) UNIQUE NOT NULL,
    numero_factura VARCHAR(150) NOT NULL,
    cliente_id VARCHAR(50) NOT NULL,
    cliente_nombre VARCHAR(255) NOT NULL,
    fecha_emision TIMESTAMP NOT NULL,
    fecha_vencimiento TIMESTAMP NOT NULL,
    total NUMERIC(14,2) NOT NULL,
    total_pagado NUMERIC(14,2) NOT NULL,
    saldo NUMERIC(14,2) NOT NULL,
    condicion_venta VARCHAR(20),
    plazo VARCHAR(50),
    estado_alegra VARCHAR(20) NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS abonos_cobro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alegra_invoice_id VARCHAR(50) NOT NULL,
    alegra_payment_id VARCHAR(50),
    cliente_id VARCHAR(50),
    cliente_nombre VARCHAR(255) NOT NULL,
    numero_factura VARCHAR(150) NOT NULL,
    monto NUMERIC(14,2) NOT NULL,
    fecha TIMESTAMP NOT NULL,
    metodo_pago VARCHAR(30) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_cliente ON cuentas_por_cobrar(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_vencimiento ON cuentas_por_cobrar(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_saldo ON cuentas_por_cobrar(saldo);
CREATE INDEX IF NOT EXISTS idx_abonos_cobro_factura ON abonos_cobro(alegra_invoice_id);
CREATE INDEX IF NOT EXISTS idx_abonos_cobro_cliente ON abonos_cobro(cliente_id);

-- Verificar
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('cuentas_por_cobrar', 'abonos_cobro');

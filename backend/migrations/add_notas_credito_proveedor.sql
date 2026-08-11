-- Notas de crédito de proveedor.
--
-- Una NC acredita una factura anterior: baja lo que se le debe al proveedor
-- por ESA factura. Vive en su propia tabla y NO en `facturas` a propósito —
-- si entrara por el flujo de compras sumaría productos al inventario y al
-- histórico de costos, cuando en realidad es un descuento sobre algo ya
-- comprado.
--
-- clave_referencia es la clave de 50 dígitos de la factura acreditada
-- (InformacionReferencia.Numero del XML). Puede haber VARIAS notas contra la
-- misma factura, así que el crédito aplicado es la suma, no un uno a uno
-- (verificado con NC reales: dos notas distintas contra la misma factura).
--
-- `lineas` y `razon` se guardan solo como evidencia para decidir a mano si
-- hubo devolución física. NO se usan para tocar inventario: hay NC con razón
-- "no sirve precio" que igual listan las unidades, y todas llegan con el
-- mismo Codigo "01", así que el efecto en bodega no es deducible del XML.

CREATE TABLE IF NOT EXISTS nota_credito_proveedor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave VARCHAR(50) NOT NULL UNIQUE,
    clave_referencia VARCHAR(50) NOT NULL,
    numero_consecutivo VARCHAR(50),
    proveedor_nombre VARCHAR(255) NOT NULL,
    proveedor_cedula VARCHAR(50) NOT NULL,
    fecha_emision TIMESTAMP NOT NULL,
    monto_total NUMERIC(14,2) NOT NULL,
    moneda VARCHAR(10) DEFAULT 'CRC',
    razon TEXT,
    codigo_referencia VARCHAR(10),
    lineas JSONB,

    -- Aplicada = su monto ya se restó del saldo de la cuenta por pagar.
    -- El flag es lo que hace idempotente el proceso: una NC puede llegar
    -- ANTES que su factura, así que se reintenta en cada corrida hasta que
    -- la factura exista.
    aplicada BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_aplicacion TIMESTAMP,
    cuenta_por_pagar_id UUID,

    -- Marca de revisión de bodega: la persona decide si hubo devolución real.
    inventario_revisado BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nc_proveedor_referencia ON nota_credito_proveedor(clave_referencia);
CREATE INDEX IF NOT EXISTS idx_nc_proveedor_aplicada ON nota_credito_proveedor(aplicada);

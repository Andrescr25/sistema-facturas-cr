-- Trazabilidad de la factura de compra creada en Alegra.
--
-- Hasta ahora el id que devolvía Alegra al crear la compra solo se escribía
-- en el log (ver revision-precios.service.js: "alegraFacturaId no está en el
-- schema, se registra en logs"). Sin ese dato no hay forma de saber si una
-- factura ya se registró en Alegra, y por lo tanto no hay forma de evitar
-- crearla dos veces.
--
-- Lo necesita el registro automático de los gastos recurrentes facturados por
-- correo (Liberty), que corre en cada sincronización: sin esta columna, cada
-- sincronización volvería a crear la misma compra.

ALTER TABLE facturas_proveedores
    ADD COLUMN IF NOT EXISTS alegra_bill_id VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_facturas_proveedores_alegra_bill
    ON facturas_proveedores(alegra_bill_id);

-- Vencimiento y período facturado que declara el emisor en <Otros>.
--
-- El XML completo no se guarda (basta con el historial que queda en Revisión
-- de Precios), así que estos dos datos se extraen al parsear —el único
-- momento en que lo tenemos— y se persisten.
--
-- Hacen falta porque la condición de venta miente para este caso: Liberty
-- declara contado y PlazoCredito 0, pero el recibo vence 18 días después.
-- Sin esto, el pago en Pagos Recurrentes nace vencido.

ALTER TABLE facturas_proveedores
    ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE,
    ADD COLUMN IF NOT EXISTS periodo_facturado VARCHAR(30);

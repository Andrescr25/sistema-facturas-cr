-- Deja constancia de la oferta que llevaba una línea del pedido.
--
-- El precio que se congela en precio_unitario ya viene REBAJADO: es el que
-- vio el cliente y el que se le va a cobrar. Sin esta columna, quien factura
-- ve un precio menor al de lista y no tiene forma de saber si fue una oferta
-- por exceso o un error.
--
-- No se usa para calcular nada. A Alegra se le manda el precio final exacto
-- en vez del par (precio de lista + % de descuento): matemáticamente da el
-- mismo total, pero Alegra redondea por su cuenta y podría quedar a uno o
-- dos colones de lo que el cliente vio en pantalla, que es justo la clase de
-- diferencia que genera un reclamo.
ALTER TABLE pedido_cliente_linea
    ADD COLUMN IF NOT EXISTS descuento_porcentaje NUMERIC(6,3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS precio_lista NUMERIC(14,4);

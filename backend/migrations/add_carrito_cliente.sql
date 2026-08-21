-- Carrito del portal, guardado en el servidor.
--
-- Hasta ahora vivía en memoria de React: recargar la página, que entrara una
-- llamada o que se cerrara la pestaña borraba el pedido entero. Con canastas
-- de ~10 productos (promedio real: 9,7 por factura) eso es perder varios
-- minutos de trabajo del cliente.
--
-- Guardarlo en el servidor y no en el navegador tiene dos razones: sigue
-- entre dispositivos —el mostrador empieza en el teléfono y termina en la
-- computadora— y deja ver los carritos armados sin enviar, que es una
-- oportunidad de venta que hoy no existe.
--
-- QUÉ NO SE GUARDA: el precio.
-- Solo el producto y la cantidad. El precio se resuelve cada vez que se lee
-- el carrito, contra el catálogo y las ofertas del momento. Congelarlo acá
-- haría que un carrito de hace tres días muestre precios viejos, o peor, que
-- una oferta ya terminada siga viéndose vigente. El precio se congela recién
-- al ENVIAR el pedido (pedido_cliente_linea), que es cuando hay compromiso.

CREATE TABLE IF NOT EXISTS carrito_cliente (
    cliente_portal_id INTEGER PRIMARY KEY REFERENCES cliente_portal(id) ON DELETE CASCADE,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carrito_cliente_linea (
    id SERIAL PRIMARY KEY,
    cliente_portal_id INTEGER NOT NULL REFERENCES carrito_cliente(cliente_portal_id) ON DELETE CASCADE,
    alegra_item_id VARCHAR(20) NOT NULL,
    cantidad NUMERIC(12,3) NOT NULL,
    agregado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (cliente_portal_id, alegra_item_id)
);

CREATE INDEX IF NOT EXISTS idx_carrito_linea_cliente
    ON carrito_cliente_linea(cliente_portal_id);

-- Las sugerencias de "se lleva junto con" se calculan EN VIVO sobre
-- venta_historico (146ms por producto, y lo mismo para un carrito entero).
-- Precalcular los 85.810 pares en una tabla sería mantener una copia que se
-- desactualiza, para ahorrar un tiempo que ya es imperceptible.
CREATE INDEX IF NOT EXISTS idx_venta_historico_factura
    ON venta_historico(alegra_invoice_id);

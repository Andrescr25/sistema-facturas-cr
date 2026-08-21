-- Porcentaje de impuesto por producto en la caché local.
--
-- En Alegra el `price` se guarda SIN impuesto, mientras que el precio real
-- de venta es el que lo incluye. Se nota en los redondos: un producto con
-- price 33451,32743 da exactamente ₡37.800 con IVA, y 19911,5 da ₡22.500 —
-- alguien fijó el precio de góndola redondo y Alegra calculó la base hacia
-- atrás.
--
-- El catálogo que se le manda a los clientes tiene que mostrar el precio que
-- van a pagar. Sin esta columna habría que consultar Alegra producto por
-- producto para saber el impuesto de cada uno, que es justo la lentitud que
-- este catálogo evita.
--
-- Y no se puede multiplicar por 1,13 fijo: no todos los productos llevan la
-- misma tasa y ya hubo un bug por tener el 13% quemado en el código.
--
-- Arranca en NULL, no en 13: NULL significa "todavía no sincronizado" y se
-- distingue de un 0 legítimo (producto exento). La primera sincronización
-- completa lo llena.

ALTER TABLE alegra_products_cache
    ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC(6,3);

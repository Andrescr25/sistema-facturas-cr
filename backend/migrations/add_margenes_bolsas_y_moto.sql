-- Migración: márgenes de las dos categorías que no tenían (2026-10-04).
--
-- "Bolsas y Desechables" y "Línea de Moto" se crearon al reordenar el
-- catálogo, separándolas de "Línea Plástica" y "Línea de Ciclo". Nadie les
-- puso fila en config_precios, así que sus 204 productos activos caían en
-- `__default__` (25 % de meta, 12 % de mínimo) cada vez que el motor sugería
-- un precio — en Revisión de Precios y al crear un producto nuevo.
--
-- CON QUÉ NÚMERO. El mismo criterio que el resto de la tabla
-- (add_precios_fase2.sql): la MEDIANA REAL del margen de la categoría, medida
-- en producción, no un número redondo. Medido el 2026-10-04 con el cálculo de
-- la pantalla de Rentabilidad, sobre los productos con costo confiable:
--
--   Bolsas y Desechables   107 de 144 productos   mediana 29,1 %
--   Línea de Moto           52 de  60 productos   mediana 28,4 %
--
-- Ese mismo cálculo reproduce lo que ya estaba configurado (Ferretería 25,0
-- contra 25; Librería 28,9 contra 29,2; Línea de Ciclo 26,8 contra 27,3;
-- Productos de PVC 28,7 contra 28,9), que es lo que da confianza en el método.
--
-- Por qué no heredar el de la categoría de origen: Línea Plástica tiene 24,5 %
-- y las bolsas venden al 29,1 %. Con 24,5 —o con el 25 % por defecto que
-- venían usando— el motor sugería precios POR DEBAJO de lo que esos productos
-- ya dejan.
--
-- El mínimo sigue la relación del resto de la tabla (alrededor del 58–60 % de
-- la meta): 17 para 29,1, igual que Librería (29,2 → 17); 16 para 28,4, el de
-- su categoría de origen y el de Consumo (28,0 → 16).
--
-- SOLO CAMBIA LO QUE EL MOTOR SUGIERE. No toca ningún precio: la sugerencia se
-- acepta o no en pantalla. Para deshacerlo:
--   DELETE FROM config_precios WHERE categoria IN ('Bolsas y Desechables', 'Línea de Moto');
--
-- Se puede correr las veces que haga falta: si alguien ya les puso otra cifra,
-- no la pisa.

INSERT INTO config_precios (categoria, margen_meta, margen_minimo) VALUES
    ('Bolsas y Desechables', 29.10, 17.00),
    ('Línea de Moto', 28.40, 16.00)
ON CONFLICT (categoria) DO NOTHING;

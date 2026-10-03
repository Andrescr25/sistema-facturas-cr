-- Rama independencia-alegra — 037: cada fila de `costo_historico` con su
-- producto propio (sección 13: Rentabilidad por `producto.id`).
--
-- La migración 005 rellenó `producto_id` una vez. Pero el código que escribe
-- la tabla (precios/costoHistorico.js) siguió guardando solo el id de Alegra,
-- así que toda compra registrada DESPUÉS quedó sin producto propio, y el costo
-- derivado —que ahora se busca por `producto.id`— no la veía. En la copia
-- local era una fila; en el corte van a ser todas las de producción escritas
-- entre que corra la 005 y que arranque el código nuevo.
--
-- El código ya la escribe al insertar; esto empareja lo que quedó atrás. Se
-- puede correr las veces que haga falta. Las filas de un producto que ya no
-- tiene ficha se quedan sin producto: no entran al costo de nadie.

UPDATE costo_historico ch
   SET producto_id = p.id
  FROM producto p
 WHERE p.alegra_id = ch.alegra_item_id
   AND ch.producto_id IS DISTINCT FROM p.id;

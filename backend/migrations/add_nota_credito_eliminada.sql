-- Notas de crédito eliminadas: se marcan, no se borran.
--
-- EL PROBLEMA
-- Eliminar una nota de crédito la borraba de verdad de la tabla. Pero el
-- monitoreo de correo relee los últimos 30 días en cada corrida, y
-- guardarNotaCredito inserta con ON CONFLICT (clave) DO NOTHING: sin la fila,
-- ya no hay conflicto, así que la nota volvía a entrar sola.
--
-- Y no volvía nada más que a la lista. aplicarNotasCreditoPendientes la
-- tomaba como pendiente y le RESTABA otra vez el monto al saldo de la
-- factura. O sea que borrar una nota equivocada terminaba, unos minutos
-- después, con la nota de vuelta y el saldo rebajado de nuevo — deshaciendo
-- en silencio la decisión de quien la borró.
--
-- LA SOLUCIÓN
-- La fila se queda con una marca. Así el ON CONFLICT vuelve a hacer su
-- trabajo —la clave sigue ocupada— y el correo puede releerse las veces que
-- sea sin revivir nada.
--
-- Además, para un documento fiscal el borrado suave es lo correcto de por sí:
-- si alguien pregunta por qué el saldo de una factura cambió, queda el rastro
-- de que hubo una nota y de que se descartó. Un DELETE no deja nada.
ALTER TABLE nota_credito_proveedor
    ADD COLUMN IF NOT EXISTS eliminada_en TIMESTAMP;

-- Las consultas de la pantalla filtran por esta columna, y la enorme mayoría
-- de las notas no están eliminadas: el índice parcial solo indexa las pocas
-- que sí, sin cargar con el resto de la tabla.
CREATE INDEX IF NOT EXISTS idx_nota_credito_eliminada
    ON nota_credito_proveedor(eliminada_en)
    WHERE eliminada_en IS NOT NULL;

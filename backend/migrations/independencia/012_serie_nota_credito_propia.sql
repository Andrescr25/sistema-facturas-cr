-- Serie propia para las notas de crédito que emitimos nosotros.
--
-- POR QUÉ UNA SERIE NUEVA Y NO CONTINUAR LA QUE HAY
-- Las 27 notas existentes van numeradas 0010000103 + 10 dígitos: el formato
-- electrónico de Hacienda (tipo 03), y la última es de agosto de 2026, así que
-- es una serie viva ante Hacienda. Nuestras notas todavía NO son electrónicas
-- —esa emisión está pospuesta—, y meter un documento sin firmar dentro de una
-- secuencia que Hacienda sigue es un problema caro de deshacer. La serie
-- electrónica queda cerrada en 81 y la propia empieza en 1.
--
-- El ancho de 4 no es un detalle: con ancho 0 el número de la nota 1 sería
-- "001000031" y el de la 10 "0010000310", que se leen como series distintas.
-- Con 4, todas miden igual: 001000030001, 001000030002…

INSERT INTO serie_consecutivo
  (tipo_documento, sucursal, terminal, siguiente, activo, serie, ancho_consecutivo, electronica, descripcion)
VALUES
  ('nota_credito', '001', '00001', 1, TRUE, '00100003', 4, FALSE, 'Nota de crédito (no electrónica)')
ON CONFLICT (tipo_documento, sucursal, terminal, electronica) DO NOTHING;

-- Rama independencia-alegra — 041: el intento de factura guarda el id PROPIO
-- de la factura que creó, en su propia columna.
--
-- `factura_intento` es lo que impide crear dos facturas cuando la tablet
-- reenvía una que no supo si llegó: la clave queda registrada con la factura
-- que le tocó, y el reenvío recibe ESA factura en vez de crear otra.
--
-- La factura quedaba anotada en `alegra_invoice_id`. Mientras las facturas se
-- creaban en Alegra, ahí iba el id de Alegra; desde que se crean acá, el
-- código nuevo escribía en la MISMA columna el id propio. Dos clases de id en
-- una columna, y nada que diga cuál es cuál. Medido el 2026-10-04 en la copia
-- local, sobre los intentos que vienen de producción:
--
--   · la clave de la factura 001000014841 guarda el id 5369 (el de Alegra);
--     acá esa factura es la 31, y la 5369 propia es OTRA. Reenviarla habría
--     devuelto —y abierto en PDF— la factura de otro cliente;
--   · cinco claves son de COTIZACIONES de Alegra (ids 7 a 10), que en
--     producción usan esta misma tabla. Buscarlas como facturas por ese id
--     encuentra las primeras facturas de la empresa, de junio de 2024 —que
--     además tienen ese mismo número: la factura 7 es el id 7—. Pedir que
--     coincida el número NO alcanza; la primera versión de esta migración lo
--     hizo así y enlazó cuatro cotizaciones con cuatro facturas ajenas.
--
-- LO QUE DISTINGUE UN INTENTO DE FACTURA es la `huella`: Facturación la
-- escribe siempre al reservar la clave, y las cotizaciones nunca. Un intento
-- sin huella no es de una factura y no lleva `factura_id`. Encima de eso se
-- pide que coincidan el id de Alegra Y el número.
--
-- `alegra_invoice_id` no se borra ni se reescribe: es lo que hay para
-- conciliar. De acá en adelante la factura propia va en `factura_id`
-- (`facturacion/idempotencia.js`), y `alegra_invoice_id` queda solo para lo
-- que se creó en Alegra.
--
-- Se puede correr las veces que haga falta. Hay que volver a correrla después
-- de la última carga de facturas, antes del corte: las claves de facturas que
-- todavía no se hayan copiado quedan sin resolver hasta entonces (el código
-- las resuelve igual al leerlas, por la misma regla).

ALTER TABLE factura_intento
  ADD COLUMN IF NOT EXISTS factura_id INTEGER REFERENCES factura(id);

COMMENT ON COLUMN factura_intento.factura_id IS
  'La factura PROPIA que creó este intento (factura.id). Nunca un id de Alegra.';
COMMENT ON COLUMN factura_intento.alegra_invoice_id IS
  'Solo intentos de antes del corte: el id del documento EN ALEGRA (factura o cotización). No es factura.id.';

-- Un intento sin huella no es de una factura. (Deshace lo que enlazó la
-- primera versión de esta migración; sobre una base limpia no toca nada.)
UPDATE factura_intento
   SET factura_id = NULL
 WHERE huella IS NULL
   AND factura_id IS NOT NULL;

UPDATE factura_intento i
   SET factura_id = f.id
  FROM factura f
 WHERE i.estado = 'creada'
   AND i.huella IS NOT NULL
   AND i.factura_id IS NULL
   AND i.alegra_invoice_id IS NOT NULL
   AND f.alegra_id = i.alegra_invoice_id
   AND f.numero = i.numero_factura;

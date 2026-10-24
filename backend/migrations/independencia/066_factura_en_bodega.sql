-- Quién tomó una factura en Bodega y cuándo (2026-10-23). El usuario: «hacer
-- que las facturas no se puedan editar, si hay que quitar algo nota de
-- crédito, si hay que agregar algo factura nueva; la única forma de editarla
-- es que no la haya tomado nadie en bodega, una vez alguien la tenga en
-- bodega ya no se puede editar».
--
-- «Tomarla» es abrirla en Bodega. Antes de despachar, lo que se marca vive
-- solo en el teléfono, así que el servidor no tenía cómo saberlo: esta tabla
-- es ese registro. Una fila por factura, y no se borra: reabrir el despacho
-- no la devuelve a Facturación.
--
-- Tabla aparte y no una columna de `factura`: tocar la fila de una factura ya
-- aceptada ante Hacienda lo impide el disparador documento_en_hacienda (043).
BEGIN;
CREATE TABLE IF NOT EXISTS factura_en_bodega (
  id SERIAL PRIMARY KEY,
  factura_id INTEGER NOT NULL UNIQUE REFERENCES factura(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuario(id),
  tomada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMIT;

-- El lugar donde va a caber la emisión electrónica, sin rehacer el modelo.
--
-- La emisión ante Hacienda está POSPUESTA por decisión del negocio. Esto no
-- la implementa: deja el espacio, que es distinto. Lo que se agrega es lo que
-- obligaría a migrar las 5.398 facturas otra vez si se dejara para después.
--
-- 1. LA RESPUESTA DE HACIENDA. Un comprobante no es electrónico porque uno lo
--    mande: lo es cuando Hacienda lo ACEPTA. Entre una cosa y la otra hay un
--    rato y puede haber un rechazo. Sin un lugar donde anotar ese estado, la
--    bandera `electronica` sería una promesa en vez de un hecho.
--
--    REGLA: `electronica` pasa a TRUE solo con `hacienda_estado = 'aceptada'`.
--    Mientras tanto la factura es una factura de venta, y así se etiqueta en
--    la pantalla.
--
-- 2. LA NATURALEZA DEL DESCUENTO. Hacienda pide decir POR QUÉ se descontó, no
--    solo cuánto. Hoy se guardan el porcentaje y el monto; falta el motivo, y
--    agregarlo después obligaría a inventarle uno a lo ya emitido.
--
-- 3. EL XML FIRMADO. Es la prueba del documento y lo que se reenvía si
--    Hacienda no contesta. Se guarda la ruta, no el contenido: son ~15 KB por
--    factura y la base ya carga con 52.357 líneas.

ALTER TABLE factura ADD COLUMN IF NOT EXISTS hacienda_estado VARCHAR(12);
ALTER TABLE factura ADD COLUMN IF NOT EXISTS hacienda_enviada_en TIMESTAMP;
ALTER TABLE factura ADD COLUMN IF NOT EXISTS hacienda_respondida_en TIMESTAMP;
ALTER TABLE factura ADD COLUMN IF NOT EXISTS hacienda_mensaje TEXT;
ALTER TABLE factura ADD COLUMN IF NOT EXISTS xml_ruta TEXT;

-- Los estados posibles. 'pendiente' es "se va a mandar", 'enviada' es "se
-- mandó y no ha contestado": esa diferencia es la que evita mandar dos veces
-- el mismo documento.
ALTER TABLE factura DROP CONSTRAINT IF EXISTS factura_hacienda_estado_check;
ALTER TABLE factura ADD CONSTRAINT factura_hacienda_estado_check
  CHECK (hacienda_estado IS NULL OR hacienda_estado IN ('pendiente', 'enviada', 'aceptada', 'rechazada'));

-- Una factura no puede decirse electrónica si Hacienda no la aceptó. Las 531
-- copiadas de Alegra ya vienen aceptadas de allá, así que se les anota.
UPDATE factura SET hacienda_estado = 'aceptada'
 WHERE electronica = TRUE AND hacienda_estado IS NULL;

ALTER TABLE factura_linea ADD COLUMN IF NOT EXISTS descuento_naturaleza VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_factura_hacienda_pendientes
  ON factura (hacienda_estado, fecha)
  WHERE hacienda_estado IN ('pendiente', 'enviada');

-- LA REGLA, HECHA VALER POR LA BASE y no por un comentario: una factura no
-- puede decirse electrónica si Hacienda no la aceptó. Sin esto, la etiqueta
-- de la pantalla diría "Factura electrónica" sobre un documento que Hacienda
-- rechazó o que todavía no contestó.
--
-- El COALESCE no es adorno: con `hacienda_estado` en NULL, la condición
-- `electronica = FALSE OR hacienda_estado = 'aceptada'` da NULL, y un CHECK
-- solo rechaza cuando da FALSE. Escrita así, la regla no se hacía valer —
-- comprobado marcando una factura y viendo que pasaba.
ALTER TABLE factura DROP CONSTRAINT IF EXISTS factura_electronica_aceptada;
ALTER TABLE factura ADD CONSTRAINT factura_electronica_aceptada
  CHECK (NOT electronica OR COALESCE(hacienda_estado, '') = 'aceptada');

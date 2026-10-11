-- El XML de compra pasa a guardarse: la ruta, no el contenido.
--
-- Mismo criterio que la 015 tomó para las facturas de VENTA: el XML son unas
-- pocas decenas de KB por comprobante, así que se guarda un archivo en
-- `almacenamiento-privado/` (fuera de lo que sirve `express.static`, porque
-- un comprobante fiscal no puede quedar accesible sin sesión, a diferencia
-- de una foto de producto) y acá solo la ruta.
--
-- POR QUÉ HACÍA FALTA: comprobado sobre las 862 facturas de la copia local y
-- las 882 de producción, NINGUNA tiene el XML — `archivo_xml` guarda el
-- NOMBRE del adjunto, no su contenido, desde siempre. Van del 2025-07-24 al
-- 2026-09-18: más de un año de comprobantes cuyo único ejemplar vive en el
-- buzón de correo, y por ley hay que conservarlos 5 años.
--
-- TRES TABLAS, no solo una: el buzón (`facturas_proveedores`), la compra que
-- nace de él (`compra`) y la nota de crédito de proveedor. Las tres son
-- comprobantes electrónicos con el mismo problema.

ALTER TABLE facturas_proveedores
  ADD COLUMN IF NOT EXISTS xml_ruta TEXT;

ALTER TABLE compra
  ADD COLUMN IF NOT EXISTS xml_ruta TEXT;

ALTER TABLE nota_credito_proveedor
  ADD COLUMN IF NOT EXISTS xml_ruta TEXT;

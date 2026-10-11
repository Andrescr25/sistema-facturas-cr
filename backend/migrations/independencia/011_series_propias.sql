-- Rama independencia-alegra — 011: las series de numeración, con su estado
--
-- `serie_consecutivo` existía desde la migración 002 pero estaba VACÍA y sin
-- saber cómo se arma el número. Acá gana lo que le faltaba y se siembra
-- CONTINUANDO lo que ya se emitió, nunca desde cero.
--
-- POR QUÉ NO SE REINICIA LA NUMERACIÓN
-- La serie del día a día (00100001) lleva 4.837 facturas emitidas; la última
-- es la 4868, del 10 de setiembre. Si el sistema propio empezara en 1,
-- emitiría documentos con números que ya existen: dos facturas distintas con
-- el mismo número es un problema fiscal, no un detalle.
--
-- CÓMO SE ARMA EL NÚMERO — son dos formatos distintos y hay que respetarlos:
--   no electrónica: serie + consecutivo tal cual   00100001 + 4868 = 001000014868
--   electrónica:    serie + consecutivo a 10 dígitos
--                   0010000101 + 0000002462 = 00100001010000002462
-- Por eso `ancho_consecutivo`: 0 significa "sin relleno".
--
-- ELECTRÓNICA NO ES UN TIPO DE DOCUMENTO, ES UNA PROPIEDAD DE LA SERIE. La
-- misma factura se emite en papel o electrónica, y ante Hacienda el tipo sigue
-- siendo "factura". Por eso no se inventa un tipo nuevo (el CHECK de la 002 ya
-- fija el vocabulario) sino que la llave única gana la columna `electronica`:
-- sin eso, las dos series de factura de la misma terminal chocan entre sí.

ALTER TABLE serie_consecutivo ADD COLUMN IF NOT EXISTS serie VARCHAR(20);
ALTER TABLE serie_consecutivo ADD COLUMN IF NOT EXISTS ancho_consecutivo SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE serie_consecutivo ADD COLUMN IF NOT EXISTS electronica BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE serie_consecutivo ADD COLUMN IF NOT EXISTS descripcion VARCHAR(80);

ALTER TABLE serie_consecutivo DROP CONSTRAINT IF EXISTS serie_consecutivo_tipo_documento_sucursal_terminal_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_serie_consecutivo_unica
  ON serie_consecutivo (tipo_documento, sucursal, terminal, electronica);
CREATE UNIQUE INDEX IF NOT EXISTS idx_serie_consecutivo_serie
  ON serie_consecutivo (serie) WHERE serie IS NOT NULL;

-- La que se usa todos los días. Sigue donde quedó Alegra.
INSERT INTO serie_consecutivo (tipo_documento, sucursal, terminal, serie, ancho_consecutivo, electronica, descripcion, siguiente)
SELECT 'factura', '001', '00001', '00100001', 0, FALSE, 'Factura de venta (no electrónica)',
       COALESCE(MAX(consecutivo), 0) + 1
  FROM factura WHERE serie = '00100001'
ON CONFLICT (tipo_documento, sucursal, terminal, electronica) DO NOTHING;

-- Las electrónicas quedan preparadas pero INACTIVAS: emitir ante Hacienda está
-- pospuesto por decisión del usuario. Cuando se active, el consecutivo ya sabe
-- dónde continuar en vez de tener que averiguarlo ese día.
INSERT INTO serie_consecutivo (tipo_documento, sucursal, terminal, serie, ancho_consecutivo, electronica, descripcion, activo, siguiente)
SELECT 'factura', '001', '00001', '0010000101', 10, TRUE, 'Factura electrónica', FALSE,
       COALESCE(MAX(consecutivo), 0) + 1
  FROM factura WHERE serie = '0010000101'
ON CONFLICT (tipo_documento, sucursal, terminal, electronica) DO NOTHING;

INSERT INTO serie_consecutivo (tipo_documento, sucursal, terminal, serie, ancho_consecutivo, electronica, descripcion, activo, siguiente)
SELECT 'nota_credito', '001', '00001', '0010000103', 10, TRUE, 'Nota de crédito electrónica', FALSE,
       COALESCE(MAX(consecutivo), 0) + 1
  FROM nota_credito WHERE serie = '0010000103'
ON CONFLICT (tipo_documento, sucursal, terminal, electronica) DO NOTHING;

INSERT INTO serie_consecutivo (tipo_documento, sucursal, terminal, serie, ancho_consecutivo, electronica, descripcion, activo, siguiente)
SELECT 'tiquete', '001', '00001', '0010000104', 10, TRUE, 'Tiquete electrónico', FALSE,
       COALESCE(MAX(consecutivo), 0) + 1
  FROM factura WHERE serie = '0010000104'
ON CONFLICT (tipo_documento, sucursal, terminal, electronica) DO NOTHING;

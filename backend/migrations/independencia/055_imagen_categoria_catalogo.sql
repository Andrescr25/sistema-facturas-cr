-- Categorías visuales del catálogo del agente. Solo agrega metadatos;
-- no modifica productos, clasificación, nombres ni orden existentes.
-- La imagen queda en el disco público propio, como las fotos de productos.
ALTER TABLE categoria_config ADD COLUMN IF NOT EXISTS imagen JSONB;
COMMENT ON COLUMN categoria_config.imagen IS
  'Foto de categoría optimizada: url, urlMovil y dimensiones. NULL usa la presentación sin foto asignada.';

-- Fase 3c — Imagen y ficha del producto de competencia.
--
-- Emparejar por nombre no alcanza para decidir "¿es el mismo producto?":
-- "TOALLA P/ MANOS 180 MTS" contra "Porta toallas de manos" da un score
-- alto y son cosas distintas (un rollo de toalla vs. el dispensador). Con
-- la foto de los dos lados la decisión se toma en un segundo y sin dudas.
--
-- Las 3 fuentes automáticas exponen imagen pública en la misma respuesta
-- que ya consultamos (EPA: small_image.url · VTEX: items[0].images[0].
-- imageUrl), así que no cuesta ninguna petición extra. url_producto sirve
-- para abrir la ficha original cuando la foto no basta.

ALTER TABLE precio_competencia ADD COLUMN IF NOT EXISTS imagen_url TEXT;
ALTER TABLE precio_competencia ADD COLUMN IF NOT EXISTS url_producto TEXT;

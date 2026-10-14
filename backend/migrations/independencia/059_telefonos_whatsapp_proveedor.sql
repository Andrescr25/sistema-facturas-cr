-- La ficha admite varios contactos de WhatsApp, uno por línea. El campo
-- conserva su nombre, sus valores y el contrato de texto de los consumidores.
-- VARCHAR(30) sólo alcanzaba para uno o dos; ensancharlo no cambia ningún dato.
ALTER TABLE proveedor ALTER COLUMN telefono_whatsapp TYPE TEXT;
COMMENT ON COLUMN proveedor.telefono_whatsapp IS
  'Hasta 10 teléfonos de WhatsApp validados, uno por línea. Un número existente conserva su valor; NULL significa sin contacto.';

-- Rama independencia-alegra — 007
--
-- El proveedor gana dos cosas:
--
-- 1. `telefono_whatsapp`. Hoy vive en `proveedor_contactos`, una tabla aparte
--    que se busca POR NOMBRE y que solo sirve para mandar la orden de compra.
--    El número es un dato del proveedor, no de esa pantalla. Se copia acá por
--    cédula (20 de las 21 fichas la tienen); la tabla vieja se sigue usando
--    hasta que el envío de órdenes lea de acá.
--
-- 2. `legacy_id`, el puente con la tabla vieja `proveedores` (25 filas, sin
--    cédula), que todavía usan Faltantes, Productos y los reportes por
--    `productos.proveedor_id`. Sin este puente, absorberla obligaría a
--    adivinar por nombre en cada consulta que se migre. 24 de las 25 calzan
--    por nombre; la que no es "Proveedor General", que no es un proveedor.

ALTER TABLE proveedor ADD COLUMN IF NOT EXISTS telefono_whatsapp VARCHAR(30);
ALTER TABLE proveedor ADD COLUMN IF NOT EXISTS legacy_id INTEGER;

UPDATE proveedor p
   SET telefono_whatsapp = c.telefono_whatsapp
  FROM proveedor_contactos c
 WHERE c.cedula_proveedor = p.identificacion
   AND c.telefono_whatsapp IS NOT NULL
   AND p.telefono_whatsapp IS NULL;

UPDATE proveedor p
   SET legacy_id = v.id
  FROM proveedores v
 WHERE lower(trim(v.nombre)) = lower(trim(p.nombre))
   AND p.legacy_id IS NULL;

-- Una fila vieja no puede apuntar a dos proveedores: si pasara, la absorción
-- duplicaría los productos de ese proveedor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedor_legacy ON proveedor (legacy_id) WHERE legacy_id IS NOT NULL;

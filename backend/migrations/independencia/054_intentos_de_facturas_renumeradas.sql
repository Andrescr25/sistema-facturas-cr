-- Rama independencia-alegra — 054: intentos de facturas que Alegra renumeró.
--
-- Completa la 041. Medido el 2026-10-09 en el ensayo con datos de
-- producción: 4 de 65 intentos de factura quedaban sin enlazar y eso cortaba
-- el ensayo antes de las conciliaciones. Las cuatro nacieron como tiquete (la
-- clave guarda 001000014897) y después se pasaron a factura electrónica:
-- Alegra conserva el id del documento (5437) pero le cambia el número
-- (00100001010000002467). Con "id Y número" no enlazan nunca.
--
-- El id de Alegra es la identidad del documento; el número se pidió encima
-- para no cruzar ids propios con ids de Alegra. Acá se afloja SOLO para la
-- causa conocida del cambio: la factura copiada está en la plantilla
-- electrónica o trae clave fiscal de origen. Una factura común con otro
-- número sigue sin enlazarse. `facturacion/idempotencia.js` usa la misma
-- regla al leer.
--
-- POR QUÉ NO VA EN LA 041: `plantilla_electronica` y `hacienda_origen` las
-- crea la 043. Puesta en la 041, una base armada desde cero fallaba en esa
-- migración (lo atrapó el ensayo del 2026-10-10 sobre el respaldo de
-- producción, antes de migrar la base real).
--
-- Se puede correr las veces que haga falta, y hay que volver a correrla
-- después de la última carga de facturas, igual que la 041.
UPDATE factura_intento i
   SET factura_id = f.id
  FROM factura f
 WHERE i.estado = 'creada'
   AND i.huella IS NOT NULL
   AND i.factura_id IS NULL
   AND i.alegra_invoice_id IS NOT NULL
   AND f.alegra_id = i.alegra_invoice_id
   AND f.numero <> i.numero_factura
   AND (f.plantilla_electronica OR f.hacienda_origen ->> 'clave' IS NOT NULL);

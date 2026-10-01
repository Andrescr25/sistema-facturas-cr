-- Rama independencia-alegra — 033: cuánto se rebajó YA de la factura por cada
-- faltante (sección 11 del checklist, paso 3: Impresión sobre la factura propia).
--
-- EL PROBLEMA. Impresión rebaja de la factura lo que no llegó, y lo calculaba
-- sobre la cantidad que la factura tiene HOY. Si una factura procesada se
-- recupera (en Impresión o en el Reporte de Clientes) y se vuelve a procesar,
-- la cantidad de hoy ya viene rebajada y el faltante se descontaba DOS veces:
-- al cliente se le cobraba de menos. Pasaba igual con Alegra.
--
-- LA SOLUCIÓN. Cada faltante recuerda cuánto se le quitó ya a la factura
-- (`cantidad_rebajada`). Procesar aplica solo la diferencia entre lo que hay
-- que rebajar ahora y lo ya rebajado: cero si nada cambió, negativa si
-- después llegó más (se le devuelve a la línea).
--
-- Lo ya procesado con Alegra: se rebajó lo que decía su ajuste (lo que no
-- llegó, o lo que faltó de un parcial); un faltante sin ajuste no se rebajaba.

ALTER TABLE faltantes
  ADD COLUMN IF NOT EXISTS cantidad_rebajada NUMERIC NOT NULL DEFAULT 0;

UPDATE faltantes f
   SET cantidad_rebajada = CASE aj.estado
         WHEN 'no_llego' THEN f.cantidad_faltante
         WHEN 'parcial' THEN GREATEST(f.cantidad_faltante - COALESCE(aj.cantidad_entregada, 0), 0)
         ELSE 0
       END
  FROM faltantes_ajustes aj
 WHERE aj.faltante_id = f.id
   AND f.estado = 'procesado'
   AND f.cantidad_rebajada = 0;

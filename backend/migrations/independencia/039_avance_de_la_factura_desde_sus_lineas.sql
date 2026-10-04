-- Rama independencia-alegra — 039: el avance de cada factura del buzón vuelve a
-- salir de sus líneas.
--
-- `facturas_proveedores.porcentaje_relacionado` y `estado_relacionado` son una
-- copia de "cuántas líneas de esta factura están relacionadas". Solo se
-- escribían al relacionar una línea desde Relacionar Productos y al recibir la
-- factura. Soltar una relación, cambiarla o confirmarla desde Revisión de
-- Precios no los tocaba, así que la copia se fue quedando atrás. Medido el
-- 2026-10-04 en la copia local:
--
--   · 217 de 862 facturas con un porcentaje que no es el de sus líneas;
--   ·  62 marcadas RELACIONADO (100 %) con líneas todavía pendientes.
--
-- Ninguna pantalla lee estas dos columnas: todas cuentan las líneas. No se
-- pueden borrar (el cliente de Prisma las selecciona), así que se dejan
-- diciendo la verdad. De acá en adelante las mantiene
-- `productos-revision/relacionPropia.js` (`recalcularAvance`), con este mismo
-- cálculo.
--
-- Completa = no le queda ninguna línea sin relacionar (no "el redondeo da
-- 100"). El estado de trabajo de la factura (`estado`) no se toca.
--
-- Se puede correr las veces que haga falta.

UPDATE facturas_proveedores f
   SET porcentaje_relacionado = a.porcentaje,
       estado_relacionado = CASE WHEN a.completa THEN 'RELACIONADO' END
  FROM (
    SELECT l.factura_id,
           COUNT(*) FILTER (WHERE l.estado_relacionado <> 'RELACIONADO') = 0 AS completa,
           CASE WHEN COUNT(*) FILTER (WHERE l.estado_relacionado <> 'RELACIONADO') = 0 THEN 100
                ELSE LEAST(99, ROUND(100.0 * COUNT(*) FILTER (WHERE l.estado_relacionado = 'RELACIONADO') / COUNT(*)))::int
           END AS porcentaje
      FROM productos_factura_proveedor l
     GROUP BY l.factura_id
  ) a
 WHERE a.factura_id = f.id
   AND (f.porcentaje_relacionado IS DISTINCT FROM a.porcentaje
        OR f.estado_relacionado IS DISTINCT FROM (CASE WHEN a.completa THEN 'RELACIONADO' END));

-- Estado nuevo para las facturas de servicios recurrentes facturados por
-- correo (Liberty: internet y planes móviles).
--
-- `estado` es un enum de Postgres, así que no basta con escribir el valor:
-- sin agregarlo acá, Prisma rechaza el create entero y la factura NO SE
-- GUARDA — que es peor que el problema original, porque se pierde.
--
-- GASTO_RECURRENTE saca la factura del flujo de compras (Revisión de Precios
-- solo lista PROCESADA y ENVIADA) sin borrarla: la recoge Pagos Recurrentes,
-- que además registra la compra en Alegra para el Reporte Contador.

ALTER TYPE estado_factura ADD VALUE IF NOT EXISTS 'GASTO_RECURRENTE';

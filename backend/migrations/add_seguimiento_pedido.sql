-- Seguimiento del pedido del portal de clientes.
--
-- El cliente ve en qué etapa va su pedido: En revisión -> En preparación ->
-- Listo para envío. Las tres salen de datos que YA existen (el estado del
-- pedido y estado_bodega de la factura); lo único que faltaba era CUÁNDO
-- salió de bodega, para poder poner la fecha en la línea de tiempo.
--
-- Las facturas viejas quedan en NULL: la etapa se muestra alcanzada, sin
-- fecha. No se inventa una fecha hacia atrás.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS bodega_procesado_en TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 'anulada' como estado de bodega válido.
--
-- duplicados-electronica/duplicados.service.js hace desde siempre
--   UPDATE facturas SET estado_bodega = 'anulada'
-- al anular la copia que deja Alegra, pero el CHECK original solo admitía
-- 'pendiente' y 'procesado'. Todavía no explotó porque esa copia no tenía
-- fila local y el UPDATE afectó 0 filas — Postgres no evalúa el CHECK si no
-- escribe nada. El día que sí la tenga, tira excepción, y como corre dentro
-- de un try/catch se registra como "Alegra rechazó la anulación", que es
-- falso: Alegra ya anuló bien, lo que falla es la marca local.
--
-- Hace falta para el seguimiento: con la factura anulada y la marca sin
-- poder escribirse, el cliente vería "En preparación" para siempre.
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_estado_bodega_check;
ALTER TABLE facturas ADD CONSTRAINT facturas_estado_bodega_check
    CHECK (estado_bodega IN ('pendiente', 'procesado', 'anulada'));

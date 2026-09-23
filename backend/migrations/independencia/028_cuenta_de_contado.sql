-- Rama independencia-alegra — 028: las compras de contado también se pagan
--
-- La cuenta por pagar nace al recibir el correo SOLO si la factura es a
-- crédito o trae plazo (`databaseService.saveFactura`). Las de contado —544
-- de 860 compras; 62 desde agosto por ₡2,75 M— no tenían ninguna, así que su
-- pago no tenía contra qué registrarse y nunca llegaba a Caja General.
--
-- Decisión del usuario (2026-09-23): al registrar una compra de contado se le
-- crea su cuenta por pagar PENDIENTE —no pagada de una vez—, y el pago lo
-- indica una persona ("esta factura de contado se pagó vía efectivo"), por
-- el mismo camino que cualquier pago a proveedor: sale de Caja General con
-- sus facturas.
--
-- `de_contado` la distingue. Su estado es CONTADO y no VENCIDA: vence el día
-- que se recibe, pero no es un atraso — es un pago que falta anotar.
--
-- Las 544 históricas no se tocan: se pagaron hace tiempo y crearles una
-- cuenta pendiente llenaría la lista de pagos que nadie debe.

ALTER TABLE cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS de_contado BOOLEAN NOT NULL DEFAULT FALSE;

-- Mismas columnas y en el mismo orden que la 025 (así lo exige CREATE OR
-- REPLACE VIEW); `de_contado` va al final.
CREATE OR REPLACE VIEW cuenta_por_pagar_saldo AS
SELECT c.id,
       c.monto_total,
       COALESCE(nc.credito, 0)                                     AS credito,
       c.pagado_sin_detalle,
       COALESCE(pg.pagado, 0)                                      AS pagado,
       GREATEST(0, ROUND(c.monto_total - COALESCE(nc.credito, 0)
                         - c.pagado_sin_detalle - COALESCE(pg.pagado, 0), 2)) AS saldo,
       CASE
         WHEN ROUND(c.monto_total - COALESCE(nc.credito, 0)
                    - c.pagado_sin_detalle - COALESCE(pg.pagado, 0), 2) <= 0 THEN 'PAGADA'
         WHEN c.de_contado THEN 'CONTADO'
         WHEN c.fecha_vencimiento::date < (now() AT TIME ZONE 'America/Costa_Rica')::date THEN 'VENCIDA'
         WHEN COALESCE(pg.pagado, 0) > 0 THEN 'PARCIAL'
         ELSE 'PENDIENTE'
       END                                                         AS estado,
       c.de_contado
  FROM cuentas_por_pagar c
  LEFT JOIN (
         SELECT a.cuenta_por_pagar_id, SUM(a.monto) AS credito
           FROM nota_credito_aplicacion a
           JOIN nota_credito_proveedor n ON n.id = a.nota_credito_id
          WHERE n.eliminada_en IS NULL
          GROUP BY a.cuenta_por_pagar_id
       ) nc ON nc.cuenta_por_pagar_id = c.id
  LEFT JOIN (
         SELECT pc.cuenta_por_pagar_id, SUM(pc.monto) AS pagado
           FROM pago_proveedor_cuenta pc
           JOIN pago_proveedor p ON p.id = pc.pago_id
          WHERE NOT p.anulado
          GROUP BY pc.cuenta_por_pagar_id
       ) pg ON pg.cuenta_por_pagar_id = c.id;

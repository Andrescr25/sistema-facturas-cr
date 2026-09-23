-- Rama independencia-alegra — 027: los movimientos de Caja General
--
-- Decisión del usuario (2026-09-23): Caja General es el punto central. Todo
-- cobro a un cliente ENTRA a ella, todo pago a un proveedor o de un gasto
-- SALE de ella, sin fondo fijo ni cajas separadas; y cada movimiento tiene
-- que decir qué facturas lo originaron.
--
-- POR QUÉ UNA VISTA Y NO UNA TABLA `movimiento_caja`
-- Los movimientos YA existen: cada cobro es una fila de `pago` (con sus
-- facturas en `pago_factura`), cada pago a proveedor una de `pago_proveedor`
-- (con sus facturas en `pago_proveedor_cuenta`), cada gasto pagado una de
-- `pago_recurrente`. Una tabla aparte sería una SEGUNDA copia de cada uno: el
-- día que alguien anule un cobro y la copia no se entere, la caja dice otra
-- cosa que los documentos — y un cobro registrado por dos caminos (al
-- facturar de contado y como abono) terminaría contado dos veces. La vista se
-- arma sobre los documentos: no hay nada que sincronizar ni que duplicar.
--
-- Los anulados SE MUESTRAN, marcados, pero no suman: una anulación también es
-- trazabilidad. El monto va siempre positivo; `sentido` dice si entra o sale.

CREATE OR REPLACE VIEW movimiento_caja AS
SELECT 'cobro'::text                                       AS tipo,
       'entrada'::text                                     AS sentido,
       p.id                                                AS documento_id,
       p.fecha,
       p.monto,
       p.cliente_nombre                                    AS contraparte,
       COALESCE(mp.nombre, p.metodo_pago_texto)            AS metodo,
       COALESCE(mp.clave, lower(p.metodo_pago_texto))      AS metodo_clave,
       p.referencia,
       p.anulado,
       p.motivo_anulacion,
       p.cuenta_dinero_id,
       (SELECT string_agg(COALESCE(f.numero, pf.factura_numero), ', ' ORDER BY pf.id)
          FROM pago_factura pf
          LEFT JOIN factura f ON f.id = pf.factura_id
         WHERE pf.pago_id = p.id)                          AS facturas,
       p.creado_en
  FROM pago p
  LEFT JOIN metodo_pago mp ON mp.id = p.metodo_pago_id

UNION ALL

SELECT 'pago_proveedor',
       'salida',
       pp.id,
       pp.fecha,
       pp.monto,
       pp.proveedor_nombre,
       COALESCE(mp.nombre, pp.metodo_pago_texto),
       mp.clave,
       pp.referencia,
       pp.anulado,
       pp.motivo_anulacion,
       pp.cuenta_dinero_id,
       (SELECT string_agg(c.numero_consecutivo, ', ' ORDER BY pc.id)
          FROM pago_proveedor_cuenta pc
          JOIN cuentas_por_pagar c ON c.id = pc.cuenta_por_pagar_id
         WHERE pc.pago_id = pp.id),
       pp.creado_en
  FROM pago_proveedor pp
  LEFT JOIN metodo_pago mp ON mp.id = pp.metodo_pago_id

UNION ALL

-- Un gasto recurrente "deshecho" vuelve a pendiente y deja de estar acá: no
-- queda como anulado porque la fila del período es la misma que se vuelve a
-- pagar.
SELECT 'gasto',
       'salida',
       pr.id,
       pr.fecha_pago,
       pr.monto,
       g.nombre,
       COALESCE(mp.nombre, pr.metodo),
       mp.clave,
       NULL,
       FALSE,
       NULL,
       pr.cuenta_dinero_id,
       'Período ' || pr.periodo,
       pr.created_at
  FROM pago_recurrente pr
  JOIN gasto_recurrente g ON g.id = pr.gasto_id
  LEFT JOIN metodo_pago mp ON mp.id = pr.metodo_pago_id
 WHERE pr.estado = 'pagado' AND pr.fecha_pago IS NOT NULL;

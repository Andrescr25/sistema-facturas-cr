-- 068 · Permisos de acción en Facturación (2026-10-29).
--
-- El usuario va a contratar un agente de ventas y decidió:
--   «el precio y descuento no lo puede tocar»         → `precio-factura`
--   «de momento este no podrá cobrar»                   → `cobro-factura`
-- Quien no tiene `precio-factura` factura al precio de lista, con solo la
-- oferta vigente o el descuento del cliente (facturacion/precioFijo.js).
-- Quien no tiene `cobro-factura` no registra el pago al facturar: la factura
-- queda pendiente y la cobra quien tenga Cuentas por Cobrar.
--
-- Para que a NADIE le cambie nada, se le dan los dos a todo el que hoy tiene
-- Facturación. El agente se crea después, sin ellos. Los administradores los
-- tienen por su rol: no llevan filas en usuario_modulo.
--
-- Se puede correr dos veces: la segunda no hace nada.

INSERT INTO usuario_modulo (usuario_id, modulo, otorgado_por)
SELECT um.usuario_id, permiso.clave, NULL
  FROM usuario_modulo um
 CROSS JOIN (VALUES ('precio-factura'), ('cobro-factura')) AS permiso(clave)
 WHERE um.modulo = 'facturacion'
ON CONFLICT (usuario_id, modulo) DO NOTHING;

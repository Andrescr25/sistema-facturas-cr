-- Lo que faltaba extraer del resumen del XML, y que explica el descuadre.
--
-- De las 862 facturas, 18 tienen el total del comprobante distinto de la
-- suma de sus líneas (₡65 a ₡16.941,92, algunas NEGATIVAS). El parser nunca
-- extraía tres campos del `<ResumenFactura>` que son justamente para esto:
--
--   TotalOtrosCargos   cargos a nivel de FACTURA (flete, manejo, un cargo de
--                      un tercero) — el candidato al descuadre POSITIVO
--                      (las líneas suman menos que el total).
--   TotalDescuentos    se parseaba, pero nunca se guardaba. Por definición
--                      del formato de Hacienda es la suma de los descuentos
--                      de línea, así que sirve para comprobar que el parseo
--                      de línea (`compra_linea.descuento`) no se quedó corto
--                      — el caso de los `<Descuento>` repetidos que daban NaN.
--   TotalIVADevuelto   devolución de IVA (turistas, zonas francas) — el
--                      candidato al descuadre NEGATIVO (las líneas suman más
--                      que el total).
--
-- `otros_cargos` guarda el detalle (tipo, quién lo cobra, monto), no solo la
-- suma: para explicarle a una persona una diferencia de ₡16.941,92 hace
-- falta decir qué fue, no solo cuánto.

ALTER TABLE facturas_proveedores
  ADD COLUMN IF NOT EXISTS total_otros_cargos NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS total_descuentos    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS total_iva_devuelto  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS otros_cargos        JSONB;

-- Mismo detalle en `compra`, que es lo que de verdad consultan Reportes y
-- Cuentas por Pagar: `compra.total` ya es el total del comprobante
-- ([[decision/el-total-manda-sobre-las-lineas]]), y esto es lo que explica
-- por qué ese total no es la simple suma de `compra_linea`.
ALTER TABLE compra
  ADD COLUMN IF NOT EXISTS total_otros_cargos NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS total_descuentos    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS total_iva_devuelto  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS otros_cargos        JSONB;

-- Recibir conserva el comprobante. Aprobar/rechazar es una decisión explícita
-- y el pago de aprobación referencia el documento de Caja, no otro saldo.
BEGIN;
ALTER TABLE gasto_operativo
  ADD COLUMN decision TEXT NOT NULL DEFAULT 'pendiente' CHECK (decision IN ('pendiente','aprobado','rechazado')),
  ADD COLUMN decidido_en TIMESTAMPTZ,
  ADD COLUMN decidido_por INTEGER REFERENCES usuario(id),
  ADD COLUMN pago_aprobacion_id INTEGER REFERENCES pago_proveedor(id),
  ADD COLUMN decision_huella TEXT,
  ADD COLUMN condicion_iva_confirmada TEXT CHECK (condicion_iva_confirmada IN ('01','04','05'));

-- Compatibilidad con decisiones fiscales que una persona YA confirmó en la
-- ficha anterior. No se fabrican pagos ni se modifican importes o documentos.
UPDATE gasto_operativo SET decision=CASE WHEN respuesta='3' THEN 'rechazado' ELSE 'aprobado' END,
  decidido_en=revisado_en, decidido_por=revisado_por
WHERE revisado_en IS NOT NULL AND respuesta IS NOT NULL AND (
  EXISTS (SELECT 1 FROM hacienda_comprobante h WHERE h.origen='compra' AND h.origen_id=gasto_operativo.compra_id)
  OR (respuesta='1' AND EXISTS (
    SELECT 1 FROM cuentas_por_pagar cp JOIN cuenta_por_pagar_saldo s ON s.id=cp.id
    WHERE cp.factura_id=gasto_operativo.factura_id AND s.saldo<=0 AND s.pagado>0
  ))
);
CREATE INDEX gasto_operativo_decision_fecha ON gasto_operativo(decision,creado_en DESC,id DESC);
COMMIT;

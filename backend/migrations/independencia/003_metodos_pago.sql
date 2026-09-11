-- Rama independencia-alegra · 003
-- Métodos de pago propios.
--
-- Hoy la lista está escrita a mano dos veces (facturacion.service.js y
-- utils/cuentasPorCobrarUtils.js) y a ninguna de las dos le está SINPE
-- Móvil, aunque en Alegra hay cobros registrados así (paymentMethod
-- SINPE_MOVIL). `alegra_clave` es el valor que Alegra acepta, para convivir
-- mientras los cobros sigan yendo allá.
--
-- `pide_referencia`: el comprobante de la transferencia o el SINPE es lo
-- único que permite cuadrar esos cobros después contra el banco.

INSERT INTO metodo_pago (clave, nombre, pide_referencia, alegra_clave, orden) VALUES
  ('efectivo',        'Efectivo',             FALSE, 'cash',        1),
  ('sinpe_movil',     'SINPE Móvil',          TRUE,  'SINPE_MOVIL', 2),
  ('transferencia',   'Transferencia',        TRUE,  'transfer',    3),
  ('tarjeta_debito',  'Tarjeta de débito',    FALSE, 'debit-card',  4),
  ('tarjeta_credito', 'Tarjeta de crédito',   FALSE, 'credit-card', 5),
  ('cheque',          'Cheque',               TRUE,  'check',       6)
ON CONFLICT (clave) DO NOTHING;

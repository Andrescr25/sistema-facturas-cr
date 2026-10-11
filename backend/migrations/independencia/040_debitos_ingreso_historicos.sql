-- 040: conservar los débitos de ingreso de Alegra y el destino de sus créditos.
-- No depende de 039. Un débito y una factura pueden tener el MISMO id externo
-- o número; nunca se mete el débito en factura para hacer calzar un crédito.
-- Es un archivo histórico consultable, no emisión electrónica ni una nueva
-- cuenta por cobrar. El JSON conserva las líneas y referencias originales;
-- su balance/totalPaid describen el origen, no el saldo vivo del mostrador.
CREATE TABLE IF NOT EXISTS debito_ingreso_historico (
  id SERIAL PRIMARY KEY,
  alegra_id VARCHAR(20) NOT NULL UNIQUE,
  numero VARCHAR(40),
  fecha DATE NOT NULL,
  estado VARCHAR(10) NOT NULL CHECK (estado IN ('borrador','emitida','anulada')),
  moneda CHAR(3) NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
  subtotal NUMERIC(14,2) NOT NULL,
  descuento NUMERIC(14,2) NOT NULL,
  impuesto NUMERIC(14,2) NOT NULL,
  total NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  original JSONB NOT NULL CHECK (jsonb_typeof(original) = 'object'),
  copiado_en TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Costa_Rica'),
  actualizado_en TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Costa_Rica')
);

CREATE TABLE IF NOT EXISTS nota_credito_debito_ingreso (
  id SERIAL PRIMARY KEY,
  nota_credito_id INTEGER NOT NULL REFERENCES nota_credito(id) ON DELETE CASCADE,
  debito_ingreso_id INTEGER NOT NULL REFERENCES debito_ingreso_historico(id),
  monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  UNIQUE (nota_credito_id, debito_ingreso_id)
);
CREATE INDEX IF NOT EXISTS idx_credito_debito_ingreso
  ON nota_credito_debito_ingreso (debito_ingreso_id);

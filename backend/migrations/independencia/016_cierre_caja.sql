-- El cierre de caja del día: lo que la caja DEBERÍA tener contra lo que tiene.
--
-- Hoy existe "Cobros del día", que resume por método lo cobrado. Eso responde
-- "cuánto entró", no "cuadra la caja". La diferencia entre las dos preguntas
-- es la que hace aparecer un faltante el mismo día y no tres semanas después.
--
-- POR QUÉ SE GUARDA EL ESPERADO Y NO SE RECALCULA
-- Un cobro se puede anular después. Si el esperado se recalculara al abrir un
-- cierre viejo, la diferencia que alguien firmó cambiaría sola y el faltante
-- de hace un mes desaparecería. El cierre es una FOTO de lo que se contó ese
-- día: se congela.
--
-- SOLO EFECTIVO. Lo demás (SINPE, transferencia, tarjeta) se cuadra contra el
-- banco, no contando billetes. Se guardan los totales por método como
-- referencia del día, pero lo que se compara es el efectivo.

CREATE TABLE IF NOT EXISTS cierre_caja (
  id                  SERIAL PRIMARY KEY,
  fecha               DATE NOT NULL UNIQUE,
  efectivo_esperado   NUMERIC(14,2) NOT NULL,
  efectivo_contado    NUMERIC(14,2) NOT NULL,
  -- Positiva = sobra plata; negativa = falta. Se guarda calculada para que
  -- una consulta no tenga que repetir la resta.
  diferencia          NUMERIC(14,2) NOT NULL,
  total_por_metodo    JSONB,
  observaciones       TEXT,
  -- Un faltante sin explicación es un faltante; con explicación es un hecho.
  motivo_diferencia   TEXT,
  cerrado_por         INTEGER REFERENCES usuario(id),
  cerrado_en          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reabierto_en        TIMESTAMP,
  reabierto_por       INTEGER REFERENCES usuario(id),
  motivo_reapertura   TEXT
);

CREATE INDEX IF NOT EXISTS idx_cierre_caja_fecha ON cierre_caja (fecha DESC);

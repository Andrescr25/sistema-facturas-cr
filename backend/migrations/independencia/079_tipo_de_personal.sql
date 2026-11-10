-- 079 · Tipo de personal en la ficha de empleado (2026-11-09).
--
-- El usuario: «mañana contrataré a un bodeguero; reciclemos lo del agente para
-- que desde los permisos de usuarios pueda poner el tipo de personal. El agente
-- de ventas tiene gasolina, incentivo, comisión… en cambio bodega solo tiene
-- horas y horas extras. Es para llevar el control del inicio de jornada de cada
-- empleado».
--
-- · `tipo`: 'ventas' (lo de siempre: horas, comisión, cliente nuevo y gasolina)
--   o 'bodega' (horas y horas extra). Las fichas que ya existen son de agentes.
-- · `horas_jornada`: cuántas horas del día son normales. Decidió el usuario:
--   lo que pase de 8 h en un día es hora extra (ajustable por empleado), y se
--   paga a tiempo y medio (eso no se guarda: es la ley, empleados/liquidacion.js).
--
-- Se puede correr dos veces: la segunda no hace nada.

ALTER TABLE empleado ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'ventas';
ALTER TABLE empleado ADD COLUMN IF NOT EXISTS horas_jornada NUMERIC(4,2) NOT NULL DEFAULT 8;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empleado_tipo_check') THEN
    ALTER TABLE empleado ADD CONSTRAINT empleado_tipo_check CHECK (tipo IN ('ventas', 'bodega'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empleado_horas_jornada_check') THEN
    ALTER TABLE empleado ADD CONSTRAINT empleado_horas_jornada_check CHECK (horas_jornada > 0 AND horas_jornada <= 24);
  END IF;
END $$;

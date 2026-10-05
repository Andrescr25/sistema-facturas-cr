-- Rutas actuales y recorridos fechados: cambiar el maestro no reescribe un ciclo.
-- No se asignan clientes ni documentos históricos por deducción.
CREATE TABLE ruta_cliente (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL CHECK (length(trim(nombre)) > 0),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX ruta_cliente_nombre ON ruta_cliente (lower(trim(nombre)));

ALTER TABLE cliente
  ADD COLUMN ruta_id INTEGER REFERENCES ruta_cliente(id),
  ADD COLUMN orden_ruta INTEGER,
  ADD COLUMN ubicacion_maps VARCHAR(2000),
  ADD COLUMN dia_visita SMALLINT CHECK (dia_visita BETWEEN 1 AND 7),
  ADD COLUMN dia_entrega SMALLINT CHECK (dia_entrega BETWEEN 1 AND 7),
  ADD CONSTRAINT cliente_ruta_y_orden CHECK (
    (ruta_id IS NULL AND orden_ruta IS NULL) OR
    (ruta_id IS NOT NULL AND orden_ruta IS NOT NULL AND orden_ruta > 0)
  ),
  ADD CONSTRAINT cliente_orden_unico UNIQUE (ruta_id, orden_ruta)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE ciclo_ruta (
  id SERIAL PRIMARY KEY,
  ruta_id INTEGER NOT NULL REFERENCES ruta_cliente(id),
  ruta_nombre VARCHAR(120) NOT NULL,
  semana DATE NOT NULL CHECK (extract(isodow FROM semana) = 1),
  estado VARCHAR(20) NOT NULL DEFAULT 'preventa'
    CHECK (estado IN ('preventa','preparacion','entrega','cerrado','cancelado')),
  recorrido_fijado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ruta_id, semana)
);
-- Una ruta actual; las siguientes pueden vender anticipadamente en paralelo.
CREATE UNIQUE INDEX ciclo_ruta_actual ON ciclo_ruta ((TRUE))
  WHERE estado IN ('preparacion','entrega');

CREATE TABLE ciclo_ruta_cliente (
  id SERIAL PRIMARY KEY,
  ciclo_id INTEGER NOT NULL REFERENCES ciclo_ruta(id),
  cliente_id INTEGER NOT NULL REFERENCES cliente(id),
  orden INTEGER NOT NULL CHECK (orden > 0),
  cliente_nombre VARCHAR(200) NOT NULL,
  ubicacion_maps VARCHAR(2000),
  dia_visita SMALLINT CHECK (dia_visita BETWEEN 1 AND 7),
  dia_entrega SMALLINT CHECK (dia_entrega BETWEEN 1 AND 7),
  UNIQUE (ciclo_id, cliente_id),
  UNIQUE (ciclo_id, orden)
);

CREATE FUNCTION proteger_recorrido_ciclo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' OR (SELECT recorrido_fijado FROM ciclo_ruta WHERE id = NEW.ciclo_id) THEN
    RAISE EXCEPTION 'El recorrido del ciclo está fijado; no se modifica ni se borra';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ciclo_recorrido_fijo BEFORE INSERT OR UPDATE OR DELETE ON ciclo_ruta_cliente
  FOR EACH ROW EXECUTE FUNCTION proteger_recorrido_ciclo();

CREATE FUNCTION proteger_contexto_ciclo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.recorrido_fijado AND (
    NOT NEW.recorrido_fijado OR NEW.ruta_id <> OLD.ruta_id OR
    NEW.ruta_nombre <> OLD.ruta_nombre OR NEW.semana <> OLD.semana
  ) THEN
    RAISE EXCEPTION 'El contexto del ciclo está fijado';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ciclo_contexto_fijo BEFORE UPDATE ON ciclo_ruta
  FOR EACH ROW EXECUTE FUNCTION proteger_contexto_ciclo();

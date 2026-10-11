-- Inventario propio. La migración crea estructura, nunca existencias.
-- Pedido explícito del usuario, 2026-10-04: arrancar TODO el inventario en
-- cero y hacer un conteo físico completo al salir a producción. Cero es la
-- apertura PROVISIONAL, no un conteo realizado. No copiar auditorías,
-- excesos ni existencias de Alegra al inventario nuevo.
BEGIN;

CREATE TABLE IF NOT EXISTS inventario_bodega (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nombre VARCHAR(40) NOT NULL DEFAULT 'Principal' CHECK (nombre = 'Principal'),
  inicializada_en TIMESTAMPTZ,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO inventario_bodega (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE inventario_auditorias ADD COLUMN IF NOT EXISTS historica BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE inventario_auditorias ALTER COLUMN historica SET DEFAULT FALSE;
ALTER TABLE inventario_auditorias ADD COLUMN IF NOT EXISTS revision_inventario BIGINT;
ALTER TABLE inventario_auditoria_items ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES producto(id);
ALTER TABLE inventario_auditoria_items ADD COLUMN IF NOT EXISTS revision_stock BIGINT;
ALTER TABLE inventario_auditoria_items ADD COLUMN IF NOT EXISTS ajustado_inventario BOOLEAN NOT NULL DEFAULT FALSE;
-- La factura admite cuatro decimales; el conteo no debe perder fracciones.
ALTER TABLE inventario_auditoria_items ALTER COLUMN stock_sistema TYPE NUMERIC(14,4);
ALTER TABLE inventario_auditoria_items ALTER COLUMN stock_real TYPE NUMERIC(14,4);
ALTER TABLE inventario_auditoria_items ALTER COLUMN costo_unitario TYPE NUMERIC(20,8);
ALTER TABLE inventario_auditoria_items ALTER COLUMN alegra_id DROP NOT NULL;
UPDATE inventario_auditoria_items i SET producto_id = p.id
  FROM producto p WHERE i.producto_id IS NULL AND p.alegra_id = i.alegra_id;
CREATE INDEX IF NOT EXISTS idx_auditoria_item_producto ON inventario_auditoria_items(producto_id);

ALTER TABLE producto_descuento_exceso ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES producto(id);
ALTER TABLE producto_descuento_exceso ADD COLUMN IF NOT EXISTS historica BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE producto_descuento_exceso ALTER COLUMN historica SET DEFAULT FALSE;
ALTER TABLE producto_descuento_exceso ALTER COLUMN alegra_item_id DROP NOT NULL;
UPDATE producto_descuento_exceso d SET producto_id = p.id
  FROM producto p WHERE d.producto_id IS NULL AND p.alegra_id = d.alegra_item_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_descuento_exceso_producto ON producto_descuento_exceso(producto_id);
ALTER TABLE regalos_exceso ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES producto(id);
ALTER TABLE regalos_exceso ADD COLUMN IF NOT EXISTS historica BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE regalos_exceso ALTER COLUMN historica SET DEFAULT FALSE;
ALTER TABLE regalos_exceso ALTER COLUMN alegra_item_id DROP NOT NULL;
UPDATE regalos_exceso r SET producto_id = p.id
  FROM producto p WHERE r.producto_id IS NULL AND p.alegra_id = r.alegra_item_id;

ALTER TABLE producto ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0);
ALTER TABLE producto ADD COLUMN IF NOT EXISTS stock_objetivo NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (stock_objetivo >= 0);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'producto_objetivo_cubre_minimo') THEN
    ALTER TABLE producto ADD CONSTRAINT producto_objetivo_cubre_minimo CHECK (stock_objetivo >= stock_minimo);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS movimiento_inventario (
  id BIGSERIAL PRIMARY KEY,
  bodega_id INTEGER NOT NULL DEFAULT 1 REFERENCES inventario_bodega(id) CHECK (bodega_id = 1),
  producto_id INTEGER NOT NULL REFERENCES producto(id),
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('inicial','venta','nota_credito','compra','ajuste_auditoria','devolucion_proveedor','reversa')),
  cantidad NUMERIC(14,4) NOT NULL CHECK (cantidad <> 0 OR tipo = 'inicial'),
  cantidad_contada NUMERIC(14,4) CHECK (cantidad_contada >= 0),
  costo_unitario NUMERIC(20,8) CHECK (costo_unitario >= 0),
  contabiliza BOOLEAN NOT NULL,
  origen_tipo VARCHAR(30) NOT NULL CHECK (origen_tipo IN ('factura','nota_credito','compra','auditoria_item','devolucion_proveedor')),
  origen_id INTEGER NOT NULL CHECK (origen_id > 0),
  clave_operacion VARCHAR(150) NOT NULL UNIQUE,
  usuario_id INTEGER REFERENCES usuario(id),
  observaciones TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE movimiento_inventario ADD COLUMN IF NOT EXISTS cantidad_contada NUMERIC(14,4) CHECK (cantidad_contada >= 0);
CREATE INDEX IF NOT EXISTS idx_movimiento_inventario_producto ON movimiento_inventario(producto_id,id);
CREATE INDEX IF NOT EXISTS idx_movimiento_inventario_origen ON movimiento_inventario(origen_tipo,origen_id,producto_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventario_inicial_producto ON movimiento_inventario(producto_id) WHERE tipo = 'inicial';

-- El kardex se corrige con otro movimiento. Editar uno anterior borraría
-- la explicación de un saldo y cambiaría retroactivamente su valoración.
CREATE OR REPLACE FUNCTION proteger_movimiento_inventario() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El kardex no se edita ni se borra; registrar una reversa.';
END $$;
DROP TRIGGER IF EXISTS movimiento_inventario_inmutable ON movimiento_inventario;
CREATE TRIGGER movimiento_inventario_inmutable BEFORE UPDATE OR DELETE ON movimiento_inventario
  FOR EACH ROW EXECUTE FUNCTION proteger_movimiento_inventario();

-- Promedio móvil, con NUMERIC y orden estable. No se guarda otro stock.
-- Un saldo negativo permanece visible, pero su valoración es desconocida;
-- al volver a saldo positivo una entrada establece el costo de lo recibido.
DROP VIEW IF EXISTS inventario_saldo;
DROP VIEW IF EXISTS inventario_kardex;
CREATE OR REPLACE VIEW inventario_kardex AS
WITH RECURSIVE ordenados AS (
  SELECT m.*, ROW_NUMBER() OVER (PARTITION BY producto_id ORDER BY id) AS paso
    FROM movimiento_inventario m WHERE contabiliza
), calculados AS (
  SELECT o.*, o.cantidad AS existencia,
    CASE WHEN o.cantidad > 0 THEN o.costo_unitario ELSE NULL END::NUMERIC(24,8) AS costo_promedio
  FROM ordenados o WHERE paso = 1
  UNION ALL
  SELECT o.*, (c.existencia + o.cantidad)::NUMERIC(14,4),
    CASE
      WHEN c.existencia + o.cantidad <= 0 THEN NULL
      WHEN o.tipo = 'inicial' THEN o.costo_unitario
      WHEN c.existencia <= 0 THEN o.costo_unitario
      WHEN c.costo_promedio IS NULL OR o.costo_unitario IS NULL THEN NULL
      ELSE (c.existencia*c.costo_promedio + o.cantidad*o.costo_unitario)/(c.existencia+o.cantidad)
    END::NUMERIC(24,8)
  FROM calculados c JOIN ordenados o ON o.producto_id=c.producto_id AND o.paso=c.paso+1
)
SELECT * FROM calculados;

CREATE OR REPLACE VIEW inventario_saldo AS
WITH ultimo AS (
  SELECT DISTINCT ON (producto_id) producto_id, existencia, costo_promedio, id AS revision_stock
    FROM inventario_kardex ORDER BY producto_id, id DESC
)
SELECT p.id AS producto_id, COALESCE(u.existencia,0)::NUMERIC(14,4) AS existencia,
  u.costo_promedio, COALESCE(u.revision_stock,0) AS revision_stock,
  EXISTS(SELECT 1 FROM movimiento_inventario m WHERE m.producto_id=p.id AND m.tipo='inicial') AS conteo_confirmado
FROM producto p LEFT JOIN ultimo u ON u.producto_id=p.id;

COMMIT;

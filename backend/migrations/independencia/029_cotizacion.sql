-- Rama independencia-alegra — 029: las cotizaciones pasan a la base propia
--
-- Hasta acá vivían en Alegra (/estimates) y facturarlas creaba la factura en
-- Alegra: era el último camino de venta que todavía salía de la casa.
--
-- LO QUE NO SE VE EN LAS COLUMNAS
--
-- 1. EL PRECIO DE LA LÍNEA ES EL COTIZADO. Se congela al crear (o al editar,
--    que la actualiza a los precios de ese día) y es el que se factura: si el
--    producto sube entre la cotización y la aceptación, cobrarle el nuevo es
--    romper lo que se le prometió al cliente. La tarifa se guarda para poder
--    mostrar el total que se le mandó; al facturar manda la del maestro.
--
-- 2. EL ESTADO NO SE GUARDA, SE CALCULA: facturada si tiene una factura que
--    no está anulada, vencida si pasó `vence`, vigente si no. Guardarlo sería
--    otro saldo que se desincroniza: anular la factura tiene que devolver la
--    cotización a vigente sin que nadie corra nada.
--
-- 3. SE BORRA DE VERDAD. Una cotización no es documento fiscal; la que nunca
--    se vendió no tiene nada que conservar. La bitácora anota qué se borró.
--    Una que ya se facturó NO se borra: su factura dice "Cotización N".
--
-- 4. EL NÚMERO NO SE REUSA. Sale de `serie_consecutivo` (tipo 'cotizacion'),
--    que ya admitía ese tipo, y continúa el de Alegra. Con "el último + 1",
--    borrar la última le daría su número a la siguiente — y la cliente que
--    recibió "la cotización 5" por WhatsApp no es la misma de la nueva 5.
--    No lleva prefijo: son "Cotización 3", "Cotización 4", como hasta ahora.

CREATE TABLE IF NOT EXISTS cotizacion (
  id                      SERIAL PRIMARY KEY,
  consecutivo             INTEGER NOT NULL UNIQUE CHECK (consecutivo > 0),
  numero                  VARCHAR(20) NOT NULL UNIQUE,
  fecha                   DATE NOT NULL,
  vence                   DATE NOT NULL,
  cliente_id              INTEGER NOT NULL REFERENCES cliente(id),
  -- Copia, como en la factura: el papel se rearma igual aunque la ficha cambie.
  cliente_nombre          VARCHAR(200) NOT NULL,
  cliente_identificacion  VARCHAR(20),
  observaciones           TEXT,
  subtotal                NUMERIC(14,2) NOT NULL DEFAULT 0,
  descuento               NUMERIC(14,2) NOT NULL DEFAULT 0,
  impuesto                NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                   NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- La factura que salió de esta cotización. Si se anula, la cotización
  -- vuelve a estar vigente y se puede facturar otra vez (se pisa este id).
  factura_id              INTEGER REFERENCES factura(id),
  -- Cuándo se facturó. Con `factura_id` vacío significa que se facturó en
  -- Alegra antes del corte y no se encontró la factura copiada.
  facturada_en            TIMESTAMP,
  -- Doble clic o respuesta perdida: la misma clave devuelve la misma
  -- cotización en vez de gastar otro número.
  clave_idempotencia      VARCHAR(80) UNIQUE,
  alegra_id               VARCHAR(20) UNIQUE,
  creado_por              INTEGER,
  creado_en               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cotizacion_vence_despues CHECK (vence >= fecha)
);

CREATE INDEX IF NOT EXISTS idx_cotizacion_cliente ON cotizacion (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_factura ON cotizacion (factura_id);

-- Mismos tipos que `factura_linea`: la línea cotizada se copia tal cual a la
-- factura, y un redondeo distinto entre las dos haría que el total facturado
-- no fuera el cotizado.
CREATE TABLE IF NOT EXISTS cotizacion_linea (
  id                    SERIAL PRIMARY KEY,
  cotizacion_id         INTEGER NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,
  numero_linea          INTEGER NOT NULL,
  producto_id           INTEGER REFERENCES producto(id),
  nombre                VARCHAR(250) NOT NULL,
  referencia            VARCHAR(100),
  cantidad              NUMERIC(14,4) NOT NULL CHECK (cantidad > 0),
  -- SIN impuesto, como en la factura.
  precio_unitario       NUMERIC(14,5) NOT NULL CHECK (precio_unitario >= 0),
  descuento_porcentaje  NUMERIC(6,3) NOT NULL DEFAULT 0,
  descuento_monto       NUMERIC(14,2) NOT NULL DEFAULT 0,
  impuesto_id           INTEGER REFERENCES impuesto(id),
  tarifa                NUMERIC(6,3) NOT NULL DEFAULT 0,
  impuesto_monto        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(14,2) NOT NULL,
  alegra_item_id        VARCHAR(20),
  CONSTRAINT cotizacion_linea_unica UNIQUE (cotizacion_id, numero_linea)
);

CREATE INDEX IF NOT EXISTS idx_cotizacion_linea_producto ON cotizacion_linea (producto_id);

-- La serie. `siguiente` arranca en 3 porque la última de Alegra es la 2;
-- `cargar-cotizaciones.js` lo sube si al copiar encuentra alguna mayor.
INSERT INTO serie_consecutivo (tipo_documento, sucursal, terminal, siguiente, electronica, serie, descripcion, activo)
VALUES ('cotizacion', '001', '00001', 3, FALSE, NULL, 'Cotizaciones (no es documento fiscal)', TRUE)
ON CONFLICT (tipo_documento, sucursal, terminal, electronica) DO NOTHING;

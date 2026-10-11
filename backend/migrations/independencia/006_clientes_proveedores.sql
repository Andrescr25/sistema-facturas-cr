-- Rama independencia-alegra · 006
-- Clientes y proveedores propios.
--
-- Hoy viven como "contactos" en Alegra (278), y el sistema no tiene pantalla
-- para crearlos ni editarlos. Un mismo contacto puede ser cliente y
-- proveedor: se carga en las dos tablas, cada una con lo suyo.
--
-- Los teléfonos se guardan como vienen: en Alegra hay fichas con dos números
-- en un campo o el nombre de quien contesta pegado. Limpiarlos es una tarea
-- aparte (ver utils/telefonosCliente.js); acá no se pierde nada.

CREATE TABLE IF NOT EXISTS cliente (
  id                   SERIAL        PRIMARY KEY,
  nombre               VARCHAR(200)  NOT NULL,
  tipo_identificacion  VARCHAR(20)   CHECK (tipo_identificacion IN ('CF', 'CJ', 'DIMEX', 'NITE', 'EXTRANJERO', 'NO_CONTRIBUYENTE')),
  identificacion       VARCHAR(20),
  correo               VARCHAR(160),
  correos_adicionales  TEXT[]        NOT NULL DEFAULT '{}',
  telefono             VARCHAR(60),
  telefono_secundario  VARCHAR(60),
  celular              VARCHAR(60),
  provincia            VARCHAR(40),
  canton               VARCHAR(60),
  distrito             VARCHAR(60),
  barrio               VARCHAR(80),
  otras_senas          TEXT,
  actividad_economica  VARCHAR(10),
  plazo_credito_id     INTEGER       REFERENCES plazo_credito(id),
  limite_credito       NUMERIC(14,2) CHECK (limite_credito IS NULL OR limite_credito >= 0),
  exoneracion          JSONB,
  observaciones        TEXT,
  activo               BOOLEAN       NOT NULL DEFAULT TRUE,
  alegra_id            VARCHAR(20)   UNIQUE,
  creado_en            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cliente_identificacion ON cliente (identificacion);
CREATE INDEX IF NOT EXISTS idx_cliente_nombre ON cliente (lower(nombre));

-- Proveedores: uno por cédula. Juntan los contactos de Alegra con los que solo
-- aparecen en las facturas de proveedor (supplier_product_mapping), que es
-- donde de verdad se sabe quién le vende qué.
CREATE TABLE IF NOT EXISTS proveedor (
  id                   SERIAL        PRIMARY KEY,
  nombre               VARCHAR(200)  NOT NULL,
  tipo_identificacion  VARCHAR(20)   CHECK (tipo_identificacion IN ('CF', 'CJ', 'DIMEX', 'NITE', 'EXTRANJERO', 'NO_CONTRIBUYENTE')),
  identificacion       VARCHAR(20),
  correo               VARCHAR(160),
  telefono             VARCHAR(60),
  plazo_credito_id     INTEGER       REFERENCES plazo_credito(id),
  observaciones        TEXT,
  activo               BOOLEAN       NOT NULL DEFAULT TRUE,
  alegra_id            VARCHAR(20)   UNIQUE,
  creado_en            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedor_identificacion ON proveedor (identificacion) WHERE identificacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proveedor_nombre ON proveedor (lower(nombre));

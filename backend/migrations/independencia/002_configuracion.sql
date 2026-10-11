-- Rama independencia-alegra · 002
-- Configuración de la empresa que hoy vive en Alegra.
--
-- Cada tabla que reemplaza algo de Alegra guarda `alegra_id` (opcional) para
-- migrar sin duplicar y conciliar mientras convivan los dos sistemas. Los
-- códigos de Hacienda quedan vacíos a propósito: se llenan contra el Anexo
-- oficial cuando se retome la emisión electrónica, no se adivinan.

-- Una sola fila: los datos legales de la empresa.
CREATE TABLE IF NOT EXISTS empresa (
  id                   SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nombre               VARCHAR(160) NOT NULL,
  nombre_comercial     VARCHAR(160),
  tipo_identificacion  VARCHAR(10)  NOT NULL CHECK (tipo_identificacion IN ('CF', 'CJ', 'DIMEX', 'NITE')),
  identificacion       VARCHAR(20)  NOT NULL,
  actividad_economica  VARCHAR(10),
  regimen              VARCHAR(40),
  telefono             VARCHAR(30),
  correo               VARCHAR(160),
  provincia            VARCHAR(40),
  canton               VARCHAR(60),
  distrito             VARCHAR(60),
  barrio               VARCHAR(80),
  otras_senas          TEXT,
  logo_url             TEXT,
  decimales            SMALLINT     NOT NULL DEFAULT 0 CHECK (decimales BETWEEN 0 AND 5),
  actualizado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tarifas de IVA. La tarifa se guarda como número, nunca se deduce del id:
-- deducirla del id de Alegra es exactamente el error que registró compras
-- al 1 % como 4 % (utils/impuestosAlegra.js, desde el 10 de julio).
CREATE TABLE IF NOT EXISTS impuesto (
  id                      SERIAL       PRIMARY KEY,
  nombre                  VARCHAR(80)  NOT NULL,
  tarifa                  NUMERIC(5,2) NOT NULL CHECK (tarifa >= 0 AND tarifa <= 100),
  tipo                    VARCHAR(20)  NOT NULL CHECK (tipo IN ('general', 'reducido', 'transitorio', 'exento', 'sin_credito', 'bienes_usados')),
  codigo_tarifa_hacienda  VARCHAR(4),
  activo                  BOOLEAN      NOT NULL DEFAULT TRUE,
  alegra_id               VARCHAR(20)  UNIQUE,
  creado_en               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS metodo_pago (
  id                          SERIAL      PRIMARY KEY,
  clave                       VARCHAR(30) NOT NULL UNIQUE,
  nombre                      VARCHAR(60) NOT NULL,
  pide_referencia             BOOLEAN     NOT NULL DEFAULT FALSE,
  codigo_medio_pago_hacienda  VARCHAR(4),
  alegra_clave                VARCHAR(30),
  orden                       SMALLINT    NOT NULL DEFAULT 0,
  activo                      BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS plazo_credito (
  id         SERIAL      PRIMARY KEY,
  nombre     VARCHAR(40) NOT NULL,
  dias       SMALLINT    NOT NULL UNIQUE CHECK (dias >= 0),
  activo     BOOLEAN     NOT NULL DEFAULT TRUE,
  alegra_id  VARCHAR(20) UNIQUE
);

-- Dónde entra y sale la plata: caja general, caja chica, banco, tarjeta.
CREATE TABLE IF NOT EXISTS cuenta_dinero (
  id             SERIAL        PRIMARY KEY,
  nombre         VARCHAR(80)   NOT NULL,
  tipo           VARCHAR(20)   NOT NULL CHECK (tipo IN ('efectivo', 'banco', 'tarjeta_credito')),
  numero         VARCHAR(60),
  descripcion    TEXT,
  saldo_inicial  NUMERIC(14,2) NOT NULL DEFAULT 0,
  activo         BOOLEAN       NOT NULL DEFAULT TRUE,
  alegra_id      VARCHAR(20)   UNIQUE,
  creado_en      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Consecutivos propios. Se toman con SELECT … FOR UPDATE para que dos ventas
-- simultáneas no reciban el mismo número. La terminal propia no puede ser
-- la de Alegra (001-00001) mientras convivan.
CREATE TABLE IF NOT EXISTS serie_consecutivo (
  id              SERIAL      PRIMARY KEY,
  tipo_documento  VARCHAR(20) NOT NULL CHECK (tipo_documento IN ('factura', 'tiquete', 'nota_credito', 'nota_debito', 'cotizacion', 'recibo')),
  sucursal        CHAR(3)     NOT NULL DEFAULT '001' CHECK (sucursal ~ '^[0-9]{3}$'),
  terminal        CHAR(5)     NOT NULL CHECK (terminal ~ '^[0-9]{5}$'),
  siguiente       BIGINT      NOT NULL DEFAULT 1 CHECK (siguiente > 0),
  activo          BOOLEAN     NOT NULL DEFAULT TRUE,
  UNIQUE (tipo_documento, sucursal, terminal)
);

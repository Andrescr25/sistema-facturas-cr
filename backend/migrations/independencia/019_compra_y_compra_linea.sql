-- La compra pasa a ser nuestra: `compra` y `compra_linea`.
--
-- HOY la factura del proveedor vive en `facturas_proveedores` (el encabezado
-- que se sacó del correo) y `productos_factura_proveedor` (las líneas). Esas
-- dos son el BUZÓN: lo que llegó, tal como llegó, esté relacionado o no.
-- `compra` es otra cosa: el hecho de que esa factura se aceptó y entró al
-- negocio. Por eso son tablas aparte y no columnas nuevas en el buzón — una
-- factura rechazada, duplicada o que resultó ser un gasto recurrente sigue en
-- el buzón y nunca llega a ser compra.
--
-- CUELGA DE NUESTROS IDS. `proveedor_id` y `producto_id`, no la cédula escrita
-- a mano ni el id de Alegra. La migración 018 dejó el terreno listo y esto se
-- midió antes de escribirlo, sobre los datos reales de la copia local:
--
--   · las 862 facturas encuentran su proveedor propio por cédula: 862 de 862;
--   · de las 8.600 líneas, 8.452 encuentran nuestro producto (98,3 %);
--   · las 123 que no tienen mapeo y 25 más cuyo mapeo quedó sin producto van
--     con `producto_id` NULL. NO se descartan: si se cayera la línea, el
--     detalle de la compra dejaría de sumar lo que dice la factura, y la
--     diferencia aparecería como si fuera un error de la compra.
--
-- EL TOTAL MANDA SOBRE LA SUMA DE LÍNEAS, y no es un detalle: de las 862, hay
-- 18 donde el total del encabezado NO coincide con la suma de sus líneas.
-- Las diferencias van de ₡65 a ₡16.941 y algunas son NEGATIVAS —las líneas
-- suman más que la factura—, así que no es redondeo: son descuentos y cargos
-- a nivel de factura que el parser del correo no extrae. El XML original no
-- se guarda (se parsea y se descarta), así que eso no se puede reconstruir.
-- Lo que se le debe al proveedor es el total del comprobante; calcularlo
-- sumando líneas le pagaría de menos a unos y de más a otros.
--
-- LA CANTIDAD SE GUARDA DOS VECES, a propósito. `cantidad` es en la unidad en
-- que factura el proveedor (la caja de 60) y `cantidad_propia` en la mía (las
-- 60 unidades). El inventario se mueve en la mía; cotejar contra el papel se
-- hace con la suya. `cantidad_propia` es una columna GENERADA para que no
-- puedan separarse nunca.

CREATE TABLE IF NOT EXISTS compra (
  id                    SERIAL PRIMARY KEY,
  proveedor_id          INTEGER      NOT NULL REFERENCES proveedor(id),

  -- La clave de 50 dígitos de Hacienda. Es la identidad del comprobante y es
  -- única: se comprobó sobre las 862, no hay una repetida. Con esto una misma
  -- factura no entra dos veces aunque el correo la traiga de nuevo.
  clave                 VARCHAR(50),
  numero_consecutivo    VARCHAR(30),

  fecha_emision         DATE         NOT NULL,
  fecha_vencimiento     DATE,
  moneda                VARCHAR(3)   NOT NULL DEFAULT 'CRC',

  -- El del comprobante, no la suma de las líneas. Ver arriba.
  total                 NUMERIC(14,2) NOT NULL,

  -- registrada  entró al negocio
  -- anulada     se registró y después se echó atrás
  -- devuelta    se le devolvió la mercadería al proveedor
  estado                VARCHAR(20)  NOT NULL DEFAULT 'registrada',

  -- De cuál correo salió. Se conserva para poder volver al buzón y ver qué
  -- llegó exactamente; es NULL en una compra cargada a mano.
  factura_proveedor_id  UUID         REFERENCES facturas_proveedores(id),

  registrada_por        INTEGER      REFERENCES usuario(id),
  observaciones         TEXT,
  creado_en             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT compra_estado_valido CHECK (estado IN ('registrada', 'anulada', 'devuelta'))
);

-- Una clave de Hacienda es una sola compra. Parcial porque una compra cargada
-- a mano puede no tener clave.
CREATE UNIQUE INDEX IF NOT EXISTS idx_compra_clave
  ON compra (clave) WHERE clave IS NOT NULL;

-- Lo mismo con el correo del que salió: que reprocesar el buzón no duplique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_compra_factura_proveedor
  ON compra (factura_proveedor_id) WHERE factura_proveedor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compra_proveedor_fecha
  ON compra (proveedor_id, fecha_emision DESC);

CREATE INDEX IF NOT EXISTS idx_compra_fecha ON compra (fecha_emision DESC);


CREATE TABLE IF NOT EXISTS compra_linea (
  id                 SERIAL PRIMARY KEY,
  compra_id          INTEGER      NOT NULL REFERENCES compra(id) ON DELETE CASCADE,
  numero_linea       INTEGER      NOT NULL,

  -- NULL cuando la línea no se pudo relacionar con un producto nuestro. La
  -- línea se guarda igual: es parte de lo que se pagó.
  producto_id        INTEGER      REFERENCES producto(id),

  -- Cómo lo llama el proveedor. Se guarda aunque haya producto, porque es lo
  -- que dice el papel y es con lo que se vuelve a relacionar si el mapeo
  -- cambia.
  descripcion        TEXT         NOT NULL,
  codigo_proveedor   VARCHAR(100),
  codigo_cabys       VARCHAR(20),

  -- En la unidad del proveedor.
  cantidad           NUMERIC(14,4) NOT NULL,
  unidad             VARCHAR(20),
  factor_conversion  NUMERIC(14,6) NOT NULL DEFAULT 1,

  -- En la mía. Generada: no puede quedar desfasada de las otras dos.
  cantidad_propia    NUMERIC(14,4) GENERATED ALWAYS AS (cantidad * factor_conversion) STORED,

  -- Precio por unidad del proveedor, sin impuesto, tal como viene en la
  -- factura. El costo por unidad mía se calcula con el descuento, el impuesto
  -- y el factor (ver modules/precios/costo.js); no se guarda aquí para que no
  -- haya dos verdades.
  precio_unitario    NUMERIC(14,4) NOT NULL,
  descuento          NUMERIC(14,2) NOT NULL DEFAULT 0,
  impuesto           NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_linea        NUMERIC(14,2) NOT NULL,

  CONSTRAINT compra_linea_cantidad_positiva CHECK (cantidad > 0),
  CONSTRAINT compra_linea_factor_positivo   CHECK (factor_conversion > 0)
);

CREATE INDEX IF NOT EXISTS idx_compra_linea_compra   ON compra_linea (compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_linea_producto ON compra_linea (producto_id)
  WHERE producto_id IS NOT NULL;

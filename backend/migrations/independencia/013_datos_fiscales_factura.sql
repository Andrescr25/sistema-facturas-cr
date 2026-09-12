-- Lo que le falta al papel para ser una factura completa.
--
-- Comparado con el PDF que hoy genera Alegra, faltaban cuatro cosas:
--
-- 1. La ACTIVIDAD ECONÓMICA con su descripción, no solo el código. En el
--    documento se lee "4752.1 - Venta al por menor de artículos de ferretería
--    y pinturas en comercios especializados"; el código solo no le dice nada
--    a quien recibe la factura.
--
-- 2. Los TÉRMINOS DE PAGO: las cuentas de SINPE y de banco que hoy salen al
--    pie ("SINPE_86477036 TARCICIO VARGAS CHAVARRIA", Banco Nacional, BAC).
--    Es POR DONDE EL CLIENTE PAGA; sin eso el papel no sirve para cobrar.
--    Va en la configuración porque un número de cuenta cambia y nadie debería
--    tener que tocar código para eso.
--
-- 3. El TELÉFONO y la DIRECCIÓN del cliente en la propia factura. Se copian
--    igual que el nombre y la cédula: un documento fiscal tiene que poder
--    reimprimirse años después diciendo lo mismo, y la ficha del cliente
--    cambia.
--
-- A las 5.398 ya copiadas se les rellena desde la ficha actual. No es la
-- copia del día de la venta —esa no la tenemos—, pero es mucho mejor que
-- reimprimirlas en blanco.

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS actividad_economica_nombre VARCHAR(200);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS terminos_pago TEXT;

ALTER TABLE factura ADD COLUMN IF NOT EXISTS cliente_telefono VARCHAR(60);
ALTER TABLE factura ADD COLUMN IF NOT EXISTS cliente_direccion TEXT;

UPDATE factura f
   SET cliente_telefono = COALESCE(f.cliente_telefono, c.telefono, c.celular),
       cliente_direccion = COALESCE(
         f.cliente_direccion,
         NULLIF(TRIM(BOTH ' ' FROM CONCAT_WS(' ', c.provincia, c.canton, c.distrito, c.barrio, c.otras_senas)), '')
       )
  FROM cliente c
 WHERE c.id = f.cliente_id
   AND (f.cliente_telefono IS NULL OR f.cliente_direccion IS NULL);

-- Los valores que la empresa VIENE IMPRIMIENDO en sus facturas, tomados del
-- PDF que hoy genera Alegra.
--
-- LA ACTIVIDAD ECONÓMICA ES LA 4752.1, confirmada con el negocio el 12 de
-- setiembre de 2026. La API de Alegra devuelve 523402 y eso fue lo que quedó
-- en la configuración al cargarla, pero el papel que reciben los clientes
-- siempre dijo 4752.1. Por eso `cargar-configuracion.js` ya no pisa lo que
-- esté escrito: repetir esa carga revertía la corrección en silencio.
UPDATE empresa
   SET actividad_economica = '4752.1',
       actividad_economica_nombre = COALESCE(
         actividad_economica_nombre,
         'Venta al por menor de artículos de ferretería y pinturas en comercios especializados'),
       terminos_pago = COALESCE(terminos_pago,
         E'SINPE_86477036 TARCICIO VARGAS CHAVARRIA\nBanco_Nacional_5518980336453110\nBAC_4745812311852180')
 WHERE id = 1;

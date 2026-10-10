-- Rama independencia-alegra — 053: códigos de Hacienda que no admiten duda.
--
-- Medido el 2026-10-10 al conectar el ambiente de pruebas: los 9 impuestos y
-- los 6 métodos de pago tenían el código de Hacienda vacío, y sin él no se
-- prepara ningún comprobante ("Código de tarifa en línea 1: falta un dato
-- fiscal válido"). Pasaba en CADA base nueva, y habría pasado en producción
-- el día del corte hasta que alguien escribiera quince códigos a mano.
--
-- Solo se llena lo que tiene una única respuesta en el anexo 4.4:
--   · impuestos: la pareja tipo + tarifa (general 13 % → 08, reducido 1 % →
--     02, …). Una tarifa de 0 % puede ser 01, 05, 10 u 11 y cambia el
--     tratamiento fiscal: esa la elige una persona en Configuración →
--     Impuestos y acá NO se toca;
--   · métodos de pago: por la clave propia que siembra la 003.
--
-- Nunca se pisa lo que ya eligió alguien: solo filas con el código vacío.
-- Se puede correr las veces que haga falta.
--
-- En una base recién armada los impuestos todavía no existen cuando corre
-- esta migración (los crea `cargar-configuracion.js`); por eso ese cargador
-- propone el mismo código al crearlos (`codigoTarifaHacienda` en
-- `modules/configuracion/desdeAlegra.js`). Las dos tablas tienen que decir lo
-- mismo; `configuracionDesdeAlegra.test.js` las compara.

UPDATE impuesto
   SET codigo_tarifa_hacienda = CASE
         WHEN tipo = 'general'     AND tarifa = 13  THEN '08'
         WHEN tipo = 'reducido'    AND tarifa = 0.5 THEN '09'
         WHEN tipo = 'reducido'    AND tarifa = 1   THEN '02'
         WHEN tipo = 'reducido'    AND tarifa = 2   THEN '03'
         WHEN tipo = 'reducido'    AND tarifa = 4   THEN '04'
         WHEN tipo = 'transitorio' AND tarifa = 4   THEN '06'
         WHEN tipo = 'transitorio' AND tarifa = 8   THEN '07'
       END,
       actualizado_en = CURRENT_TIMESTAMP
 WHERE COALESCE(codigo_tarifa_hacienda, '') = ''
   AND (   (tipo = 'general'     AND tarifa = 13)
        OR (tipo = 'reducido'    AND tarifa IN (0.5, 1, 2, 4))
        OR (tipo = 'transitorio' AND tarifa IN (4, 8)));

UPDATE metodo_pago
   SET codigo_medio_pago_hacienda = CASE clave
         WHEN 'efectivo'        THEN '01'
         WHEN 'tarjeta_debito'  THEN '02'
         WHEN 'tarjeta_credito' THEN '02'
         WHEN 'cheque'          THEN '03'
         WHEN 'transferencia'   THEN '04'
         WHEN 'sinpe_movil'     THEN '06'
       END
 WHERE COALESCE(codigo_medio_pago_hacienda, '') = ''
   AND clave IN ('efectivo', 'tarjeta_debito', 'tarjeta_credito', 'cheque', 'transferencia', 'sinpe_movil');

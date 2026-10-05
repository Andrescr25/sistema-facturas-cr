# Integración directa con Hacienda

Solicitada y autorizada por el usuario el 2026-10-05. Las revisiones manuales
de productos, clientes e inventario quedan a su cargo. Esta autorización
reemplaza la instrucción anterior de aplazar Hacienda; no implica convertir
facturas históricas en nuevas emisiones ni probar con ventas reales.

La versión publicada en el índice oficial actual de OVi es **4.4**, incluidos
los ajustes de anexos del 22/04/2026. Los XSD vigentes de www.hacienda.go.cr
sustituyen los del índice antiguo de ATV: no tienen todos los mismos bytes. Se verifican también los
anexos actuales en OVi; versión del XML y revisión de los catálogos son datos
distintos. Fuentes y huellas de los esquemas quedan dentro del módulo.

## Plan de ejecución

1. Verificar fuentes oficiales, esquemas, firma y ambientes de recepción.
2. Mantener todo en `backend/src/integrations/hacienda/`: consulta pública,
   configuración, secretos, XML por versión, firma XAdES, transporte OAuth,
   persistencia de comprobantes y seguimiento. Facturación y Compras se
   conectan mediante adaptadores pequeños; no conocen tokens ni certificados.
3. Crear tablas propias por SQL: configuración por ambiente, numeradores
   fiscales separados y comprobantes duraderos. El sandbox nunca consume
   números de producción ni declara aceptada una venta real.
4. Configuración → Hacienda: ambiente, datos fiscales que falten, usuario y
   contraseña del API, archivo `.p12` y PIN. Validar certificado, vigencia y
   correspondencia de llave; cifrar secretos. GET nunca devuelve secretos.
5. Generar FE/TE/NC y mensaje receptor con validación XSD oficial, importes
   del documento, referencias explícitas y sin inventar actividad, ubicación,
   CABYS, descuentos o aceptación de Hacienda.
6. Preparar y guardar el XML firmado antes de enviar. Reservar consecutivo
   con bloqueo; conservar clave y bytes al reintentar. Un HTTP 201 es recibido,
   no aceptado. Ante timeout consultar la misma clave, sin duplicar venta.
7. Exponer preparación, envío, consulta de estado y descarga privada del XML
   y respuesta. Bloquear edición de documentos en emisión real. Usar consulta
   autenticada para confirmar resultados; ningún callback público puede
   declarar una aceptación.
8. Corregir carga histórica conservando estado de origen y prueba disponible,
   sin interpretar el indicador de plantilla como aceptación.
9. Probar firma y alteraciones, XML frente al XSD, secretos, permisos,
   duplicación/reintentos, estados, aislamiento y transacciones PostgreSQL.
   Construir frontend y actualizar grafo, checklist y memoria.

## Activación y operación

Se inicia deshabilitada y en pruebas. El usuario carga sus credenciales por
el frontend; no se piden por chat. Una emisión real requiere configuración
completa, certificado vigente, habilitación de producción, base del corte y
protección de salida cumplidas. Falta verificar recepción y aceptación reales
en sandbox con las credenciales del contribuyente antes del corte.

Credenciales, llave de cifrado y XML van en almacenamiento privado fuera de
Git y de `/archivos`. Su respaldo y restauración forman parte del corte. Los
documentos de producción aceptados solo se corrigen con nota; la emisión no
vuelve a mover inventario, cobros ni saldos.

## Fuentes oficiales consultadas

- [Índice vigente en OVi](https://ovitribucr.hacienda.go.cr/comprobantes-electronicos).
- [Anexos 4.4](https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf).
- [API de recepción](https://www.hacienda.go.cr/docs/ComprobantesElectronicosAPI.html).
- [Oficina Virtual Tributaria](https://ovitribucr.hacienda.go.cr/).

El informe final registra qué fases se implementaron y qué comprobación exige
credenciales reales. No se marca la integración como homologada por pruebas
locales o transportes simulados.

## Ejecución realizada

Los pasos 1–9 están implementados. Ver [arquitectura y operación](../backend/src/integrations/hacienda/README.md) y [nodo Hacienda](grafo/modulo/hacienda.md).
La prueba con credenciales y aceptación REAL en sandbox, así como el corte,
siguen pendientes. No se habilita producción por aprobar pruebas locales.

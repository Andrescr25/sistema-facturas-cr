# Estado del checklist al 5 de octubre de 2026

**131 puntos terminados y 15 abiertos** en §§0–16; 16 abiertos si se incluye
la emisión de Hacienda pospuesta. Es avance del checklist, no una afirmación
de que producción ya está migrada. Claude agotó la sesión; Codex completó el
trabajo nocturno posible sin entrar a resolver Hacienda.

## Resultado visible en la copia local

**2.144 productos con existencia cero**, ninguno confirmado físicamente.
Auditorías, descuentos y regalos activos vacíos. Las 17 auditorías y los 470
descuentos anteriores se conservan como historia fuera del flujo nuevo.
Facturas, compras, pagos y series no cambiaron con la apertura: 15 huellas
comerciales iguales antes/después, con respaldo previo.

El cero es provisional, como pidió el usuario. El conteo físico completo se
hará al salir a producción, usando la auditoría inicial ya implementada.
No se importan cantidades de Alegra ni se dice que ya se contó la mercadería.

## Lo terminado por sección

| Sección | Terminado | Abierto | Resultado |
|---|---:|---:|---|
| 0. Base | 8 | 0 | Aislamiento, ids propios, bitácora y guardas |
| 1. Configuración | 7 | 0 | Empresa, catálogos y numeración propios |
| 2. Productos | 12 | 1 | Maestro, fotos, categorías, gestión y catálogos; sin caché/sincronización |
| 3. Clientes | 8 | 1 | Fichas, validación, búsqueda y vínculos propios |
| 4. Proveedores | 4 | 0 | Fichas, WhatsApp y relaciones propias |
| 5. Inventario | 8 | 1 | Kardex, promedio, ventas/compras/créditos y auditorías desde cero |
| 6. Facturación | 23 | 3 | Documentos propios, PDF, correo, edición, anulación e idempotencia offline |
| 7. Cobros/Caja | 11 | 0 | Saldo calculado, cobros, aplicaciones y cierres propios |
| 8. Compras | 12 | 1 | Registro, costos, relaciones, XML y flujo propios |
| 9. Pagos a proveedores | 6 | 0 | Pagos, saldos y salidas de Caja General |
| 10. Cotizaciones | 2 | 0 | Cotizaciones y conversión a factura propias |
| 11. Bodega/Faltantes | 7 | 0 | Despacho, ajustes e impresión propios |
| 12. Portal/Catálogos | 9 | 0 | Productos, pedidos, cuentas y permisos propios |
| 13. Reportes | 5 | 0 | Contador, rentabilidad y exportaciones propias |
| 14. Usuarios/Permisos | 4 | 0 | Dueños de rutas y permisos prestados verificados |
| 15. Migración/Corte | 1 | 7 | Herramientas preparadas; cargas finales, evidencia externa y corte pendientes |
| 16. Retiro Alegra | 4 | 1 | Aplicación sin integración, sincronizaciones ni traductores antiguos |
| **Total** | **131** | **15** | |

El detalle de cada punto terminado permanece en
[el checklist](../checklist-independencia-alegra.md) y el grafo de esta rama.

## Los 15 puntos abiertos

| Punto | Qué falta realmente |
|---|---|
| Datos de productos | Confirmar/corregir datos ciertos: impuesto, categoría y registro; revisar precios y tarifas históricas |
| Datos de clientes | Información real de contactos/identificación/actividad; la revisión fiscal quedó para Hacienda |
| Conteo físico | Realizarlo y confirmar todas las cantidades al salir a producción |
| WhatsApp de facturas | Comprobar recepción real con destinatario autorizado |
| Entrada de ids antiguos | Retirar compatibilidad de facturas después de vaciar cada cola de tablet |
| Emisión de factura creada | Hacienda, excluida esta noche |
| Aceptación de compra | Mensaje receptor/estado fiscal, con Hacienda |
| Carga completa repetible | Completar facturas históricas con estado fiscal real y verificar el conjunto, incluidas compras |
| Última carga/041 | Ejecutar con origen congelado justo antes de D y verificar consecutivos/puentes |
| Archivo electrónico | Revisar 54 fichas sin XML/clave; respaldo y traslado al servidor definitivo |
| Conciliación total | Repetir todos los períodos tras la carga; resolver diferencias y vínculos ciertos de compras |
| Ensayo completo | Superar el bloqueo fiscal de importación y completar dos pasadas/conciliaciones/recepción real |
| Plan de corte | Plan preparado; fijar D y confirmar condiciones con el usuario |
| WhatsApp del servidor | Instalar/verificar sesión del servidor definitivo y recepción autorizada |
| Columnas históricas | Retirar usos de entrada anteriores solo después de vaciar las colas offline |

Hay además una fila general de Hacienda en “Pospuesto”; no sumarla dos veces
al contar §§0–16. No faltan decisiones de permisos; Claude ya las resolvió.

## Lo nuevo del trabajo nocturno

Inventario propio completo desde cero, sin esperar un conteo para construir.
Salidas/entradas registradas en la misma transacción que la venta, compra o
crédito; reintentos no duplican. Promedio móvil, kardex inmutable, umbrales,
conteos con revisión estable, devoluciones de cliente/proveedor y exceso con
stock real. Indicadores sin conteos muestran cero. Aplicado a la compartida
con respaldo; producción no fue modificada por Codex.

Integración antigua de Alegra retirada (incluidos tres guiones de escritura).
Solo las herramientas de migración tienen un lector GET sin métodos de
escritura. No puede importarse desde la aplicación; reintentos, host y errores
están controlados. Los originales fiscales conservados son **492 PDF + 492
XML**, 984 archivos verificados, 23.561.897 bytes. La carpeta permanente fuera
de Git se conserva y no se limpia al retirar pruebas.

[Plan operativo de corte](../plan-corte-independencia.md) y herramienta de
ensayo preparados: base nueva separada, dump privado, migraciones una vez,
enlaces tras maestras/documentos, 041, ceros/series y cuatro conciliadores.
El ensayo sobre un dump nuevo restauró esquema y cargó maestras/enlaces,
pero **se detuvo** en `factura_electronica_aceptada`: el cargador no inserta
`hacienda_estado`. No se asignó aceptación supuesta ni se alteraron estados
fiscales para hacerlo pasar. [Bloqueo para mañana](../grafo/bloqueo/carga-electronica-historica.md).
La carga independiente de cotizaciones sí se comprobó (una, próximo número 3).

Auditoría READ ONLY de fichas preparada por id/referencia histórica, sin
corregir datos automáticamente. En la compartida: **14 productos sin impuesto,
17 sin categoría, 9 medicamentos sin registro y 76 con precio bajo su costo**
según la tarifa actual; causas superpuestas en 101 fichas. Clientes: 212 sin
correo, 245 sin actividad, 75 sin teléfono utilizable, 24 sin identificación
y uno con tipo por revisar; 245 fichas con algún motivo. El JSON privado
indica la base a la que pertenecen los ids: no intercambiarlos con otra copia.

## Validación y siguiente sesión

Suite final combinada: **1.908 aprobadas, cero fallos y cero omitidas**, con
PostgreSQL desechable. Incluye 25 casos reales de inventario/comercio y seis
de ensayo/guardas/lectura. Grafo validado. Build y navegador escritorio/700 px
aprobados para inventario; no hubo cambios de interfaz en las herramientas
posteriores. No se enviaron mensajes, no se leyó IMAP ni se ejecutó limpieza.

Mañana: revisar el estado fiscal del historial y las 54 fichas, resolver esa
adaptación sin inventar aceptación, repetir ensayo desde el dump privado y
completar conciliaciones. Luego fijar la ventana real, comprobar servidor y
recepción, y realizar el conteo físico completo al abrir producción. La
aplicación, el plan y los informes ya ubican los pendientes; no volver a
preguntar si se empieza inventario en cero ni repetir módulos terminados.

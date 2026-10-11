# Impresión: precios y pedido exacto

Solicitud del 2026-10-08: publicar la corrección en `main` y adaptarla a
`independencia-alegra`, revisando sus diferencias. El ejemplo confirmado es
6 unidades facturadas y 3 faltantes que no llegaron: la factura queda en 3.

En `main` se publicó `dfcbcd3`, preparado en `developer` como `0451fd3`.
Conserva la cantidad original para reintentos/recuperación, distingue precio
manual del automático, valida identidad del producto, conserva impuestos y
descuentos y deja la cola pendiente ante error. La operación con Alegra usa
bloqueos de transacción compatibles con el pooler. No lleva migración SQL.

La adaptación usa `factura.id`, `producto.id`, la rebaja diferencial guardada
en `cantidad_rebajada` y `editarFacturaEn`. Se conserva la transacción conjunta
de factura, inventario, faltantes, cola e historial, con las restricciones
fiscales, cobros y notas de crédito y el contexto de ruta/ciclo propios.
Los precios automáticos se releen al guardar; los manuales se conservan.
También se conserva la regla de catálogo en cero y la categoría
`sin_pendientes`. Los clientes sin la nueva bandera mantienen su contrato.

El formulario ignora respuestas tardías de otra factura, no guarda durante
la carga y conserva la edición vacía al quitar el último producto. Recuperar
desde Impresión o Reporte de Clientes toma primero el bloqueo de factura,
igual que procesar. No se incorpora el servicio antiguo que escribe en Alegra.

Validación: `main` pasó 941 pruebas y compilación del frontend. En migración
se prueban los manejadores reales del formulario y propuesta/payload reales
contra PostgreSQL desechable: 6−3, precio cambiado entre abrir/guardar,
manual, IVA/descuento/nota, recuperación sin doble rebaja ni doble salida,
rollback tras fallo del historial, vacío, protección electrónica y precios
de `sin_pendientes`. Verificación final de Impresión, recorrido de reportes
y grafo: **71/71**, sin saltos ni fallos. Compilación del frontend correcta.

La primera suite general compartió secuencias entre pruebas y no tenía la
firma ficticia ni el directorio temporal que requieren otros módulos. Se
corrigió el entorno externo al repositorio y se ejecutó secuencialmente.
La suite secuencial dio 2289/2291; los dos casos restantes, auditoría y
estado de ensayo de corte, se repitieron en una copia nueva: 7/7 y 6/6,
porque la primera ejecución dejó fixtures de otros módulos en la copia
desechable. No se modificaron esos módulos ni la base de trabajo.

Las pruebas usan copias de PostgreSQL local, salida de red externa bloqueada,
firmas ficticias y fixtures ZZ dentro de BEGIN/ROLLBACK. No se conectó con
la base de producción ni se ejecutaron endpoints reales, limpieza semanal,
envíos, instalación de dependencias o generación de Prisma. No se acredita
impresora física ni puesta en marcha de la migración.

Antes de esta adaptación había 52 commits locales de migración sin publicar.
La publicación de `main` no incluye ese trabajo ni adelanta el corte.
Detalle del módulo en [Faltantes](../grafo/modulo/faltantes.md).

# Órdenes de compra por ciclo: borradores y reservas

Fecha: 2026-10-05, Costa Rica. Solo local, rama `independencia-alegra`.
Continúa desde `8d591e3`, tras filtros/procedencia de bodega y reportes.
Se cierran **OC-01/02/04/07**. Operativo **48 listos / 51 pendientes**,
99 IDs; independencia conserva 133/14 y sus límites de producción.

## Qué quedó listo

Reporte Proveedores tiene **Órdenes por ciclo**. Para preparar una:
Faltantes → elegir una semana concreta o Sin ciclo → abrir proveedor →
Preparar orden de este ciclo. La revisión muestra producto, código del
proveedor cuando existe, cantidad del proveedor, equivalencia propia,
faltante registrado, reserva y cantidad libre. Excedente de empaque visible;
no cubre otras semanas ni se convierte en entrada física.

Guardar crea una orden propia con proveedor/ciclo fijo, líneas por id del
producto y procedencia de cada reserva por faltante/factura/cliente/parada.
Referencias iguales no mezclan productos. Cambiar ficha/ruta/mapeo después no
reclasifica lo guardado. Históricos se eligen explícitamente como Sin ciclo.
La ficha activa se identifica por cédula; nombre solo si es exacto y único.
No se crea una ficha por adivinar a quién se compra.

Se puede modificar la cantidad, excluir productos y añadir faltantes del
mismo proveedor/ciclo. **Pendiente de enviar** exige revisión de necesidades
vigentes y bloquea líneas hasta volver explícitamente a Borrador.
Una corrección de bodega, factura anulada o proveedor reasignado requiere
revisar antes de marcar pendiente. Versión obsoleta devuelve 409.

La reserva impide que dos borradores se atribuyan el mismo faltante, incluso
si después cambia su proveedor. Al reservar 10 y aparecer otras 3, la nueva
sugerencia ofrece 3, creando otra orden sin ampliar la anterior. UUID/cuerpo
canónico hace idempotente la creación; dos reintentos concurrentes devuelven
el mismo id. Transacción y bloqueo por faltante protegen cantidades/bitácora.

Cerrar SIN envío requiere motivo, libera reservas y conserva líneas/origen/
auditoría. La orden aparece en **Historial de cierres**, aunque el proveedor
ya no figure entre los faltantes. No se borra ni reabre. Cambiar el selector
del historial no vuelve a iniciar una creación por el proveedor anterior.

## Límites que siguen abiertos

**Una reserva no es una compra enviada ni una cantidad pendiente de recibir.**
Esta parte implementa Borrador/Pendiente y cierre previo al envío. El flujo
anterior de cantidades/envío GLOBAL sigue separado; no se convierten envíos
viejos en órdenes por ciclo sin evidencia ni se deduce su cobertura.

Sigue envío propio por WhatsApp, copia revisada/PDF inmutable y destinatario,
incertidumbre/reintentos del transporte, bloqueo definitivo tras confirmación
y cantidades realmente solicitadas. Después estados Enviada/Parcial/Recibida,
factura/PDF, comparación y recepción física sin duplicar la entrada de compra.
No existe aquí un botón para «marcar recibida» sin registrar su evento físico.

No se cerraron FAL-03/04/05/06/07/08, OC-03/05/06/08/09/10 ni VAL-02 por probar
borradores. Cobertura de enviado/recepción, pedidos sin facturar, carga/entrega,
retiro POR CÓDIGO de limpieza semanal y archivo 24 h conservando historial
continúan pendientes. La limpieza no se ejecutó. Maps históricos necesitan
fuente LOCAL; revisión manual, conteo real, aceptación REAL Hacienda y corte
siguen al usuario o a su fase correspondiente.

## Verificación

- **2.032 pruebas**, 364 suites, cero fallos/omitidas; 21 casos nuevos de
  órdenes. Grafo 12 incluido; validación de ids propios detectó y corrigió
  identidad del origen antes de integrar. SQL en base desechable local.
- PostgreSQL con SAVEPOINT/ROLLBACK y dos conexiones: separación de semanas,
  reasignación de cliente/proveedor, códigos repetidos, 10+3, reserva única,
  reintentos, versión obsoleta, caída de segunda línea y bitácora atómica.
  Conversión 0,02 y cajas; resto de una millonésima no se pierde al sugerir.
  Cambiar/eliminar mapeo conserva su referencia histórica/código/conversión.
- SQL protege contexto/historial, procedencia y edición de líneas pendientes.
  Sugerencia no asigna proveedores ni cambia faltantes; migración 046 solo
  añade estructura y nunca migra borradores globales ni inventario.
- Build frontend aprobado. Chromium **1440 y 390 px**: crear, revisar,
  pendiente, volver a borrador, cerrar con motivo e historial por semana;
  sin desborde horizontal ni errores JS. HTTP 200/201/400/401/403/409:
  usuario de solo Proveedores puede operar; Clientes no obtiene ese acceso.
- Navegador escribe únicamente órdenes de su base propia; faltantes,
  stock/kardex, compras/líneas y envíos idénticos antes/después. Ningún mensaje
  real, IMAP, limpieza, Hacienda REAL, Prisma generado ni instalación.

Evidencia privada, guiones, dump y capturas en
`/private/tmp/codex-ordenes-ciclo-20261005`. No contienen credenciales impresas;
datos de prueba y respaldos quedan fuera de Git. La base desechable y los
servidores de pruebas fueron retirados después de verificar la compartida.

## Cierre local

Implementación **`004ba50`**, avance sin fusión sobre `independencia-alegra`;
sin push, deploy ni corte. 046 aplicada solo a `tachi` local 5434, respaldo
privado nuevo antes de la migración. Tres tablas nuevas con cero filas;
inventario continúa en cero provisional. Próxima migración disponible: 047.

La comprobación previa detectó acciones locales independientes durante las
pruebas: cliente/ruta/ciclo/recorrido habían cambiado y tenían bitácora de
usuario. Se detuvo la integración, se capturó ese estado y se conservó.
**19 huellas iguales antes/después de integrar y verificar** (incluyen
faltantes/ajustes/borrador anterior). Desde el inicio, las otras 15 huellas
siguen iguales; no afirmar que las cuatro con cambios independientes quedaron
idénticas al inicio. La compartida ahora conserva una ruta y un ciclo
cancelado: no borrarlos ni devolver la copia a «rutas/ciclos vacíos».

Aplicación habitual **5174 → 3002** activa con el lanzador seguro permanente;
backend PID **79992** al cerrar. Verificada solo GET: órdenes activas/historial
vacíos, API 200/401/400, selector existente y módulo frontend nuevo servido.
No abrir el reporte sin filtro para validar solo lectura: su GET anterior
puede asignar proveedores. Navegador con escritura se ejecutó solo en la
copia desechable propia, no en la compartida.

Developer `5013270`, main `e19c3e5` y servidor original 3000/PID 5370
conservados. Ninguna conexión a producción, mensaje real, ejecución de
limpieza ni cambio del árbol compartido de dependencias/Prisma.
Base propia `tachi_codex_ordenes_ciclo_20261005` y servidores 3003/5175
retirados. Evidencia/dumps privados se conservan; worktree y rama temporal
se retiran al finalizar el avance del cierre documental. Preservar archivo
fiscal, bases de ensayo y ejemplos PDF anteriores en Descargas.

## Siguiente parte

Enviar la orden persistida: preparar/revisar/descargar un PDF con referencia
OC propia, cantidades/conversión guardadas y semana, guardar bytes/huella y
destinatario/caption, confirmar resultado sin suponer recepción por el
proveedor, proteger intento incierto y no reenviar automáticamente. Sustituir
el envío global de forma explícita; convertir sus registros históricos solo
con evidencia. Luego cobertura válida pendiente de recibir y recepción.

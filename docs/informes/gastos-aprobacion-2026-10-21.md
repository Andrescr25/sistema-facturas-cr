# Gastos de contado: aprobación sencilla — 2026-10-21

El usuario pide conservar las facturas operativas en Revisión de Precios y
aprobar o rechazar, indicando sólo el medio de pago. Confirma usar la condición
de IVA ya elegida en Configuración → Hacienda. Reemplaza los formularios por
factura del primer flujo; recibir por sí solo continúa sin pagar ni aceptar.

## Resultado

- Revisión muestra Gastos por aprobar, sin relación al catálogo, con proveedor,
  categoría, fecha, importe y Aprobar/Rechazar. Paginación independiente.
- Aprobar pide sólo el medio de pago. Registra el saldo
  completo con fecha del comprobante de contado, visible antes de confirmar,
  y deja la decisión aprobada. Si ya hubo abonos, sólo paga el saldo restante.
- La aprobación y el MISMO pago de Pago Proveedores/Caja se confirman en una
  transacción. Se extrae registrarPagoEn, no se copia la lógica de pagos.
  Reversión total ante fallo; UUID, huella, versión y bloqueos compatibles con
  el registro genérico impiden doble pago/doble decisión al reintentar.
  Sólo esta aprobación admite omitir la referencia bancaria: no se inventa
  una y la API general de pagos conserva sus requisitos por método.
- Después del COMMIT prepara/envía el mensaje receptor con los servicios
  existentes. Una caída fiscal no repite pagos ni deshace un gasto pagado:
  queda visible como respuesta pendiente. La decisión es cola durable previa
  a la reserva fiscal; el trabajador retoma sólo la respuesta tras 2 minutos,
  hasta 3 días. Después conserva los reintentos del comprobante existente.
- Rechazar no paga: bloquea CxP y anula la compra documental sin inventario.
  Envía mensaje 3 con importes cero. No anula la factura original del proveedor
  ni elimina archivos. Con pagos/notas aplicados exige revisión previa.
- Gastos operativos abre en Aprobados: proveedor/categoría/fecha/total/medio,
  pagos, originales y estado fiscal real. Rechazados consultables aparte.
  La ficha confirmada no muestra formularios de renta/IVA. Sólo afirma
  aceptación fiscal al recibir el estado correspondiente de Hacienda.
- Rechazados se conservan en el Excel del contador, fuera de sus totales e
  importes aprobados. No cambian el formato nuevo ni los reportes antiguos.

## Tratamiento fiscal confirmado y límites

Se consulta la configuración existente, no se elige un valor fiscal por omisión.
01 acredita únicamente el IVA elegible guardado del XML y el resto es gasto;
04 no acredita; 05 conserva importes pendientes sin enviarlos como ceros.
Un comprobante sin IVA elegible declara sin crédito. Impuesto único de
combustible no se convierte en IVA. La aprobación confirma uso de la actividad;
no se piden empleado, placa, descripción ni una revisión de impuestos por factura.

Se consultaron [Anexos y Estructuras v4.4 de Hacienda](https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf)
y su [guía del crédito fiscal](https://www.hacienda.go.cr/docs/CreditosFiscales.pdf).
Se mantienen emisor/receptor, clave, fecha, totales y XML originales; se envía
mensaje receptor, no otra compra electrónica. No se interpreta un rechazo del
receptor como anulación del comprobante emitido por el proveedor.

Moneda extranjera y XML sin validar no habilitan un pago automático en colones.
Un rechazo local sin XML válido se conserva con motivo pendiente de respuesta;
no inventa un envío a Hacienda. Revalidar después no libera una cuenta rechazada.
La excepción fiscal de compra anulada sólo permite el rechazo explícito del
gasto, sin abrir emisión/aceptación de otras compras anuladas.

## SQL y conservación

SQL062 agrega decisión/actor/fecha, huella, condición confirmada y referencia al
pago existente. No otra cartera ni saldo guardado. Sólo reconoce decisiones
anteriores con revisión y respuesta fiscal preparada o pago completo comprobado;
no marca una mera revisión pendiente como pago. No fabrica pagos históricos.

061 ya está en producción; **062 sólo se aplica localmente en esta entrega**.
No se publica a main sin aplicarla antes. La rama incluye también 6e26d9d,
el formato Excel del contador preparado en el pedido anterior.

## Verificación

Todas las escrituras usan copias locales desechables. Sin regenerar Prisma,
instalar dependencias, mensajes reales, prueba en producción ni limpieza semanal.
Evidencia privada: `/private/tmp/codex-gastos-aprobar-20261021/`.

- Suite completa sobre clon recién restaurado: **237 archivos, 2941 pruebas
  correctas, cero fallos y 3 omisiones históricas de corte**, que requieren
  inventario en cero. Sin poner en cero el inventario existente para probar.
  La prueba previa de preparación WhatsApp confundía referencias numéricas
  de facturas con las de órdenes: ahora cuenta sólo `tipo='orden_compra'`.
  No cambia ningún envío. Cierre dirigido adicional: 68 pruebas correctas,
  incluidos pagos genéricos, aprobación PostgreSQL, estructura y grafo.
- Diez casos PostgreSQL reales nuevos: recepción pendiente, pago total/Caja,
  configuración fiscal, doble clic/concurrencia/reintento, rechazo sin pago,
  reversión por fallo al guardar, recuperación tras caída fiscal, métodos/
  versión y aprobación sin referencia bancaria, condiciones 04/05, conservación de costos/precios y
  reintento después de anular un pago, sin volver a pagar por sí solo.
  Las facturas fiscales ficticias no ocupan la cola de otros ensayos; se
  restaura la configuración previa incluso cuando no existía antes del caso.
- Chromium: **49 comprobaciones correctas**, 390/700/1440 px, sin errores JS,
  seis envíos fiscales simulados. Flujo completo desde Revisión, medio de pago,
  confirmación/doble clic, salida de pendientes, lista/ficha de Aprobados y
  Rechazados, sin formularios adicionales ni botones de pago en rechazados.
  Permisos por HTTP: Revisión puede decidir sin abrir pagos genéricos/lista
  general; Gastos no abre la decisión del otro módulo; sin sesión da 401.
  Incluye un método que pide referencia en pagos genéricos: esta aprobación
  sólo pide medio y conserva referencia NULL, sin inventar datos bancarios.
- Build frontend y lint de los archivos modificados correctos. Capturas móvil
  y escritorio inspeccionadas. Las advertencias habituales del build por tamaño
  de paquetes no corresponden a este formulario.

Vista local 5173/3000 se conserva para revisión, con el clon limpio y SQL062.
Se aplicó con respaldo local previo y comparación de las 107 tablas locales:
todos sus datos anteriores se conservan idénticos. Consultas autenticadas de
Revisión/Gastos y salud: 200; sin datos ficticios en la vista compartida.
Las bases de suite/navegador se retiran al cerrar, con sus datos ficticios ZZ.
Entrega en developer; producción pendiente de GO-14.

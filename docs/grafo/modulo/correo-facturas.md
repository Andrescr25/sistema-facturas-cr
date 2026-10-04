---
id: modulo/correo-facturas
tipo: modulo
titulo: Facturas por correo — PDF propio y destinatario confirmado
estado: vigente
archivos:
  - backend/src/modules/facturacion/facturaCorreo.service.js
  - backend/src/modules/facturacion/facturaPropia.controller.js
  - backend/src/modules/facturacion/facturacion.routes.js
  - backend/src/modules/facturacion/factura.pdf.js
  - backend/services/mailer.js
  - backend/config/aislado.js
  - backend/tests/facturaCorreo.test.js
  - frontend/src/services/facturacionService.js
  - frontend/src/hooks/useFacturasEmitidas.js
  - frontend/src/components/facturacion/PanelFacturasEmitidas.jsx
  - frontend/src/components/facturacion/VistaFactura.jsx
  - frontend/src/components/facturacion/ModalEnviarFacturaCorreo.jsx
aristas:
  relacionado: [modulo/facturacion, modulo/permisos, leccion/un-borrador-no-es-una-venta, leccion/la-db-local-es-produccion]
medido: 2026-10-04
---

ENTRADA. Facturación → Facturas → abrir una emitida → Correo. El modal
muestra remitente, destinatario editable, asunto, mensaje y PDF adjunto.
No ofrece enviar borradores o anuladas; el servidor también lo exige.

DECISIÓN DEL USUARIO, registrada en el relevo de Claude del 2026-10-04:
salir de la misma cuenta que recibe las facturas. Se reutiliza `mailer`,
que por omisión usa la cuenta del buzón; no se crea otro transporte ni
se conecta a IMAP. Si se configura SMTP aparte, esa configuración prevalece
y la pantalla muestra su remitente. La petición no elige remitente,
adjuntos ni enlaces: el servidor genera y adjunta el PDF propio.

CONTRATO. GET `/api/facturacion/facturas/:id/correo` propone el correo de
la ficha actual; si la ficha existe pero se quitó su correo, no resucita
el antiguo de la factura. Si no hay ficha, propone la fotografía histórica
para revisión. Datos vacíos o ilegibles se dejan vacíos. No modifica la
ficha ni la fotografía del PDF. POST de la misma ruta recibe únicamente
`para`, `asunto`, `mensaje`. Exige una dirección explícita, sin listas,
objetos o sintaxis de nombres; asunto de hasta 200 caracteres sin CR/LF,
mensaje de hasta 4.000. Las dos rutas heredan sesión y permiso Facturación.

RESULTADO. Solo confirma aceptación si SMTP aceptó al destinatario y no lo
rechazó. Eso no demuestra recepción en su buzón. No hay reintentos
automáticos: un fallo de conexión puede ocurrir después de aceptar el correo.
La pantalla pide revisar los enviados antes de volver a intentar. Los errores
SMTP se traducen a mensajes controlados, sin respuesta SMTP cruda ni
credenciales en logs. El modal bloquea duplicados y cierre durante el envío;
tras aceptación ofrece cerrar, sin volver a enviar con el mismo formulario.

AISLAMIENTO. `salidasBloqueadas` frena el POST antes de consultar o generar
PDF (423); el mailer conserva su segunda guarda. GET permite revisar la
propuesta y la pantalla indica el bloqueo, con Enviar deshabilitado. No se
activaron llaves de escape. No cambian tablas, stock, deuda o consecutivos.

VERIFICACIÓN. `facturaCorreo.test.js` usa el mailer real con nodemailer
sustituido antes de importarlo, PDF real y correos `example.test`: ficha
actual/vacía/ausente, destinatario confirmado, remitente del buzón, PDF,
validaciones, borrador/anulada/inexistente, falta de configuración, bloqueo,
rechazo SMTP y fallo sin filtraciones ni reintentos. El navegador verifica
el bloqueo real y los estados de aceptación/rechazo con respuestas simuladas.
La recepción real con la cuenta elegida se comprueba al habilitar salidas
en el ensayo del corte; no se envían correos reales para desarrollar.

CIERRE VERIFICADO. 14 comprobaciones dirigidas; suite completa con pruebas
PostgreSQL activadas: 1.804 aprobadas, cero fallos/omitidas. Build aprobado.
Chromium 1440/700 px, 401 sin sesión, 403 sin Facturación, 423 en la copia
aislada; aceptación/rechazo simulados y sin errores JS ni correos reales.

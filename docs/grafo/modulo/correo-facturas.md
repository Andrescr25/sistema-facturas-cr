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
  - backend/src/modules/facturacion/notaCreditoCorreo.service.js
  - backend/src/modules/facturacion/notaCreditoConsulta.service.js
  - backend/src/modules/facturacion/notaCredito.pdf.js
  - backend/tests/notaCreditoCorreo.test.js
  - backend/tests/notaCreditoPdf.test.js
  - backend/tests/notaCreditoConsulta.test.js
  - backend/services/mailer.js
  - backend/config/aislado.js
  - backend/tests/facturaCorreo.test.js
  - frontend/src/services/facturacionService.js
  - frontend/src/hooks/useFacturasEmitidas.js
  - frontend/src/components/facturacion/PanelFacturasEmitidas.jsx
  - frontend/src/components/facturacion/VistaFactura.jsx
  - frontend/src/components/facturacion/ModalEnviarFacturaCorreo.jsx
  - backend/src/modules/facturacion/papelFiscal.pdf.js
  - backend/src/integrations/hacienda/lectura.service.js
  - backend/tests/papelFiscal.test.js
aristas:
  relacionado: [modulo/hacienda, modulo/facturacion, modulo/permisos, leccion/un-borrador-no-es-una-venta, leccion/la-db-local-es-produccion]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


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

HACIENDA (2026-10-05): [[modulo/hacienda]] describe configuración, emisión y
seguimiento fiscal separados; no repetir el movimiento comercial al enviar.

ENTREGA AUTOMÁTICA DE LA FACTURA ELECTRÓNICA (2026-10-11). Es la excepción a
"una persona confirma el destinatario", pedida por el usuario: «esta factura
se le tiene que enviar al cliente por correo el pdf con los 2 XML».
`entregarFacturaElectronica(id)` la llama el módulo fiscal cuando Hacienda
acepta una factura en producción ([[modulo/hacienda]], "UN CLIC EMITE"):

- va al correo de la FICHA del cliente, con las mismas reglas de arriba (un
  solo buzón; un correo quitado de la ficha no se resucita);
- adjunta el PDF, el XML firmado y la respuesta de Hacienda, y se niega a
  mandar el PDF solo si la factura todavía no trae su comprobante aceptado;
- NO LANZA: devuelve `enviado`, `sin_correo` o `error` con un motivo sin datos
  del servidor de correo. La factura ya está aceptada y eso no depende de un
  correo;
- no reintenta sola (un envío incierto repetido son dos correos al cliente);
  la persona lo repite desde el panel de la factura.

El botón Correo de siempre no cambió: sigue pidiendo confirmar destinatario,
asunto y mensaje, y sirve también para una factura sin emitir. Siete pruebas
nuevas en `facturaCorreo.test.js`, con nodemailer sustituido.

Pendiente del usuario: ver llegar el primer correo real. En el servidor tiene
que estar configurada la cuenta del buzón; si no, el panel de la factura dice
«El envío de correo todavía no está configurado» y la factura queda aceptada.

LA NOTA DE CRÉDITO TAMBIÉN SE ENTREGA, Y AHORA TIENE PAPEL (2026-10-11,
noche). El usuario revisó Facturación en producción y avisó: «en nota de
crédito está faltando enviar la nota de crédito por correo al cliente, el pdf
con sus xml». Faltaban dos cosas, no una: el envío y el PDF, porque la nota
nunca tuvo papel propio.

- **El PDF** (`notaCredito.pdf.js`) se dibuja con el código de la factura:
  `generarPdfFactura(documento, empresa, papel)` recibe en `papel` lo que cada
  papel dice distinto (título, datos de arriba, condiciones junto al cliente,
  observación y si lleva las cuentas para pagar). El de la factura lo arma
  `papelDeFactura`; el de la nota, `papelDeNota`: «NOTA DE CRÉDITO
  ELECTRÓNICA» con su consecutivo si Hacienda la aceptó, **a qué factura se
  aplica** (sale de la clave que la nota FIRMÓ; si no es electrónica, del
  número de la factura), el motivo, y sin términos de pago: una nota le
  devuelve al cliente, no le cobra.
- **La nota entera** la arma `notaCreditoConsulta.obtenerNota`, con la misma
  forma que `obtenerFactura`. Teléfono, dirección y correo del cliente salen
  de la copia fija de su factura (la nota guarda solo nombre y cédula).
  `lectura.service.notaAceptada` lee su comprobante por la nota, porque la
  nota no guarda el id.
- **El envío** (`notaCreditoCorreo.entregarNotaElectronica`) sigue las reglas
  de la factura y usa sus piezas, que quedaron como funciones de
  `facturaCorreo.service.js` (`correoDeFicha`, `adjuntosFiscales`,
  `exigirCorreoConfigurado`, `despachar`): correo de la ficha, solo una nota
  emitida y aceptada, PDF + los DOS XML de la nota, no lanza y no reintenta.
- **Se puede ver**: `GET /api/facturacion/notas-credito/:id/pdf`, botón «Ver
  PDF» en la tarjeta de cada nota (electrónica o no).

DOS DEFECTOS DEL PDF QUE APARECIERON AL MIRARLO, y que también tenía la
factura. (1) La letra chica decía «No constituye un comprobante electrónico
autorizado por el Ministerio de Hacienda» en TODOS los papeles, incluida una
factura electrónica aceptada: la frase es de cuando todo era factura de
venta. Ahora un comprobante aceptado dice que es su representación impresa y
que lo válido es el XML firmado (`leyenda`). No se cita ninguna resolución:
no se pudo confirmar el texto oficial, y una cita equivocada en un papel que
va al cliente es peor que ninguna; si el contador la pide, es una línea.
(2) La observación se escribía a la misma altura que el monto en letras y
quedaban encimadas; ahora va debajo, la dibuja `totales` y salta de página
con ellos. El título, además, se achica hasta caber en un renglón.

Pruebas: `notaCreditoPdf.test.js`, `notaCreditoCorreo.test.js` (nodemailer
sustituido), `notaCreditoConsulta.test.js` (base de mentira) y tres casos
nuevos en `haciendaUnClicPg.test.js`. Chromium real con Hacienda y correo
simulados: nota aceptada con su correo, sin correo en la ficha, correo que
falla, y nota sobre una factura de venta común; el PDF se abrió y se miró.

## El papel de una electrónica muestra lo que dice su XML — 2026-10-24

QUÉ PIDE LA NORMA. La representación gráfica «deberá mostrar el contenido de
los comprobantes electrónicos, de forma legible» (MH-DGT-RES-0027-2024, art. 5;
el Decreto 44739-H, art. 2 inciso 24, la define como el «documento impreso que
expresa el contenido»). No hay lista de campos ni leyenda obligatoria. El QR
del mismo artículo está SUSPENDIDO (Transitorio III) hasta que la DGT lo
comunique: no se imprime. Fuentes leídas el 2026-10-24 en hacienda.go.cr.

QUÉ FALTABA y ahora va, SOLO cuando el comprobante está aceptado
(`papel.fiscal`; la factura de venta sale pixel por pixel igual):
- encabezado: fecha de emisión legible (con la hora firmada), «Aceptada por
  Hacienda» y el proveedor de sistemas;
- cliente: «Crédito a N días» (plazo firmado), medio de pago con su código y
  la actividad del receptor si va en el XML;
- cada línea: unidad, subtotal, total con IVA y motivo del descuento;
- debajo de los totales, el recuadro «Resumen del comprobante electrónico»:
  gravado, exento, venta, descuentos, venta neta, IVA por código de tarifa,
  impuesto y comprobante (servicios/mercancías y otros, solo si no dan cero).

DE DÓNDE SALE: del XML aceptado (`lectura.service.js`, `contenidoDelXml`), no
de la base. El XML trae la ubicación del emisor en códigos: `conNombres` pone
los nombres de Configuración solo si los códigos configurados son los
firmados. Teléfono y términos de pago (las cuentas) salen de Configuración,
como en la factura de venta: antes la electrónica salía sin ellos.

Lo fiscal se dibuja en `papelFiscal.pdf.js` (el archivo de la factura estaba
en el tope de 700 líneas; `medioDePago` pasó a `utils/marcaPdf.js`). Vale
igual para la nota de crédito electrónica. Pruebas: `papelFiscal.test.js`,
con un XML armado por el mismo `generarVenta` que va a Hacienda.

PENDIENTE (no se hizo): una electrónica todavía sin aceptar se imprime como
«FACTURA DE VENTA». Hoy no le llega al cliente así (se imprime y se envía al
aceptarse), pero el art. 18 del reglamento pide entregar el papel aunque
falte la confirmación.

---
id: modulo/whatsapp
tipo: modulo
titulo: WhatsApp — adentro del sistema con Baileys, con Evolution API de respaldo durante la mudanza
estado: vigente
archivos:
  - backend/src/integrations/whatsapp/whatsapp.client.js
  - backend/src/integrations/whatsapp/conexion.js
  - backend/src/integrations/whatsapp/sesionDb.js
  - backend/src/integrations/whatsapp/turno.js
  - backend/src/modules/admin/admin.controller.js
  - frontend/src/components/configuracion/SeccionWhatsApp.jsx
  - backend/tests/whatsappInterno.test.js
  - backend/tests/erroresWhatsApp.test.js
aristas:
  relacionado: [leccion/telefonos-sucios, leccion/la-db-local-es-produccion]
medido: 2026-09-29
---

Todo lo que el sistema manda por WhatsApp (orden de compra, factura,
cotización, saldo, invitación al portal, aviso de pedido) pasa por
`whatsapp.client.js`: `enviarTexto` y `enviarDocumento`. El número se valida
siempre ahí ([[leccion/telefonos-sucios]]). Nada sale automático: botón y
confirmación (decisión del usuario).

DOS CANALES (2026-09-29). Antes era solo Evolution API, un servicio aparte en
Render gratis que se suspendía antes de fin de mes. Ahora Baileys (la misma
librería que Evolution usa por dentro) corre en este servidor
(`conexion.js`), encendido con `WHATSAPP_PROVEEDOR=interno`. El cliente
elige: adentro si está conectado; si está vinculado pero reconectando, espera
hasta 20 s; si no, Evolution mientras `WHATSAPP_API_URL` exista. Así la
mudanza no corta los envíos. Antes de mandar se pregunta a WhatsApp si el
número existe (`onWhatsApp`): un fijo falla con un mensaje claro.

LO QUE NO SE PUEDE ROMPER

- **Apagado por omisión.** Sin la variable no crea tablas ni conecta: el
  backend local usa la base de PRODUCCIÓN
  ([[leccion/la-db-local-es-produccion]]) y no debe disputarle la sesión a
  Render. Nunca poner `WHATSAPP_PROVEEDOR=interno` en el `.env` local.
- **La sesión vive en la base** (`whatsapp_sesion`, una fila por llave):
  el disco de Render se borra en cada despliegue. Baileys actualiza llaves en
  cada mensaje; sin guardarlas, los mensajes dejan de llegar.
- **Una sola copia conectada** (`whatsapp_turno`, dueño + vencimiento de 60
  s): Render levanta la copia nueva antes de apagar la vieja, y dos
  conexiones con la misma sesión se echan mutuamente ("connectionReplaced")
  y corrompen las llaves. `pg_advisory_lock` no sirve: el pooler de Supabase
  (puerto 6543) no garantiza la misma conexión. Al apagarse (SIGTERM) se
  cierra SIN desvincular y se suelta el turno.
- **No aparece "en línea"** (`markOnlineOnConnect: false`): si no, el
  teléfono del dueño deja de sonar con los mensajes que le llegan.

VINCULAR: Configuración → WhatsApp → "Vincular con código QR" (lo
principal: WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y
se apunta la cámara; el QR se renueva cada ~20 s y la pantalla pregunta cada
3 s) o, como alternativa, con el número del celular y un código de 8
caracteres. Las rutas son `/api/admin/whatsapp` (estado, con el QR vigente),
`/vincular` (`{ modo: 'qr' }` o `{ modo: 'codigo', telefono }`) y
`/desvincular`: bajo `/admin`, o sea del módulo Configuración.

EL "NAVEGADOR" TIENE QUE SER UNO QUE WHATSAPP CONOZCA. El primer intento en
producción falló con "No se pudo vincular el dispositivo", código tras
código: con `Browsers.ubuntu('Sistema Facturas')` Baileys declaraba el
dispositivo como "otro cliente web" (tipo 9) y WhatsApp lo rechaza. Con
'Chrome' es tipo 1 (medido: el tipo va al final del texto del QR). En el
teléfono aparece como "Chrome (Ubuntu)". `whatsappInterno.test.js` lo
verifica contra la tabla de la propia librería.

"VINCULADO" NO ES `creds.registered`. Baileys solo la pone en true al
vincular con el código; con el QR queda en false para siempre. En
producción el sistema, vinculado con QR, se "desconectó de la nada" al
primer corte (reinicio o red): al releer la sesión creía que no había
teléfono y no reconectaba, mientras el teléfono lo mostraba conectado.
Vinculado es `sesionCompleta(creds)`: `me` + `account` (la identidad firmada
que llega con "pair-success", por cualquiera de los dos caminos).

Baileys es 7.0.0-rc14, fijo (ESM: se carga con `import()` desde CommonJS;
pide Node 20). Se instaló con `--ignore-scripts` para no regenerar Prisma
(ver bloqueo de Prisma); ninguna dependencia necesita scripts al instalar.

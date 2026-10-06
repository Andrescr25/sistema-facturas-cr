---
id: modulo/preventa-por-enlace
tipo: modulo
titulo: Preventa por cliente y ciclo, PDF con fotos y enlace que no concede acceso
estado: vigente
archivos:
  - backend/src/modules/precios/ofertasPorBaja.js
  - backend/src/utils/descuentosExceso.js
  - backend/src/modules/productos/taxonomiaTablas.js
  - backend/package.json
  - backend/src/modules/portal-clientes/preventaPdf.service.js
  - backend/src/modules/portal-clientes/preventaFotos.service.js
  - backend/src/modules/portal-clientes/preventa.pdf.js
  - backend/tests/preventaPdf.test.js
  - backend/tests/preventaFotos.test.js
  - backend/server.js
  - backend/src/utils/urlParaRegistro.js
  - backend/src/modules/portal-clientes/preventa.service.js
  - backend/src/modules/portal-clientes/portal-clientes.service.js
  - backend/src/modules/portal-clientes/portal-clientes.routes.js
  - backend/src/modules/portal-clientes/portal-clientes.controller.js
  - backend/src/modules/portal-clientes/portal-clientes.cliente.service.js
  - backend/src/modules/envios-whatsapp/envios.service.js
  - frontend/src/components/clientes/VistaRutas.jsx
  - frontend/src/components/clientes/ModalPreventa.jsx
  - frontend/src/hooks/usePreventaCliente.js
  - frontend/src/pages/CatalogoClientes.jsx
  - frontend/src/components/catalogo-clientes/ModalPedido.jsx
  - frontend/src/components/catalogo-clientes/PanelPedido.jsx
  - frontend/src/pages/portal/PortalIngresar.jsx
  - frontend/src/pages/portal/PortalActivar.jsx
  - frontend/src/services/apiPortal.js
  - frontend/src/utils/enlacePreventa.js
  - backend/tests/preventaEnlaces.test.js
aristas:
  depende_de: [modulo/rutas-clientes, modulo/portal-clientes, modulo/pedidos-por-ciclo]
  relacionado: [modulo/whatsapp, modulo/permisos, decision/ciclo-de-ruta-como-contexto, modulo/gestion-catalogo, decision/orden-canonico-compartido, leccion/dos-clases-de-oferta]
medido: 2026-10-05
---

Tercera parte. Clientes → Rutas → Ver recorrido de un ciclo en preventa →
Preparar catálogo por cliente. El enlace usa la portada personal existente
(habituales, productos que dejó de llevar y ofertas), detrás de la sesión del
portal; el catálogo general sigue público. No existe una portada ajena pública.
El ciclo actual en preparación/entrega y los ciclos en preventa permanecen
visibles por ruta/semana. Preparar/copiar jamás manda un mensaje.

El contexto `pv1.clienteId.cicloId.firma` lleva HMAC SHA-256 con dominio
`preventa-ciclo-v1`, secreto del portal y comparación en tiempo constante. No
es un JWT ni una invitación y nunca sirve en Authorization. Es estable por
cliente/ciclo; preparar otra copia no invalida mensajes anteriores. No lleva
nombre, Maps, teléfono o historial. No se guarda en tablas, logs o bitácora;
no requiere migración 046. Rotar el secreto del portal invalida estos enlaces
y las sesiones anteriores. No hay vencimiento artificial por día: dejan de
servir al cerrar/cancelar el ciclo, revocar la cuenta o desactivar la ficha.

Staff GET `/portal-clientes/clientes/:id/preventa?cicloId=...` conserva ACL
Clientes y exige miembro del recorrido fijo, ficha activa y ciclo en preventa.
El modal ofrece copiar el enlace, preparar/revisar/descargar PDF con fotos y
WhatsApp; reutiliza los teléfonos propios y la
pantalla compartida para revisar número/texto. POST `/preventa/whatsapp`
vuelve a comprobar destinatario/contexto y presencia del enlace en el mensaje.
`enviarYRegistrar` anota éxito/fallo como tipo `preventa`, referencia
`cicloId:clienteId`. El registro conserva quién/cuándo/número, sin texto o token. Los logs HTTP
registran solo la ruta, con token de invitación oculto y sin query en URL o
Referer; evitan guardar también el contexto firmado de preventa.
La pantalla consulta ese historial antes de reenviar; el aislamiento sigue
bloqueando el transporte REAL en esta rama (423, registro de fallo).

Cliente sin usuario puede recibir PDF/enlace y pedir por WhatsApp sin crear
una cuenta. El personal registra lo confirmado en Facturación con su ciclo;
una respuesta no crea automáticamente un pedido. Para pedir en línea: botón opcional `/preventa/invitacion` reutiliza la
invitación de un solo uso, guardando únicamente su hash. Bloquea ficha/cuenta
y crea invitación en una transacción; una cuenta revocada requiere la acción
habitual de Cuentas y nunca se reactiva por preparar un catálogo. Se comparte
la invitación con `?preventa=...`; tras activarse llega al catálogo elegido.
Cerrar sin copiar una invitación exige generar otra: se mantiene su contrato.

GET `/portal/preventa?token=...` exige `requireCliente`. El cliente se deriva
de la cuenta; incluso otro miembro de la MISMA ruta/ciclo recibe 404 al abrir
ese enlace. La respuesta enumera solo id/rutaId/rutaNombre/semana/orden/estado.
Entrar, activar y redirigir por 401 conservan el contexto mediante destinos
internos construidos por el frontend. El enlace no selecciona otra cuenta.

CatalogoClientes bloquea los controles del pedido mientras comprueba el
enlace o cuando no es válido; muestra la semana fuera del selector para móvil.
ModalPedido vuelve a resolverlo, fija su semana y manda `preventaToken` junto
a `cicloId`. La transacción de crearPedido comprueba cliente, firma, igualdad
de ciclo y estado abierto antes de consumir el carrito. Su bloqueo compartido
del ciclo espera al cierre concurrente. Un 400/404/409 conserva el carrito,
nunca cambia a Sin ciclo o a otra semana. El cliente puede salir del enlace
explícitamente y elegir una semana desde su catálogo general. Pedidos ya
recibidos conservan su contexto aunque luego cierre el ciclo.

Verificación: doce casos PostgreSQL con ROLLBACK, sumados a los once de
documentos por ciclo; 23 aprobados sin fallos/omitidos. Compilación aprobada.
La prueba de transporte retira NODE_TEST_CONTEXT únicamente durante la
comprobación del bloqueo real; ningún proveedor externo recibe peticiones.
Suite final: 1.974 aprobadas, cero fallos/omitidas; grafo 12 y build aprobados.
Chromium 1440/390 verificó copia, bloqueo real 423/registro, nueva invitación,
activación/login con semana, pedido por enlace, cuenta ajena 404 y cierre 409
con carrito intacto. Sin errores JS/desborde y logs sin tokens. Checklist
PRE-03/04/10 y FIL-03 cerrados (30/61). Evidencia y límites en
`docs/informes/preventa-enlaces-2026-10-05.md`.
Preparación/bodega, faltantes/compras/recepción y archivo 24 h siguen pendientes.

Integrado localmente como `7d44a3e`; aplicación habitual 5174→3002 verificada
SOLO GET y 16 huellas de negocio idénticas antes/después. Sin nueva migración,
fixtures compartidos, mensajes reales o cambios a producción/developer/main.

## Ampliación: PDF con fotos, 2026-10-05

POST staff `/portal-clientes/clientes/:id/preventa/pdf` recibe cicloId y alcance
`completo`/`seleccion`; GET `.../pdf/:pdfId?cicloId=...` descarga exclusivamente
su copia, con sesión/ACL Clientes y Cache-Control private,no-store. El UUID
no es una autorización. Generar/descargar/enviar revalida ficha, recorrido fijo,
cuenta no revocada y ciclo en preventa. No hay ruta pública de PDF.

`modeloCatalogo` consulta TODOS los visibles del maestro, sin límite de página
ni filtro por stock. Selección incluye habituales/perdidos de ESA ficha, TODAS las rebajas
vigentes y liquidaciones activas. Completo incluye el resto. Los dos alcances
agrupan todo por categoría y subcategoría; sin selección cae al completo,
con aviso. Ninguna promoción vive en una sección duplicada. El precio con IVA y descuento usa
consultaProducto/mapProducto; las bajas solo imprimen precio anterior cuando
el precio nuevo sigue vigente. Lista blanca sin costos, márgenes, saldos,
fiscal, Maps, cantidades de compras o historial de terceros.

Cada tarjeta imprime foto grande, nombre, código propio P-id, referencia y
precio con IVA, con dos tarjetas por fila. Oferta/Liquidación son etiquetas
y el precio anterior se tacha cuando supera el actual. Cliente/ruta/semana y referencia R-ciclo/C-cliente se repiten por hoja;
las indicaciones para pedir quedan en el mensaje de WhatsApp. Por petición
del usuario se retiró el bloque explicativo del PDF.
PDFKit usa la marca y fuentes existentes. Sharp 0.35.5, ya disponible en el
árbol compartido, queda declarado en package.json sin instalar ni cambiar
node_modules/Prisma. Convierte fotos a JPEG 480×360, calidad 72, sin alterar
originales. Miniaturas privadas por ruta/fecha/tamaño y cuatro trabajos a la
vez; límite de original 8 MB y 24 megapíxeles. realpath impide salir de RAIZ,
incluso mediante enlaces simbólicos. Fotos externas requieren HTTPS sin
credenciales, descargarImagen comprueba redes internas y cada redirección;
no se renuevan firmas vía Alegra. Aislamiento/pruebas bloquean fotos remotas.
Ausencias/fallos dicen «Sin imagen» en el PDF y muestran su cantidad antes
de enviar; no imprimen/loguean URL firmada ni error remoto.

Guardar PDF/JSON privado en RAIZ_PRIVADA/preventa-pdf, UUID, archivos 0600,
directorio 0700 y SHA-256. Límite final 20 MB. Descargar/enviar reutiliza los
mismos bytes revisados aunque cambien precios. Un hash alterado da 409;
cliente/ciclo ajenos 404. Al elegir otro alcance, el frontend invalida el
adjunto, exige preparar de nuevo y revoca su URL blob al reemplazar/cerrar.
Preparar no envía, no crea cuenta/invitación/pedido ni toca tablas de negocio.
Invitación opcional reutiliza el flujo anterior. El modal WhatsApp muestra el
archivo/productos además del número/texto. POST /whatsapp exige pdfId y enlaza
Buffer + caption en UN envíoDocumento. Se registra éxito/fallo, tipo preventa,
referencia cicloId:clienteId; el historial de envíos no cambia.

No hay purga automática de estos PDF/miniaturas; conservar el directorio
privado al cambiar almacenamiento de despliegue. El archivo individual 24 h
solicitado corresponde a órdenes de compra recibidas, aún pendiente, y no
borra estos adjuntos ni documentos fiscales.

Evidencia actualizada: `docs/informes/preventa-pdf-2026-10-05.md`. Las cifras
anteriores documentan la tercera parte; el informe nuevo gobierna el relevo.

Integración PDF local `05cb0fe`, 1.991 pruebas aprobadas, 17 de PDF/fotos
repetidas tras retirar el bloque a petición del usuario, grafo 12 y build.
Chromium 1440/390 aprobado; compartida 5174→3002 solo GET, 16 huellas
idénticas, sin nuevos ciclos/negocio/stock. Operativo 34/61. Ejemplo real con
60 productos/fotos en Descargas; cuenta/recepción REAL de WhatsApp no probada.

## Categorías, promociones y tarjetas — ampliación visual 2026-10-05

El PDF usa categoria_producto/ producto.subcategoria_id y categoriasEnOrden
para el orden y nombre visible de Gestión/el agente. Subcategoría activa de
esa categoría: orden manual, empate natural, Otros al final. Una subcategoría
inactiva o de otra categoría no esconde el producto. Se comprueba paridad del
orden de subcategorías con el helper canónico del frontend, que sigue sin
imports. No se modifica clasificación, precios ni inventario para publicar.

ofertasPorBajaDePrecio({limite:null}) es una opción interna para el PDF: incluye
todas las rebajas y conserva el tope 40/100 de las rutas públicas. Solo se
etiqueta Oferta si el precio base actual coincide con la baja vigente. Si
además hay liquidación, la comparación usa precioLista; el precio final sale
de mapProducto una sola vez. Puede tener ambas etiquetas en una única ficha.
Regalías o porcentajes ≥100 no son liquidaciones vendibles; SQL_VIGENTES ahora
aplica explícitamente ese techo coherente con su contrato documentado.
Historia o stock físico cero no reactivan una liquidación. Esto no impide
incluir productos normales con cero stock del negocio intermediario.

Las categorías/subcategorías contienen también las ofertas y liquidaciones:
no hay «Tus habituales»/«Ofertas»/«Liquidaciones» como secciones del PDF. La
selección sigue personal; la portada del portal conserva su diseño anterior.
El renderer reserva encabezado + primera fila juntos, repite contexto y
clasificación al cambiar de página, mide nombres sin truncarlos y dibuja
foto arriba/datos abajo. La cache de miniaturas cambia de versión para no
reutilizar imágenes pequeñas. Guardar/revisar/enviar una copia mantiene hash
y bytes inmutables. El caption empieza «Te enviamos nuestro CATÁLOGO DE
PRODUCTOS en PDF…». El bloque de instrucciones retirado no vuelve al PDF.

Evidencia y relevo actual en `docs/informes/catalogo-visual-2026-10-05.md`.

Verificado: 1.999 pruebas, ocho casos nuevos de taxonomía/promociones, grafo
12, build y Chromium 1440/390. Completo con 1.859 productos/1.827 fotos,
16.773.686 bytes (bajo 20 MB). Selección real con 58 productos/58 fotos y
15 ofertas. Sin liquidaciones activas locales; prueba aislada con rollback.
Checklist vigente 38/61. El informe visual sustituye las cifras de diseño
anteriores para el relevo; conserva sus entregas y evidencia histórica.

Integrado solo local en 427e257, aplicación 5174→3002 verificada SOLO GET y
16 huellas iguales en compartida. Stock cero e históricos conservados, sin
ciclos demo. Base/servidores de prueba retirados; reserva se libera al
cerrar. Developer/main/original 3000 conservados. Sin push ni mensajes.

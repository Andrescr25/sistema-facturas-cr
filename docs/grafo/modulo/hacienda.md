---
id: modulo/hacienda
tipo: modulo
titulo: Hacienda — integración fiscal separada, XML 4.4 y estados duraderos
estado: vigente
archivos:
  - backend/src/integrations/hacienda/README.md
  - backend/src/integrations/hacienda/package.json
  - backend/src/integrations/hacienda/rutas.js
  - backend/src/integrations/hacienda/configuracion.service.js
  - backend/src/integrations/hacienda/emision.service.js
  - backend/src/integrations/hacienda/numeracion.js
  - backend/src/integrations/hacienda/lectura.service.js
  - backend/src/integrations/hacienda/trabajador.js
  - backend/src/integrations/hacienda/transporte/cliente.js
  - backend/src/integrations/hacienda/seguridad/almacen.js
  - backend/src/integrations/hacienda/firma/xades.js
  - backend/src/integrations/hacienda/firma/certificado.js
  - backend/src/integrations/hacienda/xml/v4.4.js
  - backend/src/integrations/hacienda/xml/validar.js
  - backend/tests/haciendaValidadorXsd.test.js
  - backend/tests/haciendaUsuarioAmbiente.test.js
  - backend/src/integrations/hacienda/esquemas/v4.4/fuentes.json
  - backend/migrations/independencia/043_hacienda.sql
  - frontend/src/integrations/hacienda/ConfiguracionHacienda.jsx
  - frontend/src/integrations/hacienda/DocumentoFiscal.jsx
  - frontend/src/integrations/hacienda/BotonEmitirFactura.jsx
  - frontend/src/integrations/hacienda/PanelEmisionFactura.jsx
  - frontend/src/integrations/hacienda/useEmisionFactura.js
  - frontend/src/integrations/hacienda/emisionPasos.js
  - frontend/src/integrations/hacienda/api.js
  - backend/tests/emisionUnClic.test.js
  - backend/tests/haciendaUnClicPg.test.js
  - backend/tests/haciendaNumeracion.test.js
  - backend/tests/haciendaNumeracionPg.test.js
  - backend/tests/haciendaMedioPago.test.js
  - frontend/src/integrations/hacienda/NumeracionHacienda.jsx
  - frontend/src/integrations/hacienda/numeracionTexto.js
  - frontend/src/integrations/hacienda/catalogos.js
  - backend/tests/haciendaFiscal.test.js
  - backend/tests/haciendaTransporte.test.js
  - backend/tests/haciendaPg.test.js
  - docs/plan-integracion-hacienda.md
  - docs/informes/hacienda-2026-10-05.md
aristas:
  relacionado: [modulo/facturacion, modulo/compras, modulo/correo-facturas, modulo/permisos, modulo/ensayo-corte, modulo/archivo-ventas-electronicas, bloqueo/carga-electronica-historica, decision/la-ruta-no-el-contenido, bloqueo/prisma-no-se-regenera]
medido: 2026-10-11
---

El usuario autorizó desarrollar Hacienda sin pedir nuevas confirmaciones,
dentro del mismo proyecto pero en carpetas propias. Sustituye la instrucción
anterior de posponerla. Revisiones manuales de fichas y conteo: usuario.

La **4.4** es la versión publicada en OVi el 2026-10-05, con ajustes de abril
2026. Se conservaron esquemas actuales, fuentes y huellas, incluida la
importación XMLDSig local. El API es v1; su número no es la versión del XML.

Implementados FE, TE y NC en CRC, mensajes receptor, certificado .p12 + PIN,
OAuth por ambiente y firma XAdES-EPES verificable. Configuración → Hacienda
recibe el certificado y las credenciales; nunca vuelven en GET o bitácora.
Configuración → Impuestos/Métodos de pago permite completar códigos fiscales.
No inferir tarifa exenta del porcentaje cero ni actividad/ubicación del nombre.

Migración 043 crea configuración, numerador y comprobantes con id propio.
Preparar bloquea documento y serie; conserva XML firmado y clave. Repetir la
preparación devuelve la misma reserva. Timeout produce `incierta`: consultar
la misma clave antes de reenviar los mismos bytes. 201 solo es `recibida`.
Aceptar exige respuesta autenticada, XML/XSD/firma y clave/emisor coincidentes.
Sandbox conserva la venta comercial y numeración de producción intactas.

Reserva de producción bloquea cambios de cabecera y líneas, incluso inserts
y traslados. Un rechazo se conserva y permite sustitución explícita con
referencia tipo 10/código 16 y nuevo consecutivo. Aceptados se corrigen con
nota, nunca borrando. Emitir ante Hacienda no vuelve a mover inventario,
cobros, aplicaciones ni saldos. El indicador `anulada_por_nota` sigue siendo
una derivación del negocio, no una edición del original fiscal.

PDF de aceptadas propias usa número fiscal y emisor del XML firmado. El
correo incorpora PDF + XML + respuesta, con las guardas existentes; desde el
2026-10-11 sale solo al aceptarse la factura (ver "UN CLIC EMITE", abajo).
La compra usa su id propio; desde el buzón se resuelve primero el UUID. Sin
XML original no se fabrica mensaje receptor. Cargarlo exige correspondencia
de clave, proveedor, receptor y total. La aceptación comercial y fiscal son
estados distintos; la fiscal vive en los comprobantes.

`HACIENDA_PERMITIR_PRUEBAS` abre exclusivamente sandbox. Producción conserva
`salidasBloqueadas()`. El seguimiento automático es optativo mediante
`HACIENDA_TRABAJADOR`; consulta, no envía. Dependencias de firma separadas del
Prisma compartido, instalación exclusivamente en el paquete anidado.

**Pendiente externo:** cargar certificados/credenciales reales, aceptación
real en pruebas, recepción de adjuntos, infraestructura persistente y corte.
Los tests usan firma de prueba y transporte simulado; no son homologación.
Alcance no implementado (REP, ND, FEE, FEC, exoneraciones, moneda extranjera,
IVA especial): README del módulo. No declararlo terminado por tener sus XSD.

Respaldar base + llave de cifrado + XML privados juntos. 0700/0600, fuera de
Git y de rutas públicas. No copiar secretos a memoria/grafo ni ejecutar
limpieza semanal. Detalle operativo y plan: archivos citados arriba.

NUMERACIÓN HISTÓRICA: las plantillas de Alegra pueden compartir prefijo y
número entre venta comercial y electrónica. El adaptador conserva el número
impreso, usa la serie/consecutivo de la clave y guarda plantilla de origen.
La recarga normaliza series abreviadas sin inventar aceptación. La reserva
fiscal relee también las claves del emisor para no reutilizar números.

DEPENDENCIAS: node-forge 1.4.0 tiene aviso GHSA-86w9-cpqp-85rv sin parche
publicado al 2026-10-05. Se usa solo para decodificar .p12; firma/verificación
son de Node, no el verificador RSA de Forge. Caso de prueba con interceptor
para conservar esa separación; análisis y fuente en README. No declarar
audit limpio ni introducir cert.verify/publicKey.verify de Forge.

ACTIVIDAD ECONÓMICA, 2026-10-10: el XSD pide un texto de seis caracteres, no
seis dígitos. La consulta pública devuelve la actividad inscrita de la empresa
como `4752.1` y las 207 facturas 4.4 archivadas con ese valor fueron aceptadas;
24 con el código anterior `523402` también. `ACTIVIDAD` en `xml/v4.4.js`
admite las dos formas para emisor y receptor, y Configuración usa la misma
regla. Antes no se podía habilitar ni probar la conexión con el dato real.
Las copias sin punto (`47521`, como dejó la carga de Alegra en facturas y en
tres clientes) siguen rechazadas PARA EL EMISOR: no se adivina dónde va el
punto.

LA ACTIVIDAD DEL RECEPTOR NO SE PIDE (decisión del usuario, 2026-10-11:
«la actividad económica del receptor no es necesaria, quitala del modal»).
El XSD hace opcional `CodigoActividadReceptor` y 243 de esas 247 facturas
aceptadas no lo traen; acá toda factura electrónica lo exigía y el modal de
emisión lo pedía a mano cada vez, con 245 de 247 clientes sin ese dato. Ahora
el modal no lo muestra y `xml/v4.4.js` no lo exige: si el documento ya trae
una actividad bien escrita se manda; si no trae, o está mal escrita, se
omite (ni se inventa un código ni se bloquea la venta). La ficha del cliente
conserva el campo y dejó de avisar que sin él no se puede facturar. La del
emisor sigue siendo obligatoria. Pruebas en `haciendaFiscal.test.js`, contra
el XSD oficial.

ALMACÉN PRIVADO Y PRUEBAS: `haciendaPg.test.js` escribe en
`HACIENDA_ALMACEN_PRIVADO`; sin esa variable usa el almacén real. Correrla
siempre con un directorio de descarte.

CREDENCIALES RECHAZADAS, 2026-10-10: el transporte ya no responde 401 cuando
Hacienda rechaza el usuario o la contraseña guardados (422), ni cuando rechaza
la sesión a mitad de un pedido (502). El frontend toma todo 401 como sesión
vencida de ESTE sistema, borra el token y manda a /ingresar: "Probar conexión"
sacaba a la persona al ingreso sin mostrarle el motivo. Caso real: la
contraseña del API guardada era el PIN del certificado.

PRIMERA ACEPTACIÓN REAL EN PRUEBAS, 2026-10-10: un tiquete (04) y una
factura electrónica (01) de facturas propias de la copia local quedaron
`aceptada` en el ambiente de pruebas, con respuesta firmada verificada y
guardada. Lo que hubo que corregir para llegar:

- DIRECCIÓN DE PRUEBAS. `api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1/`
  ya no existe: la pasarela contesta 403 a todo. La vigente es
  `api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1/`. El IdP y el
  cliente `api-stag` no cambiaron. Producción no se tocó ni se probó.
- CAUSA DE HACIENDA. Los rechazos de recepción vienen en el encabezado
  `X-Error-Cause`, no en el cuerpo. El transporte lo devuelve como `causa` y
  queda en `mensaje`; antes solo se veía "Hacienda no recibió el comprobante".
- CLAVE DESCONOCIDA. Pruebas contesta 400 con "no ha sido recibido", no 404.
  Sin reconocerlo, un envío fallido no se podía repetir nunca.
- CÓDIGOS POR DEFECTO. Migración 053 y `codigoTarifaHacienda` del cargador:
  tarifa cuando tipo + porcentaje solo admite una, y medio de pago por clave
  propia. Las tarifas de 0 % (01, 05, 10 u 11) las sigue eligiendo una persona.

Falta en pruebas: nota de crédito, mensaje receptor de una compra, una línea
con descuento o regalía, un rechazo con su sustitución y el correo con PDF +
XML + respuesta. Los dos comprobantes aceptados usan como receptor la misma
cédula del emisor; no prueban un cliente distinto.

EL XSD SE VALIDA SIN NADA DEL SERVIDOR (2026-10-11). `xml/validar.js`
ejecutaba el programa `xmllint`. La máquina de desarrollo lo trae; Render no,
y con el entorno de Node ahí no se instala nada: en la primera prueba en
producción, «Preparar XML firmado» respondió «Instale libxml2 (xmllint) en el
servidor» con las catorce pruebas del módulo en verde —corren donde el
programa sí está—. Ahora valida el mismo libxml2 compilado a WebAssembly
(`xmllint-wasm`, versión exacta, en el `package.json` de esta carpeta, que el
despliegue instala con `npm ci`). Los XSD oficiales se usan tal cual, con su
importación relativa de la firma, y sin red.

Comprobado: los 247 comprobantes 4.4 reales del archivo fiscal dan el mismo
veredicto en los dos validadores; seis alteraciones por tipo (FE, TE, NC)
también; y en un contenedor limpio —Linux, Node 22, sin `xmllint`— `npm ci`
instala y valida. Cuesta ~40–100 ms por documento.

De paso, al rechazar dice CUÁL elemento falló («…esquema oficial 4.4
(CodigoCABYS)…»), nunca su valor: el diagnóstico crudo trae cédulas y montos.

**La regla que deja:** lo que el servidor necesita y no está en un
`package.json` es un requisito que nadie prueba. Antes de dar por listo un
módulo, buscar `child_process` y preguntarse si ese programa existe donde se
despliega. Hoy el backend no ejecuta ninguno (el `git` de `utils/grafo.js`
es de las pruebas del grafo, no del servidor).

PRODUCCIÓN ERA UN CAMINO QUE NADIE HABÍA RECORRIDO (2026-10-11). Al habilitar
el ambiente de producción con las credenciales reales, Configuración
respondió «El usuario del API no corresponde a este ambiente». La regla pedía
que el usuario terminara en `@comprobanteselectronicos.go.cr`, a secas, y
Hacienda entrega `…@prod.comprobanteselectronicos.go.cr` (y `@stag.` en
pruebas). El formato exigido no existe: las pruebas usaban un usuario
inventado con esa forma y pasaban. Ahora `USUARIO_API` tiene una regla por
ambiente con la forma real, el mensaje dice cómo debe terminar, y el usuario
se guarda sin espacios de borde (se pega desde la OVi).

Dos cosas medidas ese día en producción, que explican lo que se va a ver:
- **Hacienda rechaza un consecutivo repetido, también en pruebas.** La
  primera FE de prueba hecha desde Render salió con el número 1 y fue
  rechazada (-99, «la numeración consecutiva … ya existe»): ese número lo
  había usado el día anterior la copia local, con la misma cuenta de pruebas.
  Cada base lleva su propio numerador de pruebas; el segundo intento usa el 2.
  De paso confirma que en Render ya funciona toda la cadena: XML, firma,
  envío y respuesta.
- **La primera FE real salió con el número 4947, no con el 2481**
  (aceptada el 2026-10-11 a las 14:19, factura 5565; y una nota de crédito
  con el 82). En producción la serie de Alegra iba por el 2480, pero hay dos
  facturas aceptadas con consecutivo 4902 y 4946 (nacieron como tiquete y
  Alegra les dejó ese número), y `numerar` arrancaba en el máximo + 1.

UN CLIC EMITE, Y LA FACTURA CUENTA QUÉ PASA (2026-10-11). Pedido del usuario:
«ocupo que con solo darle a este botón ya se emita electrónicamente y no me
abra el modal de antes», «que en la misma factura me indique qué va pasando,
si se envió, o si la aceptó Hacienda» y «esta factura se le tiene que enviar
al cliente por correo el pdf con los 2 XML». Emitir era un modal, dos listas
(ambiente y tipo) y tres botones en orden; además, al enviar, la pantalla se
recargaba y cerraba el modal con el avance adentro.

Los tres pasos del servidor (`preparar`, `enviar`, `consultar`) son los
mismos. Lo nuevo es quién decide y quién los encadena:

- **Lo que antes se elegía, ahora lo decide el servidor**
  (`emision.service.js`, `emitirFactura`): va a producción si está
  habilitada y si no a pruebas (`ambienteDeEmision`); factura electrónica si
  el cliente tiene identificación y si no tiquete (`tipoDeFactura`).
  `POST /api/facturacion/hacienda/facturas/:id/emitir`.
- **La pantalla los encadena** (`emisionPasos.js`, sin React y con pruebas):
  firma → envía → consulta cada 3 s hasta un minuto. Con un comprobante a
  medias el botón CONTINÚA ese mismo; solo un rechazo prepara otro.
- **El avance vive en la factura** (`PanelEmisionFactura.jsx`): cuatro
  renglones —firmada, enviada, respuesta de Hacienda, correo al cliente— que
  salen de `GET …/facturas/:id/estado`. El panel se queda: ahí se bajan los
  dos XML y se le vuelve a mandar al cliente.
- **Si Hacienda tarda más de un minuto** la pantalla deja de insistir y lo
  dice; el seguimiento del servidor (`HACIENDA_TRABAJADOR=true`) sigue cada
  minuto y la pantalla relee sola cada 15 s lo que el servidor ya sabe. SIN
  esa variable nadie consulta: el panel no promete nada y pide tocar
  «Consultar a Hacienda», y el correo al cliente espera a ese toque. Tiene
  que estar encendida en producción.
- **El correo sale solo al aceptarse**, una vez, y solo para una FACTURA en
  PRODUCCIÓN (`entregar`, dentro de `consultar`): lo dispara la consulta que
  HACE el cambio a aceptada —la de la persona o la del seguimiento—, fuera de
  la transacción. Si falla, la factura queda aceptada igual. El resultado se
  anota en `bitacora_cambio` (`accion='correo'` sobre el comprobante) y es lo
  que muestra el panel; por eso no hizo falta una migración. No se reintenta
  solo; "Enviar al cliente" lo repite a pedido
  (`POST …/facturas/:id/correo`). El envío mismo está en
  [[modulo/correo-facturas]], enchufado en `rutas.js`
  (`ganchos.alAceptarFactura`): este módulo sigue sin importar correo.
- **Cuándo el clic NO emite sin preguntar** (`datosPendientes`): una línea
  con descuento necesita su motivo —Hacienda lo exige y una regalía no es un
  descuento comercial— y un medicamento, su registro y forma farmacéutica si
  la ficha no los trae. La factura lo pide ahí mismo y sigue sola. Es raro:
  una de las últimas mil facturas tenía descuento, diez productos de dos mil
  son medicamentos.

`DocumentoFiscal.jsx` (el modal) queda para lo que sí necesita elegir algo:
la nota de crédito (código de referencia) y la respuesta a una compra.

En pruebas el botón lleva la marca "Pruebas" antes de tocarlo y el panel dice
"sin validez fiscal": una aceptación de pruebas no vuelve electrónica la
factura ni le manda nada al cliente, y al habilitar producción esa misma
factura vuelve a ofrecer emitir.

Verificado: `emisionUnClic.test.js` (reglas, orden de los pasos, textos),
`haciendaUnClicPg.test.js` (base desechable: un correo por aceptación, también
con dos consultas a la vez; nada en pruebas ni en rechazos; un correo que
falla no tumba la aceptación) y un Chromium real a 1440, 820 y 390 px con
Hacienda y correo simulados: aceptación, tiquete, rechazo y reemisión, envío
no recibido, Hacienda lenta, descuento, pruebas y correo bloqueado. **No se
emitió nada real ni salió ningún correo**: la primera factura de producción y
su correo los va a ver el usuario.

LA NUMERACIÓN LA DECIDE EL DUEÑO (2026-10-11, noche). Con la primera factura
ya en el 4947, el usuario dijo, textual: «empieza la factura electrónica con
2481». Con la regla vieja no se podía: el número era siempre "el mayor que
exista + 1", releído en cada reserva, y todo valor menor se ignoraba.

La regla nueva (`numeracion.js`):
- **Manda el numerador** (`hacienda_numerador.siguiente`). "El mayor + 1" solo
  sirve para arrancar una serie que todavía no tiene numerador.
- **Un número ya usado se salta al llegar**, sea de una factura de Alegra (por
  serie y consecutivo, o porque consta en su clave) o de un comprobante
  propio. Protege igual que antes —si se carga después un documento de Alegra
  con un número de adelante, se salta ese y nada más— sin que un número suelto
  arrastre toda la serie. Seguir desde 2481 deja 4902, 4946 y 4947 para
  saltarse cuando toque.
- **Se cambia desde Configuración → Hacienda → "Numeración"**
  (`NumeracionHacienda.jsx`; `GET`/`PUT /api/configuracion/hacienda/:ambiente/numeracion`),
  por tipo: factura, tiquete y nota de crédito. Pide el módulo Configuración
  y queda en la bitácora (`hacienda_numerador`). La pantalla dice qué número
  sale y cuáles ya usados se van a saltar.
- **No deja retroceder al medio de una numeración ya usada**: se rechaza un
  número que tenga por delante más de diez usados. De los 2.480 números de
  Alegra esta base conoce 502; "libre" ahí no quiere decir "sin usar".
- En pruebas vale lo mismo, con su propia cuenta: sirve para adelantarla
  cuando otra copia ya gastó esos números con la misma cuenta de Hacienda.

POR QUÉ ES UN BOTÓN Y NO UNA MIGRACIÓN: producción no tiene quien corra
migraciones solo, y el número es una decisión fiscal que puede volver a
cambiar. **Falta que el usuario lo ponga en 2481** en producción (hoy dice
4948); el código solo no lo cambia.

Riesgo que él aceptó: Alegra queda de respaldo con su propia cuenta en 2481.
Si vuelve a emitir desde allá sin cambiarle la numeración, Hacienda rechaza
el repetido. La pantalla lo avisa.

Verificado: `haciendaNumeracion.test.js`, `haciendaNumeracionPg.test.js`
(base desechable, con el caso real: serie en 2480, sueltos en 4902 y 4946,
primera en 4947, cambio a 2481; rompiendo cada regla, alguna prueba falla) y
un Chromium real a 1440, 820 y 390 px: cambio a 2481, dos facturas emitidas
con 2481 y 2482, y el salto de 4946 a 4948.

EL MEDIO DE PAGO: SE EXIGE EN CONTADO, SE BUSCA ANTES DE PREGUNTAR
(2026-10-11, noche). En producción, al emitir: «Medio de pago: falta un dato
fiscal válido», con la factura de contado a la vista. Dos cosas juntas: el
XML exigía el medio de pago SIEMPRE, y desde que la factura nace sin cobrar
(`leccion/lo-que-mueve-plata-no-va-por-omision`) ninguna lo trae. Quedó
bloqueada toda emisión nueva, de contado y de crédito. El arreglo de la
mañana y la emisión de un clic se probaron con facturas de prueba que sí
traían medio: el camino real —factura nacida sin cobrar— no se recorrió.

La regla, medida contra las 247 facturas 4.4 que Hacienda ya aceptó: las 145
de contado declaran medio; de las 102 de crédito, una salió sin él. El
esquema lo hace opcional (`minOccurs="0"`).

- **Crédito sin cobrar:** sale sin el nodo `MedioPago`. No hay medio que
  declarar y no se inventa.
- **Contado:** se exige. `medioDePago` (en `emision.service.js`) lo busca en
  este orden: lo que contestó quien emite; el anotado en la factura; el que
  ya se declaró para esa factura en ese ambiente (así la nota de crédito dice
  lo mismo que su factura y volver a emitir un rechazo no pregunta otra vez);
  el del cobro vigente de mayor monto. «99 Otros» no cuenta.
- **Si nada lo dice, se pregunta en la misma factura** («¿Con qué paga el
  cliente?»), con los medios activos del negocio. Nunca se asume efectivo:
  eso era exactamente el error de la mañana, con otra cara. Elegirlo NO
  registra un cobro ni toca la factura, y la pantalla lo dice.

Pruebas: `haciendaMedioPago.test.js` (XML y esquema oficial, con y sin el
nodo, en factura, tiquete y nota), `emisionUnClic.test.js` y siete casos
nuevos en `haciendaUnClicPg.test.js`. Chromium real con Hacienda simulada:
contado sin cobrar (pregunta), crédito (un clic, sin nodo) y contado ya
cobrado por SINPE (un clic, declara 06).

**La regla que deja:** una prueba que arma su propio dato de entrada prueba
ese dato. Cuando cambia cómo NACE un documento, hay que volver a recorrer
todo lo que lo consume con un documento nacido de la forma nueva.

# Hacienda, integración independiente dentro del proyecto

Versión XML implementada: **4.4**, esquemas de la OVi actuales, ajustes del
22/04/2026, verificados el 2026-10-05. `esquemas/v4.4/fuentes.json` conserva
URL y SHA-256 de cada archivo oficial. El plan y las fuentes están en
[plan-integracion-hacienda.md](../../../../docs/plan-integracion-hacienda.md).
`.gitattributes` conserva los bytes originales de los XSD, incluidos los
finales de línea y espacios del proveedor; no se formatean como código propio.

## Responsabilidades

- `hacienda.client.js` / `index.js`: consulta pública del contribuyente existente; no manejan secretos de emisión.
- `rutas.js`: endpoints autenticados, listas blancas, límites de subida y errores públicos.
- `configuracion.service.js`: configuración por ambiente, vigencia del certificado y metadatos públicos.
- `seguridad/almacen.js`: cifrado AES-256-GCM, llave privada local y XML con huellas.
- `xml/v4.4.js`: FE, TE, NC y mensajes receptor; importes, claves y referencias.
- `xml/validar.js` y `esquemas/`: validación local con el XSD oficial, sin lecturas de red.
- `firma/`: apertura de .p12, XAdES-EPES, verificación de firma y respuesta.
- `transporte/`: OAuth y API con destinos fijos, TLS validado y tiempos límite.
- `emision.service.js`: reserva, XML inmutable, recepción, consulta y sustitución de rechazos.
- `lectura.service.js`: representación impresa desde el emisor y número del XML aceptado.
- `historico.js`: estado de origen de Alegra; una plantilla no prueba aceptación.
- `trabajador.js`: consulta de pendientes; no envía nuevos comprobantes.

Las pantallas y el cliente HTTP están en `frontend/src/integrations/hacienda/`.
Facturación y Compras llaman esta integración con sus **ids propios**; el id
del buzón es UUID y se resuelve primero a `compra.id`.

## Instalación

Esta carpeta tiene **su propio package.json y lockfile**. No comparte su
node_modules con Prisma. En el worktree de migración, instalar únicamente:

```sh
cd backend
npm run hacienda:instalar
```

No ejecutar npm install ni regenerar Prisma en el backend enlazado. El
postinstall del despliegue normal instala también este paquete, en un árbol
nuevo que no debe ser un enlace compartido.

Se requiere Node >=22. La validación contra el XSD usa libxml2 compilado a
WebAssembly (`xmllint-wasm`, dependencia de este paquete): NO hace falta el
programa `xmllint` en el servidor. Se quitó esa dependencia el 2026-10-11:
Render no lo trae, con el entorno de Node no se puede instalar, y la primera
prueba en producción respondió 503. Si la dependencia no estuviera instalada
la preparación responde 503; nunca omite el XSD.
Aplicar `migrations/independencia/043_hacienda.sql` antes de iniciar el módulo
y antes de ejecutar los cargadores históricos actualizados. SQL puro, sin
cambios del cliente Prisma.

## Configuración y habilitación

En Configuración → Empresa completar los datos verdaderos del emisor.
En Configuración → Hacienda cargar la actividad tal como la publica Hacienda
(seis caracteres: `4752.1`; los seis dígitos anteriores también valen),
proveedor del sistema, códigos oficiales de ubicación, sucursal, terminal, usuario y
contraseña del API, certificado .p12 y PIN, **por separado en cada ambiente**.
El certificado se valida al cargar; habilitar requiere también identificación
coincidente y credenciales completas. Campos secretos vacíos conservan lo
guardado; no se devuelven al navegador. Configuración → Impuestos y Métodos
de pago permite asignar sus códigos fiscales explícitos. La migración 053 y el
cargador de configuración dejan puestos los que solo admiten una respuesta;
las tarifas de 0 % quedan pendientes hasta que una persona elija.

Variables operativas (sin credenciales en archivos de entorno):

- `HACIENDA_ALMACEN_PRIVADO`: directorio privado persistente fuera del repositorio y de `/archivos`. Por omisión `~/.local/share/sistema-facturas-cr/hacienda`.
- `HACIENDA_PERMITIR_PRUEBAS=true`: permite solo los destinos oficiales de pruebas; no abre WhatsApp, correo ni Alegra.
- `HACIENDA_TRABAJADOR=true`: consulta pendientes cada minuto, máximo diez por pasada, sin solapar pasadas.

También se puede ejecutar `npm run hacienda:seguir` una vez desde un
planificador separado, con el mismo almacenamiento y base. Producción sigue
la guarda `salidasBloqueadas`; la copia de migración conserva sus salidas
reales bloqueadas. Las dos configuraciones parten deshabilitadas.

## Flujo y recuperación

Preparar reserva el consecutivo fiscal en una transacción y conserva el XML
firmado. HTTP 201/202 significa recibido. La aceptación exige GET autenticado,
clave y emisor coincidentes, XML válido y firma verificable. La identidad del
servidor se establece por TLS y OAuth; el certificado embebido en la respuesta
se usa para comprobar integridad, no como autoridad independiente. No hay
callback público que pueda inventar aceptación.

Si el POST termina sin respuesta, consultar primero la misma clave. Solo al
no encontrarla se puede reenviar **el mismo XML y consecutivo**. Nunca se
recrean la venta, la compra, sus cobros ni sus movimientos de inventario.
Mientras existe una reserva de producción vigente, cabecera y líneas no se
pueden modificar por otros módulos. `anulada_por_nota` es un indicador
derivado de las aplicaciones de notas y puede actualizarse sin cambiar el
original fiscal.

Un rechazo definitivo conserva documento y respuesta. Revisar la venta y
usar “Preparar sustitución del rechazado”: nueva clave y consecutivo,
referencia tipo 10 / código 16. La acción es explícita; un doble clic normal
devuelve el comprobante existente. Un aceptado se corrige mediante nota de
crédito. La emisión fiscal no mueve inventario otra vez.

El sandbox nunca marca aceptada una factura real ni consume su numerador
fiscal de producción. Históricos de Alegra nunca se reemiten. Las compras
requieren XML original: no se reconstruye desde líneas incompletas; la
subida coteja clave, proveedor, receptor, total y XSD antes de conservarlo.

## Alcance y prueba real pendiente

Emisión inicial: FE 01, TE 04, NC 03 en CRC, con IVA por línea, descuentos
explícitos, registro/forma de medicamentos y referencia a una sola factura
en NC. Mensajes receptor 05/06/07 con crédito y gasto elegidos por la persona.
Los XSD de ND, exportación, compra electrónica y REP se conservan como fuentes,
pero esos emisores no están implementados: requieren sus reglas y adaptadores.
Exoneraciones, cálculo especial de IVA, impuestos distintos del IVA, moneda
extranjera y emisor alfanumérico requieren implementación específica; se
frenan datos incompatibles, sin convertir identificaciones borrando letras.
Tarifas transitorias 05/06/07 se usan solo en notas según el anexo vigente.

El 2026-10-10 se obtuvo aceptación real en pruebas de un tiquete y una
factura electrónica. Antes del corte falta la de nota de crédito y mensaje
receptor, comprobar rechazos/reintentos y
recepción del correo con PDF + XML + respuesta. Las pruebas locales usan
certificados ZZ autofirmados y transporte simulado; no certifican aceptación
fiscal ni homologación.

Respaldar **juntos** PostgreSQL, el directorio privado con `llave-cifrado` y
XML, y el almacén privado de originales del buzón. La llave tiene 32 bytes,
permisos 0600; directorio 0700. No se copia a Git ni al log. Si falta la llave,
restaurar la que corresponde: generar otra no recupera secretos existentes.
No ejecutar la limpieza semanal para mantener este archivo.

La verificación reconoce también el filtro XPath exacto del ejemplo oficial
(`not(ancestor-or-self::ds:Signature)`), equivalente a excluir la única firma.
No evalúa XPath arbitrario. Respuestas conservan ruta y SHA-256 inmutables.

## Revisión de dependencias, 2026-10-05

`npm audit` del paquete fiscal reporta [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
en node-forge 1.4.0, sin versión corregida publicada. Afecta la verificación
RSA PKCS#1 v1.5 de Forge. Aquí Forge solo decodifica el `.p12`; la firma y
verificación usan la criptografía de Node. No se llaman `publicKey.verify`,
`cert.verify` ni validación de cadenas de Forge. Una prueba intercepta las
llaves decodificadas y hace fallar ese verificador: el flujo válido sigue
funcionando y el XML alterado se rechaza. El aviso no se oculta ni se declara
audit limpio; revisar actualización publicada y mantener esa separación.

# Envío de órdenes por ciclo y cobertura de compras

Fecha: 2026-10-06, Costa Rica. Solo local, rama `independencia-alegra`.
Continúa desde `46f96aa` (catálogo de cuatro productos por hoja).
Implementación `a929ca9`, integrada por avance sin fusión únicamente local.
Se cierran **OC-05/06/08/09/10, FAL-05/06 y VAL-02**: operativo **56 listos /
43 pendientes (99 IDs)**. Independencia conserva 133/14 y sus límites de corte.

## Resultado y uso

Reporte Proveedores → elegir semana o Sin ciclo → proveedor → Preparar orden
de este ciclo → guardar borrador → marcar pendiente de enviar. Elegir número y
mensaje definitivos, preparar PDF, abrir/descargar la copia guardada y confirmar
que se revisó antes de enviar. El mensaje propuesto identifica ORDEN DE COMPRA
y su referencia; una respuesta inicial tardía no reemplaza lo ya escrito.

Orden enviada muestra cantidad pendiente del proveedor y bloquea productos,
cantidades y contexto. Nuevos faltantes requieren otra orden: caso comprobado
**10 enviadas + 3 nuevas → anterior 10 / nueva sugerencia 3**, sin mezclar la
siguiente semana. Reserva sin confirmación, solicitado y libre son distintos.
Con conversión 6, dos cajas pendientes son 12 propias: solo 10 cubren los
orígenes asignados; las otras 2 no se asignan a la próxima ruta ni a stock.

El envío global antiguo se retiró de la pantalla y su API rechaza 409,
indicando elegir semana/Sin ciclo. Mantenerlo permitiría comprar por fuera de
la cobertura persistida. Sus borradores e historial se conservan, sin deducir
ciclos antiguos. El cambio intencional requiere actualizar clientes externos
que usaran POST /api/orden-compra/enviar-whatsapp.

## Persistencia, incertidumbre y permisos

047 añade `orden_compra_ciclo_envio`: PDF BYTEA privado, SHA-256 comprobado en
SQL, versión, número, mensaje, UUID y secuencia, actores/fechas/resultados. Los
bytes se guardan al preparar y se descargan/transmiten exactamente iguales;
no se regeneran según cambios del maestro. PDFKit usa snapshots de la orden,
no cantidades globales. Copias anteriores consultables; abrir una copia
anterior no habilita enviar la actual. Máximo 5 MB; el backup de DB incluye PDF.

Transacción reclama el intento y bloquea la cabecera antes de llamar a WhatsApp,
con COMMIT durable antes de la red. Repetir el mismo intento solo consulta.
Dos conexiones/operadores y copias diferentes no producen dos transmisiones.
Se revalidan versión y necesidad antes de iniciar, incluso tras cambios de
bodega/proveedor o cierre del ciclo. Confirmación del adaptador conserva orden,
documento, número y mensaje y pasa a Enviada · recepción pendiente.

Timeout o fallo tras iniciar queda incierto, bloquea la orden y conserva su
cobertura. No reenviar automáticamente. Fallo de DB después de transportar
deja intento durable en curso, tampoco retransmite al consultar. Solo un fallo
demostrado antes de iniciar el transporte admite preparar otra copia explícita.
Incierto, o en curso por más de cinco minutos, permite registrar verificación
con el proveedor y motivo/actor. Esa confirmación manual no inventa ACK del
transporte ni recepción física. SQL protege bytes/historial/estados y líneas;
la orden enviada no puede regresar a borrador o cerrarse sin recepción.

PDF/listas/propuesta/envío/verificación heredan permiso Reporte Proveedores;
descarga autenticada, `private, no-store` y pertenencia de copia a orden. DTO
solo metadatos, nunca BYTEA. Bitácora y errores persistidos omiten respuestas
crudas/payloads privados. La UI solo hace GET durante envío, nunca reintento
POST automático. `config/aislado` sigue bloqueando salidas en la app habitual.

## Verificación de esta parte

Suite completa **2.059 aprobadas, 364 suites, cero fallos/omitidas** (115,6 s).
Grafo válido (12), build de frontend aprobado. Aviso ya existente de bundle
mayor de 500 kB; no bloquea el build ni se cambiaron dependencias.

23 casos nuevos: 20 de servicio/SQL/concurrencia sobre PostgreSQL propio,
2 del adaptador (fallo antes de canal frente a timeout tras transferir),
1 del router real que rechaza envío global incluso con pedido válido antes
de llamar al servicio. Incluyen hash/bytes, DTO, revisión obsoleta, teléfono,
idempotencia, SQL/API inmutable, 10+3 enviado, manual, caída del proceso,
conversiones y huellas sin cambios de compras/stock/facturas/faltantes.

Chromium 1440/390: permiso exclusivo Proveedores sin permiso Clientes,
401/403/400, PDF exacto, copia anterior no habilita envío, revisión explícita,
envío confirmado simulado, bloqueo, timeout simulado y verificación manual.
Sin errores JS ni desborde. Toda salida fuera de 3003/5175 abortada; dobles
de WhatsApp únicamente en el proceso privado, nunca en código compartido.

PDF nativo PDFKit de macOS: orden de una hoja y 80 líneas en 14 hojas con
descripción extensa; códigos presentes una vez, descripción completa,
cabecera/pie en cada hoja y texto dentro de márgenes. Inspección visual de
PDF y pantallas. El catálogo del usuario conserva cuatro fichas por hoja;
este renderer es propio de órdenes, sin cambios a aquel.

Evidencia privada en `/private/tmp/codex-envio-ordenes-20261006`: logs de suite,
build y navegador, PDFs/renders propios, huellas locales y respaldos protegidos.
Pruebas en `tachi_codex_envio_ordenes_20261006`, no registros de la base habitual.
No conectar producción, Alegra, Gmail, WhatsApp o Hacienda reales; no ejecutar
limpieza semanal, instalar dependencias o regenerar Prisma.

## Integración local y relevo

047 aplicada únicamente a `tachi` local, localhost:5434, con respaldo previo
`antes-047-local.dump` protegido en la carpeta privada de evidencia. Después
de aplicar, las **22 huellas de negocio siguen iguales** al inicio; cero
copias/envíos en la tabla nueva. No fixtures de esta parte en la base habitual.
La ruta/ciclo cancelado y asignación del usuario se conservan, al igual que
stock provisional cero. Compartida verificada solo GET: API nueva/health/frontend
200; lista/PDF sin sesión 401, cero órdenes/copias/movimientos/conteos y stock
no cero = 0. Las 22 huellas también siguen iguales tras integrar y reiniciar.
No abrir reporte global para comprobar lectura: puede asignar proveedores.

App habitual **5174→3002**, backend PID **92846**, con el lanzador seguro
permanente `/private/tmp/codex-inventario-propio-20261004/servidor-compartido.cjs`
y Node absoluto. No usar `server.js` directo: cron semanal aún pendiente por
código. Original 3000/PID 5370 y ramas developer `5013270` / main `e19c3e5`
conservados; sin conexión a producción, push, despliegue o mensajes reales.

Base de prueba propia y servidores 3003/5175 retirados. Worktree/rama temporal
se retiran al cerrar el relevo. Evidencia/respaldo privado se conserva, al igual
que catálogos de Descargas, archivo fiscal y bases de ensayo anteriores.
Los guiones que dependan del worktree retirado no son lanzadores reutilizables.

Siguiente parte: vincular factura electrónica/PDF del proveedor, comparar
pedido/facturado/físico y registrar recepción parcial/final idempotente.
Reutilizar `compras.registrarCompra`/entrada existente: una factura ingresada
no puede crear stock una segunda vez al recibir. Un envío confirmado no
significa lectura, entrega física o agotamiento confirmado.

**OC-03 y FAL-04 siguen parciales** por estados/cantidades recibidas y cierre
de enviada. FAL-03/07/08, REC-01–11, entrega/carga, archivo individual 24 h y
retiro del cron/botón de limpieza siguen abiertos. Las validaciones generales
VAL-01/03–08 continúan para el flujo completo y revisiones del usuario.
No añadir un botón «Recibida» que omita evento físico/auditoría. Próxima SQL 048.

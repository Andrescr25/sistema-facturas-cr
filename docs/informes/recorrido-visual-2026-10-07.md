# Recorrido completo de rutas y compras — 2026-10-07

VAL-05: acciones reales del navegador, desde el catálogo hasta recepción,
carga/entrega e historial. Trabajo exclusivamente local en independencia-alegra,
desde e54589e, con copia/rama temporal propia. Developer/main y producción
permanecen fuera del trabajo. No hay migración SQL nueva; 053 sigue libre.

## Cambios encontrados al usar las pantallas

Con una semana seleccionada faltaba asignar proveedor desde Faltantes.
Ahora permite seleccionar productos y elegir una ficha sin salir del ciclo.
La API admite ciclo positivo o Sin ciclo, cambia solo faltantes pendientes de
ese ámbito y conserva otras semanas, mapeos maestros y órdenes enviadas.
Vacío explícito/inválido rechaza 400, inexistente 404; omitir ciclo mantiene
el contrato global anterior. Cambiar el filtro cierra el modal. Tarjetas de
proveedor accesibles por teclado y búsqueda adaptada al celular.

Los GET filtrados de reportes de clientes/proveedores todavía asignaban
proveedores automáticamente. Las pruebas anteriores pasaban false explícito
y no ejercitaban el valor por omisión de las pantallas. Ahora ruta, semana y
Sin ciclo se consultan sin asignación automática; exportar sigue sin escribir.
Seis regresiones PostgreSQL comprueban ámbitos, rechazos y ambas lecturas.

Una lectura inicial tardía de recepción podía reiniciar lo recién escrito.
Recepción descarta el turno cancelado y bloquea su propia carga; Factura
ignora la lectura de una instancia cancelada. El recorrido demora un GET,
escribe 6, confirma y libera la respuesta anterior: cantidad y confirmación
se conservan antes de guardar. No se sustituyeron las guardas del proyecto.

## Evidencia del recorrido

Chromium realiza catorce pasos completos por ancho, con acciones en escritorio
1440 y celular390: **44 vistas/88 capturas**,54 mutaciones de UI sobre el
clon y12 descargas; cuatro documentos de UI simulados más seis de preparación.
Cada recorrido tiene27 mutaciones,22 vistas/44 capturas y6 descargas:
ficha/historial y orden maestro; recorrido congelado; catálogo PDF/mensaje
CATÁLOGO; pedido anticipado 3 en portal; facturación; bodega/faltante 3;
asignación explícita; nueva orden 3 sin ampliar la enviada 4; revisión/envío de
la misma copia PDF; factura del proveedor/representación; compra desde Revisión
de Precios; recepción; cierre/promoción/carga/entrega; Excel; archivo/historial.

La compra comercial no aumenta stock; recibir agrega +3 una vez, consultar
no lo repite. La orden actual agrega solo las 6 que faltaban tras recibir 4.
Cerrar la anterior próxima conserva 1 recibido y libera solo 3 de esa semana.
Cerrar/promover el ciclo no mueve facturas anteriores; Maps y orden de parada
siguen siendo los originales. Cargar/entregar no vuelve a descontar stock.

El PDF de catálogo y el de la nueva orden llegan al doble de transporte con
la misma SHA-256 que los revisados/descargados. Cuatro Excel se descargan desde
la UI y se abren con sus hojas de procedencia, orden, clientes y recorrido.
La orden recibida de hace 24 h sale de Activas; Historial conserva cantidades,
recepciones, comparación y su PDF. No hay errores JavaScript, desborde global
ni reporte legado de fondo.

Montaje desechable: tachi_codex_recorrido_visual_20261007, puertos 3003/5175.
Datos iniciales de cadena creados por servicios reales sobre el clon; la
factura entrante del buzón es sintética. Las 24 h se representan insertando
un evento final histórico NUEVO, sin editar eventos confirmados, desactivar
triggers ni alterar el reloj compartido. No se ejecutó limpieza semanal.

Servidor de prueba con la excepción NODE_TEST_CONTEXT existente: documento
simulado antes de requerir server.js; iniciar/detener WhatsApp sustituidos,
correo/avisos/trabajos desactivados, socket limitado a localhost5434/3003 y
fetch propio. Conexión remota rechazada en una comprobación explícita. El
navegador aborta tráfico externo y limita mutaciones a módulos del recorrido.
Nunca arrancar server.js ordinario con esa excepción. La app habitual conserva
sus guardas y su autorización fiscal sandbox anterior; esta parte no crea
comprobantes ni llama Hacienda, Gmail, Alegra o WhatsApp reales.

El runner persistente backend/tests/e2e/recorridoOperativo.cjs queda fuera de
la suite nativa. Requiere node --test, Playwright ya disponible (sin instalar),
RECORRIDO_PRUEBA_DIR privado0700 con base-prueba.cjs, RECORRIDO_DB_NOMBRE
`tachi_codex_*`, PLAYWRIGHT_MODULO y ANCHO_PRUEBA1440/390; comprueba PID/puerto
y comando del servidor propio. El anfitrión debe recrear el montaje y sus
transportes bloqueados. Los scripts privados de este ensayo que apuntan a la
copia retirada son evidencia y no se deben ejecutar tal cual otra vez.

La revisión visual humana, Maps antiguos de una fuente LOCAL, aceptación
fiscal real y corte conservan sus pendientes. Estos escenarios no acreditan
WhatsApp real, factura electrónica oficial recibida ni inventario físico.

## Aplicación local y relevo

**2.263 pruebas/363 suites**, fail0/skip0; seis regresiones nuevas y caso
anterior reforzado para las lecturas reales por omisión. Suite con concurrencia
de archivos1 sobre clon fresco,162,7s. Grafo12 y build aprobados. La prueba
Chromium se ejecuta aparte y ambos recorridos aprueban; no cuenta como una
prueba omitida de la suite nativa.

VAL-05 cerrado: **94 listos /5 pendientes (99 IDs)**. Independencia conserva
133/14 (147 IDs). Siguen VAL-06/07 globales, Maps LOCAL RUT-03 y revisiones
CLI-10/VAL-08 del usuario. Quince decisiones originales conservadas.

La integración local y el retiro de la copia se registran tras aplicarlos.

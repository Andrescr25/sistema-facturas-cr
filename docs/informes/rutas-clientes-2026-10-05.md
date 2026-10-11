# Primera parte: clientes, rutas y ciclos

2026-10-05. Trabajo únicamente local en `independencia-alegra`. Producción,
`developer` y `main` conservados; sin push.

## Lo disponible

- Clientes abre en fichas y separa Rutas, Pedidos, Cuentas y Tablets.
- Ficha por secciones: general/contacto/ruta/ubicación/notas/estado, facturas
  pendientes y abonos, historial de ventas/pedidos y pedidos en línea recientes.
- Ruta, posición manual, ubicación Maps https y días habituales opcionales.
- Crear/editar/desactivar ruta; asignar clientes desde su ficha y ordenar
  con arrastre o flechas, guardando el orden expresamente.
- Filtro de ruta y Sin ruta en clientes, antes de paginar y con orden de visita.
- Ciclos de semana (lunes), recorrido fijado y promoción controlada. Ciclo
  actual en preparación/entrega y otros en preventa, sin cerrar automáticamente.
- Botón Maps desde ficha, lista y recorrido; autorización de Clientes en API.

Corregido el resumen: los pedidos usan id propio, incluyendo agente sin
cuenta del portal; las deudas muestran también facturas anteriores a las
últimas diez. Cambiar una ficha refresca el detalle abierto.

## Verificación y aplicación

**1.949 pruebas aprobadas, cero fallos y cero omitidas**, con base PostgreSQL
desechable propia. Catorce nuevas comprueban nombre/duplicados, enlaces, permisos, asignación/orden,
dos escrituras concurrentes, semanas, copia inmutable del recorrido, transición
de estados y resumen con facturas antiguas/cliente sin referencia externa.
Build aprobado; Chromium 1440/700/390 sin desbordamiento. Verificado guardar
orden con flechas, crear ciclo, editar día, abrir enlace correcto y mantener
el día original del recorrido; sin abrir Maps externo ni enviar mensajes.
La aplicación habitual **5174 → 3002** también verificada con lecturas GET y
navegador 1440/390: vistas disponibles, rutas/ciclos vacíos, clientes sin
reasignar e inventario en cero. El backend local usa el lanzador seguro existente;
los servidores de prueba no sustituyen la aplicación del usuario.

Migración 044 aplicada **solo a la base local** con respaldo privado previo,
13 huellas comerciales iguales y nuevas tablas vacías. No se asignaron rutas
ni ubicaciones reales por deducción. Inventario provisional/historia conservados.
La copia local inspeccionada no traía campos ni enlaces Maps en señas/notas:
la recuperación de ubicaciones existentes necesita identificar su fuente local;
no se consultó producción. Los datos ZZ se usaron solo en la base desechable.

## Lo que sigue

Los ciclos ya existen; aún **no están ligados a pedidos/facturas/faltantes**.
Promover un ciclo cambia su estado y no mueve pedidos ni genera compras.
La próxima parte añade el ciclo al portal/agente y conserva ese contexto al
facturar; después filtros de bodega/reportes y faltantes trazables.

También pendientes: catálogos de próxima ruta, órdenes de compra persistentes,
bloqueo tras envío, cobertura sin duplicados, PDF/comparación/recepción,
carga/entrega y archivo 24 h conservando historial. El retiro del cron viejo
sigue pendiente de código; los lanzadores seguros lo mantienen sustituido.
Las revisiones visuales y los datos reales quedan al usuario, como acordó.

Estado por ID: [checklist operativo](../checklist-rutas-ciclos-operativos.md).
Detalle técnico y próxima entrada: [grafo de rutas/clientes](../grafo/modulo/rutas-clientes.md).

Continuación del 2026-10-05: la segunda parte ya vincula pedidos/facturas
al recorrido de su semana. Consultar [informe vigente de pedidos/ciclos](pedidos-ciclos-2026-10-05.md)
para no usar la sección anterior como estado actual.

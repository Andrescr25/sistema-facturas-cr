# Segunda parte: pedidos y facturas por ciclo

2026-10-05. Solo local en `independencia-alegra`, sin push ni cambios en
`developer`, `main` o base de producción. Continuación de
[clientes/rutas](rutas-clientes-2026-10-05.md).

## Lo disponible

- Portal: elegir ruta/semana al enviar; confirmar y consultar esa semana en
  el historial. La cuenta solo puede elegir sus recorridos.
- Facturación presencial: elegir ciclo de visita; las opciones se descargan
  con los clientes para uso sin conexión. Catálogo del agente sigue de consulta.
- Pedidos antiguos del agente: contrato compatible, con ciclo opcional y clave
  original; un pedido adicional conserva su identidad separada del anticipado.
- Facturar un pedido conserva ruta, semana, parada y condición anticipada,
  con el vínculo pedido/factura dentro de la misma transacción.
- Clientes → Pedidos: filtros ruta, ciclo/semana y origen en línea/agente,
  antes del límite; Sin ciclo visible para registros no clasificados.
- Cambiar ruta/orden/nombre del maestro no mueve documentos pasados. SQL protege
  el vínculo, además de la validación del servicio.
- Reintentos conservan factura/pedido. Las huellas nuevas distinguen semana y
  las antiguas sin ciclo mantienen su fórmula. No se cambian colas ni claves.

El ciclo cerrado/cancelado rechaza nuevos envíos; el carrito o la venta
offline permanecen para revisión. Un pedido recibido antes del cierre sigue
facturable con su contexto original. No se promueve silenciosamente de semana.

## Verificación

**1.962 pruebas aprobadas, cero fallos y cero omitidas** en la base PostgreSQL
propia desechable; suite ejecutada por separado del navegador y con archivos
secuenciales. Once nuevas verifican semanas, cuenta ajena/carrito conservado,
pedido adicional, reintentos antiguos, filtros antes del límite, cambio de
ficha, facturación y protección SQL. Dos más comprueban huellas de semana y
compatibilidad de intentos anteriores. Grafo: 12 aprobadas. Build aprobado;
aviso de tamaño del paquete ya existente.

Chromium 1440/390: selección/envío de semana próxima, confirmación/historial,
filtros de pedidos y facturación; la factura conserva el ciclo. Facturación
presencial desde el formulario también conserva la semana actual. Cinco
peticiones HTTP concurrentes del agente confirman un único pedido. Al perder
señal, conserva la semana seleccionada; ante 409 al sincronizar conserva cuerpo
y clave pendientes. La cola antigua del agente queda idéntica. Sin errores de
JavaScript ni desborde horizontal; peticiones externas bloqueadas.

045 aplicada exclusivamente a la base local, con respaldo privado previo y
23 huellas comerciales/operativas idénticas. Los históricos siguen sin ciclo y
el inventario provisional sigue en cero; no se agregaron datos demo a la base
del usuario. Producción y los otros branches permanecen intactos.
Aplicación habitual **5174 → 3002** verificada exclusivamente con GET y
navegador: filtros de pedidos 1440/390, selector presencial Sin ciclo,
históricos intactos e inventario cero. No se facturó ni insertó una demo allí.
Implementación integrada en `d87ee54`; el cierre de esta entrega añade evidencia
y mantiene la semana visible en celular aunque el nombre de ruta sea largo.

Evidencia privada en `/private/tmp/codex-pedidos-ciclos-20261005`: suite/build,
grafo, navegador, capturas, respaldo local y huellas. Las pruebas SQL se
revierten con ROLLBACK; los ZZ del navegador viven solo en la base desechable.
No se envían mensajes reales. Checklist operativo: **26 listos / 65 pendientes**;
las siete casillas nuevas son PRE-01/02/05/06/07/09 y FIL-02.

## Pendiente y próxima parte

Preparar enlaces personalizados por cliente y ciclo y facilitar su envío
controlado. Después: filtros de bodega/reportes/exportaciones, faltantes con
procedencia, cobertura de compras sin duplicados, órdenes persistentes e
inmutables tras envío, PDF/comparación/recepción, carga/entrega y archivo 24 h.
Retirar el cron global del domingo sigue pendiente; los lanzadores de prueba
y del usuario lo mantienen sustituido para no ejecutar la limpieza.

Maps anteriores necesitan identificar su fuente local. Revisión visual y
correcciones manuales quedan al usuario. Hacienda real y corte de producción
permanecen en el checklist de independencia; no se confunden con este avance.

[Checklist por ID](../checklist-rutas-ciclos-operativos.md) y
[entrada técnica del grafo](../grafo/modulo/pedidos-por-ciclo.md).

# Bodega y faltantes por ruta/semana — 2026-10-05

Continuidad desde 80f73e2, catálogo visual terminado. Seis puntos del
checklist implementados: FIL-04/05/06/08, FAL-02 y ENT-02. Solo local en
independencia-alegra; worktree y PostgreSQL propios, sin migración nueva.

Bodega → elegir ruta y semana: documentos del recorrido fijo, en orden de
parada. Un ciclo no se recorta a las últimas 40 facturas ni a 30 días; los
filtros se aplican antes de leer líneas. Vista conjunta mantiene ventana
anterior; cada tarjeta/detalle indica ruta, semana, parada y anticipado.
Historial conserva orden de despacho. Maps abre la ubicación del recorrido
fijado desde el detalle; no toma una ubicación nueva de otra ruta.
Borradores de alistado siguen por factura propia, sin borrar claves/colas.
Caché conjunta no se presenta como si perteneciera a otra semana elegida.

Reporte Clientes → filtros ruta/ciclo, orden y contexto en factura,
ubicación en detalle; guardado/impresión siguen por id propio. Facturas con
número coincidente no se agrupan como una sola. Sin ciclo permite revisar
históricos, sin suponer ruta por fecha/nombre. Las tarjetas conservan su
separación de pendientes/listos; dentro de cada sección manda el recorrido.

Reporte Proveedores → cantidad registrada y procedencia por cada
faltante/factura/cliente/ciclo, con semana/parada y anticipado. Suma de los
orígenes coincide con total. Asignaciones a proveedores diferentes de un
mismo producto conservan cantidades separadas. Cantidades corresponden al
registro de faltantes en unidades enteras, sin supuestas conversiones de compra.
La asignación automática al abrir se limita a los faltantes seleccionados;
Excel no asigna ni escribe. Notas consultan el mismo ámbito; una variante
de la próxima semana no se mezcla con esta.

El borrador/registro de envío anterior es global por proveedor: NO identifica
un ciclo. La consulta filtrada no lo aplica ni muestra una marca de enviado
que correspondería a otra semana. Muestra datos registrados y Excel; creación
por ciclo queda pendiente hasta órdenes persistentes con foto enviada y
cobertura. El flujo conjunto anterior se conserva. No acreditar OC-* ni
FAL-03/04/05 por mostrar procedencia: todavía no hay descuento de compras
pendientes ni conciliación física. Pedidos sin facturar no entran en Bodega.

Ambos Excel respetan ruta/ciclo y datos guardados. Clientes incorpora ruta,
semana, ID ciclo, parada y anticipado. Proveedores conserva hoja agregada y
añade Procedencia con cada origen, sumable, sin editar borradores de orden.
Permisos: selector, lista, Maps y exportación pertenecen a su módulo, aun
sin permiso Clientes. Notas son del Reporte Proveedores; limpieza continúa
como camino de Configuración, pendiente retirar por código. No ejecutarla.

Verificación:

- **2.011 pruebas aprobadas**, cero fallos/omitidas; 12 casos nuevos de
  PostgreSQL/ROLLBACK, separación de semanas/misma ruta, cliente movido,
  procedencia, notas, Excel sin escrituras, histórico, alistado separado,
  filtros inválidos, metadatos mínimos, permisos y proveedor distinto.
  Asignación automática filtrada no cambia faltantes de la próxima semana.
- 65 pruebas focalizadas de ciclo/permisos/SQL/hora aprobadas. Grafo 12 y
  build aprobados; permanecen avisos previos de tamaño del paquete/browserslist.
  No soportar fracciones supuestas: faltantes guarda unidades enteras.
- Chromium 1440/390 en los tres módulos, después de la suite: semana/parada,
  orden de dos clientes, Maps fijo, anticipado, volver conserva filtros,
  consulta de proveedor sin borrador global ni falso envío, procedencia
  desplegada, cambio rápido de semana y dos Excel descargados/releídos.
  Sin errores JavaScript/desborde. Pantalla SOLO GET; datos ZZ solo propios.
- HTTP real: usuarios de un solo módulo consultan su selector con 200 sin
  permiso Clientes; otro módulo y Clientes 403, sin sesión 401 y filtro
  inválido 400. No usar un endpoint que escriba sobre datos compartidos.
Checklist vigente **44 listos / 55 pendientes (99 IDs)**. Independencia
conserva 133/14. Siguiente: órdenes persistentes por ciclo, foto inmutable
al enviar y cobertura; después factura/recepción, carga/entrega y archivo
24 h. Quedan propagación/exportaciones generales, Maps históricos de fuente
LOCAL, manuales/conteo del usuario, aceptación REAL Hacienda y corte.

Evidencia/dump/guiones privados:
/private/tmp/codex-operacion-ciclos-20261005. No reutilizar los que dependan
del worktree retirado. Sin push ni cambios a developer/main/DB producción,
IMAP, mensajes reales o aceptación fiscal. Preservar archivo fiscal/ensayos.

Integración **8e656fa**, SOLO LOCAL, sin push. Compartida 5174→3002
verificada SOLO GET: selectores vacíos, filtros/componentes nuevos servidos,
consulta explícita de ciclo inexistente vacía (sin asignaciones automáticas),
PDF previo 404/401 y vista Rutas 1440/390 sin errores/desborde. **16 huellas
del inicio iguales** y **19 iguales antes/después de integrar**, incluidas
faltantes, ajustes y orden_compra_temporal. Stock cero provisional, sin rutas
ni ciclos demo e históricos conservados. Backend 3002 con lanzador seguro
existente (PID 73752 al cerrar). Developer 5013270, main e19c3e5 y original
3000/PID 5370 conservados. Solo base/servidores propios retirados; worktree
y rama temporal se retiran tras integrar este relevo. Evidencia privada,
PDF real del usuario y archivo fiscal/ensayos anteriores conservados.

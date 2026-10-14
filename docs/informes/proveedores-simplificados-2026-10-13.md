# Reporte de proveedores simplificado — 2026-10-13

Responsable: Codex. Parte de developer 7b156b4, en worktree propio; prioridad
recibida: dejar únicamente Faltantes como main y fichas de Proveedores.

## Resultado

Faltantes es el área inicial, con la consulta/global cantidades/editor/descarga
existentes de main. Proveedores conserva información y contactos. Se retiran
Compras, Necesidades, Órdenes como área, filtros de ruta/semana/Sin ciclo y
paneles de factura, recepción y cierre; sus componentes y hooks sin uso se borran.
Órdenes se revisan en un modal dentro del proveedor, con referencia, creación,
estado, cantidades, PDF revisado y envío. La tarjeta avisa de una orden nueva
pendiente aunque haya envíos anteriores. No se muestra ciclo en PDF/mensaje nuevo.

La acumulación busca una abierta del proveedor en borrador/pendiente sin intento
activo, independientemente de semanas, incluidos borradores históricos. Nuevas
órdenes guardan ciclo/ruta/semana NULL. Enviada/incierta/parcial/recibida/cerrada no
se amplían; nuevos faltantes crean otra. Cobertura/versiones/conversiones/reintentos
siguen protegidos. Preparar anteriores/liberados requiere POST explícito; GET
no crea ni modifica órdenes. Los documentos y APIs históricos se conservan.

SQL 058 sustituye solo validar_reserva_orden_compra: retira igualdad de ciclo,
conserva producto/factura/cliente, capacidad de línea y cobertura única. No
modifica datos, esquema, FK, inventario ni protecciones de enviada/PDF.

## Verificación local

Copia desechable de PostgreSQL 17, SQL 058 aplicada e idempotente; pruebas que
escriben usan ROLLBACK. WhatsApp simulado, ninguna salida real; sin limpieza semanal,
producción, regenerar Prisma ni instalar dependencias compartidas.

Regresión de nueve escenarios nuevos: ciclo histórico cerrado no bloquea,
faltantes globales conservados, 10 enviado +3 nuevo, lectura/preparación repetible,
proveedor desconocido/ambiguo/inactivo, permisos HTTP, reutilización de borrador
antiguo entre semanas y aislamiento de lectura READ ONLY/REPEATABLE READ real.
La guarda SQL se verifica directamente: otra semana entra si la identidad y
capacidad coinciden; factura equivocada, sobrecobertura o reclasificar/borrar
la cabecera siguen rechazados.

Las pruebas de rutas se actualizan para seguir hooks separados/subrouters y cubren
los contratos nuevos y los documentos históricos.

Estructura: useReporteProveedores baja al límite de 500 líneas, edición manual a
su hook y envío/órdenes a hooks propios. Se retiran cinco excepciones de deuda;
no se añaden. Componentes sin imports de servicios, paleta por rol y piezas
compartidas. Build sin dependencias nuevas y bundle reducido frente a la entrada anterior.

Resultados: suite completa **2.776 casos**, 2.431 aprobados y 345 condicionales
omitidos, 0 fallos/cancelaciones. PostgreSQL: **183 pruebas dirigidas** aprobadas,
más repetición de 21 pruebas de reservas tras fortalecer la comprobación SQL.
Grafo 12 y estructura 11 aprobados dentro de la suite; build aprobado.

Chromium con APIs/controladores/servicios reales, permiso solo Reporte Proveedores,
BEGIN/ROLLBACK y transporte simulado: 390/700/1440 sin desborde ni errores JS.
Consulta de faltantes comparada por igualdad profunda contra el código de main
en las mismas filas; solo dos áreas, sin llamadas de ciclos/necesidades/resumen
ni preparación por GET. Revisar/enviar A10/B5, recibir nuevos C8/A3 en otra factura,
ver otra orden con C8/A3, edición obsoleta409, ficha y reintentos503 comprobados.
Orden anterior y PDF guardado idénticos después de todos los pasos.

Vista previa: respaldo privado previo a 058; aplicada dos veces en una transacción
local, **106 tablas y 80 secuencias idénticas** antes/después. Sin fixtures nuevos
en la vista compartida; los ensayos ZZ confirmados para concurrencia existen solo
en la copia desechable, retirada al cerrar. Evidencia privada local:
/private/tmp/codex-proveedores-simple-20261013/.

## Entrega y pendientes

Destino developer y vista local 5173/3000. SQL 058 local; **pendiente en producción**
ante main, igual que SQL 057 de Carga/entregas. No se publica main ni se aplican
migraciones allí en esta entrega. Esta prioridad completa solo la parte proveedores
de ROT-08. Siguen pendientes impresión/historial tras 24 h sin movimiento
(ROT-06/07) y retirar ciclos de Facturación/pedidos/rutas/Bodega/exportaciones.

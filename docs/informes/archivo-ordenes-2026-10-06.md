# Archivo individual y retiro semanal — 2026-10-06

**Implementado, verificado e integrado solo local.** Código `e8b1b67`,
desde 4334399, sin push.
Rama tmp/codex-archivo-ordenes-20261006, base desechable propia; sin otros
commits/worktrees de agente al reservar. Producción, developer/main fuera.

Una orden recibida sale de Activas 24 horas después de su recepción final.
Historial conserva detalle, factura/PDF, comparación, motivos y recepción.
Parciales siguen activas. Hora PostgreSQL e intervalo exacto, sin borrar,
cambiar estado recibido ni liberar su cobertura; 6 recibidas de 10 mantienen
6 cubiertas y dejan solo 4 para otra orden. Ruta/ciclo/semana conservados.

SQL050 añade vista operativa y asegura tabla histórica del envío anterior,
sin modificar filas de negocio ni fechas ya anotadas. Lista abierta consulta
al vencer y al recuperar foco, sin reemplazar formulario abierto.

Retirados cron del arranque, botón y llamadas del frontend. Compatibilidad
de servicios y API responde 410 sin consulta/escritura, con ACL original.
No reiniciar envíos al cambiar domingo/lunes; conservar historial/corte antiguo.
Nunca ejecutar limpieza anterior: pruebas se cambiaron a rechazo y huellas
inmutables antes de correr suite. Mantener lanzador seguro para otras salidas.

Pruebas nuevas: frontera exacta con microsegundos, UTC/CR, parcial antigua,
historia de cierre sin envío, separación de ciclos y Sin ciclo, cobertura,
PDF de envío y factura posterior, doce huellas sin cambios al consultar.
Solo fixtures propios con ROLLBACK; no reloj/fecha inyectable en API.

Pendientes posteriores: carga/entrega, vista completa de stock/requerido/
comprometido y cierre de orden enviada con liberación justificada. Preservar
catálogo cuatro productos/hoja, Descargas, archivo fiscal, stock provisional 0
y las 15 instrucciones del usuario. Revisiones manuales corresponden al usuario.

## Verificación

Suite completa: **2.111 pruebas / 362 suites, cero fallos y omitidas**. Diez
casos nuevos de archivo con PostgreSQL; seis contratos retirados verificados
sin SQL. Grafo 12 y build aprobados. El conteo incluye dos llamadas frontend
retiradas (menos dos pruebas de rutas); las dos suites antiguas de reinicio
se sustituyen por contratos de rechazo. La prueba de integridad de rutas
ahora exige sus 21 llamadas reales, antes 23 por esas dos API retiradas.

Chromium 1440/390: fixture final histórica nueva pasa a Historial, PDF/factura/
recepción accesibles; otra orden cumple 24 h mientras la lista sigue abierta
sin recargar. Parcial de 30 días sigue activa en próxima semana, sin mezcla.
Mantenimiento sin botón; contratos 410 y ACL 401/403. Nueve huellas comerciales
iguales durante consultas. Fechas históricas SOLO al insertar fixtures de
copia propia, nunca modificando eventos ni reloj del servidor. Transporte
simulado en proceso privado 3003, sin mensajes reales.

ARC-01–06 y VAL-03 cerrados: **75 listos / 24 pendientes, 99 IDs**.
Independencia 133/14 (147 IDs) sigue separada. VAL-04–07 son verificaciones
integrales de todas las partes; las verificaciones por parte no cierran las
entregas aún inexistentes. Revisión manual del usuario permanece pendiente.

Una ejecución inicial del navegador encontró Vite aún sin arrancar; se
inició con su CLI/config privada y API3003, y se repitió con fixtures nuevos.
La suite completa pasó antes de esos fixtures, con stock de partida cero.
No restaurar base compartida ni relajar la comprobación de stock.

## Cierre local

Código `e8b1b67` integrado con rebase/avance sin fusión en independencia-alegra.
050 aplicada exclusivamente a tachi LOCAL 5434 con respaldo nuevo protegido
antes-050-local.dump (0600). Backend3002 detenido durante SQL/avance para
mantener código/vista coherentes; reiniciado con lanzador permanente seguro,
PID **8366**, Vite98892/app5174. Cron de limpieza ya no forma parte del arranque;
el lanzador se conserva por bloqueo de IMAP/ping/Hacienda y otras salidas.

**36 huellas operativas iguales** al inicio, antes de integrar y después de
SQL/código: clientes/rutas/ciclos/carrito, pedidos/facturas, faltantes/ajustes,
asignaciones del proveedor, cantidades/envíos/corte histórico, compras/precios/
CxP, buzón/comprobantes y stock. Ninguna fila de negocio cambió por esta parte.
Vista/órdenes/recepciones vacías, stock/conteos/movimientos 0; todas las compras
anteriores conservan modalidad false. Ruta/ciclo cancelado/cliente del usuario
conservados. Compartida verificada SOLO GET/SQL READ ONLY, salud/API/frontend200
sin sesión PDF/factura/recepción401. No consultar reporte proveedor sin filtros.

developer5013270, main e19c3e5 y backendoriginal3000/PID5370 intactos. Sin
producción, mensajes reales, Prisma/instalación, Hacienda/IMAP reales ni
limpieza antigua ejecutada. Código de rechazo probado solo en copia propia.
No borrar históricos para hacer desaparecer una orden; no cambiar recibida a
cerrada ni añadir tarea de barrido. Catálogo/Descargas/fiscal/ensayos conservados.

Base desechable tachi_codex_archivo_ordenes_20261006 y procesos3003/5175 retirados.
Evidencia/dumps/capturas/PDF privados conservados en
/private/tmp/codex-archivo-ordenes-20261006. Guiones que referencian su worktree
no son lanzadores reutilizables después del cierre. Memoria confirma retiro
final de copia/rama temporal y reserva, con 15 decisiones conservadas.

Siguiente: **carga/entregas por ciclo**, orden real de parada, sugerencia de
carga inversa y registro de avance sin cerrar la próxima semana (ENT-01/03–06,
FIL-07 y PRE-08). Mantener pendientes de stock/comprometido, cierre de enviada,
exportaciones e históricos/Maps; no marcar validaciones integrales hasta tener
flujo completo. Próxima SQL **051** si esta siguiente parte necesita esquema.

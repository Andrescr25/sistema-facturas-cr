---
id: modulo/auditoria-operacion-local
tipo: modulo
titulo: Auditoría global local — migraciones, historia y cero provisional
estado: vigente
archivos:
  - backend/scripts/independencia/auditar-operacion-local.js
  - backend/scripts/independencia/lib/auditoria-operacion.js
  - backend/tests/auditoriaOperacionLocal.test.js
  - backend/tests/ramaAislada.test.js
  - docs/informes/auditoria-local-2026-10-07.md
  - docs/checklist-rutas-ciclos-operativos.md
aristas:
  relacionado: [modulo/inventario, modulo/ensayo-corte, modulo/recorrido-visual-operativo, modulo/validacion-cadena-operativa, decision/ciclo-de-ruta-como-contexto, decision/inventario-desde-cero, leccion/la-db-local-es-produccion]
medido: 2026-10-07
---

CLI de lectura para esta rama: exige PostgreSQL LOCAL 5434 incluso si otra
herramienta autorizó una excepción remota. Salida nueva fuera de Git, carpeta
privada 0700 sin enlaces, JSON 0600. No requiere servidor, Prisma, importaciones,
transportes de mensajes ni nuevas dependencias. Comandos y límites en el informe.

REPEATABLE READ/READ ONLY captura todas las tablas públicas con columnas,
conteos y huellas: incluye ids, fechas, importes y valores fiscales, sin filas
ni secretos. Las secuencias se consultan sin nextval; comparar con la aplicación
en reposo porque no son MVCC. Referencia previa a DDL permite proyectar las
columnas anteriores; una columna ausente rechaza, tabla perdida/cambio de fila
falla. Las tablas nuevas se verifican aparte, no quedan acreditadas por comparar
historia. MD5 sirve de huella de regresión, no firma ni aceptación fiscal.

Cero provisional es una comprobación ANTES de iniciar trabajo: stock/conteo/
valoración desconocida/apertura pendientes y sin operaciones inventadas. Auditorías,
descuentos y regalos anteriores siguen históricos. No ejecutar esta condición
como regla que bloquee futuras ventas/conteos reales. Histórico Sin ciclo no se
clasifica adivinando semanas. Ruta/ciclo cancelado existente del usuario se conserva.

VAL-06/07: clon LOCAL 043, migraciones 044–052 en una transacción; 93 tablas
previas y secuencias idénticas, 13 nuevas vacías. Fallo 22012 revierte y repetir
044 rechaza 42P07/ROLLBACK. Suite completa sobre 052 reconstruida: 2.270 pruebas/
363 suites, fail0/skip0; siete regresiones nuevas. Grafo12 y build. Habitual:
106 tablas/80 secuencias, 36+9 controles anteriores y 2.023 fotos idénticos;
2.144 productos en cero, 17 auditorías/470 descuentos históricos, activos0.
Comparación de esquema y límites de almacenes privados en el informe.

Guardas de WhatsApp/correo/buzón probadas fuera de NODE_TEST_CONTEXT en la
suite; CLI rechaza remota aun con escape y salidas inseguras. Ninguna salida
real ni limpieza semanal. Sin SQL nueva, 053 libre, servicios conservados.
Operativo 96/3; Maps LOCAL y dos revisiones humanas pendientes. Independencia
133/14 separada: no demuestra importación final, conteo físico, Hacienda o corte.

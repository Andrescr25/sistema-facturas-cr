---
id: bloqueo/maps-anteriores-sin-fuente-local
tipo: bloqueo
titulo: Ubicaciones Maps anteriores — falta identificar su fuente local
estado: vigente
archivos:
  - docs/informes/busqueda-maps-local-2026-10-07.md
  - docs/checklist-rutas-ciclos-operativos.md
  - backend/src/modules/clientes/desdeAlegra.js
  - backend/src/modules/rutas/rutas.validacion.js
aristas:
  relacionado: [modulo/rutas-clientes, modulo/carga-entregas-por-ciclo, modulo/auditoria-operacion-local, decision/ciclo-de-ruta-como-contexto, leccion/la-db-local-es-produccion]
medido: 2026-10-07
---

Afecta únicamente recuperación de datos RUT-03. Campo Maps, edición, botón
móvil y recorrido fijo implementados; la ausencia de datos no abre esos IDs.
El usuario indica que ya guardó ubicaciones de muchos clientes. No afirmar
que no existen: falta conocer su procedencia local, no fabricar enlaces a
partir de nombres/direcciones ni contactar producción/Alegra/Gmail para buscar.

Búsqueda2026-10-07:247 clientes sin Maps,106 tablas sin enlaces/coordenadas
reconocidos; tres respaldos locales de03/05/07 de octubre sin enlaces Maps.
Archivo tar del proyecto26/09 (48 archivos admitidos), dos JSON históricos de
ventas y código local no permiten identificar la fuente. Alcance/patrones y
límites en el informe. Datos nunca impresos ni guardados en Git/memoria.

Dumps leídos con pg_restore SIN -d, tar sin extraer y SQL READ ONLY; no
restauraciones ni servidores nuevos ni limpieza semanal. RUT-03 permanece
pendiente:96/3 operativo, CLI-10/VAL-08 del usuario; independencia133/14 aparte.
Tras identificar fuente, validar identidad propia/externa sin emparejar solo
por nombre, conservar ediciones recientes y fotografías de ciclos anteriores.

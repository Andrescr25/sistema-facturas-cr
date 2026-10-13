# Reporte de clientes por ruta actual (ROT-03)

Continúa el relevo autorizado de Claude, después de la frecuencia individual.
Se entrega en `developer` con vista local 5173/3000. No hay nueva migración
ni conexión a producción; `main` conserva la versión anterior.

## Resultado

El reporte usaba la ruta del ciclo de cada factura. Clientes asignados a una
ruta con facturas sin ciclo no aparecían al elegirla. Ahora usa la ruta de
la ficha actual, con todas las rutas activas e inactivas asignadas y la
opción Sin ruta. Se retira el selector de semana y una petición antigua con
`cicloId` responde 400 para recargar, sin devolver otro alcance silencioso.

Las tarjetas dicen próxima visita, frecuencia y atraso/hoy/próximo. La cuenta
se comparte con Clientes y considera todas las ventas vigentes, también sin
faltantes. Sin frecuencia queda explícito. El orden por visita se mantiene
en pendientes y listos; el aviso sin caja y la revisión real siguen visibles.

Dos fichas con un mismo nombre antes se agrupaban juntas. Ahora se usa su id
propio, incluida la navegación y el Excel del detalle. Un documento histórico
sin ficha tiene clave propia y no se atribuye por coincidencia de nombre.
Excel añade ruta de hoy y fechas/estado de visita; distingue ruta histórica.

Consultar clientes/rutas/Excel no escribe asignaciones. Bodega y la asignación
explícita mantienen su escritura. Se conserva guardar qué llegó, confirmar
revisión, enviar a Impresión y recuperar, con los mismos ids y protecciones.
La agenda de TODOS los clientes sigue en ROT-04: este reporte muestra trabajo
de faltantes existente, sin inventarlo para clientes sin faltantes.

## Verificación

Pruebas en copia desechable del PostgreSQL local, con BEGIN/ROLLBACK. Cubre
ruta sin ciclos, homónimos con frecuencias diferentes, venta posterior sin
faltantes, atraso/hoy/próximo, sin frecuencia/ruta/ficha, cambio de ruta sin
reescribir factura, Excel del detalle exacto, consultas sin escrituras,
filtros inválidos y protección de permisos HTTP. Regresión de entregas,
impresión, contexto histórico y unidades de proveedor/propias.

La fixture compartida de cadena usaba una creación manual de orden después
de registrar faltantes. Desde `e5b1cd2` ya existe un borrador automático:
ahora la fixture revisa ese borrador antes de enviar, como hace la pantalla,
sin duplicar ni liberar cobertura a escondidas.

Chromium con controladores/rutas/servicios reales contra el clon: seleccionar
ruta sin semanas, distinguir homónimos, descargar Excel del detalle, guardar
«No llegó», confirmar y encolar, volver conservando filtros, Sin ruta,
selección rápida A → B → A con respuesta atrasada y errores 503 con reintento.
Móvil/tablet/escritorio; sin errores JavaScript ni desbordes. Salidas bloqueadas.

Verificación terminada: suite completa 2.762 pruebas, 2.417 aprobadas,
345 condicionales omitidas, cero fallos/cancelaciones. Se ejecutó secuencial:
Node 25.8.2 había fallado al deserializar resultados de dos archivos en la
ejecución paralela; ningún caso se excluyó para resolverlo. 93 pruebas
específicas con PostgreSQL, todas aprobadas y sin omisiones. Grafo/estructura
23 aprobadas y build correcto. Navegador 390/700/1440 sin errores ni desbordes.
Evidencia privada fuera del repositorio. El clon se elimina al cerrar, sin
registros de prueba en la base de vista previa ni producción. No se ejecuta
limpieza semanal ni se envían mensajes reales.

## Pendiente

Sigue ROT-04: agenda Preventa por ruta para todos los clientes, ordenada por
próxima visita. ROT-05 requiere definir qué facturas componen la carga sin
semanas. ROT-06/07 conservan pendiente el paso de impresos al historial tras
24 horas; ROT-08 retira el resto de dependencias operativas manteniendo historia.

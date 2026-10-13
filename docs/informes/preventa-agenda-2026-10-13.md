# Preventa: agenda por ruta y rotación individual

Continuación autorizada del relevo de Claude, ROT-04. Entrega solo a
`developer`; no publicación de esta parte a `main` ni acceso a producción.

## Resultado

Nueva pantalla `/preventa` en Ventas. Al seleccionar una ruta muestra todas
sus fichas activas, tengan o no facturas/faltantes. Grupos Atrasados, Hoy,
Próximos, Sin rotación y Sin facturas; búsqueda por nombre y filtro de estado,
tarjetas y detalle por id propio. Homónimos separados; volver conserva los
filtros. Contacto/dirección y fechas, sin exponer información de cuentas.

API propia con permiso `preventa`, otorgable desde Usuarios. Administrador
entra por rol; personal requiere ese permiso, sin necesitar Clientes/Reporte.
No cambia la preventa por enlace ni el portal. No agrega tablas/migraciones:
usa la columna de la 056 ya incorporada. No instala ni regenera dependencias.

Ruta actual y selector mínimo extraídos a `rutas/rutaActual.service.js`,
compartido con Reporte Clientes; sus pruebas de PostgreSQL vuelven a pasar.
Rotación calculada desde factura vigente mediante la única regla de Clientes:
nota completa/anulación retira atención; nota parcial conserva. Consultar no
escribe ni genera pedidos. Las frecuencias reales no se rellenan por defecto.

Hook con invalidación por identidad/revisión, cancelación, actualización al
volver al foco y cambio de día en Costa Rica, reintentos independientes. Una
ficha movida de ruta/desactivada cierra el detalle con aviso al actualizar.

## Verificación

Solo copia desechable PostgreSQL 17 del entorno local, con guardia sin red
externa y `BEGIN/ROLLBACK`. Pruebas con SQL real y HTTP autenticado: agenda
completa sin faltantes, rutas sin ciclos, sin ruta/inactivas/vacías, homónimos,
rotaciones vacías, facturar/corregir fecha/anular, crédito parcial/completo,
frecuencia/ruta actual. Se verificó consulta en una transacción `READ ONLY`
real además de huella de las fichas; 401/403/200, mayúsculas/barra final,
permiso exclusivo y token de portal ajeno. Nada de mensajes reales/limpieza.

- 119 pruebas dirigidas, cero fallos/omisiones.
- Suite completa secuencial: 2.765 pruebas, 2.420 aprobadas, 345 omisiones
  condicionales, cero fallos/cancelaciones. Concurrencia 1 por el problema del
  protocolo del runner Node 25 observado en el cierre anterior.
- Build de Vite aprobado. Conserva advertencia previa de tamaño del bundle.
- Navegador Chromium a 390/700/1440 px, API real y usuario con solo Preventa:
  cinco estados, clientes sin faltantes, homónimos por id, filtros al volver,
  sin ruta/inactiva/vacía, errores 503 independientes y reintentos, actualización
  al facturar/cambiar frecuencia y cierre del detalle al cambiar ruta.
  Carrera A → B → A con respuesta vieja que deliberadamente no se pudo
  cancelar: no pisa la selección. Sin desbordamiento, cero errores de página,
  cero escrituras desde la navegación. Capturas inspeccionadas.
- Estructura/grafo después de documentar: 23 pruebas aprobadas, cero fallos.

Evidencia privada local en `/private/tmp/codex-preventa-agenda-20261013`:
logs, script y capturas, sin configuración privada ni secretos publicados.

Preview local actualizado en 5173/3000 con esta versión; la base de preview
conserva las frecuencias reales vacías. Las fichas ZZ de prueba se deshacen,
y la copia desechable se retira al cerrar. No se dejan servicios adicionales.

## Pendiente del proyecto y decisiones recibidas

ROT-05: Carga/entrega todavía exige semanas. Usuario eligió incluir
**automáticamente todas las facturas pendientes de la ruta**; decisión
guardada, no implementada por esta entrega. Necesita adaptar registro de
entrega y SQL, preservando los recorridos históricos.

ROT-06/07: usuario aclaró **24 horas sin movimiento** después del envío a
Impresión, y luego historial para que no se acumulen en Reporte Clientes.
La referencia no es solo el envío inicial; una gestión nueva reinicia el
plazo. Leer no lo reinicia. Falta implementación del reloj/movimientos y la
vista de historial. No se autorizó por la pregunta una foto de próxima visita
persistida ni SQL nueva; su respuesta aclaró el objetivo de la antigüedad.

ROT-08: retirar selectores y exigencias de ciclos de Facturación, pedidos,
proveedores, Rutas, Bodega y exportaciones; conservar tablas/FK/documentos
históricos. El checklist marca solo lo implementado en esta rama.

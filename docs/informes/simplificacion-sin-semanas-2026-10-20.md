# Simplificación retomada de Claude — 2026-10-20

Codex continúa el parche sin terminar de Claude sobre `1a7bfed`, en copia
propia. Se desarrolla y prueba contra un clon desechable local; producción
no participa. No hay SQL nuevo, limpieza semanal ni mensajes reales.

## Comportamiento

- Reporte Proveedores conserva faltantes, fichas y enviados separados/tachados.
  Un envío cerrado conserva líneas, factor, destinatario, mensaje y PDF; la
  nueva necesidad genera otro pedido. Los documentos nuevos dicen «Orden de
  compra», proveedor y fecha, sin OC-xx. El formato comercial conserva código,
  descripción, factor y cantidad del proveedor. El id de base sigue existiendo
  para deduplicar y reintentar; no se renumeran ni regeneran copias anteriores.
- Revisión de precios registra costos/precios, compra, inventario y aceptación
  fiscal con sus controles previos, sin relacionar OC ni elegir candidata. Se
  retiran indicadores facturado/parcial derivados del vínculo. La relación
  histórica en SQL sigue intacta. El usuario definirá luego el nuevo proceso.
- Clientes conserva rutas/asignación/orden/Maps, descuento y próxima visita.
  No crea ni promueve semanas. Facturación, pedidos y Bodega no las consultan
  ni las asignan. Los pedidos se filtran por ruta actual; una ruta elegida en
  Bodega incluye pendientes antiguos. Carga ya registrada conserva su ruta.
- Las claves y huellas de colas antiguas siguen reconociendo el mismo envío;
  el campo retirado no ata una venta nueva a una semana cerrada. La edición de
  una factura histórica conserva su FK original y los controles fiscales.
  Las APIs semanales y de enlace OC retiradas dejan de estar montadas.

## Código retirado y cobertura

Se retiran los servicios, pantallas y pruebas exclusivamente del flujo por
semana, preventa PDF semanal, enlace/recepción/cierre por OC y necesidades por
ciclo. La historia queda en SQL y las migraciones existentes. Las pruebas
actuales cubren pedidos sin semana, colas, rutas actuales, próxima visita,
protección histórica y el envío fijo con nueva demanda independiente.

## Verificación

- Suite completa: **231 archivos, 2.922 pruebas: 2.919 aprobadas, ninguna
  fallida y tres omitidas**. Cada archivo se ejecutó en su propio proceso,
  habilitando las pruebas con PostgreSQL local. Las tres omitidas son de
  auditoría/ensayo del corte que exigen inventario provisional en cero; el
  clon local actual ya tiene movimientos y conteo. Sus pruebas restantes
  corrieron; no se modifica inventario para satisfacer una condición pasada.
- Cierre tras acotar el historial de Bodega: **67 pruebas aprobadas**, incluida
  SQL real por ruta/sin ruta, pendientes antiguos visibles e historial por
  fecha, colas anteriores y PDF sin numeración OC. Las nueve regresiones de
  operación sin semanas pasan con PostgreSQL y ROLLBACK.
- ESLint del frontend sin referencias inexistentes en los archivos modificados.
  La revisión completa conserva dos señalamientos previos fuera del cambio
  (`fetchpriority` y `data-xml-proveedor`) y avisos existentes; no se presenta
  el lint global como aprobado.
- Compilación de producción aprobada. Se mantiene el aviso previo del tamaño
  del paquete; no se agregan dependencias ni migraciones.
- Chromium: 58 comprobaciones a 390/700/1440 px, sin errores de JavaScript ni
  desbordes. Cliente seleccionado en Facturación, Rutas sin semanas, Bodega
  por ruta, detalle de proveedor/modal de WhatsApp con mensaje y revisión de
  compra sin seleccionar OC. Comprobadas autenticación, rutas retiradas y entradas públicas al portal/catálogo
  con parámetros semanales antiguos.
  Capturas móvil/escritorio inspeccionadas.
- El servidor real arranca con los módulos finales y `/health` responde 200.
  Localhost 5173/3000 usa la copia local habitual, con cron, correo, WhatsApp,
  Hacienda y conexiones externas bloqueados. Las pruebas escriben en clones
  desechables distintos; los pedidos y comprobantes de producción no participan.

## Entrega

Retomado por Codex desde el parche incompleto de Claude, con ambas autorías
reconocidas en el commit. Primera entrega en `developer` como `a020b89`; en ese momento `main`
conservaba `1a7bfed`. No necesita aplicar SQL. La nueva relación con facturas de proveedor
queda pendiente de la definición anunciada por el usuario.

Vista local: <http://localhost:5173>; backend en el puerto 3000. Refrescar la
pestaña para descargar la versión nueva. Las credenciales son las del clon
local y la sesión es local.


## Publicación a main autorizada — 2026-10-20

El usuario pide «subelo al main». Codex publica `developer:main` por avance
sin fusión: el cambio funcional `a020b89` (parche de Claude retomado,
completado y verificado por Codex, ambas firmas) y este registro de destino.
Se inspeccionó todo lo que viaja; no hay otros cambios funcionales pendientes
ni SQL nuevo. La evidencia local anterior corresponde al código publicado;
este registro solo actualiza documentación. No se conecta a la base de
producción ni se mandan mensajes para verificar el despliegue.

Render despliega desde main. La confirmación de lo observado desde sus
endpoints públicos queda en `permiso-subir-a-main.md` de la memoria compartida;
una respuesta de salud sola no demuestra la versión exacta de la API.
Recargar la pantalla y las tablets después de actualizar, porque los
selectores y rutas anteriores se retiraron.

# Sustitución de producto en Reporte Clientes — 2026-11-05

## Resultado y uso

Cuando el producto original no ingresó, «Cambiar producto» aparece junto a
«No llegó». El administrador habilita la acción por usuario desde Usuarios y
permisos → Reporte Clientes → «Cambiar productos faltantes por equivalentes»;
el administrador ya tiene esa facultad por su rol. Un usuario con solo el
módulo no puede consultar ni confirmar sustituciones.

Se busca el equivalente por nombre/código entre compras efectivamente
registradas y libres. El modal muestra disponibilidad, cantidad a cambiar,
precio con IVA y total antes/después. Confirmar usa el **precio actual del
sustituto**, decisión expresa del usuario, su tarifa y el descuento mayor
entre oferta vigente y descuento global del cliente. No se suman descuentos.

Si la factura tenía 6 originales y faltaban 3, sustituir 3 conserva 3
originales y agrega 3 sustitutos. Se puede cambiar solo una parte. Se conserva
el id/número de factura y cada otra línea con su precio, IVA y descuento
histórico. El sustituto ya presente conserva también su línea histórica;
las unidades nuevas usan el precio actual.

## Ingreso, revisión y documentos

La disponibilidad reutiliza `ingresoDisponibleSql`, con compras registradas
a partir del pedido original menos la tolerancia existente de 12 h y
restando todas las reservas. No interpreta existencias sin respaldo como
ingresos. El sustituto queda reservado para esta factura y con su entrega
guardada, **sin revisión marcada**. Después se revisa y envía a Impresión
normalmente; no se vuelve a rebajar la cantidad sustituida. «No llegó»
conserva su funcionamiento.

El faltante original se reduce y conserva su fila histórica. El destino suma
la nueva necesidad y su ingreso sin borrar entregas o reservas anteriores.
Mantiene la fecha original que respalda la compra. Reporte Proveedores no
vuelve a pedir las unidades recibidas; el conteo sin caja solo considera
productos presentes en la factura actual.

La operación comparte las restricciones nativas de edición: factura emitida
propia, sin cobros/notas vigentes, en CRC y sin reserva fiscal. Una factura
ante Hacienda se conserva y se corrige con el flujo fiscal existente. Tampoco
se cambia una factura que ya está en la cola ni un ajuste ya rebajado en
Impresión. No se emite ningún comprobante fiscal desde este modal.

## Implementación

- Consultas y controlador nuevos dentro de `missing-items`, bajo módulo y
  acción comprobados en servidor en cada petición. Los GET no escriben.
- Servicio de factura separado y helper puro de líneas. Reutiliza cálculo
  monetario, reglas fiscales, descuento/ofertas, inventario y bitácora.
- Un solo helper para guardar ajustes y para repartir ingresos; los flujos
  anteriores llaman la misma implementación.
- Confirmación transaccional: factura/faltantes bloqueados en orden, ingresos
  bloqueados por id de producto ordenado; revalidación de disponibilidad y
  huella de factura/líneas/faltantes/precio/descuento antes de guardar.
- Respuesta perdida, doble clic o propuesta obsoleta no aplica otra vez las
  mismas unidades. Un 409 conserva el modal con «Revisar de nuevo».
- Hook para búsquedas, cancelación de respuestas tardías, propuesta y guardado;
  componente para dibujar. Cambiar cliente/ruta/pestaña cierra la selección.
  Paleta y Modal/Boton existentes, sin librería nueva ni CSS adicional.

No hay migraciones nuevas, cambios en Prisma ni instalaciones de dependencias.

## Comprobaciones locales

Dos copias desechables de PostgreSQL derivadas de la copia local del 4/11;
red saliente bloqueada, Hacienda/WhatsApp/correo deshabilitados. Sin consultar
ni escribir producción para desarrollar, sin limpieza semanal.

- Suite completa por archivo, con regresiones de acciones y rutas
  actualizadas y revalidación de los módulos afectados: **277 archivos,
  3.395 correctas, cero fallos/cancelaciones**. Tres casos de auditoría/corte
  histórico permanecen omitidos: exigen la copia del corte original, no la
  copia operativa actual. Las dos suites de gastos con protección por nombre
  de clon se ejecutaron explícitamente (21 casos), sin quedar omitidas.
- 12 casos con PostgreSQL: 6→3/3, sustitución parcial sucesiva, precio
  obsoleto, compra anulada/ya reservada, fallo inducido con reversión total,
  «No llegó», bloqueo fiscal, destino con entregas previas, enteros, cadena
  revisión→Impresión, saldo calculado y descuento cliente/oferta sin sumarlos.
- Cinco pruebas del cálculo puro y visibilidad del botón; regresiones de
  Reporte Clientes, historial e ingreso de faltantes.
- HTTP real: 401 sin sesión; 403 sin acción o sin módulo; 200 con ambos;
  revocación inmediata. Dos clientes compiten por las mismas 3 unidades:
  un 200, un 409, solo 3 reservadas y factura perdedora intacta.
- Navegador real Chromium y WebKit, 390/1280 px: cancelar, buscar, IVA del
  sustituto, precio actual, confirmar y verificar líneas en PostgreSQL.
  Sin errores JS ni desbordes. Administrador concede permiso en Usuarios y
  el empleado pasa a ver el botón.
- Recorrido móvil adicional: sustituir 2 y dejar 1 pendiente, doble clic con
  una escritura; cambiar el precio después de la propuesta produce 409 sin
  tocar la factura. Revisar de nuevo y confirmar conserva las 2 unidades
  anteriores a su precio y aplica el precio nuevo solo a la última.
- Build correcto y lint sin avisos en los archivos modificados; grafo y
  prueba de estructura: 23 correctas. El aviso previo de tamaño del bundle
  de Vite continúa; no se añadió una dependencia.

Las capturas, manifiestos y logs técnicos de la verificación local se
conservan fuera de Git, en el directorio privado de esta entrega; no contienen
credenciales de producción. El relevo de publicación queda en la memoria
compartida, con agente y commit.

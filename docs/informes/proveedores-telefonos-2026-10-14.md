# Proveedores: varios teléfonos y destino editable — 2026-10-14

El usuario pide registrar varios números al mismo proveedor y poder cambiar
el destino al enviar. La ficha permite añadir/quitar hasta diez WhatsApp;
el modal permite elegir uno registrado o escribir otro para ese pedido.
Los contactos permanentes se guardan sólo desde la ficha.

## Contrato y conservación

Se mantiene telefono_whatsapp como texto, con un teléfono validado y
formateado por línea. SQL059 amplía VARCHAR(30) a TEXT sin modificar datos.
Las lecturas y teléfonos únicos anteriores conservan su contrato. La
validación reutiliza telefonosCliente y rechaza anotaciones, números
incompletos, duplicados, filas intermedias vacías y más de diez contactos.
Los cambios de ficha quedan en la misma bitácora/transacción existente.

POST /proveedor/revisar-envio devuelve los contactos de la ficha. Con cero
o varios y sin elección explícita, devuelve pendiente_destino, sin crear
orden/copia ni tocar WhatsApp. Con uno, prepara el destino como antes.
Un telefono explícito se valida como un solo número; puede ser otro no
guardado. El modal invalida Confirmar al editar; Revisar número prepara
otra UUID y muestra el destino normalizado exacto antes de habilitar envío.

Confirmar mantiene cuerpo/UUID, PDF, número y mensaje de esa copia. Una
respuesta tardía anterior no reemplaza la selección nueva. Una pérdida de
respuesta conserva el intento original; consultarlo no lo cambia ni envía
de nuevo. Copias anteriores, mensajes/PDF y órdenes enviadas/inciertas
conservados. La firma de cuerpos antiguos sin telefono sigue siendo válida.
El mensaje se conserva exactamente en dos líneas, como pidió el usuario.

## Verificación y publicación

Suite completa: 238 archivos, 2.885 casos, 2.484 aprobados, 401 condicionales
omitidos, cero fallos. Node25 corre en procesos independientes por archivo,
con contexto de prueba y bloqueo de red. **154 pruebas dirigidas aprobadas**
con PostgreSQL, CRUD, modal y compatibilidad; grafo/estructura23 aprobados
tras actualizar documentación. Build correcto. La guarda antigua que prohibía
telefono en el gancho se adapta a la nueva elección del usuario, conservando
la prohibición de elegir automáticamente el primero o usar otra persistencia.

SQL059 ensayada con SAVEPOINT/ROLLBACK, repetición y huellas conservadas.
CRUD real de diez números (99 caracteres), edición/borrado y bitácora
comprobados. Cinco escenarios nuevos con PostgreSQL verifican varios destinos,
ficha sin número, cambio de copia/versión/PDF, rechazo sin escrituras y
reintento con destino original. Utilidades de frontend/backend validan los
formatos CR, duplicados, anotaciones y límites; no se concatenan dos teléfonos.
Diecinueve pruebas del modal/gancho cubren cambio durante preparación,
respuesta tardía, doble clic, cancelación, selección y recuperación tras503.

Chromium con HTTP/servicios/PG reales: 53 solicitudes y ROLLBACK. Ficha con
cuatro números que supera el antiguo VARCHAR30, guardado/reapertura, duplicados
y quitar/cancelar conservando contactos; selección explícita8777 sin crear
una copia previa, cambio8555→8999 con UUID nueva y destino puntual sin modificar
la ficha. Se mantienen faltantes/revisión, reserva obsoleta, cantidades7+3,
recarga, exclusión/manual/restauración y nueva factura3. Pantallas390/700/1440
sin desborde ni errores de ejecución; capturas inspeccionadas. Transporte
simulado y ningún mensaje real.

Respaldo privado previo restaurado localmente: SQL059 pasa VARCHAR30→TEXT
con las144 tablas exactamente conservadas y cero datos reescritos. La
SQL059 aplicada en producción el14/10 a11:16 CR, antes de publicar código:
transacción, espera de bloqueos limitada y huellas de las144 tablas iguales
antes/después. Sólo cambia el tipo del campo, sin reescribir filas.
No se usa producción para desarrollo/pruebas ni se
ejecuta la limpieza semanal. El conjunto incorpora trabajo revisado del equipo
Codex; la interfaz que quedó sin commit se retoma en la copia del root, sin
editar la del agente. No viaja trabajo nuevo de Claude. Esta entrega no cambia
ROT-06/07/08; hashes y salud final quedan en la memoria compartida.
